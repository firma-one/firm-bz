'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Folder, Sparkles, X, Building2, Briefcase, Hash, FileText, ArrowUpRight, ArrowRight, RefreshCw, History, BrushCleaning, CalendarClock, Info, ChevronRight, FolderPlus, AlignLeft } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { UserAvatarWithTooltip } from '@/components/ui/user-avatar-with-tooltip'
import { formatRelativeTime, cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { PageHeading } from '@/components/ui/page-heading'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Tag } from '@/components/ui/tag'
import { Hint } from '@/components/ui/tooltip'
import { FilterMenuLabel, FilterMenuRow, FilterMenuSearch, FilterPill, summarizePicks } from '@/components/ui/filter-pill'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { resolvePeriod } from '@/lib/search/period'
import { fetchWithTimeout, AI_TIMEOUT_MS } from '@/lib/ai/fetch-timeout'
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
  createdAt?: string | null
  dueDate?: string | null
  score: number
  metadata?: any
  isFolder?: boolean
  matchType?: 'name' | 'semantic' | 'description'
  /** Set when the words were found only in the description written for it in Firma: shown as why. */
  description?: string | null
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

// File-type categories for the multi-select Type filter. 'any' is not stored as a value: it is
// the absence of a type chip, and it displays with every category checked, since "Any" and "all
// of them" filter identically. Picking 'any' therefore clears the rest; unchecking a category
// under it narrows to the others. See toggleFileTypeSimple.
const FILE_TYPE_OPTIONS = ['document', 'spreadsheet', 'presentation', 'image', 'audio', 'video', 'folder', 'any'] as const
type FileTypeOption = typeof FILE_TYPE_OPTIONS[number]
/** Every concrete category, i.e. the options minus the exclusive 'any'. */
const CONCRETE_FILE_TYPES = FILE_TYPE_OPTIONS.filter((t) => t !== 'any') as Exclude<FileTypeOption, 'any'>[]
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

// Single source of truth for stage order — used for chip display order, the @/Tab auto-advance
// scan, and the filter-badge row. Client/Engagement/Deliverable stay first (hierarchical), with
// Type before Time at the end.
const FILTER_STAGE_ORDER: FilterStage[] = ['client', 'engagement', 'deliverable', 'type', 'dateRange']

interface SelectedChip {
  stage: FilterStage
  id: string
  name: string
}

