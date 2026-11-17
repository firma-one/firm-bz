'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowUpRight, CheckCircle2, ChevronRight, Clock3, FileText, FolderOpen, Type, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { cn, formatRelativeTime, getFileTypeLabel } from '@/lib/utils'
import { AccessLock } from '@/components/ui/access-lock'
import { SUB_TABS_ROW, subTabClass } from '@/components/ui/sub-tabs'
import { INTERNAL_ONLY_LABEL } from './discussions-switch'
import { DocumentIcon } from '@/components/ui/document-icon'
import { FilterMenuLabel, FilterMenuRow, FilterPill } from '@/components/ui/filter-pill'
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { NotionTable, NotionTableBody, NotionTableCell, NotionTableHead, NotionTableHeader, NotionTableRow } from '@/components/ui/notion-table'
import { LoadFailed } from '@/components/ui/load-failed'
import { DATA } from './insight-rings'
import { InfoHint } from './overview-charts'
import { BandPill, FOLDER_SCORE_INFO, type FileCheck } from './engagement-overview-sections'
import { StatusCell } from './overview-layout'
import { failureReason } from '@/lib/files/action-failure'
import type { EngagementInsightsResponse, RecentDocumentItem, SensitiveFileItem } from '@/app/api/projects/[projectId]/insights/route'

/*
 * The Files tab's views (.claude/plans/engagement-overview-restructure.md): All files (the file list, as
 * it was), Recent (what was the Overview's Document Activity) and Health (File Organization and the
 * Action Center's housekeeping). Recent and Health are internal only, as those Overview sections were;
 * the caller decides who sees the tabs at all.
 */

export type FilesView = 'all' | 'recent' | 'health'
export const FILES_VIEW_PARAM = 'view'
export function filesViewOf(raw: string | null | undefined): FilesView {
    return raw === 'recent' || raw === 'health' ? raw : 'all'
}

/**
 * The views across the top of the Files tab, drawn as Discussions draws its sub-tabs
 * (components/ui/sub-tabs.ts). `healthBadge`: how many checks need attention, when known.
 */
export function FilesViewTabs({ view, hrefOf, onSelect, healthBadge }: {
    view: FilesView
    /** Each view's link (the app's paths, the tour's query). */
    hrefOf: (v: FilesView) => string
    /** Takes the click instead of following the link (client navigation). */
    onSelect?: (v: FilesView) => void
    healthBadge?: number
}) {
    const tabs: { v: FilesView; label: string; internal: boolean }[] = [
        { v: 'all', label: 'All files', internal: false },
        { v: 'recent', label: 'Recent', internal: true },
        { v: 'health', label: 'Health', internal: true },
    ]
    return (
        <nav aria-label="Files views" className={SUB_TABS_ROW} data-demo-tour="files-views">
            {tabs.map((t) => {
                const selected = view === t.v
                return (
                    <a
                        key={t.v}
                        href={hrefOf(t.v)}
                        aria-current={selected ? 'page' : undefined}
                        onClick={onSelect ? (e) => { e.preventDefault(); onSelect(t.v) } : undefined}
                        className={subTabClass(selected)}
                    >
                        {t.label}
                        {t.v === 'health' && healthBadge !== undefined && healthBadge > 0 && (
                            // Color for state: a check needs attention.
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-waiting-bg px-1 text-[11px] font-semibold tabular-nums text-status-waiting-fg" aria-label={`${healthBadge} need attention`}>
                                {healthBadge}
                            </span>
                        )}
                        {t.internal && <AccessLock label={INTERNAL_ONLY_LABEL} />}
                    </a>
                )
            })}
        </nav>
    )
}

// ─── Recent ──────────────────────────────────────────────────────────────────

type Window = '24h' | '1w' | '1m'
const WINDOW_MS: Record<Window, number> = { '24h': 86400000, '1w': 7 * 86400000, '1m': 30 * 86400000 }
const WINDOW_LABEL: Record<Window, string> = { '24h': '24 hours', '1w': '1 week', '1m': '1 month' }
const WINDOW_WORDS: Record<Window, string> = { '24h': 'today', '1w': 'this week', '1m': 'this month' }

