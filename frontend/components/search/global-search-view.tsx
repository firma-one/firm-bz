'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Folder, Sparkles, X, Building2, Briefcase, Package, Hash, FileText, ArrowUpRight, ArrowRight, RefreshCw, ChevronDown, History, BrushCleaning, CalendarClock, AlertTriangle, ChevronRight } from 'lucide-react'
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
import { formatRelativeTime, formatDateTimeWithTZ, formatFullDate, cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
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
  // 'filters' is today's live chip-picker search. 'ask' interprets prose into chips on submit,
  // costs AI credits, and never fires while typing.
  const [mode, setMode] = useState<'filters' | 'ask'>('filters')
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
    setRelaxedStages([])
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

      // User-picked chips always win; inference only fills stages left empty.
      setChips((prev) => {
        const taken = new Set(prev.map((c) => c.stage))
        return [...prev, ...inferred.filter((c) => !taken.has(c.stage))]
      })
      setInferredStages(inferred.map((c) => c.stage))

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
  }, [firmId, accessToken, searchQuery, interpreting])

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
      return RELATIVE_TIME_PRESETS.map((p) => ({ id: p, name: p }))
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

  /** Type is multi-select; 'any' is exclusive with the rest. */
  const toggleFileTypeSimple = useCallback((opt: FileTypeOption) => {
    setChips((prev) => {
      const current = prev.find((c) => c.stage === 'type')
      const selected = current ? (current.id.split(',').filter(Boolean) as FileTypeOption[]) : []
      const next = opt === 'any'
        ? []
        : selected.includes(opt) ? selected.filter((t) => t !== opt) : [...selected, opt]

      const without = prev.filter((c) => c.stage !== 'type')
      if (next.length === 0) return without
      return [...without, {
        stage: 'type' as FilterStage,
        id: next.join(','),
        name: next.length === 1 ? FILE_TYPE_LABEL[next[0]] : `${next.length} types`,
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
      <div className="flex h-full min-h-0 bg-ki-bg">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="shrink-0 px-6 pb-4 bg-ki-bg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-headline text-2xl font-semibold tracking-tight text-ki-on-surface">Document Search</h1>
              <p className="text-sm text-ki-on-surface-variant mt-1">
                Search documents across every client and engagement you have access to.
              </p>
              <p className="text-xs text-ki-on-surface-variant mt-1">
                Narrow results with the filters below, or switch to Ask <Brio /> and
                describe what you need.
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
            </button>
          </div>

          <div ref={composerRef} className="relative mt-4">
            <div className="rounded-md border border-ki-outline bg-ki-surface shadow-sm overflow-hidden transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5">
              {/* Row 1 — filters only, inside the same bordered control as the search input below.
                  Every stage always has a fixed slot in canonical order: a filled pill (icon +
                  value + remove ×) once selected, or the same pill shape in a muted/outline
                  "empty" state (icon only) that's a direct mouse entry point — click it to open
                  that exact stage's picker, no @ or sequencing required. Selecting a value (via
                  mouse or keyboard) turns the same slot into the filled pill in place. Engagement/
                  Deliverable badges are disabled until their parent (Client/Engagement) is set,
                  matching the same hierarchy gating the keyboard flow already enforces. */}
              {/* Mode toggle. Filters is today's search, unchanged and free. Ask interprets a
                  sentence into filters on submit and consumes AI credits. */}
              <div className="flex items-center gap-1 px-3 pt-2.5">
                <div className="inline-flex rounded-full border border-ki-outline p-0.5 bg-ki-surface-low">
                  <button
                    type="button"
                    onClick={() => { setMode('filters'); setAskNote(null) }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      mode === 'filters' ? 'bg-primary text-white shadow-sm' : 'text-ki-on-surface-variant hover:text-primary'
                    )}
                  >
                    Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('ask'); setAskNote(null) }}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      mode === 'ask' ? 'bg-primary text-white shadow-sm' : 'text-primary hover:bg-primary/10'
                    )}
                  >
                    Ask <Brio />
                  </button>
                </div>
                {mode === 'ask' && (
                  <span className="text-[11px] text-ki-on-surface-variant ml-1">
                    Describe what you need, then press Enter.
                  </span>
                )}
              </div>

              {/* Filters — plain dropdowns, styled to match the Engagement > Files toolbar.
                  Client/Engagement/Deliverable are interdependent: each narrows the next. */}
              <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 pb-2.5 border-b border-ki-outline">
                {FILTER_STAGE_ORDER.map((stage) => {
                  const chip = chips.find((c) => c.stage === stage) || null
                  const Icon = STAGE_ICON[stage]
                  const options = optionsForStage(stage)
                  const disabledReason = stageDisabledReason(stage)
                  const isInferred = inferredStages.includes(stage)
                  // A chip the zero-result ladder relaxed is shown struck through: it is still
                  // there to be restored or removed, but it did NOT constrain these results.
                  const isRelaxed = relaxedStages.includes(stage)

                  return (
                    <DropdownMenu key={stage}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={Boolean(disabledReason)}
                          className={cn(
                            'h-8 gap-1.5 text-xs bg-white rounded border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors',
                            chip && 'border-slate-400 ring-1 ring-slate-300 text-slate-900',
                            isInferred && 'border-primary/40 ring-primary/30',
                            isRelaxed && 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100 hover:text-amber-950',
                          )}
                          title={isRelaxed
                            ? `Not applied — no results matched this ${STAGE_LABEL[stage].toLowerCase()} filter`
                            : disabledReason ?? undefined}
                        >
                          {isInferred
                            ? <Sparkles className="h-3 w-3 text-primary" />
                            : <Icon className="h-3 w-3 opacity-60" />}
                          {chip ? chip.name : STAGE_LABEL[stage]}
                          {isRelaxed && (
                            <span className="ml-0.5 rounded-sm bg-amber-200/70 px-1 py-px text-[9px] font-semibold uppercase tracking-wide">
                              not applied
                            </span>
                          )}
                          {chip && (
                            <span
                              role="button"
                              tabIndex={-1}
                              aria-label={`Clear ${STAGE_LABEL[stage]} filter`}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeChip(stage) }}
                              className="ml-0.5 rounded hover:bg-slate-200"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="start" className="w-[240px] max-h-[320px] overflow-y-auto py-1 text-xs rounded">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-1.5 font-medium">
                          {STAGE_LABEL[stage]}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {stage === 'type' ? (
                          FILE_TYPE_OPTIONS.map((opt) => (
                            <DropdownMenuCheckboxItem
                              key={opt}
                              checked={opt === 'any' ? selectedFileTypes.length === 0 : selectedFileTypes.includes(opt)}
                              onCheckedChange={() => toggleFileTypeSimple(opt)}
                              onSelect={(e) => e.preventDefault()}
                              className="text-xs py-1.5 pl-8"
                            >
                              {FILE_TYPE_LABEL[opt]}
                            </DropdownMenuCheckboxItem>
                          ))
                        ) : options.length === 0 ? (
                          <div className="px-2.5 py-2 text-xs text-slate-400">Nothing available</div>
                        ) : (
                          <>
                            {/* "No filter" option — an explicit way back to unfiltered from inside
                                the menu, rather than only via the chip's ✕. Not a selectable value:
                                choosing it clears the filter. */}
                            <DropdownMenuItem
                              onClick={() => removeChip(stage)}
                              className={cn(
                                'text-xs py-1.5 px-2.5 cursor-pointer',
                                !chip && 'bg-slate-100 font-medium',
                              )}
                            >
                              {STAGE_ANY_LABEL[stage]}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {options.map((o) => (
                              <DropdownMenuItem
                                key={o.id}
                                onClick={() => selectStageValue(stage, o)}
                                className={cn(
                                  'text-xs py-1.5 px-2.5 cursor-pointer',
                                  chip?.id === o.id && 'bg-slate-100 font-medium',
                                )}
                              >
                                {o.name}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                })}

                {chips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setChips([]); setInferredStages([]) }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {(interpreting || askNote || relaxedNote || ambiguity) && (
                <div className="px-3 pt-2 flex items-center gap-1.5 text-[11px]">
                  {interpreting ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-primary">
                        <Brio className="animate-pulse" />
                        is reading your question…
                      </span>
                    </>
                  ) : (
                    <span className="text-ki-on-surface-variant">{askNote}</span>
                  )}
                  {relaxedNote && !interpreting && (
                    <span className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                      <span>{relaxedNote}</span>
                      {relaxedStages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => relaxedStages.forEach((st) => removeChip(st))}
                          className="underline underline-offset-2 font-medium hover:text-amber-950"
                        >
                          Remove {relaxedStages.length > 1 ? 'them' : 'it'}
                        </button>
                      )}
                    </span>
                  )}
                  {/* Ambiguity is disclosed alongside results, never as a question that blocks the
                      search (§A.11). Switching re-runs locally — no second model call. */}
                  {ambiguity && !interpreting && (
                    <span className="text-ki-on-surface-variant">
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
                        className="underline underline-offset-2 hover:text-primary"
                      >
                        {ambiguity.alternativeName}
                      </button>
                      ?
                    </span>
                  )}
                </div>
              )}

              <div className="flex">
                <div className="flex flex-col justify-center py-3 pl-4 pr-2 shrink-0">
                  {mode === 'ask'
                    ? <Sparkles className="h-4 w-4 text-primary" />
                    : <Search className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0 flex items-center px-1 py-2.5">
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
                      : 'Search by filename or topic, e.g. SEO strategy documents'}
                    className="flex-1 min-w-[10rem] py-1 px-1 border-0 bg-transparent text-sm font-medium shadow-none focus:outline-none focus:ring-0"
                    autoFocus
                    aria-label="Document search"
                  />
                </div>
                <div className="flex flex-row items-center justify-center gap-1 py-2 pl-1.5 pr-3 shrink-0">
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
                          className="p-1 rounded-full text-ki-on-surface-variant hover:bg-ki-surface-low"
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
                            ? 'text-ki-outline-variant'
                            : 'text-white bg-primary hover:bg-primary'
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
                      (searchQuery.trim() || chips.length > 0) ? 'text-ki-on-surface-variant hover:bg-ki-surface-low' : 'text-ki-outline-variant'
                    )}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Only for chrono's soft, implicit date detection from typed text — a Time filter set
              explicitly already shows its preset name, so repeating the range here is redundant. */}
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
                      // A chip the ladder relaxed is still on screen but was NOT applied to these
                      // results, so it must not be cited as the reason a document matched.
                      const dateFilterApplied = Boolean(dateRangeChip) && !relaxedStages.includes('dateRange')
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
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest bg-primary/10 text-primary">
                                {matchType === 'semantic' ? <Sparkles className="h-2.5 w-2.5" /> : <Hash className="h-2.5 w-2.5" />}
                                {matchType === 'semantic' ? 'Semantic Match' : 'File Match'}
                              </span>
                              {/* All three dates inline. A date filter matches on
                                  COALESCE(dueDate, createdAt) while the row's timestamp shows
                                  updatedAt, so without these it is not obvious why a document
                                  matched "Q3 2026". The one the active filter used is highlighted. */}
                              <span className="inline-flex items-center gap-1.5 text-[10px] text-ki-on-surface-variant">
                                {([
                                  { label: 'Created', value: file.createdAt, used: dateFilterApplied && !file.dueDate },
                                  { label: 'Updated', value: file.updatedAt, used: false },
                                  { label: 'Due', value: file.dueDate, used: dateFilterApplied && Boolean(file.dueDate) },
                                ] as const).map(({ label, value, used }, i) => (
                                  <React.Fragment key={label}>
                                    {i > 0 && <span className="opacity-30">|</span>}
                                    <span className={cn('inline-flex items-center gap-1', used && 'text-primary font-semibold')}>
                                      <span className="opacity-60">{label}</span>
                                      {value ? (
                                        <RelativeDateTime
                                          date={value}
                                          tooltipSide="top"
                                          tooltipPrefix={used ? `Matched the ${dateRangeChip?.name} filter ·` : undefined}
                                          className="gap-0.5"
                                          iconClassName="hidden"
                                          textClassName={cn('text-[10px]', used && 'text-primary font-semibold')}
                                        />
                                      ) : (
                                        <span>Not set</span>
                                      )}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </span>
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
        <aside id="doc-search-history-pane" className="w-80 shrink-0 border border-ki-outline bg-ki-surface flex flex-col min-h-0 mb-4 mr-4 rounded-md overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-ki-outline flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-ki-on-surface">Search History</p>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              title="Hide search history"
              aria-label="Hide search history"
              className="ml-auto mr-1 shrink-0 rounded p-1 text-ki-on-surface-variant hover:bg-ki-surface-low hover:text-ki-on-surface transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
