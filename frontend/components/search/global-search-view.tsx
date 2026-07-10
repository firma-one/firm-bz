'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, Folder, Sparkles, X, Building2, Briefcase, Package, Hash, FileText, ArrowUpRight, History, BrushCleaning, CalendarClock } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { UserAvatarWithTooltip } from '@/components/ui/user-avatar-with-tooltip'
import { formatRelativeTime, formatDateTimeWithTZ, cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'

interface PickerEntity {
  id: string
  name: string
  clientId?: string
  engagementId?: string
}

interface PickerData {
  clients: PickerEntity[]
  engagements: PickerEntity[]
  deliverables: PickerEntity[]
}

interface GlobalSearchResult {
  externalId: string
  fileName: string
  updatedAt: string
  score: number
  metadata?: any
  isFolder?: boolean
  matchType?: 'name' | 'semantic'
  documentId?: string | null
  engagementId?: string | null
  clientName?: string | null
  engagementName?: string | null
  ancestorFolderNames?: string[]
  docId?: string | null
  createdByName?: string | null
  createdByEmail?: string | null
  createdByAvatarUrl?: string | null
  updatedByName?: string | null
  updatedByEmail?: string | null
  updatedByAvatarUrl?: string | null
}

// File-type categories for the multi-select Type filter. 'any' is exclusive with the rest —
// selecting it clears any other selected category and vice versa, since "Any" means no filtering.
const FILE_TYPE_OPTIONS = ['document', 'spreadsheet', 'presentation', 'image', 'audio', 'video', 'folder', 'any'] as const
type FileTypeOption = typeof FILE_TYPE_OPTIONS[number]
const FILE_TYPE_LABEL: Record<FileTypeOption, string> = {
  document: 'Document', spreadsheet: 'Spreadsheet', presentation: 'Presentation',
  image: 'Image', audio: 'Audio', video: 'Video', folder: 'Folder', any: 'Any',
}

/** Classifies a result into a FileTypeOption using the same mime-matching convention as the
 * existing engagement-file-list.tsx type filter (exact match for Office/Google types, prefix
 * match for image/audio/video since global search spans arbitrary uploaded file types). */
function classifyFileType(file: { isFolder?: boolean; metadata?: any }): FileTypeOption {
  if (file.isFolder) return 'folder'
  const mime = (file.metadata?.mimeType as string | undefined) ?? ''
  if (mime === 'application/vnd.google-apps.document'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mime === 'application/msword'
    || mime === 'application/pdf') return 'document'
  if (mime === 'application/vnd.google-apps.spreadsheet'
    || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mime === 'application/vnd.ms-excel') return 'spreadsheet'
  if (mime === 'application/vnd.google-apps.presentation'
    || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || mime === 'application/vnd.ms-powerpoint') return 'presentation'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}

interface ResolvedFilters {
  clientId: string | null
  engagementId: string | null
  deliverableDocumentId: string | null
  dateRange: { start: string; end: string } | null
}

type FilterStage = 'client' | 'engagement' | 'deliverable' | 'dateRange' | 'type'

interface SelectedChip {
  stage: FilterStage
  id: string
  name: string
}

const STAGE_LABEL: Record<FilterStage, string> = {
  client: 'Client',
  engagement: 'Engagement',
  deliverable: 'Deliverable',
  dateRange: 'Time',
  type: 'Type',
}
const STAGE_ICON: Record<FilterStage, React.ComponentType<{ className?: string }>> = {
  client: Building2,
  engagement: Briefcase,
  deliverable: Package,
  dateRange: CalendarClock,
  type: FileText,
}

// Relative-time presets — deterministic, exact-selection date filtering, replacing chrono's
// unreliable free-text date detection (bare years not recognized, fiscal-quarter ambiguity,
// date words colliding with entity names — see date-query-parser.ts). Unlike chrono's soft
// ranking-boost date range, a selected preset here is explicit user intent and becomes a hard
// AND filter, same treatment as Client/Engagement/Deliverable chips.
const RELATIVE_TIME_PRESETS = [
  'Overdue', 'Today', 'Last 7 days', 'Last 30 days', 'This Quarter', 'This Year',
] as const
type RelativeTimePreset = typeof RELATIVE_TIME_PRESETS[number]

function resolveRelativeTimeRange(preset: RelativeTimePreset, now: Date = new Date()): { start: Date; end: Date } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)

  switch (preset) {
    case 'Overdue':
      // dueDate strictly before today - a very early epoch start is fine since it's an AND filter,
      // never displayed as a literal "start date" to the user (the chip itself says "Overdue").
      return { start: new Date(0), end: new Date(todayStart.getTime() - 1) }
    case 'Today':
      return { start: todayStart, end: todayEnd }
    case 'Last 7 days':
      return { start: startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)), end: todayEnd }
    case 'Last 30 days':
      return { start: startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)), end: todayEnd }
    case 'This Quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
      return { start: new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0), end: todayEnd }
    }
    case 'This Year':
      return { start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), end: todayEnd }
  }
}

// Long enough that a search only fires (and gets recorded to history) once the user has actually
// paused typing, not on every incomplete word — 400ms was capturing "researc", "researcg", etc.
// as separate history entries mid-keystroke.
const DEBOUNCE_MS = 900

// Detailed search history — supersedes the earlier simpler text-only "recent searches" quick-list
// is text-only, session-scoped; this one is the full record shown in the history sidebar,
// persisted across sessions in localStorage, last 10 per firm).
interface SearchHistoryEntry {
  id: string
  query: string
  chips: SelectedChip[]
  timestamp: number
  resultCount: number
  openedCount: number
}

