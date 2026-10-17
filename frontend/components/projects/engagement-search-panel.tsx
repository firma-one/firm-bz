'use client'

import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { Search, Folder, Sparkles, Clock, FileText, MoreVertical, Hash, CalendarClock } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FilterMenuLabel, FilterMenuRow, FilterPill } from '@/components/ui/filter-pill'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { ShimmerBar, ShimmerBlock, LoadingAnnouncement } from '@/components/ui/shimmer'
import { Tag } from '@/components/ui/tag'
import { formatRelativeTime, formatDateTimeWithTZ, cn } from '@/lib/utils'
import { useEngagementSearch } from './engagement-search-context'
import { useRightPane } from '@/lib/right-pane-context'
import type { DriveFile } from '@/lib/types'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <>{text}</>
  const escaped = highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-tag-yellow-bg px-px text-fg">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

/** The same words and tags firm Doc Search uses (global-search-view.tsx): a name or keyword hit is a
 * "File match", a hit by meaning a "Semantic match". The hover keeps the more specific reason. */
const MATCH_TYPE_LABEL: Record<string, string> = {
  keyword: 'File match',
  name: 'File match',
  semantic: 'Semantic match',
}
const MATCH_TYPE_TOOLTIP: Record<string, string> = {
  keyword: 'Matched by keyword search in file name or summary',
  name: 'Matched by file or folder name',
  semantic: 'Matched by meaning, using file name and summary',
}

/** Doc Search's Time filter, on the result's last-modified date. */
const TIME_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
] as const
const TYPE_OPTIONS: { value: 'folder' | 'file'; label: string }[] = [
  { value: 'folder', label: 'Folders' },
  { value: 'file', label: 'Files' },
]

const TYPEWRITER_PHRASES = [
  'client discovery files',
  'client proposal files',
  'client onboarding docs',
  'marketing research files',
  'GTM strategy reports',
  'client reports',
  'client presentations',
]