/** "jordan.lee@firm.com" → "Jordan Lee": the editor's name, from their address. */
function nameFromEmail(email: string): string {
    return email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Recent: the files changed in a window, newest first, with who changed them (it was the Overview's
 * Document Activity). The same table and filter pills as All files.
 */
export function FilesRecentView({ recent, engagementBase }: { recent: RecentDocumentItem[]; engagementBase: string }) {
    const [win, setWin] = useState<Window>('1w')
    const [types, setTypes] = useState<Set<string>>(new Set())
    const [editors, setEditors] = useState<Set<string>>(new Set())
    // Relative to now, so set after mount to keep server and client markup equal.
    const [now, setNow] = useState<number | null>(null)
    useEffect(() => setNow(Date.now()), [])

    const typeOptions = useMemo(() => Array.from(new Set(recent.map((d) => getFileTypeLabel(d.mimeType ?? '')).filter(Boolean))).sort(), [recent])
    const editorOptions = useMemo(() => Array.from(new Set(recent.map((d) => d.updatedByEmail).filter((e): e is string => !!e))).sort(), [recent])
    const shown = now === null ? [] : recent
        .filter((d) => new Date(d.updatedAt).getTime() >= now - WINDOW_MS[win])
        .filter((d) => types.size === 0 || types.has(getFileTypeLabel(d.mimeType ?? '')))
        .filter((d) => editors.size === 0 || (d.updatedByEmail !== null && editors.has(d.updatedByEmail)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const toggle = (set: Set<string>, value: string) => {
        const next = new Set(set)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        return next
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex gap-0.5 rounded-control border border-line bg-surface-subtle p-0.5" role="group" aria-label="Changed in the last">
                        {(['24h', '1w', '1m'] as Window[]).map((w) => (
                            <button
                                key={w}
                                type="button"
                                aria-pressed={win === w}
                                onClick={() => setWin(w)}
                                className={cn('rounded-[3px] px-2 py-0.5 text-caption transition-colors', win === w ? 'bg-surface text-fg shadow-[0_0_0_1px_var(--ui-line)]' : 'font-normal text-fg-muted hover:text-fg')}
                            >
                                {WINDOW_LABEL[w]}
                            </button>
                        ))}
                    </div>
                    {typeOptions.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <FilterPill icon={<FileText />} label="Type" value={types.size > 0 ? Array.from(types).join(', ') : undefined} onClear={() => setTypes(new Set())} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[220px] p-1">
                                <FilterMenuLabel>Type</FilterMenuLabel>
                                <FilterMenuRow multi selected={types.size === 0} onSelect={() => setTypes(new Set())}>Any type</FilterMenuRow>
                                <DropdownMenuSeparator className="mx-0 my-1" />
                                {typeOptions.map((t) => (
                                    <FilterMenuRow key={t} multi selected={types.has(t)} onSelect={() => setTypes((s) => toggle(s, t))}>{t}</FilterMenuRow>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    {editorOptions.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <FilterPill icon={<User />} label="Modified by" value={editors.size > 0 ? Array.from(editors).map(nameFromEmail).join(', ') : undefined} onClear={() => setEditors(new Set())} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[240px] p-1">
                                <FilterMenuLabel>Modified by</FilterMenuLabel>
                                <FilterMenuRow multi selected={editors.size === 0} onSelect={() => setEditors(new Set())}>Anyone</FilterMenuRow>
                                <DropdownMenuSeparator className="mx-0 my-1" />
                                {editorOptions.map((e) => (
                                    <FilterMenuRow key={e} multi selected={editors.has(e)} onSelect={() => setEditors((s) => toggle(s, e))}>{nameFromEmail(e)}</FilterMenuRow>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                {now !== null && (
                    <span className="text-small text-fg-muted">
                        {shown.length === 0 ? `No files changed ${WINDOW_WORDS[win]}` : `${shown.length} ${shown.length === 1 ? 'file' : 'files'} changed ${WINDOW_WORDS[win]}`}
                    </span>
                )}
            </div>
            {shown.length > 0 && (
                <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                    <NotionTable>
                        <NotionTableHeader>
                            <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                            <NotionTableHead icon={<FolderOpen />} className="hidden md:table-cell">In</NotionTableHead>
                            <NotionTableHead icon={<User />} className="hidden sm:table-cell">Modified by</NotionTableHead>
                            <NotionTableHead icon={<Clock3 />}>Modified</NotionTableHead>
                            <NotionTableHead className="w-10"><span className="sr-only">Open</span></NotionTableHead>
                        </NotionTableHeader>
                        <NotionTableBody>
                            {shown.map((d) => {
                                const href = engagementBase ? `${engagementBase}/files#doc-file:${d.id}` : '?tab=files'
                                return (
                                    <NotionTableRow key={d.id}>
                                        <NotionTableCell>
                                            <a href={href} className="flex min-w-0 items-center gap-2 hover:underline">
                                                <DocumentIcon mimeType={d.mimeType ?? undefined} size={16} />
                                                <span className="truncate">{d.fileName}</span>
                                            </a>
                                        </NotionTableCell>
                                        <NotionTableCell className="hidden max-w-[18rem] truncate text-fg-muted md:table-cell">{d.folderPath ?? '—'}</NotionTableCell>
                                        <NotionTableCell className="hidden truncate text-fg-muted sm:table-cell">{d.updatedByEmail ? nameFromEmail(d.updatedByEmail) : '—'}</NotionTableCell>
                                        <NotionTableCell className="whitespace-nowrap text-fg-muted">{formatRelativeTime(d.updatedAt)}</NotionTableCell>
                                        <NotionTableCell>
                                            <a href={href} aria-label={`Open ${d.fileName}`} className="inline-flex rounded-control p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg">
                                                <ArrowUpRight className="h-4 w-4" />
                                            </a>
                                        </NotionTableCell>
                                    </NotionTableRow>
                                )
                            })}
                        </NotionTableBody>
                    </NotionTable>
                </div>
            )}
        </div>
    )
}

// ─── Health ──────────────────────────────────────────────────────────────────

/** What the Health view draws from. The app maps the insights API onto it; the tour, its sample data. */
export interface FilesHealthInput {
    score: number
    penalties: { label: string; points: number }[]
    /** The seven File Organization checks (fileChecks), each with what it flags. */
    checks: FileCheck[]
    sensitive: SensitiveFileItem[]
    totalFiles: number
    /** Duplicate files, as the drilldown lists them; the caller draws it, with a way back. */
    renderDuplicates?: (onBack: () => void) => React.ReactNode
    /** False for a check the firm has hidden (its `hiddenRings` id). */
    show?: (ringId: string) => boolean
}

/** How many of the Health view's checks flag something: the Files tab's badge. */
export function healthAttentionCount(input: Pick<FilesHealthInput, 'checks' | 'sensitive' | 'show'>): number {
    const show = input.show ?? (() => true)
    return input.checks.filter((c) => show(c.id) && c.count > 0).length + (input.sensitive.length > 0 ? 1 : 0)
}

/** One check: what it looks for, and what it found. */
function CheckRow({ label, info, count, of, children }: { label: string; info: string; count: number; of: number; children?: React.ReactNode }) {
    return (
        <li className="flex flex-col gap-2 border-b border-line py-3">
            <div className="flex items-start gap-2.5">
                {count > 0
                    ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-waiting-icon" aria-hidden />
                    : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-done-icon" aria-hidden />}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-ui font-medium text-fg">{label}</span>
                    <span className="text-caption font-normal text-fg-muted">{info}</span>
                </div>
                <span className={cn('shrink-0 text-small', count > 0 ? 'font-medium text-status-waiting-fg' : 'text-fg-muted')}>
                    {count > 0 ? `${count} of ${of}` : 'None'}
                </span>
            </div>
            {children}
        </li>
    )
}

/**
 * Health: the folder score and what lowered it, then each check (it was the Overview's File
 * Organization, with the Action Center's Sensitive files). A sensitive file also raises a row in the
 * Overview's Needs you.
 */
export function FilesHealthView({ input, engagementBase }: { input: FilesHealthInput; engagementBase: string }) {
    const show = input.show ?? (() => true)
    const [showDuplicates, setShowDuplicates] = useState(false)
    const band = input.score >= 80 ? { text: 'Good', band: 'good' as const } : input.score >= 60 ? { text: 'Fair', band: 'warning' as const } : { text: 'Needs attention', band: 'critical' as const }
    const hex = input.score >= 80 ? DATA.done : input.score >= 50 ? DATA.waiting : DATA.problem
    const penalties = [...input.penalties].sort((a, b) => b.points - a.points)
    const deducted = penalties.reduce((s, p) => s + p.points, 0)
    const checks = input.checks.filter((c) => show(c.id))
    const passed = checks.filter((c) => c.count === 0).length + (input.sensitive.length === 0 ? 1 : 0)
    const total = checks.length + 1
    const fileHref = (id: string) => (engagementBase ? `${engagementBase}/files#doc-file:${id}` : '?tab=files')

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto custom-scrollbar pb-6">
            {show('folder.overall_score') && (
                <section aria-label="File health" className="@container">
                    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line @lg:grid-cols-2">
                        <StatusCell icon={FolderOpen} label="File health" info={FOLDER_SCORE_INFO}>
                            <p className="flex items-center gap-1.5">
                                <span className="text-h2 tabular-nums text-fg">{input.score}</span>
                                <span className="text-small text-fg-muted">/ 100</span>
                                <BandPill band={band.band} className="ml-1">{band.text}</BandPill>
                            </p>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                                <div className="h-full rounded-full" style={{ width: `${input.score}%`, backgroundColor: hex }} />
                            </div>
                            {deducted > 0 && <p className="text-caption font-normal text-fg-muted">100 − {deducted} = {input.score}</p>}
                        </StatusCell>
                        <StatusCell icon={AlertCircle} label="What lowered it">
                            {penalties.length > 0 ? (
                                <ul className="flex flex-col gap-1.5">
                                    {penalties.map((p) => (
                                        <li key={p.label} className="flex items-center gap-3 text-small">
                                            <span className="min-w-0 flex-1 truncate text-fg">{p.label}</span>
                                            <span className="shrink-0 font-medium tabular-nums text-status-problem-fg">−{p.points}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-small text-fg-muted">Nothing. Every check passed.</p>
                            )}
                        </StatusCell>
                    </div>
                </section>
            )}

            <section aria-labelledby="files-checks-h" className="flex flex-col">
                <div className="flex items-center gap-2 border-b border-line pb-2">
                    <h2 id="files-checks-h" className="text-h3 text-fg">Checks</h2>
                    <span className="text-small text-fg-muted">{passed === total ? `All ${total} passed` : `${passed} of ${total} passed`}</span>
                    <InfoHint text="What each check flags, out of the files or folders it looks at." label="About the checks" />
                </div>
                <ul className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
                    <CheckRow label="Sensitive files" info="Content that looks like account, card or ID numbers. A flagged file also shows in Needs you on the Overview." count={input.sensitive.length} of={input.totalFiles}>
                        {input.sensitive.length > 0 && (
                            <ul className="ml-6 flex flex-col gap-1">
                                {input.sensitive.map((f) => (
                                    <li key={f.documentId}>
                                        <a href={fileHref(f.documentId)} className="inline-flex items-center gap-1 text-small text-fg hover:underline">
                                            {f.fileName}
                                            <ChevronRight className="h-3 w-3 text-fg-subtle" aria-hidden />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CheckRow>
                    {checks.map((c) => (
                        <CheckRow key={c.id} label={c.label} info={c.info} count={c.count} of={c.of}>
                            {c.id === 'folder.duplicates' && c.count > 0 && input.renderDuplicates && (
                                showDuplicates ? (
                                    <div className="ml-6">{input.renderDuplicates(() => setShowDuplicates(false))}</div>
                                ) : (
                                    <button type="button" onClick={() => setShowDuplicates(true)} className="ml-6 inline-flex items-center gap-1 self-start text-small font-medium text-action hover:underline">
                                        Show the duplicates
                                        <ChevronRight className="h-3 w-3" aria-hidden />
                                    </button>
                                )
                            )}
                        </CheckRow>
                    ))}
                </ul>
            </section>
        </div>
    )
}

// ─── The app's views: the insights API behind them ───────────────────────────

/**
 * Recent and Health in the app. They read the Overview's insights route, which answers internal viewers
 * the file data (it strips it for Reviewers and Limited Access contributors), and only when one is open.
 */
export function EngagementFilesViews({ projectId, view, engagementBase, toHealth, onHealthBadge }: {
    projectId: string
    view: Exclude<FilesView, 'all'>
    engagementBase: string
    /** The app's mapping of the insights onto the Health view (engagement-insights-dashboard.tsx). */
    toHealth: (data: EngagementInsightsResponse, engagementBase: string) => FilesHealthInput
    onHealthBadge?: (n: number) => void
}) {
    const { session } = useAuth()
    const [data, setData] = useState<EngagementInsightsResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        if (!session?.access_token) return
        let live = true
        setError(null)
        fetch(`/api/projects/${projectId}/insights`, { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then(async (r) => {
                if (!r.ok) {
                    const body = await r.json().catch(() => null) as { error?: string } | null
                    throw new Error(body?.error || `The server answered ${r.status}. Try again.`)
                }
                return r.json() as Promise<EngagementInsightsResponse>
            })
            .then((d) => { if (live) setData(d) })
            .catch((e) => { if (live) setError(failureReason(e)) })
        return () => { live = false }
    }, [projectId, session?.access_token, tick])

    const health = data ? toHealth(data, engagementBase) : null
    useEffect(() => {
        if (health && onHealthBadge) onHealthBadge(healthAttentionCount(health))
        // Only when the data changes; `health` is rebuilt each render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    if (error && !data) {
        return <LoadFailed className="py-16" what={view === 'recent' ? 'recent changes' : 'file health'} reason={error} onRetry={() => setTick((t) => t + 1)} />
    }
    if (!data) {
        return (
            <div className="flex flex-col gap-2" aria-busy="true">
                <div className="h-8 w-64 animate-pulse rounded-control bg-surface-muted" />
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded-control bg-surface-muted" />)}
            </div>
        )
    }
    return view === 'recent'
        ? <FilesRecentView recent={data.recentDocuments ?? []} engagementBase={engagementBase} />
        : <FilesHealthView input={health!} engagementBase={engagementBase} />
}