const SEARCH_HISTORY_KEY = (firmId: string) => `fm_document_search_history_${firmId}`
const SEARCH_HISTORY_MAX = 10

function getSearchHistory(firmId: string): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY(firmId))
    const parsed = raw ? (JSON.parse(raw) as SearchHistoryEntry[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, SEARCH_HISTORY_MAX) : []
  } catch {
    return []
  }
}

function saveSearchHistory(firmId: string, entries: SearchHistoryEntry[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY(firmId), JSON.stringify(entries.slice(0, SEARCH_HISTORY_MAX)))
  } catch {
    // ignore - localStorage full/unavailable, history just won't persist
  }
}

function chipsMatch(a: SelectedChip[], b: SelectedChip[]): boolean {
  if (a.length !== b.length) return false
  return a.every((chip) => b.some((c) => c.stage === chip.stage && c.id === chip.id))
}

/** Records a completed search. Re-running the exact same query+filters bumps the existing entry's timestamp/result count rather than duplicating it. */
function recordSearchHistory(firmId: string, query: string, chips: SelectedChip[], resultCount: number): string {
  const trimmedQuery = query.trim()
  const prev = getSearchHistory(firmId)
  const existing = prev.find((e) => e.query.trim().toLowerCase() === trimmedQuery.toLowerCase() && chipsMatch(e.chips, chips))
  const id = existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const entry: SearchHistoryEntry = {
    id,
    query: trimmedQuery,
    chips,
    timestamp: Date.now(),
    resultCount,
    openedCount: existing?.openedCount ?? 0,
  }
  const next = [entry, ...prev.filter((e) => e.id !== id)].slice(0, SEARCH_HISTORY_MAX)
  saveSearchHistory(firmId, next)
  return id
}

function recordSearchHistoryOpen(firmId: string, entryId: string) {
  const prev = getSearchHistory(firmId)
  const next = prev.map((e) => (e.id === entryId ? { ...e, openedCount: e.openedCount + 1 } : e))
  saveSearchHistory(firmId, next)
}

function removeSearchHistoryEntry(firmId: string, entryId: string) {
  saveSearchHistory(firmId, getSearchHistory(firmId).filter((e) => e.id !== entryId))
}