/** The "no filter" entry at the top of each dropdown. */
const STAGE_ANY_LABEL: Record<FilterStage, string> = {
  client: 'Any client',
  engagement: 'Any engagement',
  deliverable: 'Any deliverable',
  dateRange: 'Anytime',
  type: 'Any type',
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
  deliverable: FolderPlus,
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

/** What the Time menu and chip show. The preset itself stays the id (the search and the Ask
 *  interpreter match on it), so only the display moves to sentence case. */
const TIME_PRESET_LABEL: Record<RelativeTimePreset, string> = {
  'Overdue': 'Overdue',
  'Today': 'Today',
  'Last 7 days': 'Last 7 days',
  'Last 30 days': 'Last 30 days',
  'This Quarter': 'This quarter',
  'This Year': 'This year',
}

/** Long lists (clients, engagements, deliverables) get a search box in their menu past this. */
const MENU_SEARCH_THRESHOLD = 7


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

/**
 * Ask Brio mode — prose interpreted into filter chips by a paid model call — is hidden
 * (2026-10-15). It runs the same search as Filters, so it found nothing Filters doesn't, while
 * costing credits and making people pick a mode. The code stays until Deepak signs off on
 * removing it; flip this to bring the Filters / Ask toggle back.
 */
const ASK_MODE_ENABLED = false

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
  // 'filters' is today's live chip-picker search. 'ask' interprets prose into chips on submit,
  // costs AI credits, and never fires while typing.
  const [modeState, setMode] = useState<'filters' | 'ask'>('filters')
  // Ask only exists while ASK_MODE_ENABLED is on: state left over from before it was switched off
  // (a tab kept open, fast refresh) must not bring back its prompt or its paid submit.
  const mode = ASK_MODE_ENABLED ? modeState : 'filters'
  const [interpreting, setInterpreting] = useState(false)
  const [askNote, setAskNote] = useState<string | null>(null)
  // Chips the model inferred, by stage — rendered with a marker so they are distinguishable
  // from ones the user picked, and cleared whenever the user edits the query.
  const [inferredStages, setInferredStages] = useState<FilterStage[]>([])
  // Set when an Ask submission has resolved and its search should run. Intent cannot be inferred
  // by comparing searchQuery to debouncedQuery: interpretation deliberately rewrites the query
  // (stripping the parts that became filters), so the two differ exactly when a search is wanted.
  const [askSubmitted, setAskSubmitted] = useState(false)
  /** Set when the zero-result ladder (§A.11) had to relax an inferred filter to find anything. */
  const [relaxedNote, setRelaxedNote] = useState<string | null>(null)
  /** Stages the zero-result ladder dropped for the current result set (§A.11). */
  const [relaxedStages, setRelaxedStages] = useState<FilterStage[]>([])
  /**
   * Stages where the typed sentence asked for one value and a hand-picked chip already held
   * another. The chip wins, but the user is told, and can switch in one click.
   */
  const [conflicts, setConflicts] = useState<{ stage: FilterStage; keptName: string; ignoredName: string; ignoredId: string }[]>([])
  /** A client Brio nearly picked instead (§A.11). Offered as a switch, never as a blocking question. */
  const [ambiguity, setAmbiguity] = useState<{ chosenId: string; alternativeId: string; alternativeName: string } | null>(null)
  // Bumped on every Ask submission. Without it, resubmitting an identical query changes no
  // dependency and the search effect never re-runs.
  const [askRunId, setAskRunId] = useState(0)
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
  /** The search box inside whichever filter menu is open; cleared each time a menu opens. */
  const [menuQuery, setMenuQuery] = useState('')
  // Index into `chips` of the chip currently focused via keyboard, or null when focus is in the text input.
  // In-progress multi-select state while the Type picker is open — not committed to `chips`
  // until the user confirms (Enter) or closes the picker, so partial toggling doesn't
  // re-trigger a search on every Space press.
  // The picker dropdown is rendered via a portal (see render below) so it can escape the firm
  // page's `overflow-y-auto` tab-content wrapper (firm-clients-view.tsx), which otherwise clips
  // any `position: absolute` descendant that extends past its scrolled viewport — no z-index can
  // fix that, since z-index only affects paint order within a stacking context, not clipping
  // across an overflow boundary. Position is computed from the composer's viewport rect and kept
  // in sync while the picker is open.
  // Set right after selectChip/commitFileTypes commits a chip, to auto-advance into the next
  // eligible stage once `chips` state has actually updated — openPickerAtNextStage reads
  // clientChip/engagementChip/etc. derived from `chips`, which are still stale immediately after
  // setChips (React batches the update), so the advance is deferred to an effect keyed off chips
  // itself rather than called synchronously right after setChips.
  // How the picker was opened for the current stage — 'keyboard' (via @ or Tab-skip) keeps the
  // guided auto-advance-through-remaining-stages flow; 'mouse' (clicking an empty filter badge
  // directly) is a one-off lookup with no forced sequence, so selecting a value just closes back
  // to the badge row rather than auto-opening the next stage.
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLInputElement>(null)

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
    // Ask mode submits explicitly, so no debounce — typing must not fire a paid interpretation.
    if (mode === 'ask') return
    const t = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchQuery, mode])

  // Editing the query invalidates chips inferred from the previous one.
  useEffect(() => {
    setAskSubmitted(false)
    if (inferredStages.length > 0) {
      setChips((prev) => prev.filter((c) => !inferredStages.includes(c.stage)))
      setInferredStages([])
      setAskNote(null)
      setRelaxedNote(null)
      setRelaxedStages([])
      setConflicts([])
      setAmbiguity(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  /**
   * Ask mode submit: interpret the sentence into chips, then run the normal search with them.
   * One model call per submission — never while typing.
   */
  const runAskSearch = useCallback(async () => {
    const text = searchQuery.trim()
    if (!text || interpreting || !accessToken) return

    setInterpreting(true)
    setAskNote(null)
    setRelaxedNote(null)
    setRelaxedStages([])
    setConflicts([])
    setAmbiguity(null)
    try {
      const res = await fetchWithTimeout(`/api/firms/${firmId}/search/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ text }),
      }, AI_TIMEOUT_MS.interpret)

      if (!res.ok) {
        // Interpretation is an enhancement: fall back to searching the raw text.
        setAskNote(res.status === 503
          ? `${ASSISTANT.name} is unavailable — searching without filters.`
          : `Could not interpret that — searching without filters.`)
        setAskSubmitted(true)
        setAskRunId((n) => n + 1)
        setDebouncedQuery(text)
        return
      }

      const data = await res.json() as {
        chips?: SelectedChip[]
        residualText?: string
        degraded?: boolean
        ambiguity?: { stage: FilterStage; chosenId: string; alternativeId: string; alternativeName: string }
      }
      setAmbiguity(data.ambiguity && data.ambiguity.stage === 'client' ? data.ambiguity : null)
      const inferred = data.chips ?? []

      // User-picked chips always win; inference only fills stages left empty. A chip the user set
      // by hand is an instruction, not a guess, so prose never overrides it.
      const taken = new Set(chips.map((c) => c.stage))
      const applied = inferred.filter((c) => !taken.has(c.stage))
      // Conflicts: prose resolved a filter for a stage the user had already set, to a DIFFERENT
      // value. Silently dropping it leaves the user believing their sentence was honoured.
      const conflicts = inferred.filter((c) => {
        const existing = chips.find((x) => x.stage === c.stage)
        return existing !== undefined && existing.id !== c.id
      })
      setChips((prev) => [...prev, ...applied])
      // Only stages inference actually FILLED are inferred. Marking a conflicting stage inferred
      // would let the zero-result ladder relax the user's own hand-picked chip.
      setInferredStages(applied.map((c) => c.stage))
      setConflicts(conflicts.map((c) => {
        const existing = chips.find((x) => x.stage === c.stage)!
        return { stage: c.stage, keptName: existing.name, ignoredName: c.name, ignoredId: c.id }
      }))

      if (data.degraded) setAskNote('Searching without filters.')
      else if (inferred.length === 0) setAskNote('No filters matched — searching everything.')

      setAskSubmitted(true)
      setAskRunId((n) => n + 1)
      setDebouncedQuery((data.residualText ?? text).trim() || text)
    } catch {
      setAskNote('Could not interpret that — searching without filters.')
      setAskSubmitted(true)
      setAskRunId((n) => n + 1)
      setDebouncedQuery(text)
    } finally {
      setInterpreting(false)
    }
    // `chips` is a dependency because the conflict check compares inference against the
    // chips the user currently has set; a stale array would miss or invent conflicts.
  }, [firmId, accessToken, searchQuery, interpreting, chips])

  const removeChip = useCallback((stage: FilterStage) => {
    setChips((prev) => {
      // Removing a chip also removes any downstream chips that depended on it narrowing.
      // dateRange/type have no dependents and don't depend on anything else.
      if (stage === 'client') return prev.filter((c) => c.stage === 'dateRange' || c.stage === 'type')
      if (stage === 'engagement') return prev.filter((c) => c.stage !== 'engagement' && c.stage !== 'deliverable')
      if (stage === 'deliverable') return prev.filter((c) => c.stage !== 'deliverable')
      return prev.filter((c) => c.stage !== stage)
    })
    setInferredStages((prev) => prev.filter((s) => s !== stage))
  }, [])

  /**
   * Options for one filter, narrowed by the selections above it: picking a client limits
   * engagements to that client's, and picking an engagement limits deliverables to its own.
   */
  const optionsForStage = useCallback((stage: FilterStage): PickerEntity[] => {
    if (stage === 'client') return pickerData.clients
    if (stage === 'engagement') {
      return clientChip
        ? pickerData.engagements.filter((e) => e.clientId === clientChip.id)
        : pickerData.engagements
    }
    if (stage === 'deliverable') {
      if (engagementChip) return pickerData.deliverables.filter((d) => d.engagementId === engagementChip.id)
      if (clientChip) {
        const ids = new Set(pickerData.engagements.filter((e) => e.clientId === clientChip.id).map((e) => e.id))
        return pickerData.deliverables.filter((d) => d.engagementId && ids.has(d.engagementId))
      }
      return pickerData.deliverables
    }
    if (stage === 'dateRange') {
      return RELATIVE_TIME_PRESETS.map((p) => ({ id: p, name: TIME_PRESET_LABEL[p] }))
    }
    return []
  }, [pickerData, clientChip, engagementChip])

  /** Why a filter is unavailable, or null when it can be used. */
  const stageDisabledReason = useCallback((stage: FilterStage): string | null => {
    if (stage === 'engagement' && pickerData.engagements.length === 0) return 'No engagements available'
    if (stage === 'deliverable' && !clientChip && !engagementChip) return 'Select a client or engagement first'
    return null
  }, [pickerData, clientChip, engagementChip])

  /** Commits a selection, clearing any downstream filter the new value invalidates. */
  const selectStageValue = useCallback((stage: FilterStage, entity: PickerEntity) => {
    setChips((prev) => {
      let next = prev.filter((c) => c.stage !== stage)
      if (stage === 'client') next = next.filter((c) => c.stage !== 'engagement' && c.stage !== 'deliverable')
      if (stage === 'engagement') next = next.filter((c) => c.stage !== 'deliverable')
      return [...next, { stage, id: entity.id, name: entity.name }]
    })
    setInferredStages((prev) => prev.filter((s) => s !== stage))
  }, [])

  /**
   * Type is multi-select. 'any' is the absence of a chip rather than a value of its own, and
   * because every category is shown as checked under it, a click on one has to read as
   * UNCHECKING that one — so narrowing starts from all categories and removes the clicked one,
   * not from nothing and adds it.
   *
   * Selecting every category back is the same filter as 'any' (classifyFileType buckets every
   * result into one of them), so it collapses to no chip instead of listing all seven.
   */
  const toggleFileTypeSimple = useCallback((opt: FileTypeOption) => {
    setChips((prev) => {
      const current = prev.find((c) => c.stage === 'type')
      const selected = current ? (current.id.split(',').filter(Boolean) as FileTypeOption[]) : []
      // No chip means 'any', which shows every category checked — so start from all of them.
      const base: FileTypeOption[] = selected.length === 0 ? [...CONCRETE_FILE_TYPES] : selected
      const next = opt === 'any'
        ? []
        : base.includes(opt) ? base.filter((t) => t !== opt) : [...base, opt]

      const without = prev.filter((c) => c.stage !== 'type')
      // Nothing left, or everything selected — both mean "don't filter by type".
      if (next.length === 0 || next.length === CONCRETE_FILE_TYPES.length) return without
      return [...without, {
        stage: 'type' as FilterStage,
        id: next.join(','),
        name: summarizePicks(next.map((t) => FILE_TYPE_LABEL[t])),
      }]
    })
    setInferredStages((prev) => prev.filter((s) => s !== 'type'))
  }, [])


  /**
   * Runs one search against an explicit chip set, rather than reading chip state. The zero-result
   * ladder needs to try progressively relaxed filter sets within a single pass, which is only
   * possible if the filters are an argument instead of a dependency.
   */
  const executeSearch = useCallback(async (
    query: string,
    filters: { client?: SelectedChip; engagement?: SelectedChip; deliverable?: SelectedChip; dateRange?: SelectedChip; type?: SelectedChip },
  ): Promise<GlobalSearchResult[] | null> => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (filters.client) params.set('clientId', filters.client.id)
    if (filters.engagement) params.set('engagementId', filters.engagement.id)
    if (filters.deliverable) params.set('deliverableDocumentId', filters.deliverable.id)
    if (filters.dateRange) {
      // The chip id is either a relative preset ("Last 7 days") or an absolute period token
      // ("Q1 2026"). Absolute periods are resolved by the shared grammar so the same token means
      // the same range wherever it is read.
      const absolute = resolvePeriod(filters.dateRange.id)
      if (absolute) {
        params.set('dateStart', absolute.start.toISOString())
        params.set('dateEnd', absolute.end.toISOString())
        // An absolute period asks which quarter/year a document BELONGS to, so it falls back to
        // creation rather than last activity — a Q1 document edited in Q3 still belongs to Q1.
        // `dueDate` is sent so the server's COALESCE(dueDate, createdAt) applies: due date wins
        // when there is one, creation date otherwise.
        params.set('dateField', 'dueDate')
      } else {
        const preset = filters.dateRange.id as RelativeTimePreset
        const { start, end } = resolveRelativeTimeRange(preset)
        params.set('dateStart', start.toISOString())
        params.set('dateEnd', end.toISOString())
        // Recency presets genuinely mean recent ACTIVITY ("Last 7 days" = touched recently), so
        // updatedAt is correct here — unlike an absolute period above. Only "Overdue" is tied to
        // a document's dueDate.
        params.set('dateField', preset === 'Overdue' ? 'dueDate' : 'updatedAt')
        // Overdue must not fall back to updatedAt: an un-dated document is not overdue.
        if (preset === 'Overdue') params.set('strictDueDate', '1')
      }
    }

    const res = await fetch(`/api/firms/${firmId}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    // null distinguishes "request failed" from "searched, found nothing" — the ladder must not
    // treat a 500 as a reason to relax filters.
    if (!res.ok) return null
    setResolvedFilters(data.resolvedFilters ?? null)
    return (data.files ?? []) as GlobalSearchResult[]
  }, [firmId, accessToken])

  /**
   * Relaxes inferred filters one at a time, stopping at the first step that returns results.
   *
   * Two rules make this a *broader* version of the user's search rather than a different one
   * (§A.11):
   *
   * 1. The client chip is never relaxed. It is the highest-confidence inference — resolved against
   *    a real, access-scoped entity list rather than guessed from a phrase — and it is what keeps
   *    results relevant. Widening past it is exactly what produces unrelated results.
   * 2. A step that would leave no query text AND no filters is skipped. That is not a broader
   *    search, it is "list everything".
   *
   * Only inferred filters are candidates. A chip the user picked by hand is an instruction.
   *
   * There is no per-chip confidence to order these by — `InferredChip` is `{stage, id, name}` —
   * so the order is fixed by what is most often misread: a date phrase ("last spring") is a looser
   * inference than a named entity, and a deliverable is narrower than an engagement.
   */
  const runRelaxationLadder = useCallback(async (
    query: string,
    base: { client?: SelectedChip; engagement?: SelectedChip; deliverable?: SelectedChip; dateRange?: SelectedChip; type?: SelectedChip },
  ): Promise<{ files: GlobalSearchResult[]; note: string; relaxedStages: FilterStage[] } | null> => {
    const inferred = new Set(inferredStages)
    const steps: { stage: FilterStage; label: string; key: 'dateRange' | 'deliverable' | 'engagement' }[] = [
      { stage: 'dateRange', label: '', key: 'dateRange' },
      { stage: 'deliverable', label: 'deliverable', key: 'deliverable' },
      { stage: 'engagement', label: 'engagement', key: 'engagement' },
    ]

    const dropped: string[] = []
    const droppedStages: FilterStage[] = []
    const current = { ...base }

    for (const step of steps) {
      if (!inferred.has(step.stage)) continue
      if (step.stage === 'dateRange') current.dateRange = undefined
      if (step.stage === 'deliverable') current.deliverable = undefined
      if (step.stage === 'engagement') current.engagement = undefined
      dropped.push(base[step.key] ? `${step.label} ${base[step.key]!.name}` : `the ${step.label} filter`)
      droppedStages.push(step.stage)

      // Rule 2: never run a search with nothing left to constrain it.
      const stillConstrained = Boolean(
        query.trim().length >= 2 || current.client || current.engagement || current.deliverable || current.type,
      )
      if (!stillConstrained) return null

      const files = await executeSearch(query, current)
      if (files === null) return null
      if (files.length > 0) {
        const kept = current.client ? ` in ${current.client.name}` : ''
        // Name the filter AND its value: "the Q2 2026 date filter" tells the user what to correct,
        // where "the date filter" makes them look back at the chips to find out.
        const relaxedList = dropped.length === 1
          ? dropped[0]
          : `${dropped.slice(0, -1).join(', ')} and ${dropped[dropped.length - 1]}`
        return {
          files,
          note: `Nothing${kept} matched ${relaxedList}. Showing results without ${dropped.length > 1 ? 'those filters' : 'that filter'}.`,
          relaxedStages: droppedStages.slice(),
        }
      }
    }

    // Exhausted without results: a deliberate dead end reads better than a page of unrelated
    // documents. Chips stay on screen and removable, so the user can widen where they know to.
    return null
  }, [inferredStages, executeSearch])

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
    // Relaxation state is produced by THIS function, so it resets here. Conflicts are produced by
    // runAskSearch, which then bumps askRunId to trigger this search — clearing them here wiped
    // the banner before it ever rendered. They are cleared when a new Ask search starts instead.
    setRelaxedNote(null)
    setRelaxedStages([])
    try {
      const base = {
        client: clientChip ?? undefined,
        engagement: engagementChip ?? undefined,
        deliverable: deliverableChip ?? undefined,
        dateRange: dateRangeChip ?? undefined,
        type: typeChip ?? undefined,
      }

      let files = await executeSearch(debouncedQuery, base)
      if (files === null) {
        setResults([])
        setResolvedFilters(null)
        return
      }

      // Zero-result ladder (§A.11). Only ever relaxes filters Brio *inferred* — a filter the user
      // picked by hand is an instruction, not a guess, and is never second-guessed.
      if (files.length === 0 && inferredStages.length > 0) {
        const relaxed = await runRelaxationLadder(debouncedQuery, base)
        if (relaxed) {
          files = relaxed.files
          setRelaxedNote(relaxed.note)
          setRelaxedStages(relaxed.relaxedStages)
        }
      }

      setResults(files)
      currentHistoryEntryId.current = recordSearchHistory(firmId, debouncedQuery, chips, files.length)
      setSearchHistory(getSearchHistory(firmId))
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, accessToken, debouncedQuery, clientChip, engagementChip, deliverableChip, dateRangeChip, typeChip, chips, inferredStages, executeSearch])

  useEffect(() => {
    // Ask mode searches only on submit, so typing must not trigger a search. Chip removals still
    // re-run (they change the chip deps, not the query), which is how a misread is corrected.
    if (mode === 'ask' && !askSubmitted) return
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, clientChip, engagementChip, deliverableChip, dateRangeChip, typeChip, accessToken, mode, askSubmitted, askRunId])

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
      <div className="flex h-full min-h-0 bg-surface">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* No horizontal padding: the tab shell already sets the page gutter and sibling tabs
            (Analytics, Clients) render flush to it. px-6 here inset Doc Search by 24px. */}
        <div className="shrink-0 pb-4">
          <PageHeading
            className="pb-0"
            icon={<Search />}
            title="Doc Search"
            description={
              ASK_MODE_ENABLED
                ? <>Search documents across every client and engagement you have access to. Narrow with filters, or switch to Ask <Brio /> and describe what you need.</>
                : 'Search documents across every client and engagement you have access to, and narrow with filters.'
            }
            actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen((o) => !o)}
              className={cn(historyOpen && 'bg-surface-selected text-fg')}
              aria-pressed={historyOpen}
              aria-expanded={historyOpen}
              aria-controls="doc-search-history-pane"
              title={historyOpen ? 'Hide search history' : 'Show search history'}
            >
              <History className="h-3.5 w-3.5" />
              History
              {/* The pane sits to the RIGHT of this button, so the chevron points at it: right
                  when open (the pane is there), left when closed (it is tucked away off to the
                  side). The opposite mapping — the sidebar "which way will it move" convention —
                  ends up pointing left at nothing while the pane is open on the right. */}
              <ChevronRight
                className={cn(
                  'h-3 w-3 transition-transform duration-200',
                  !historyOpen && 'rotate-180',
                )}
                aria-hidden
              />
            </Button>
            }
          />

          <div ref={composerRef} className="relative mt-4">
            <div>
              {/* Mode toggle. Filters is today's search, unchanged and free. Ask interprets a
                  sentence into filters on submit and consumes AI credits. Hidden while
                  ASK_MODE_ENABLED is off. */}
              {ASK_MODE_ENABLED && (
              <div className="flex items-center gap-1 pb-2.5">
                <div className="inline-flex items-center rounded-control border border-line bg-surface-subtle p-0.5" role="group" aria-label="Search mode">
                  <button
                    type="button"
                    onClick={() => { setMode('filters'); setAskNote(null) }}
                    aria-pressed={mode === 'filters'}
                    className={cn(
                      'rounded-[4px] px-2.5 py-1 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                      mode === 'filters' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('ask'); setAskNote(null) }}
                    aria-pressed={mode === 'ask'}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                      mode === 'ask' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    Ask <Brio />
                  </button>
                </div>
                {mode === 'ask' && (
                  <span className="ml-1.5 text-small text-fg-subtle">
                    Describe what you need, then press Enter.
                  </span>
                )}
              </div>
              )}

            {/* Search — Notion's search field: large and borderless, with a rule under it that
                darkens on focus. The filter pills sit on their own row below. */}
            <div className="flex items-center gap-2.5 border-b border-line pb-2 transition-colors focus-within:border-line-strong">
              <div className="flex shrink-0 items-center">
                {mode === 'ask'
                  ? <Sparkles className="h-[18px] w-[18px] text-action" />
                  : <Search className="h-[18px] w-[18px] text-fg-subtle" />}
              </div>
              <div className="flex min-w-0 flex-1 items-center">
                <input
                  ref={textareaRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (mode === 'ask') runAskSearch()
                      else setDebouncedQuery(searchQuery)
                    }
                  }}
                  placeholder={mode === 'ask'
                    ? `Ask ${ASSISTANT.name}, e.g. overdue spreadsheets on the Nexus rollout`
                    // A topic, not a filename: semantic search finds documents by what they are
                    // about, which a filename example would never show.
                    : 'Search by name or topic, e.g. competitor pricing research'}
                  className="min-w-[10rem] flex-1 border-0 bg-transparent py-1.5 text-body text-fg shadow-none placeholder:text-fg-subtle focus:outline-none focus:ring-0"
                  autoFocus
                  aria-label="Document search"
                />
              </div>
              <div className="flex shrink-0 flex-row items-center justify-center gap-1">
                {/* Ask mode is submit-driven, so it needs an explicit send affordance. Clear only
                    appears once there are results to clear — before that there is nothing to undo. */}
                {mode === 'ask' ? (
                  <>
                    {hasSearched && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('')
                          setChips([])
                          setInferredStages([])
                          setAskNote(null)
                          setResults([])
                          setHasSearched(false)
                        }}
                        className="p-1 rounded-full text-fg-muted hover:bg-surface-hover"
                        aria-label="Clear search and start again"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={runAskSearch}
                      disabled={interpreting || !searchQuery.trim()}
                      className={cn(
                        'p-1.5 rounded-full transition-colors',
                        interpreting || !searchQuery.trim()
                          ? 'text-fg-subtle'
                          : 'bg-action text-action-fg hover:bg-action-hover'
                      )}
                      aria-label={`Ask ${ASSISTANT.name}`}
                    >
                      {interpreting
                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                        : <ArrowRight className="h-4 w-4" />}
                    </button>
                  </>
                ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setChips([])
                  }}
                  disabled={!searchQuery.trim() && chips.length === 0}
                  className={cn(
                    'p-1 rounded-full',
                    (searchQuery.trim() || chips.length > 0) ? 'text-fg-muted hover:bg-surface-hover' : 'text-fg-subtle'
                  )}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
                )}
              </div>
            </div>

              {/* Filters — Notion's filter-bar pills, one fixed slot per stage in canonical order.
                  Empty: a quiet outlined pill ("Client"). Set: filled in the accent, reading
                  "Client: Contoso", with an x to remove it. Client/Engagement/Deliverable are
                  interdependent: each narrows the next, so a stage waiting on its parent is faded
                  and says why in the app's tooltip. */}
              <div className="flex flex-wrap items-center gap-1.5 pt-3">
                {FILTER_STAGE_ORDER.map((stage) => {
                  const chip = chips.find((c) => c.stage === stage) || null
                  const Icon = STAGE_ICON[stage]
                  const options = optionsForStage(stage)
                  const disabledReason = stageDisabledReason(stage)
                  const isInferred = inferredStages.includes(stage)
                  // A chip the zero-result ladder relaxed is shown struck through: it is still
                  // there to be restored or removed, but it did NOT constrain these results.
                  const isRelaxed = relaxedStages.includes(stage)
                  const hint = isRelaxed
                    ? `Not applied — no results matched this ${STAGE_LABEL[stage].toLowerCase()} filter`
                    : disabledReason

                  const pill = (
                    <DropdownMenu key={stage} onOpenChange={(open) => { if (open) setMenuQuery('') }}>
                      <DropdownMenuTrigger asChild>
                        <FilterPill
                          disabled={Boolean(disabledReason)}
                          icon={isInferred ? <Sparkles /> : <Icon />}
                          label={STAGE_LABEL[stage]}
                          value={chip?.name}
                          onClear={() => removeChip(stage)}
                          relaxed={isRelaxed}
                        />
                      </DropdownMenuTrigger>
                      {/* Notion's filter menu: the property name, a search box when the list is
                          long, then compact rows with a check on the chosen value. "Any …" leads
                          every menu as the way back to no filter. */}
                      <DropdownMenuContent align="start" className="w-[260px] p-1">
                        {(() => {
                          const searchable = stage !== 'type' && stage !== 'dateRange' && options.length > MENU_SEARCH_THRESHOLD
                          const q = menuQuery.trim().toLowerCase()
                          const shown = searchable && q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
                          return (
                            <>
                              <FilterMenuLabel>{STAGE_LABEL[stage]}</FilterMenuLabel>
                              {searchable && (
                                <FilterMenuSearch
                                  value={menuQuery}
                                  onChange={(e) => setMenuQuery(e.target.value)}
                                  placeholder={`Search ${STAGE_LABEL[stage].toLowerCase()}s…`}
                                  aria-label={`Search ${STAGE_LABEL[stage].toLowerCase()}s`}
                                />
                              )}
                              <div className="max-h-[280px] overflow-y-auto overflow-x-hidden">
                                {stage === 'type' ? (
                                  <>
                                    <FilterMenuRow multi selected={selectedFileTypes.length === 0} onSelect={() => toggleFileTypeSimple('any')}>
                                      {STAGE_ANY_LABEL.type}
                                    </FilterMenuRow>
                                    <DropdownMenuSeparator className="mx-0 my-1" />
                                    {CONCRETE_FILE_TYPES.map((opt) => (
                                      <FilterMenuRow key={opt} multi selected={selectedFileTypes.length === 0 || selectedFileTypes.includes(opt)} onSelect={() => toggleFileTypeSimple(opt)}>
                                        {FILE_TYPE_LABEL[opt]}
                                      </FilterMenuRow>
                                    ))}
                                  </>
                                ) : options.length === 0 ? (
                                  <p className="px-2 py-1.5 text-small text-fg-subtle">Nothing available</p>
                                ) : (
                                  <>
                                    <FilterMenuRow selected={!chip} onSelect={() => removeChip(stage)}>
                                      {STAGE_ANY_LABEL[stage]}
                                    </FilterMenuRow>
                                    <DropdownMenuSeparator className="mx-0 my-1" />
                                    {shown.map((o) => (
                                      <FilterMenuRow key={o.id} selected={chip?.id === o.id} onSelect={() => selectStageValue(stage, o)}>
                                        {o.name}
                                      </FilterMenuRow>
                                    ))}
                                    {shown.length === 0 && <p className="px-2 py-1.5 text-small text-fg-subtle">No matches</p>}
                                  </>
                                )}
                              </div>
                            </>
                          )
                        })()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                  // The app's tooltip, not the browser's. A disabled button gets no pointer events,
                  // so the hint sits on a wrapper.
                  return hint ? (
                    <Hint key={stage} label={hint}>
                      <span className="inline-flex">{pill}</span>
                    </Hint>
                  ) : pill
                })}

                {chips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setChips([]); setInferredStages([]) }}
                    className="ml-0.5 h-7 rounded-full px-2 text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                  >
                    Clear
                  </button>
                )}
              </div>

              {(interpreting || askNote || ambiguity) && (
                <div className="flex items-center gap-1.5 pt-2 text-small">
                  {interpreting ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-action">
                        <Brio className="animate-pulse" />
                        is reading your question…
                      </span>
                    </>
                  ) : (
                    <span className="text-fg-muted">{askNote}</span>
                  )}
                  {/* Ambiguity is disclosed alongside results, never as a question that blocks the
                      search (§A.11). Switching re-runs locally — no second model call. */}
                  {ambiguity && !interpreting && (
                    <span className="text-fg-muted">
                      Did you mean{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setChips((prev) => prev.map((c) => (
                            c.stage === 'client'
                              ? { ...c, id: ambiguity.alternativeId, name: ambiguity.alternativeName }
                              : c
                          )))
                          setAmbiguity(null)
                          setAskRunId((n) => n + 1)
                        }}
                        className="underline underline-offset-2 hover:text-fg"
                      >
                        {ambiguity.alternativeName}
                      </button>
                      ?
                    </span>
                  )}
                </div>
              )}

            </div>

          </div>

          {/* Only for chrono's soft, implicit date detection from typed text — a Time filter set
              explicitly already shows its preset name, so repeating the range here is redundant. */}
          {resolvedFilters?.dateRange && !dateRangeChip && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-small text-fg-muted">
              <span className="rounded-control bg-surface-muted px-1.5 py-0.5 tabular-nums text-fg">
                {new Date(resolvedFilters.dateRange.start).toLocaleDateString()} – {new Date(resolvedFilters.dateRange.end).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-6">
          {hasSearched && (
            isSearching ? (
              <div className="flex flex-col items-center gap-3 py-12 text-fg-subtle" role="status">
                <LoadingSpinner size="md" />
                <p className="text-small text-fg-muted">Searching across your firm…</p>
              </div>
            ) : results.length > 0 ? (
              <>
                {/* Notices sit on the count row: they qualify what was counted, and reading the
                    number apart from them invites believing the results answered the query as asked. */}
                <div className="mb-2 flex items-start justify-between gap-3 text-small">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    {/* A hand-picked chip beats the typed sentence, but saying nothing would leave
                        the user believing their words were honoured. Offer the switch instead. */}
                    {conflicts.length > 0 && !interpreting && conflicts.map((c) => (
                      <span
                        key={c.stage}
                        className="inline-flex items-center gap-1.5 rounded-control bg-surface-subtle px-2.5 py-1.5 text-fg"
                      >
                        <Info className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                        <span>
                          Using your <span className="font-medium text-fg">{c.keptName}</span> filter,
                          not <span className="font-medium text-fg">{c.ignoredName}</span> from your question.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setChips((prev) => prev.map((chip) => (
                              chip.stage === c.stage ? { ...chip, id: c.ignoredId, name: c.ignoredName } : chip
                            )))
                            setConflicts((prev) => prev.filter((x) => x.stage !== c.stage))
                            setAskRunId((n) => n + 1)
                          }}
                          className="font-medium text-action underline underline-offset-2 hover:text-action-hover"
                        >
                          Use {c.ignoredName}
                        </button>
                      </span>
                    ))}
                    {relaxedNote && !interpreting && (
                      <span className="inline-flex items-center gap-1.5 rounded-control bg-surface-subtle px-2.5 py-1.5 text-fg">
                        <Info className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                        <span>{relaxedNote}</span>
                        {relaxedStages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => relaxedStages.forEach((st) => removeChip(st))}
                            className="font-medium text-action underline underline-offset-2 hover:text-action-hover"
                          >
                            Remove {relaxedStages.length > 1 ? 'them' : 'it'}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 pt-1 tabular-nums text-fg-subtle">
                    {filteredResults.length} {filteredResults.length === 1 ? 'result' : 'results'}
                  </span>
                </div>

                {filteredResults.length > 0 ? (
                  <div className="flex flex-col divide-y divide-line border-y border-line">
                    {filteredResults.map((file) => {
                      // A chip the ladder relaxed is still on screen but was NOT applied to these
                      // results, so it must not be cited as the reason a document matched.
                      const dateFilterApplied = Boolean(dateRangeChip) && !relaxedStages.includes('dateRange')
                      const matchType = file.matchType === 'name' || file.matchType === 'semantic' || file.matchType === 'description' ? file.matchType : 'semantic'
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
                          className="group flex w-full gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-muted">
                            {file.isFolder ? (
                              <Folder className="h-5 w-5 text-fg-muted" />
                            ) : (
                              <DocumentIcon mimeType={file.metadata?.mimeType} size={20} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="flex min-w-0 items-center gap-1.5 text-ui text-fg">
                              {file.docId && (
                                <span className="shrink-0 rounded-control bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-fg-muted">
                                  {file.docId}
                                </span>
                              )}
                              <span className="truncate font-medium">
                                {file.fileName}
                              </span>
                            </h3>
                            {breadcrumbParts.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                {breadcrumbParts.map((part, i) => {
                                  const PartIcon = part.icon
                                  return (
                                    <React.Fragment key={i}>
                                      {i > 0 && <span className="text-fg-subtle">/</span>}
                                      <span className="inline-flex items-center gap-1 text-caption text-fg-subtle">
                                        <PartIcon className="h-2.5 w-2.5 shrink-0" />
                                        {part.label}
                                      </span>
                                    </React.Fragment>
                                  )
                                })}
                              </div>
                            )}
                            {/* Why it matched, when the words were in its description rather than its name */}
                            {matchType === 'description' && file.description && (
                              <p className="mt-0.5 line-clamp-2 text-caption text-fg-muted">{file.description}</p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <Tag color={matchType === 'semantic' ? 'purple' : 'gray'} icon={matchType === 'semantic' ? <Sparkles /> : matchType === 'description' ? <AlignLeft /> : <Hash />}>
                                {matchType === 'semantic' ? 'Semantic match' : matchType === 'description' ? 'Description match' : 'File match'}
                              </Tag>
                              {/* All three dates inline. A date filter matches on
                                  COALESCE(dueDate, createdAt) while the row's timestamp shows
                                  updatedAt, so without these it is not obvious why a document
                                  matched "Q3 2026". The one the active filter used is highlighted. */}
                              <span className="inline-flex items-center gap-1.5 text-caption text-fg-subtle">
                                {([
                                  { label: 'Created', value: file.createdAt, used: dateFilterApplied && !file.dueDate },
                                  { label: 'Updated', value: file.updatedAt, used: false },
                                  { label: 'Due', value: file.dueDate, used: dateFilterApplied && Boolean(file.dueDate) },
                                ] as const).map(({ label, value, used }, i) => (
                                  <React.Fragment key={label}>
                                    {i > 0 && <span className="opacity-30">|</span>}
                                    <span className={cn('inline-flex items-center gap-1', used && 'font-medium text-action')}>
                                      <span>{label}</span>
                                      {value ? (
                                        <RelativeDateTime
                                          date={value}
                                          tooltipSide="top"
                                          tooltipPrefix={used ? `Matched the ${dateRangeChip?.name} filter ·` : undefined}
                                          className="gap-0.5"
                                          iconClassName="hidden"
                                          textClassName={cn('text-caption text-fg-muted', used && 'font-medium text-action')}
                                        />
                                      ) : (
                                        <span>Not set</span>
                                      )}
                                    </span>
                                  </React.Fragment>
                                ))}
                                {!file.isFolder && file.updatedByName && (
                                  <>
                                    <span className="opacity-30">|</span>
                                    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                                      <UserAvatarWithTooltip
                                        displayName={file.updatedByName}
                                        email={file.updatedByEmail ?? undefined}
                                        photoLink={file.updatedByAvatarUrl ?? undefined}
                                        avatarSize="sm"
                                      />
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                          {/* The relative timestamp that used to sit here duplicated "Updated" in
                              the date row below, and the avatar now sits beside those dates. */}
                          <div className="flex flex-col justify-end items-end shrink-0">
                            <ArrowUpRight className="h-4 w-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyPanel compact icon={<Search />} title={`No results match this search${typeChip ? ` and ${typeChip.name} filter` : ''}`} />
                )}
              </>
            ) : (
              <EmptyPanel icon={<Search />} title="No results found" description="Try a different search term or remove a filter." />
            )
          )}

          {!hasSearched && searchHistory.length > 0 && !historyOpen && (
            <div className="py-8 text-center">
              <p className="text-small text-fg-subtle">Open History to revisit a past search.</p>
            </div>
          )}
        </div>
      </div>

      {historyOpen && (
        <aside id="doc-search-history-pane" className="mb-4 ml-4 flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
            <p className="text-ui font-medium text-fg">Search history</p>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              title="Hide search history"
              aria-label="Hide search history"
              className="ml-auto mr-1 shrink-0 rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {searchHistory.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={clearAllHistory}
                    className="rounded p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
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
                <p className="text-small text-fg-subtle">No searches yet. Your last {SEARCH_HISTORY_MAX} searches will appear here.</p>
              </div>
            ) : (
              <ul>
                {searchHistory.map((entry) => {
                  const isZeroResult = entry.resultCount === 0
                  return (
                    <li key={entry.id} className="border-b border-line last:border-b-0">
                      <div className="group relative px-3 py-2.5 transition-colors hover:bg-surface-hover">
                        <button
                          type="button"
                          onClick={() => rerunHistoryEntry(entry)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap pr-6">
                            {entry.chips.map((chip) => {
                              const Icon = STAGE_ICON[chip.stage]
                              return (
                                <span key={chip.stage} className="inline-flex items-center gap-1 rounded-control bg-surface-muted px-1.5 py-0.5 text-caption text-fg-muted">
                                  <Icon className="h-2.5 w-2.5" />
                                  {chip.name}
                                </span>
                              )
                            })}
                            {entry.query && (
                              <span className="truncate text-ui text-fg">{entry.query}</span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-caption text-fg-subtle">
                            <span>{formatRelativeTime(new Date(entry.timestamp).toISOString())}</span>
                            <span>·</span>
                            <span className={cn(isZeroResult && 'text-danger font-medium')}>
                              {entry.resultCount} {entry.resultCount === 1 ? 'result' : 'results'}
                            </span>
                            {entry.openedCount > 0 && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5 text-action">
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
                              className="absolute top-3 right-3 p-1 rounded text-fg-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-danger transition-all"
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
