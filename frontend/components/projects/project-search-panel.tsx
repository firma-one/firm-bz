'use client'

import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { Search, Folder, Sparkles, Clock, FileText, MoreVertical, X, Hash, MessageSquare } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { DocumentIcon } from '@/components/ui/document-icon'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import { formatRelativeTime, formatDateTimeWithTZ, cn } from '@/lib/utils'
import { useProjectSearch } from './project-search-context'
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
          <span key={i} className="bg-indigo-100 text-indigo-900 font-medium rounded-[2px] px-0.5">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

const MATCH_TYPE_LABEL: Record<string, string> = {
  keyword: 'Keyword',
  name: 'Filename',
  semantic: 'Semantic',
}
const MATCH_TYPE_TOOLTIP: Record<string, string> = {
  keyword: 'Matched by keyword search in file name or summary',
  name: 'Matched by file or folder name',
  semantic: 'Matched by meaning, using file name and summary',
}

const LIGHT_TOOLTIP_CLASS = 'z-[9999] max-w-[320px] p-3 text-xs bg-white text-slate-900 border border-slate-200 shadow-xl break-words'

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

export interface ProjectSearchPanelActionMenuProps {
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
  onRestrictToConfidential?: (doc: DriveFile) => void
  onRestoreToGeneral?: (doc: DriveFile) => void
  onPromoteToGeneral?: (doc: DriveFile) => void
  onShareSaved?: () => void
}

export interface ProjectSearchPanelProps {
  projectId: string
  generalFolderId: string | null
  confidentialFolderId: string | null
  stagingFolderId: string | null
  navigateToItem: (file: DriveFile) => Promise<void>
  onClose?: () => void
  actionMenuProps?: ProjectSearchPanelActionMenuProps
}

type TypeFilter = 'all' | 'file' | 'folder'