export function GlobalSearchView({ firmId }: { firmId: string }) {
  const { session } = useAuth()
  const accessToken = session?.access_token

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [resolvedFilters, setResolvedFilters] = useState<ResolvedFilters | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [openingExternalId, setOpeningExternalId] = useState<string | null>(null)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const currentHistoryEntryId = useRef<string | null>(null)

  const [pickerData, setPickerData] = useState<PickerData>({ clients: [], engagements: [], deliverables: [] })

  // Selected filter chips — same idea as mentionedUsers in the Comments @mention picker:
  // a chip array decoupled from the raw text, rendered before the textarea.
  const [chips, setChips] = useState<SelectedChip[]>([])
  // Index into `chips` of the chip currently focused via keyboard, or null when focus is in the text input.
  const [focusedChipIndex, setFocusedChipIndex] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStage, setPickerStage] = useState<FilterStage>('client')
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerFocusedIndex, setPickerFocusedIndex] = useState(0)
  // In-progress multi-select state while the Type picker is open — not committed to `chips`
  // until the user confirms (Enter) or closes the picker, so partial toggling doesn't
  // re-trigger a search on every Space press.
  const [pendingFileTypes, setPendingFileTypes] = useState<FileTypeOption[]>([])
  // The picker dropdown is rendered via a portal (see render below) so it can escape the firm
  // page's `overflow-y-auto` tab-content wrapper (firm-clients-view.tsx), which otherwise clips
  // any `position: absolute` descendant that extends past its scrolled viewport — no z-index can
  // fix that, since z-index only affects paint order within a stacking context, not clipping
  // across an overflow boundary. Position is computed from the composer's viewport rect and kept
  // in sync while the picker is open.
  const [pickerPosition, setPickerPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  // Set right after selectChip/commitFileTypes commits a chip, to auto-advance into the next
  // eligible stage once `chips` state has actually updated — openPickerAtNextStage reads
  // clientChip/engagementChip/etc. derived from `chips`, which are still stale immediately after
  // setChips (React batches the update), so the advance is deferred to an effect keyed off chips
  // itself rather than called synchronously right after setChips.
  const autoAdvanceRequested = useRef(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLInputElement>(null)
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([])

  const clientChip = chips.find((c) => c.stage === 'client') || null
  const engagementChip = chips.find((c) => c.stage === 'engagement') || null
  const deliverableChip = chips.find((c) => c.stage === 'deliverable') || null
  const dateRangeChip = chips.find((c) => c.stage === 'dateRange') || null
  // Multi-select: the Type chip's id is a comma-joined list of FileTypeOption values
  // (e.g. "document,image"); its name is the human-readable summary shown on the chip.
  const typeChip = chips.find((c) => c.stage === 'type') || null
  const selectedFileTypes: FileTypeOption[] = typeChip
    ? (typeChip.id.split(',').filter(Boolean) as FileTypeOption[])
    : []

  // Chips always display in a fixed canonical order (Client, Engagement, Deliverable, Time, Type)
  // regardless of the order they were selected/re-selected in — e.g. removing and re-adding
  // Deliverable after Time was already set must not move Deliverable after Time visually.
  const CHIP_DISPLAY_ORDER: FilterStage[] = ['client', 'engagement', 'deliverable', 'dateRange', 'type']
  const orderedChips = useMemo(
    () => [...chips].sort((a, b) => CHIP_DISPLAY_ORDER.indexOf(a.stage) - CHIP_DISPLAY_ORDER.indexOf(b.stage)),
    [chips]
  )

  useEffect(() => {
    setSearchHistory(getSearchHistory(firmId))
  }, [firmId])

  // Pre-cache picker data once per session so @-triggered autocomplete filters locally, no round-trip per keystroke.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    fetch(`/api/firms/${firmId}/search/picker-data`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data && !data.error) {
          setPickerData({
            clients: data.clients ?? [],
            engagements: data.engagements ?? [],
            deliverables: data.deliverables ?? [],
          })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [firmId, accessToken])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchQuery])

  const stageOptions = useMemo((): PickerEntity[] => {
    if (pickerStage === 'client') return pickerData.clients
    if (pickerStage === 'engagement') {
      return clientChip
        ? pickerData.engagements.filter((e) => e.clientId === clientChip.id)
        : pickerData.engagements
    }
    if (pickerStage === 'dateRange') {
      return RELATIVE_TIME_PRESETS.map((preset) => ({ id: preset, name: preset }))
    }
    if (pickerStage === 'type') {
      return FILE_TYPE_OPTIONS.map((opt) => ({ id: opt, name: FILE_TYPE_LABEL[opt] }))
    }
    return engagementChip
      ? pickerData.deliverables.filter((d) => d.engagementId === engagementChip.id)
      : pickerData.deliverables
  }, [pickerStage, pickerData, clientChip, engagementChip])

  const filteredOptions = pickerQuery.trim()
    ? stageOptions.filter((o) => o.name.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
    : stageOptions

  // Closing the picker (whether via Escape, click-outside, or auto-advance finding nothing left
  // to pick) always hands focus back to the main search input — this is the one place where the
  // @ session is genuinely "done."
  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setPickerQuery('')
    textareaRef.current?.focus()
  }, [])

  // "@" opens the staged picker at whichever stage is next eligible, same trigger mechanism as
  // the Comments mention picker: consume the keypress, never insert "@" into the text.
  // Client/Engagement/Deliverable are hierarchical (each narrows the next) — Engagement is only
  // eligible once Client is set, Deliverable only once Engagement is set, so an empty Client
  // means Engagement/Deliverable are skipped over entirely, not just optionally offered. Time and
  // Type have no such dependency and are always eligible. Selecting a chip (selectChip/
  // commitFileTypes) calls this again afterward to auto-advance into the next eligible stage
  // within the same @ session; Tab still skips the current stage without selecting.
  //
  // Linear scan only, NEVER wraps around — a single @ session walks forward through
  // ['client','engagement','deliverable','dateRange','type'] exactly once and stops for good once
  // it falls off the end, even if an earlier stage (e.g. Engagement, skipped via Tab) is still
  // unfilled. Auto-chaining back to a skipped stage without the user asking again would silently
  // reopen a picker they'd already moved past. A skipped stage only becomes reachable again via an
  // explicit fresh "@" press once the picker is fully closed — which naturally restarts this same
  // scan from index 0, since `pickerOpen` is false at that point.
  const openPickerAtNextStage = useCallback(() => {
    const order: FilterStage[] = ['client', 'engagement', 'deliverable', 'dateRange', 'type']
    const isFilled: Record<FilterStage, boolean> = {
      client: !!clientChip,
      engagement: !!engagementChip,
      deliverable: !!deliverableChip,
      dateRange: !!dateRangeChip,
      type: !!typeChip,
    }
    const isEligible = (stage: FilterStage): boolean => {
      if (isFilled[stage]) return false
      if (stage === 'engagement') return !!clientChip
      if (stage === 'deliverable') return !!engagementChip
      return true
    }
    const startIndex = pickerOpen ? order.indexOf(pickerStage) + 1 : 0
    let nextStage: FilterStage | null = null
    for (let i = startIndex; i < order.length; i++) {
      if (isEligible(order[i])) { nextStage = order[i]; break }
    }
    if (!nextStage) {
      // Fell off the end of this pass — stop for good, don't wrap back to a skipped stage.
      if (pickerOpen) closePicker()
      return
    }
    setPickerStage(nextStage)
    setPickerQuery('')
    setPickerFocusedIndex(0)
    setPickerOpen(true)
    setFocusedChipIndex(null)
    if (nextStage === 'type') setPendingFileTypes(selectedFileTypes)
  }, [clientChip, engagementChip, deliverableChip, dateRangeChip, typeChip, pickerOpen, pickerStage, closePicker, selectedFileTypes])

  const selectChip = useCallback((entity: PickerEntity) => {
    setChips((prev) => {
      const withoutStage = prev.filter((c) => c.stage !== pickerStage)
      // Selecting a Client clears a previously selected Engagement/Deliverable (narrowing changed);
      // selecting an Engagement clears a previously selected Deliverable — same as picking a new
      // upstream filter invalidating downstream narrowed selections. dateRange/type have no
      // narrowing relationship to the other stages (neither is entity-scoped), so they're never
      // cleared by a Client/Engagement/Deliverable selection.
      const cleared = pickerStage === 'client'
        ? withoutStage.filter((c) => c.stage === 'client' || c.stage === 'dateRange' || c.stage === 'type')
        : pickerStage === 'engagement'
          ? withoutStage.filter((c) => c.stage !== 'deliverable')
          : withoutStage

      // Backfill upstream chips the user skipped past — e.g. picking an Engagement directly
      // (via Tab-skip past Client, or the @-cycle jumping ahead) should still show its owning
      // Client as a chip, since every Engagement/Deliverable belongs to exactly one Client/
      // Engagement. Only fills in a stage that's genuinely missing; never overrides an existing
      // explicit selection.
      const backfilled: SelectedChip[] = []
      if (pickerStage === 'engagement' && entity.clientId && !cleared.some((c) => c.stage === 'client')) {
        const client = pickerData.clients.find((c) => c.id === entity.clientId)
        if (client) backfilled.push({ stage: 'client', id: client.id, name: client.name })
      }
      if (pickerStage === 'deliverable' && entity.engagementId) {
        if (!cleared.some((c) => c.stage === 'engagement')) {
          const engagement = pickerData.engagements.find((e) => e.id === entity.engagementId)
          if (engagement) backfilled.push({ stage: 'engagement', id: engagement.id, name: engagement.name })
          if (engagement?.clientId && !cleared.some((c) => c.stage === 'client')) {
            const client = pickerData.clients.find((c) => c.id === engagement.clientId)
            if (client) backfilled.push({ stage: 'client', id: client.id, name: client.name })
          }
        } else if (entity.clientId && !cleared.some((c) => c.stage === 'client')) {
          const client = pickerData.clients.find((c) => c.id === entity.clientId)
          if (client) backfilled.push({ stage: 'client', id: client.id, name: client.name })
        }
      }

      return [...cleared, ...backfilled, { stage: pickerStage, id: entity.id, name: entity.name }]
    })
    // Auto-advance into the next eligible stage within the same @ session, deferred to the
    // chips-effect below since `chips` state hasn't updated yet at this point in the callback.
    // Focus is handled by openPickerAtNextStage/closePicker depending on the outcome — not here,
    // since focusing the textarea unconditionally would steal focus away from the picker input
    // when there's another stage to advance into.
    autoAdvanceRequested.current = true
  }, [pickerStage, pickerData])

  // Type is multi-select: Space toggles a category into pendingFileTypes without closing the
  // picker; "any" is exclusive with every other category (selecting it clears the rest, and
  // selecting any other category clears "any"), since "Any" means "don't filter by type."
  const toggleFileType = useCallback((option: FileTypeOption) => {
    setPendingFileTypes((prev) => {
      if (option === 'any') return prev.includes('any') ? [] : ['any']
      const withoutAny = prev.filter((t) => t !== 'any')
      return withoutAny.includes(option)
        ? withoutAny.filter((t) => t !== option)
        : [...withoutAny, option]
    })
  }, [])

  // advanceAfter: true for an explicit confirm (Enter, Apply click) — auto-advances into the next
  // eligible stage within the same @ session, same as selectChip. False for click-outside (just
  // close, don't pop open a new dropdown) and Tab-skip (which already advances separately itself,
  // so committing here must not also advance or the picker would skip two stages at once).
  const commitFileTypes = useCallback((advanceAfter: boolean) => {
    setChips((prev) => {
      const withoutType = prev.filter((c) => c.stage !== 'type')
      if (pendingFileTypes.length === 0) return withoutType
      const name = pendingFileTypes.map((t) => FILE_TYPE_LABEL[t]).join(', ')
      return [...withoutType, { stage: 'type', id: pendingFileTypes.join(','), name }]
    })
    if (advanceAfter) autoAdvanceRequested.current = true
    else closePicker()
  }, [pendingFileTypes, closePicker])

  const removeChip = useCallback((stage: FilterStage) => {
    setChips((prev) => {
      // Removing a chip also removes any downstream chips that depended on it narrowing.
      // dateRange/type have no dependents and don't depend on anything else.
      if (stage === 'client') return prev.filter((c) => c.stage === 'dateRange' || c.stage === 'type')
      if (stage === 'engagement') return prev.filter((c) => c.stage !== 'engagement' && c.stage !== 'deliverable')
      if (stage === 'deliverable') return prev.filter((c) => c.stage !== 'deliverable')
      return prev.filter((c) => c.stage !== stage)
    })
    setFocusedChipIndex(null)
    textareaRef.current?.focus()
  }, [])

  // Keep keyboard focus in sync with which chip element is logically focused.
  useEffect(() => {
    if (focusedChipIndex !== null) {
      chipRefs.current[focusedChipIndex]?.focus()
    }
  }, [focusedChipIndex, chips.length])

  // Focus the picker's own filter input whenever it opens or advances to a new stage. The input's
  // `autoFocus` prop only fires on its first real DOM mount — when auto-advance changes
  // pickerStage while the picker stays open (same JSX position, so React reuses the existing
  // input node instead of remounting it), autoFocus never re-fires, so focus would otherwise be
  // left wherever it last was (e.g. stolen back to the main search box), stranding keyboard users.
  useEffect(() => {
    if (pickerOpen) pickerInputRef.current?.focus()
  }, [pickerOpen, pickerStage])

  // Deferred auto-advance: selectChip/commitFileTypes set autoAdvanceRequested and commit a chip,
  // then this effect (which only re-runs once `chips` has actually updated) opens the next
  // eligible stage — openPickerAtNextStage reads clientChip/engagementChip/etc. derived from the
  // now-current `chips`, so eligibility (e.g. Engagement only after Client is set) reflects the
  // selection that was just made, not stale pre-update state.
  useEffect(() => {
    if (autoAdvanceRequested.current) {
      autoAdvanceRequested.current = false
      openPickerAtNextStage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)
        && composerRef.current && !composerRef.current.contains(e.target as Node)) {
        if (pickerStage === 'type') commitFileTypes(false)
        else closePicker()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [closePicker, pickerStage, commitFileTypes])

  // Recompute the portaled picker's position from the composer's live viewport rect whenever it
  // opens, and keep it in sync on scroll (capture phase, so scrolling inside the clipping
  // ancestor — which doesn't bubble a window-level scroll event — still updates it) and resize.
  useEffect(() => {
    if (!pickerOpen) { setPickerPosition(null); return }
    const updatePosition = () => {
      const rect = composerRef.current?.getBoundingClientRect()
      if (rect) setPickerPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [pickerOpen])

  const runSearch = useCallback(async () => {
    if (!accessToken) return
    const hasQuery = debouncedQuery.trim().length >= 2
    const hasFilters = clientChip || engagementChip || deliverableChip || dateRangeChip || typeChip
    if (!hasQuery && !hasFilters) {
      setResults([])
      setResolvedFilters(null)
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    try {
      const params = new URLSearchParams()
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
      if (clientChip) params.set('clientId', clientChip.id)
      if (engagementChip) params.set('engagementId', engagementChip.id)
      if (deliverableChip) params.set('deliverableDocumentId', deliverableChip.id)
      if (dateRangeChip) {
        const preset = dateRangeChip.id as RelativeTimePreset
        const { start, end } = resolveRelativeTimeRange(preset)
        params.set('dateStart', start.toISOString())
        params.set('dateEnd', end.toISOString())
        // Recency presets reflect recent activity (updatedAt); only "Overdue" is meaningfully
        // tied to a document's dueDate.
        params.set('dateField', preset === 'Overdue' ? 'dueDate' : 'updatedAt')
      }

      const res = await fetch(`/api/firms/${firmId}/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setResults([])
        setResolvedFilters(null)
        return
      }
      const files: GlobalSearchResult[] = data.files ?? []
      setResults(files)
      setResolvedFilters(data.resolvedFilters ?? null)
      currentHistoryEntryId.current = recordSearchHistory(firmId, debouncedQuery, chips, files.length)
      setSearchHistory(getSearchHistory(firmId))
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [firmId, accessToken, debouncedQuery, clientChip, engagementChip, deliverableChip, dateRangeChip, typeChip, chips])

  useEffect(() => {
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, clientChip, engagementChip, deliverableChip, dateRangeChip, typeChip, accessToken])

  // Deep-links to the Files tab, reusing the existing /api/deeplink resolver (slug lookup +
  // permission check) unmodified — same cookie-auth fetch as components/ui/top-bar.tsx's
  // resolveDeeplink, but opened in a new tab (not router.push) since a search result is a
  // reference to jump to, not a page navigation away from the search itself.
  const openInFiles = useCallback(async (file: GlobalSearchResult) => {
    if (!file.engagementId) return
    setOpeningExternalId(file.externalId)
    try {
      const documentId = file.documentId ?? file.externalId
      const qs = new URLSearchParams({ kind: 'document', projectId: file.engagementId, documentId })
      const res = await fetch(`/api/deeplink?${qs.toString()}`)
      if (!res.ok) return
      const data = await res.json().catch(() => null) as { url?: string } | null
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
        if (currentHistoryEntryId.current) {
          recordSearchHistoryOpen(firmId, currentHistoryEntryId.current)
          setSearchHistory(getSearchHistory(firmId))
        }
      }
    } catch {
      // ignore - link just won't navigate
    } finally {
      setOpeningExternalId(null)
    }
  }, [firmId])

  const filteredResults = (selectedFileTypes.length === 0 || selectedFileTypes.includes('any'))
    ? results
    : results.filter((f) => selectedFileTypes.includes(classifyFileType(f)))

  const rerunHistoryEntry = useCallback((entry: SearchHistoryEntry) => {
    setChips(entry.chips)
    setSearchQuery(entry.query)
    setDebouncedQuery(entry.query)
    setHistoryOpen(false)
    textareaRef.current?.focus()
  }, [])

  const deleteHistoryEntry = useCallback((entryId: string) => {
    removeSearchHistoryEntry(firmId, entryId)
    setSearchHistory(getSearchHistory(firmId))
  }, [firmId])

  const clearAllHistory = useCallback(() => {
    saveSearchHistory(firmId, [])
    setSearchHistory([])
  }, [firmId])

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 bg-ki-bg">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="shrink-0 px-6 pb-4 bg-ki-bg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-headline text-2xl font-semibold tracking-tight text-ki-on-surface">Document Search</h1>
              <p className="text-sm text-ki-on-surface-variant mt-1">
                Search documents across every client and engagement you have access to. Type <span className="font-mono font-medium text-primary">@</span> to filter by client, engagement, deliverable, time, or type.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
                historyOpen
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-ki-surface border-ki-outline text-ki-on-surface-variant hover:bg-ki-surface-low'
              )}
              aria-pressed={historyOpen}
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
          </div>

          <div ref={composerRef} className="relative mt-4">
            <div className="flex rounded-md border border-ki-outline bg-ki-surface shadow-sm overflow-hidden transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5">
              <div className="flex flex-col justify-center py-3 pl-4 pr-2 shrink-0">
                <Search className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 px-1 py-2.5">
                {orderedChips.map((chip, index) => {
                  const Icon = STAGE_ICON[chip.stage]
                  const isFocused = focusedChipIndex === index
                  return (
                    <button
                      key={chip.stage}
                      type="button"
                      ref={(el) => { chipRefs.current[index] = el }}
                      tabIndex={-1}
                      onFocus={() => setFocusedChipIndex(index)}
                      onClick={() => setFocusedChipIndex(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' || e.key === 'Delete') {
                          e.preventDefault()
                          removeChip(chip.stage)
                          return
                        }
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault()
                          if (index > 0) setFocusedChipIndex(index - 1)
                          return
                        }
                        if (e.key === 'ArrowRight') {
                          e.preventDefault()
                          if (index < orderedChips.length - 1) setFocusedChipIndex(index + 1)
                          else { setFocusedChipIndex(null); textareaRef.current?.focus() }
                          return
                        }
                        if (e.key === 'Escape') {
                          setFocusedChipIndex(null)
                          textareaRef.current?.focus()
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border shrink-0 transition-colors focus:outline-none font-mono',
                        isFocused
                          ? 'bg-red-50 text-red-700 border-red-300 ring-1 ring-red-300'
                          : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15'
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {chip.name}
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); removeChip(chip.stage) }}
                        className={cn('ml-0.5 -mr-0.5 rounded', isFocused ? 'hover:bg-red-100' : 'hover:bg-primary/20')}
                        aria-label={`Remove ${STAGE_LABEL[chip.stage]} filter`}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  )
                })}
                <input
                  ref={textareaRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => setFocusedChipIndex(null)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === '@' && !pickerOpen
                      && (pickerData.clients.length > 0 || pickerData.engagements.length > 0 || pickerData.deliverables.length > 0)) {
                      e.preventDefault()
                      openPickerAtNextStage()
                      return
                    }
                    const atStart = (e.currentTarget.selectionStart ?? 0) === 0 && (e.currentTarget.selectionEnd ?? 0) === 0
                    if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && atStart && chips.length > 0) {
                      e.preventDefault()
                      setFocusedChipIndex(chips.length - 1)
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setDebouncedQuery(searchQuery)
                    }
                  }}
                  placeholder={chips.length === 0 ? 'Search by filename or topic, e.g. SEO strategy documents' : 'Add more to your search...'}
                  className="flex-1 min-w-[10rem] py-1 px-1 border-0 bg-transparent text-sm font-medium shadow-none focus:outline-none focus:ring-0"
                  autoFocus
                  aria-label="Document search"
                />
              </div>
              <div className="flex flex-col justify-center py-2 pl-1.5 pr-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setChips([])
                    setFocusedChipIndex(null)
                    setPendingFileTypes([])
                    closePicker()
                  }}
                  disabled={!searchQuery.trim() && chips.length === 0}
                  className={cn(
                    'p-1 rounded-full',
                    (searchQuery.trim() || chips.length > 0) ? 'text-ki-on-surface-variant hover:bg-ki-surface-low' : 'text-ki-outline-variant'
                  )}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {pickerOpen && pickerPosition && createPortal(
              <div
                ref={pickerRef}
                style={{ position: 'fixed', top: pickerPosition.top, left: pickerPosition.left, width: pickerPosition.width, maxWidth: 320 }}
                className="z-50 rounded-md border border-ki-outline bg-ki-surface shadow-lg py-1"
              >
                <div className="px-2.5 py-1.5 border-b border-ki-outline text-[10px] font-mono font-medium uppercase tracking-widest text-ki-on-surface-variant">
                  {STAGE_LABEL[pickerStage]}
                </div>
                <input
                  ref={pickerInputRef}
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => { setPickerQuery(e.target.value); setPickerFocusedIndex(0) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      closePicker()
                      e.stopPropagation()
                      return
                    }
                    if (e.key === '@') {
                      // Already open — treat another "@" as "skip to the next stage",
                      // so Time is reachable without completing Client/Engagement/Deliverable.
                      e.preventDefault()
                      openPickerAtNextStage()
                      return
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setPickerFocusedIndex((i) => Math.min(i + 1, filteredOptions.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setPickerFocusedIndex((i) => Math.max(i - 1, 0))
                    } else if (e.key === ' ' && pickerStage === 'type') {
                      // Type is multi-select — Space toggles the focused category without closing the picker.
                      e.preventDefault()
                      if (filteredOptions[pickerFocusedIndex]) toggleFileType(filteredOptions[pickerFocusedIndex].id as FileTypeOption)
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      if (pickerStage === 'type') {
                        commitFileTypes(true)
                      } else if (filteredOptions[pickerFocusedIndex]) {
                        selectChip(filteredOptions[pickerFocusedIndex])
                      }
                    } else if (e.key === 'Tab') {
                      // Skip this stage without selecting, advance to the next eligible one
                      // (Engagement/Deliverable are only eligible once their parent is set).
                      e.preventDefault()
                      if (pickerStage === 'type' && pendingFileTypes.length > 0) {
                        commitFileTypes(true)
                      } else {
                        openPickerAtNextStage()
                      }
                    }
                  }}
                  placeholder={pickerStage === 'type' ? 'Filter types, Space to toggle...' : `Filter ${STAGE_LABEL[pickerStage].toLowerCase()}s, or Tab to skip...`}
                  className="w-full px-2.5 py-1.5 text-xs border-b border-ki-outline focus:outline-none"
                />
                <div className="max-h-56 overflow-y-auto">
                  {filteredOptions.length === 0 && (
                    <div className="px-2.5 py-2 text-xs text-ki-on-surface-variant">No matches</div>
                  )}
                  {filteredOptions.map((o, i) => {
                    const isChecked = pickerStage === 'type' && pendingFileTypes.includes(o.id as FileTypeOption)
                    return (
                      <button
                        key={o.id}
                        type="button"
                        ref={(el) => { if (el && i === pickerFocusedIndex) el.scrollIntoView({ block: 'nearest' }) }}
                        onMouseEnter={() => setPickerFocusedIndex(i)}
                        onClick={() => (pickerStage === 'type' ? toggleFileType(o.id as FileTypeOption) : selectChip(o))}
                        className={cn(
                          'w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2',
                          i === pickerFocusedIndex ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-ki-surface-low'
                        )}
                      >
                        {pickerStage === 'type' && (
                          <span className={cn(
                            'shrink-0 h-3.5 w-3.5 rounded-sm border flex items-center justify-center',
                            isChecked ? 'bg-primary border-primary' : 'border-ki-outline'
                          )}>
                            {isChecked && <span className="h-1.5 w-1.5 rounded-[1px] bg-ki-surface" />}
                          </span>
                        )}
                        {o.name}
                      </button>
                    )
                  })}
                </div>
                <div className="px-2.5 py-1.5 border-t border-ki-outline flex items-center justify-between gap-2 text-[9px] font-mono text-ki-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span><kbd className="px-1 py-0.5 rounded border border-ki-outline bg-ki-surface-low">↑↓</kbd> Navigate</span>
                    {pickerStage === 'type' ? (
                      <span><kbd className="px-1 py-0.5 rounded border border-ki-outline bg-ki-surface-low">Space</kbd> Toggle</span>
                    ) : (
                      <span><kbd className="px-1 py-0.5 rounded border border-ki-outline bg-ki-surface-low">Enter</kbd> Select</span>
                    )}
                  </div>
                  {pickerStage === 'type' ? (
                    <button
                      type="button"
                      onClick={() => commitFileTypes(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors"
                    >
                      <kbd className="px-1 py-0.5 rounded border border-primary/30 bg-ki-surface">Enter</kbd> Apply
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openPickerAtNextStage}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-ki-on-surface-variant hover:bg-ki-surface-low hover:text-ki-on-surface font-bold transition-colors"
                    >
                      <kbd className="px-1 py-0.5 rounded border border-ki-outline bg-ki-surface-low">Tab</kbd> Skip
                    </button>
                  )}
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* Only surface this confirmation line for chrono's soft, implicit date detection from
              typed text — an explicit @ Time chip already shows its own preset name as a chip,
              so repeating the resolved range here would be redundant. */}
          {resolvedFilters?.dateRange && !dateRangeChip && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ki-on-surface-variant">
              <span className="px-1.5 py-0.5 rounded bg-ki-surface-low font-mono font-medium text-ki-on-surface">
                {new Date(resolvedFilters.dateRange.start).toLocaleDateString()} – {new Date(resolvedFilters.dateRange.end).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {hasSearched && (
            isSearching ? (
              <div className="py-12 flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-10 w-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <Sparkles className="h-4 w-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-xs text-ki-on-surface-variant font-medium">Searching across your firm...</p>
              </div>
            ) : results.length > 0 ? (
              <>
                <div className="flex items-center justify-end gap-2 mb-4">
                  <span className="text-[10px] font-mono text-ki-on-surface-variant shrink-0">
                    {filteredResults.length} {filteredResults.length === 1 ? 'Result' : 'Results'} found
                  </span>
                </div>

                {filteredResults.length > 0 ? (
                  <div className="space-y-3">
                    {filteredResults.map((file) => {
                      const matchType = file.matchType === 'name' || file.matchType === 'semantic' ? file.matchType : 'semantic'
                      const isOpening = openingExternalId === file.externalId
                      const breadcrumbParts = [
                        file.clientName ? { icon: Building2, label: file.clientName } : null,
                        file.engagementName ? { icon: Briefcase, label: file.engagementName } : null,
                        // Full ancestor-folder chain (root-first), not just the immediate parent —
                        // e.g. Naviqure AI > Q2 - Go-To-Market & Positioning > 04_Enablement &
                        // Launch Execution > 01_Sales_Playbooks_&_Battlecards for a file nested
                        // two folders deep under the engagement root.
                        ...(file.ancestorFolderNames ?? []).map(name => ({ icon: Folder, label: name })),
                      ].filter((p): p is { icon: typeof Building2; label: string } => p !== null)
                      return (
                        <button
                          key={file.externalId}
                          type="button"
                          onClick={() => openInFiles(file)}
                          disabled={isOpening}
                          className="group w-full text-left bg-ki-surface border border-ki-outline p-4 rounded hover:shadow-md hover:border-primary/50 transition-all disabled:opacity-60 flex gap-4"
                        >
                          <div className={cn(
                            'w-12 h-12 flex items-center justify-center rounded border shrink-0 transition-colors',
                            file.isFolder
                              ? 'bg-primary/5 border-primary/20 group-hover:bg-primary/10'
                              : 'bg-ki-surface-low border-ki-outline group-hover:bg-primary/5'
                          )}>
                            {file.isFolder ? (
                              <Folder className="h-6 w-6 text-primary" />
                            ) : (
                              <DocumentIcon mimeType={file.metadata?.mimeType} size={24} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="flex items-center gap-1.5 text-sm text-ki-on-surface min-w-0">
                              {file.docId && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded-sm bg-ki-surface-low border border-ki-outline text-[9px] font-mono font-bold text-ki-on-surface-variant">
                                  {file.docId}
                                </span>
                              )}
                              <span className="font-medium group-hover:text-primary transition-colors truncate">
                                {file.fileName}
                              </span>
                            </h3>
                            {breadcrumbParts.length > 0 && (
                              <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1">
                                {breadcrumbParts.map((part, i) => {
                                  const PartIcon = part.icon
                                  return (
                                    <React.Fragment key={i}>
                                      {i > 0 && <span className="text-ki-outline-variant">•</span>}
                                      <span className="inline-flex items-center gap-1 text-[10px] text-ki-on-surface-variant font-mono">
                                        <PartIcon className="h-2.5 w-2.5 shrink-0" />
                                        {part.label}
                                      </span>
                                    </React.Fragment>
                                  )
                                })}
                              </div>
                            )}
                            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest bg-primary/10 text-primary">
                              {matchType === 'semantic' ? <Sparkles className="h-2.5 w-2.5" /> : <Hash className="h-2.5 w-2.5" />}
                              {matchType === 'semantic' ? 'Semantic Match' : 'File Match'}
                            </div>
                          </div>
                          <div className="text-right flex flex-col justify-between items-end shrink-0">
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              {!file.isFolder && file.updatedByName && (
                                <UserAvatarWithTooltip
                                  displayName={file.updatedByName}
                                  email={file.updatedByEmail ?? undefined}
                                  photoLink={file.updatedByAvatarUrl ?? undefined}
                                  avatarSize="sm"
                                />
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] font-mono text-ki-on-surface-variant">
                                    {formatRelativeTime(file.updatedAt)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {formatDateTimeWithTZ(file.updatedAt)}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-ki-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-sm text-ki-on-surface-variant">No results match this search{typeChip ? ` and ${typeChip.name} filter` : ''}.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <div className="bg-ki-surface-low h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Search className="h-6 w-6 text-ki-on-surface-variant" />
                </div>
                <p className="text-sm font-medium text-ki-on-surface">No results found</p>
                <p className="text-xs text-ki-on-surface-variant mt-1">
                  Try a different search term or remove a filter.
                </p>
              </div>
            )
          )}

          {!hasSearched && searchHistory.length > 0 && !historyOpen && (
            <div className="py-8 text-center">
              <p className="text-xs text-ki-on-surface-variant">Open History to revisit a past search.</p>
            </div>
          )}
        </div>
      </div>

      {historyOpen && (
        <aside className="w-80 shrink-0 border border-ki-outline bg-ki-surface flex flex-col min-h-0 mb-4 mr-4 rounded-md overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-ki-outline flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-ki-on-surface">Search History</p>
            {searchHistory.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={clearAllHistory}
                    className="p-1 rounded text-ki-on-surface-variant hover:text-primary hover:bg-ki-surface-low transition-colors"
                    aria-label="Clear all search history"
                  >
                    <BrushCleaning className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Clear all history</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {searchHistory.length === 0 ? (
              <div className="py-8 text-center px-4">
                <p className="text-xs text-ki-on-surface-variant">No searches yet. Your last {SEARCH_HISTORY_MAX} searches will appear here.</p>
              </div>
            ) : (
              <ul>
                {searchHistory.map((entry) => {
                  const isZeroResult = entry.resultCount === 0
                  return (
                    <li key={entry.id} className="border-b border-ki-outline last:border-b-0">
                      <div className="group relative px-4 py-3 hover:bg-ki-surface-low transition-colors">
                        <button
                          type="button"
                          onClick={() => rerunHistoryEntry(entry)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap pr-6">
                            {entry.chips.map((chip) => {
                              const Icon = STAGE_ICON[chip.stage]
                              return (
                                <span key={chip.stage} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-mono font-medium">
                                  <Icon className="h-2.5 w-2.5" />
                                  {chip.name}
                                </span>
                              )
                            })}
                            {entry.query && (
                              <span className="text-sm font-medium text-ki-on-surface truncate">{entry.query}</span>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono text-ki-on-surface-variant">
                            <span>{formatRelativeTime(new Date(entry.timestamp).toISOString())}</span>
                            <span className="text-ki-outline-variant">•</span>
                            <span className={cn(isZeroResult && 'text-error font-medium')}>
                              {entry.resultCount} {entry.resultCount === 1 ? 'result' : 'results'}
                            </span>
                            {entry.openedCount > 0 && (
                              <>
                                <span className="text-ki-outline-variant">•</span>
                                <span className="inline-flex items-center gap-0.5 text-primary">
                                  <ArrowUpRight className="h-2.5 w-2.5" />
                                  opened {entry.openedCount}
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => deleteHistoryEntry(entry.id)}
                              className="absolute top-3 right-3 p-1 rounded text-ki-on-surface-variant opacity-0 group-hover:opacity-100 hover:bg-ki-surface hover:text-error transition-all"
                              aria-label="Clear from history"
                            >
                              <BrushCleaning className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Clear from history</TooltipContent>
                        </Tooltip>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      )}
    </div>
    </TooltipProvider>
  )
}