function isToday(date: Date | string): boolean {
  const d = new Date(date)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export interface EngagementSearchPanelActionMenuProps {
  canEdit: boolean
  canManage: boolean
  currentFolderType: 'general' | 'confidential' | 'staging'
  firmId: string
  isProjectLead: boolean
  onOpenDocument: (doc: DriveFile) => void
  onDuplicateDocument?: (doc: DriveFile) => void
  onCopyDocument?: (doc: DriveFile) => void
  onMoveDocument?: (doc: DriveFile) => void
  onDeleteDocument?: (doc: DriveFile) => void
  onRenameDocument?: (doc: DriveFile) => void
  onMakePrivate?: (doc: DriveFile) => void
  onMakePublic?: (doc: DriveFile) => void
  onShareSaved?: () => void
}

export interface EngagementSearchPanelProps {
  projectId: string
  generalFolderId: string | null
  confidentialFolderId: string | null
  stagingFolderId: string | null
  navigateToItem: (file: DriveFile) => Promise<void>
  onClose?: () => void
  actionMenuProps?: EngagementSearchPanelActionMenuProps
}

type TypeFilter = 'all' | 'file' | 'folder'

export function EngagementSearchPanel({
  projectId,
  generalFolderId,
  confidentialFolderId,
  stagingFolderId,
  navigateToItem,
  onClose,
  actionMenuProps,
}: EngagementSearchPanelProps) {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    closeSearchPanel,
    recentSearches,
    clearRecentSearches,
    searchRootLabel,
  } = useEngagementSearch()
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [timeFilter, setTimeFilter] = useState<number | null>(null)
  const [typewriterText, setTypewriterText] = useState('')
  const [typewriterIndex, setTypewriterIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const { setExpanded } = useRightPane()

  const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder'
  const filteredResults = searchResults.filter((f) => {
    if (typeFilter === 'folder' && !isFolder(f)) return false
    if (typeFilter === 'file' && isFolder(f)) return false
    if (timeFilter !== null && (!f.modifiedTime || Date.now() - new Date(f.modifiedTime).getTime() > timeFilter * 86_400_000)) return false
    return true
  })

  const handleClose = useCallback(() => {
    onClose?.()
    closeSearchPanel()
  }, [onClose, closeSearchPanel])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [handleClose])

  // Typewriter helper text for empty search field
  useEffect(() => {
    if (searchQuery.trim()) {
      // When user is typing, hide helper and pause animation
      if (typewriterText) setTypewriterText('')
      return
    }

    const currentPhrase = TYPEWRITER_PHRASES[typewriterIndex]
    const typingSpeed = 80
    const deletingSpeed = 40
    const pauseAfterTyped = 1200
    const pauseAfterDeleted = 400

    let timeout: number

    if (!isDeleting) {
      if (typewriterText.length < currentPhrase.length) {
        timeout = window.setTimeout(() => {
          setTypewriterText(currentPhrase.slice(0, typewriterText.length + 1))
        }, typingSpeed)
      } else {
        timeout = window.setTimeout(() => {
          setIsDeleting(true)
        }, pauseAfterTyped)
      }
    } else {
      if (typewriterText.length > 0) {
        timeout = window.setTimeout(() => {
          setTypewriterText(currentPhrase.slice(0, typewriterText.length - 1))
        }, deletingSpeed)
      } else {
        timeout = window.setTimeout(() => {
          setIsDeleting(false)
          setTypewriterIndex((prev) => (prev + 1) % TYPEWRITER_PHRASES.length)
        }, pauseAfterDeleted)
      }
    }

    return () => window.clearTimeout(timeout)
  }, [searchQuery, typewriterText, typewriterIndex, isDeleting])

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((i) => (i < filteredResults.length - 1 ? i + 1 : i))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((i) => (i > 0 ? i - 1 : -1))
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && filteredResults[highlightedIndex]) {
        e.preventDefault()
        handleSelect(filteredResults[highlightedIndex])
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [highlightedIndex, filteredResults])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchQuery, searchResults.length, typeFilter, timeFilter])

  const handleSelect = async (file: DriveFile) => {
    await navigateToItem(file)
    // If the right pane was maximized, collapse it back to the docked state
    // so the FILES tab is clearly visible, while keeping search state intact.
    setExpanded(false)
  }

  const handleRecentClick = (query: string) => {
    setSearchQuery(query)
  }

  const handleParentClick = useCallback(
    (e: React.MouseEvent, file: DriveFile) => {
      e.preventDefault()
      e.stopPropagation()

      const parentId = file.parents?.[0]
      if (!parentId) return

      // When clicking the parent folder chip, treat the parent folder itself
      // as the navigation target so we:
      // - open its parent folder in the FILES tab
      // - highlight this parent folder row in the list (same behavior as
      //   clicking a normal folder row in FILES).
      const parentAsFile: DriveFile = {
        ...(file as any),
        id: parentId,
        name: (file as any).parentName || file.name,
        mimeType: 'application/vnd.google-apps.folder',
      }

      navigateToItem(parentAsFile)
    },
    [navigateToItem]
  )

  /**
   * One result, laid out like firm Doc Search's rows (global-search-view.tsx): an icon tile, the doc
   * ID chip and name, the folder it is in, then the match tag and the date. Hairline rows rather
   * than cards that lift on hover.
   */
  const renderSearchResultCard = useCallback(
    (file: DriveFile, index: number) => {
      const matchType = (file.matchType === 'keyword' || file.matchType === 'name' || file.matchType === 'semantic') ? file.matchType : 'keyword'
      const folder = isFolder(file)
      return (
        <div
          className={cn(
            'group flex w-full items-start gap-2.5 rounded-control px-2 py-2.5 text-left transition-colors',
            highlightedIndex === index ? 'bg-surface-selected' : 'hover:bg-surface-hover'
          )}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[data-parent-folder-button]')) return
              handleSelect(file)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleSelect(file)
              }
            }}
            onMouseEnter={() => setHighlightedIndex(index)}
            className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/30"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-muted">
              {folder
                ? <Folder className="h-4 w-4 text-fg-muted" aria-hidden />
                : <DocumentIcon mimeType={file.mimeType} size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {file.docId && (
                  <span className="shrink-0 rounded-control bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-fg-muted">
                    {file.docId}
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate text-ui font-medium text-fg">
                      <HighlightText text={file.name} highlight={searchQuery} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs break-words">{file.name}</TooltipContent>
                </Tooltip>
              </div>
              {file.parents?.[0] && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-parent-folder-button
                      onClick={(e) => handleParentClick(e, file)}
                      className="relative z-10 mt-0.5 inline-flex max-w-full items-center gap-1 text-caption text-fg-subtle transition-colors hover:text-fg hover:underline"
                    >
                      <Folder className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{file.parentName || 'Parent folder'}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Open {file.parentName ? <>&ldquo;{file.parentName}&rdquo;</> : 'the parent folder'} in Files
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-default">
                      <Tag color={matchType === 'semantic' ? 'purple' : 'gray'} icon={matchType === 'semantic' ? <Sparkles /> : <Hash />}>
                        {MATCH_TYPE_LABEL[matchType]}
                      </Tag>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{MATCH_TYPE_TOOLTIP[matchType]}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="shrink-0 cursor-default text-caption tabular-nums text-fg-subtle">
                      {formatRelativeTime(file.modifiedTime)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{formatDateTimeWithTZ(file.modifiedTime)}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
          {actionMenuProps && (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <DocumentActionMenu
                document={file}
                showShareModal={actionMenuProps.isProjectLead}
                isEngagementLead={actionMenuProps.isProjectLead}
                projectId={projectId}
                onShareSaved={actionMenuProps.onShareSaved}
                canManage={actionMenuProps.canManage}
                currentFolderType={actionMenuProps.currentFolderType}
                onRenameDocument={actionMenuProps.onRenameDocument}
                onDuplicateDocument={actionMenuProps.onDuplicateDocument}
                onCopyDocument={actionMenuProps.onCopyDocument}
                onMoveDocument={actionMenuProps.onMoveDocument}
                onDeleteDocument={actionMenuProps.onDeleteDocument}
                onMakePrivate={actionMenuProps.onMakePrivate}
                onMakePublic={actionMenuProps.onMakePublic}
                onOpenDocument={(doc) => actionMenuProps.onOpenDocument(doc as DriveFile)}
                triggerIcon={<MoreVertical className="h-4 w-4" />}
              />
            </div>
          )}
        </div>
      )
    },
    [
      searchQuery,
      highlightedIndex,
      handleSelect,
      handleParentClick,
      actionMenuProps,
      projectId,
    ]
  )

  const { todayResults, earlierResults } = useMemo(() => {
    const today: DriveFile[] = []
    const earlier: DriveFile[] = []
    filteredResults.forEach((f) => {
      if (f.modifiedTime && isToday(f.modifiedTime)) today.push(f)
      else earlier.push(f)
    })
    return { todayResults: today, earlierResults: earlier }
  }, [filteredResults])

  const hasQuery = searchQuery.trim().length >= 2
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label
  const timeLabel = TIME_OPTIONS.find((o) => o.days === timeFilter)?.label
  const sectionLabel = 'px-2 pb-1 pt-2 text-caption text-fg-subtle'

  const renderGroup = (title: string, files: DriveFile[], ref?: React.Ref<HTMLUListElement>) =>
    files.length > 0 && (
      <div>
        <p className={sectionLabel}>{title}</p>
        <ul ref={ref} className="flex flex-col">
          {files.map((file) => (
            <li key={file.id}>{renderSearchResultCard(file, filteredResults.indexOf(file))}</li>
          ))}
        </ul>
      </div>
    )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 flex-col bg-surface">
        {/* SEARCH FIELD, as on firm Doc Search: borderless, a search icon and a clear button, a
            hairline under it. Two rows, since a natural-language query is often a sentence. */}
        <div className="shrink-0 px-3 pt-3">
          <label htmlFor="engagement-search-panel-input" className="sr-only">
            Search engagement files
          </label>
          <div className="flex items-start gap-2 border-b border-line pb-2">
            <Search className="mt-2 h-[18px] w-[18px] shrink-0 text-fg-subtle" aria-hidden />
            <div className="relative flex min-w-0 flex-1">
              <Textarea
                id="engagement-search-panel-input"
                name="engagement-search-panel"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                rows={2}
                className="min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-1.5 text-body text-fg shadow-none placeholder:text-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
                aria-label="Search engagement files"
              />
              {/* Example queries, typed out: says "you can describe what you want" without a
                  separate hint. */}
              {!searchQuery.trim() && (
                <div className="pointer-events-none absolute left-0 top-1.5 select-none text-body text-fg-subtle" aria-hidden>
                  <span>Show{typewriterText ? ' ' : ''}{typewriterText}</span>
                  <span className="-mb-[0.1em] ml-0.5 inline-block h-[1.1em] w-px animate-pulse bg-fg-subtle" />
                </div>
              )}
            </div>
            {/* "Clear" in words, not a second ×: the pane's own × to close it sits one row above,
                and two identical icons a row apart read as the same action. Only while there is
                something to clear. */}
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-1.5 shrink-0 rounded-control px-1.5 py-0.5 text-caption text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                Clear
              </button>
            )}
          </div>
          {searchRootLabel && (
            <p className="mt-1.5 text-caption text-fg-subtle" aria-live="polite">
              Searching in <span className="font-medium text-fg-muted">{searchRootLabel}</span>
            </p>
          )}

          {/* FILTERS, Doc Search's pills and Notion menus. */}
          {hasQuery && (
            <div className="flex flex-wrap items-center gap-1.5 pb-1 pt-2.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FilterPill icon={<FileText />} label="Type" value={typeLabel} onClear={() => setTypeFilter('all')} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px] p-1">
                  <FilterMenuLabel>Type</FilterMenuLabel>
                  <FilterMenuRow selected={typeFilter === 'all'} onSelect={() => setTypeFilter('all')}>Any type</FilterMenuRow>
                  <DropdownMenuSeparator className="mx-0 my-1" />
                  {TYPE_OPTIONS.map((o) => (
                    <FilterMenuRow key={o.value} selected={typeFilter === o.value} onSelect={() => setTypeFilter(o.value)}>{o.label}</FilterMenuRow>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FilterPill icon={<CalendarClock />} label="Modified" value={timeLabel} onClear={() => setTimeFilter(null)} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px] p-1">
                  <FilterMenuLabel>Modified</FilterMenuLabel>
                  <FilterMenuRow selected={timeFilter === null} onSelect={() => setTimeFilter(null)}>Any time</FilterMenuRow>
                  <DropdownMenuSeparator className="mx-0 my-1" />
                  {TIME_OPTIONS.map((o) => (
                    <FilterMenuRow key={o.days} selected={timeFilter === o.days} onSelect={() => setTimeFilter(o.days)}>{o.label}</FilterMenuRow>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {/* RECENT SEARCHES, as plain rows. */}
          {recentSearches.length > 0 && !hasQuery && (
            <section className="pt-1">
              <div className="flex items-center justify-between px-2 pb-1 pt-2">
                <span className="text-caption text-fg-subtle">Recent searches</span>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="rounded-control px-1 text-caption text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  Clear
                </button>
              </div>
              <ul className="flex flex-col">
                {recentSearches.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => handleRecentClick(q)}
                      className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                      <span className="truncate">{q}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasQuery && (
            <section>
              {isSearching && searchResults.length === 0 ? (
                /* Loading: rows shaped like the results that are coming, as Doc Search loads. */
                <div className="flex flex-col gap-1 pt-2">
                  <LoadingAnnouncement label="Searching" />
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-2.5 px-2 py-2.5">
                      <ShimmerBlock className="h-8 w-8" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
                        <ShimmerBar className="w-[70%]" />
                        <ShimmerBar className="w-[40%]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <EmptyPanel
                  compact
                  icon={<Search />}
                  title="No results"
                  description={<>Nothing in {searchRootLabel ?? 'this engagement'} matches &ldquo;{searchQuery.trim()}&rdquo;.</>}
                />
              ) : (
                <>
                  <p className="flex items-center justify-between px-2 pb-1 pt-2 text-caption text-fg-subtle">
                    <span>Results</span>
                    <span className="tabular-nums">{filteredResults.length} {filteredResults.length === 1 ? 'result' : 'results'}</span>
                  </p>
                  {filteredResults.length === 0 ? (
                    <EmptyPanel compact icon={<Search />} title="No results match these filters" />
                  ) : (
                    <>
                      {renderGroup('Today', todayResults, listRef)}
                      {renderGroup('Earlier', earlierResults)}
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {!hasQuery && !recentSearches.length && (
            <p className="py-8 text-center text-small text-fg-subtle">Type at least 2 characters to search.</p>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