export function ProjectSearchPanel({
  projectId,
  generalFolderId,
  confidentialFolderId,
  stagingFolderId,
  navigateToItem,
  onClose,
  actionMenuProps,
}: ProjectSearchPanelProps) {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    closeSearchPanel,
    recentSearches,
    clearRecentSearches,
    searchRootLabel,
  } = useProjectSearch()
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [infoTooltipOpen, setInfoTooltipOpen] = useState(false)
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null)
  const [typewriterText, setTypewriterText] = useState('')
  const [typewriterIndex, setTypewriterIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const { setExpanded } = useRightPane()

  const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder'
  const filteredResults = typeFilter === 'all'
    ? searchResults
    : typeFilter === 'folder'
      ? searchResults.filter(isFolder)
      : searchResults.filter((f) => !isFolder(f))

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
  }, [searchQuery, searchResults.length, typeFilter])

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

  const renderSearchResultCard = useCallback(
    (file: DriveFile, index: number) => {
      const matchType = (file.matchType === 'keyword' || file.matchType === 'name' || file.matchType === 'semantic') ? file.matchType : 'keyword'
      return (
        <div
          className={cn(
            'w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-start gap-3 group border border-transparent',
            highlightedIndex === index
              ? 'bg-slate-50 shadow-sm border-slate-200'
              : 'hover:bg-slate-50 hover:shadow-sm hover:border-slate-200'
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
            className="flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-inset rounded-lg"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-0.5 flex-shrink-0 cursor-default">
                  {file.mimeType === 'application/vnd.google-apps.folder' ? (
                    <Folder className="h-4 w-4 text-purple-500 fill-purple-100" />
                  ) : (
                    <DocumentIcon mimeType={file.mimeType} className="h-4 w-4" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className={LIGHT_TOOLTIP_CLASS}>
                {file.name}
              </TooltipContent>
            </Tooltip>
            <div className="flex-1 min-w-0">
              <div className="flex items-center min-w-0">
                <span className="text-sm font-semibold text-slate-800 truncate block group-hover:text-slate-900">
                  <HighlightText text={file.name} highlight={searchQuery} />
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                  {file.parents?.[0] ? (
                    <button
                      type="button"
                      data-parent-folder-button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleParentClick(e, file)
                      }}
                      className="relative z-10 inline-flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-800 hover:underline min-w-0 flex-shrink cursor-pointer"
                      title={file.parentName ? `${file.parentName} (open in Files)` : 'Open parent folder in Files'}
                    >
                      <Tooltip open={openTooltipId === `parent-${file.id}`}>
                        <TooltipTrigger asChild>
                          <span
                            onClick={(e) => {
                              // Open tooltip on click without interfering with parent navigation
                              e.stopPropagation()
                              setOpenTooltipId((prev) => prev === `parent-${file.id}` ? null : `parent-${file.id}`)
                            }}
                            className="inline-flex items-center gap-1.5 max-w-[10rem] cursor-help"
                          >
                            <Folder className="h-3.5 w-3.5 shrink-0 stroke-slate-400 stroke-[1.5] fill-slate-200" aria-hidden />
                            {file.parentName ? (
                              <span className="font-medium truncate">{file.parentName}</span>
                            ) : (
                              'Open parent folder'
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                          {file.parentName || 'Open parent folder'}
                        </TooltipContent>
                      </Tooltip>
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 flex-shrink-0">—</span>
                  )}
                  <Tooltip open={openTooltipId === `badge-${file.id}`}>
                    <TooltipTrigger asChild>
                      <span
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setOpenTooltipId((prev) => (prev === `badge-${file.id}` ? null : `badge-${file.id}`))
                        }}
                        className={cn(
                          'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium shrink-0 bg-slate-100 text-slate-600 cursor-pointer'
                        )}
                      >
                        {matchType === 'semantic' ? <Sparkles className="h-2.5 w-2.5" /> : <Hash className="h-2.5 w-2.5" />}
                        {MATCH_TYPE_LABEL[matchType]}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                      {MATCH_TYPE_TOOLTIP[matchType]}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-auto cursor-default">
                      {formatRelativeTime(file.modifiedTime)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className={LIGHT_TOOLTIP_CLASS}>
                    {formatDateTimeWithTZ(file.modifiedTime)}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
          {actionMenuProps && (
            <div className="flex-shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
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
                onRestrictToConfidential={actionMenuProps.onRestrictToConfidential}
                onRestoreToGeneral={actionMenuProps.onRestoreToGeneral}
                onPromoteToGeneral={actionMenuProps.onPromoteToGeneral}
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

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0 bg-slate-50/50">
        {/* Search input - integrated box: icons inside left edge, 2-line textarea, clear on right */}
        <div className="shrink-0 p-3 pb-2">
          <label htmlFor="project-search-panel-input" className="sr-only">
            Search engagement files
          </label>
          <div className="flex rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-slate-300 focus-within:border-slate-300">
            {/* Left strip: chat icon with tooltip (click to toggle) */}
            <div className="flex flex-col justify-center py-2 pl-2.5 pr-1.5 border-r border-slate-100 bg-slate-50/80 shrink-0">
              <Tooltip open={openTooltipId === `chat-${projectId}`}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenTooltipId((prev) => (prev === `chat-${projectId}` ? null : `chat-${projectId}`))
                    }}
                    className="p-0.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-300 -ml-0.5 cursor-pointer"
                    aria-label="Natural language search info"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className={LIGHT_TOOLTIP_CLASS}>
                  Natural language search can be performed
                </TooltipContent>
              </Tooltip>
            </div>
            {/* Middle: textarea + typewriter helper overlay */}
            <div className="relative flex-1 min-w-0 flex">
              <Textarea
                id="project-search-panel-input"
                name="project-search-panel"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                rows={2}
                className="pl-3 pr-3 py-2 min-h-0 resize-none border-0 rounded-none bg-transparent text-sm shadow-none placeholder:text-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
                aria-label="Search engagement files"
              />
              {!searchQuery.trim() && (
                <div
                  className="absolute left-3 top-2 text-sm text-slate-400 pointer-events-none select-none"
                  aria-hidden
                >
                  <span>Show{typewriterText ? ' ' : ''}{typewriterText}</span>
                  <span className="inline-block w-[1px] h-[1.1em] -mb-[0.1em] ml-0.5 bg-slate-400 animate-pulse" />
                </div>
              )}
            </div>
            {/* Right strip: clear (X) icon – always visible, enabled after search text + debounce */}
            <div className="flex flex-col justify-center py-2 pl-1.5 pr-2.5 border-l border-slate-100 bg-slate-50/80 shrink-0">
              {(() => {
                const canClear = searchQuery.trim().length > 0 && !isSearching
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (!canClear) return
                      setSearchQuery('')
                    }}
                    disabled={!canClear}
                    className={cn(
                      "p-0.5 rounded-md -mr-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
                      canClear
                        ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                        : "text-slate-300 cursor-default"
                    )}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )
              })()}
            </div>
          </div>
          {searchRootLabel && (
            <p className="text-[10px] text-slate-500 mt-1 px-0.5" aria-live="polite">
              Searching in <span className="font-medium text-slate-600">{searchRootLabel}</span>
            </p>
          )}
        </div>

        {/* Scrollable content: Recent Search + File results */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
          {/* Recent Search */}
          {recentSearches.length > 0 && searchQuery.trim().length < 2 && (
            <section className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Recent Search</span>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="text-[10px] text-slate-500 hover:text-slate-700"
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-0.5">
                {recentSearches.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => handleRecentClick(q)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm text-slate-700 hover:bg-white hover:shadow-sm transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{q}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* File results */}
          {searchQuery.trim().length >= 2 && (
            <section>
              {              searchResults.length > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Results
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTypeFilter('all')}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                          typeFilter === 'all' ? 'bg-slate-200 text-slate-800 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter('folder')}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                          typeFilter === 'folder' ? 'bg-slate-200 text-slate-800 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <Folder className="h-3.5 w-3.5" />
                        Folder
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter('file')}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                          typeFilter === 'file' ? 'bg-slate-200 text-slate-800 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        File
                      </button>
                    </div>
                  </div>
                  <>
                    {todayResults.length > 0 && (
                      <div className="mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 py-1 block">Today</span>
                        <ul ref={listRef} className="space-y-0.5">
                          {todayResults.map((file) => {
                            const index = filteredResults.indexOf(file)
                            return (
                              <li key={file.id}>
                                {renderSearchResultCard(file, index)}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                    {earlierResults.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 py-1 block">Earlier</span>
                        <ul className="space-y-0.5">
                          {earlierResults.map((file) => {
                            const index = filteredResults.indexOf(file)
                            return (
                              <li key={file.id}>
                                {renderSearchResultCard(file, index)}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </>
                </>
              ) : !isSearching ? (
                <div className="py-8 text-center">
                  <div className="bg-white h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Search className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">No results found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    No files match &quot;{searchQuery}&quot; in this project.
                  </p>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="h-10 w-10 border-2 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                    <Sparkles className="h-4 w-4 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Scanning with AI context...</p>
                </div>
              )}
            </section>
          )}

          {searchQuery.trim().length < 2 && !recentSearches.length && (
            <div className="py-8 text-center">
              <p className="text-xs text-slate-500">Type at least 2 characters to search.</p>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
