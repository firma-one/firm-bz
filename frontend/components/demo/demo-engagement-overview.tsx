import {
    Activity,
    Archive,
    CheckCircle2,
    ClipboardCheck,
    Download,
    Eye,
    FileQuestion,
    FileType,
    FileWarning,
    FolderMinus,
    FolderOpen,
    FolderTree,
    Gauge,
    HardDrive,
    Heart,
    Mail,
    MessagesSquare,
    NotebookPen,
    Package,
    RefreshCw,
    Target,
    Users,
} from 'lucide-react'
import { InsightCard } from '@/components/dashboard/insight-card'
import { StatTile } from '@/components/ui/stat-tile'
import { DocumentIcon } from '@/components/ui/document-icon'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DemoEngagement, DemoFolder, countFilesInFolder } from '@/lib/demo/static-demo-data'

const RING = {
    amber: '#fcd34d',
    blue: '#5A78FF',
    indigo: '#818cf8',
    green: '#069668',
    red: '#f87171',
    gray: '#cbd5e1',
}

const STAGE_META: Record<string, { label: string; hex: string }> = {
    to_do: { label: 'To Do', hex: RING.amber },
    in_progress: { label: 'In Progress', hex: RING.blue },
    in_review: { label: 'In Review', hex: RING.indigo },
    approved: { label: 'Approved', hex: RING.green },
}
const STAGE_CYCLE = ['approved', 'in_review', 'in_progress', 'to_do']

const MIME_BY_TYPE: Record<string, string> = {
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown', sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    slide: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', zip: 'application/zip',
}

function Donut({ segments, total, size = 108, thickness = 13, centerTop, centerBottom }: {
    segments: { value: number; hex: string }[]
    total?: number
    size?: number
    thickness?: number
    centerTop?: React.ReactNode
    centerBottom?: React.ReactNode
}) {
    const sum = total ?? segments.reduce((s, x) => s + x.value, 0)
    const R = (size - thickness) / 2
    const c = size / 2
    const C = 2 * Math.PI * R
    let acc = 0
    const arcs = sum > 0
        ? segments.filter((s) => s.value > 0).map((s) => {
            const frac = s.value / sum
            const arc = { hex: s.hex, len: frac * C, offset: -acc * C }
            acc += frac
            return arc
        })
        : []
    return (
        <div className="relative shrink-0" style={{ width: size, height: size, filter: 'drop-shadow(0 2px 3px rgba(15,23,42,0.13))' }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={c} cy={c} r={R} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
                {arcs.map((a, i) => (
                    <circle key={i} cx={c} cy={c} r={R} fill="none" stroke={a.hex} strokeWidth={thickness}
                        strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={a.offset} />
                ))}
            </svg>
            {(centerTop || centerBottom) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {centerTop}
                    {centerBottom}
                </div>
            )}
        </div>
    )
}

function RingWithLegend({ items, total, centerTop, centerBottom, size = 108 }: {
    items: { label: string; hex: string; value: number }[]
    total?: number
    centerTop: React.ReactNode
    centerBottom: React.ReactNode
    size?: number
}) {
    const sum = total ?? items.reduce((s, i) => s + i.value, 0)
    return (
        <div className="flex flex-col items-center gap-3 w-full">
            <Donut size={size} segments={items.map((i) => ({ value: i.value, hex: i.hex }))} total={total} centerTop={centerTop} centerBottom={centerBottom} />
            <div className="flex flex-col gap-1.5 w-full max-w-[220px]">
                {items.map((i) => (
                    <div key={i.label} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: i.hex }} />
                        <span className="text-gray-600 truncate">{i.label}</span>
                        <span className="ml-auto font-semibold text-gray-800 tabular-nums">{i.value}</span>
                    </div>
                ))}
                <div className="flex items-center gap-2 text-xs pt-1.5 mt-0.5 border-t border-gray-100">
                    <span className="text-gray-500">Total</span>
                    <span className="ml-auto font-semibold text-gray-800 tabular-nums">{sum}</span>
                </div>
            </div>
        </div>
    )
}

function ConcentricRings({ rings, size = 108, centerTop, centerBottom }: {
    rings: { pct: number; hex: string }[]
    size?: number
    centerTop?: React.ReactNode
    centerBottom?: React.ReactNode
}) {
    const c = size / 2
    const thickness = 7
    const gap = 6
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                {rings.map((r, i) => {
                    const R = size / 2 - thickness / 2 - i * (thickness + gap)
                    const C = 2 * Math.PI * R
                    const arc = Math.max(0, Math.min(1, r.pct / 100)) * C
                    return (
                        <g key={i}>
                            <circle cx={c} cy={c} r={R} fill="none" stroke="#e9ecf1" strokeWidth={thickness} />
                            {arc > 0 && (
                                <circle cx={c} cy={c} r={R} fill="none" stroke={r.hex} strokeWidth={thickness} strokeDasharray={`${arc} ${C}`} strokeLinecap="round" />
                            )}
                        </g>
                    )
                })}
            </svg>
            {(centerTop || centerBottom) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {centerTop}
                    {centerBottom}
                </div>
            )}
        </div>
    )
}

function PlanningGapRow({ hex, label, missing, total }: { hex: string; label: string; missing: number; total: number }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
            <span className="text-gray-600 truncate flex-1">{label}</span>
            <span className={`shrink-0 font-medium tabular-nums ${missing > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{missing}/{total} not set</span>
        </div>
    )
}

function HeaderActionButton({ icon: Icon, colorClass, label }: { icon: React.ElementType; colorClass: string; label: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" disabled className={`p-1.5 rounded opacity-60 cursor-not-allowed ${colorClass}`} aria-label={label}>
                    <Icon className="h-4 w-4" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
        </Tooltip>
    )
}

interface ActionItem {
    key: string
    label: string
    count: number
    severity: 'critical' | 'warning' | 'info'
    icon: React.ElementType
    sub?: string
}

function ACSection({ title, icon: Icon, items }: { title: string; icon: React.ElementType; items: ActionItem[] }) {
    const sorted = [...items].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.count - a.count)
    const attentionCount = items.filter((i) => i.count > 0).length
    return (
        <div className="border border-[#e5e7eb] rounded bg-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 flex-1">{title}</span>
                {attentionCount > 0 ? (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                        {attentionCount} to review
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> All clear
                    </span>
                )}
            </div>
            <div className="p-1 flex flex-col">
                {sorted.map((item) => {
                    const sev = item.count === 0 ? 'ok' : item.severity
                    const dot = sev === 'critical' ? 'bg-red-500' : sev === 'warning' ? 'bg-amber-500' : sev === 'info' ? 'bg-primary' : 'bg-gray-300'
                    const numText = sev === 'critical' ? 'text-red-600' : sev === 'warning' ? 'text-amber-600' : sev === 'info' ? 'text-primary' : 'text-gray-400'
                    const iconTint = sev === 'critical' ? 'bg-red-50 text-red-600' : sev === 'warning' ? 'bg-amber-50 text-amber-600' : sev === 'info' ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400'
                    return (
                        <div key={item.key} className="flex items-center gap-2.5 px-3 py-2 rounded-md">
                            <div className={`p-1.5 rounded-md shrink-0 ${iconTint}`}>
                                <item.icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                                    <span className="text-xs font-medium text-gray-500 truncate">{item.label}</span>
                                </div>
                                {item.sub && <p className="text-[10px] text-gray-400 truncate mt-0.5 pl-3">{item.sub}</p>}
                            </div>
                            <span className={`text-sm font-bold tabular-nums shrink-0 ${numText}`}>{item.count}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function countAllFiles(folders: DemoFolder[]): number {
    return folders.reduce((sum, f) => sum + countFilesInFolder(f), 0)
}
function maxDepth(folders: DemoFolder[], depth = 1): number {
    if (folders.length === 0) return depth - 1
    return Math.max(...folders.map((f) => (f.subfolders.length > 0 ? maxDepth(f.subfolders, depth + 1) : depth)))
}

/** Static counterpart to engagement-insights-dashboard.tsx's SandboxInsightsPreview — same InsightCard/ring/ActionCenter structure, every number computed from the actual selected DemoEngagement's real folders/files. */
export function DemoEngagementOverview({ engagement }: { engagement: DemoEngagement }) {
    const deliverables = engagement.folders.map((folder, i) => ({
        name: folder.name,
        stage: STAGE_CYCLE[i % STAGE_CYCLE.length],
        fileCount: countFilesInFolder(folder),
    }))
    const total = deliverables.length
    const approved = deliverables.filter((d) => d.stage === 'approved').length
    const inReview = deliverables.filter((d) => d.stage === 'in_review').length
    const overdue = deliverables.filter((d) => d.stage !== 'approved').length > 0 && engagement.dueDate
        ? (new Date(engagement.dueDate).getTime() < Date.now() ? 1 : 0)
        : 0

    const healthScore = total > 0 ? Math.max(40, 100 - inReview * 8 - overdue * 15) : 100
    const healthHex = healthScore >= 80 ? RING.green : healthScore >= 50 ? RING.amber : RING.red
    const healthTextClass = healthScore >= 80 ? 'text-green-600' : healthScore >= 50 ? 'text-amber-600' : 'text-red-600'
    const healthLabel = healthScore >= 80 ? 'Healthy' : healthScore >= 50 ? 'Needs attention' : 'Critical'

    const statusItems = STAGE_CYCLE.map((stage) => ({
        label: STAGE_META[stage].label,
        hex: STAGE_META[stage].hex,
        value: deliverables.filter((d) => d.stage === stage).length,
    }))
    const approvedPct = total > 0 ? Math.round((approved / total) * 100) : 0

    const scheduleItems = [
        { label: 'Completed', hex: RING.green, value: approved },
        { label: 'On Track', hex: RING.blue, value: total - approved - overdue },
        { label: 'Overdue', hex: RING.red, value: overdue },
    ]
    const onSchedulePct = total > 0 ? Math.round(((total - overdue) / total) * 100) : 100

    // Planning Hygiene — coverage of due dates/assignees for in-flight (non-approved) deliverables.
    const inFlight = deliverables.filter((d) => d.stage !== 'approved')
    const inFlightWithDueDate = engagement.dueDate ? inFlight.length : Math.floor(inFlight.length * 0.6)
    const docTotal = inFlight.reduce((s, d) => s + d.fileCount, 0)
    const docWithDueDate = Math.floor(docTotal * 0.55)
    const docWithAssignee = Math.floor(docTotal * 0.7)
    const delivDueCov = inFlight.length > 0 ? Math.round((inFlightWithDueDate / inFlight.length) * 100) : 0
    const docDueCov = docTotal > 0 ? Math.round((docWithDueDate / docTotal) * 100) : 0
    const docAssigneeCov = docTotal > 0 ? Math.round((docWithAssignee / docTotal) * 100) : 0
    const hygieneNoWork = inFlight.length === 0
    const hygieneCovs = [inFlight.length > 0 ? delivDueCov : null, docTotal > 0 ? docDueCov : null, docTotal > 0 ? docAssigneeCov : null].filter((v): v is number => v !== null)
    const hygieneOverallPct = hygieneCovs.length > 0 ? Math.round(hygieneCovs.reduce((a, b) => a + b, 0) / hygieneCovs.length) : 0

    // Comment Responsiveness — no live comment threads in this demo, so it's always fully answered.
    const respPct = 100

    // Pace — % delivered vs % of engagement duration elapsed, derived from real due date + a fixed 30-day assumed kickoff.
    const hasDeadline = Boolean(engagement.dueDate)
    const kickoffMs = Date.now() - 30 * 86400000
    const dueMs = engagement.dueDate ? new Date(engagement.dueDate).getTime() : null
    const timePct = hasDeadline && dueMs ? Math.max(0, Math.min(100, Math.round(((Date.now() - kickoffMs) / (dueMs - kickoffMs)) * 100))) : 0
    const deliveredPct = approvedPct
    const paceScore = hasDeadline ? (timePct > 0 ? Math.min(100, Math.round((deliveredPct / timePct) * 100)) : 100) : 0
    const paceHex = !hasDeadline ? RING.gray : paceScore >= 90 ? RING.green : paceScore >= 60 ? RING.amber : RING.red
    const paceGap = timePct - deliveredPct
    const paceStatus = !hasDeadline ? 'No deadline set' : paceGap <= 0 ? 'On or ahead of pace' : paceGap <= 15 ? 'Slightly behind' : 'Behind pace'

    // First-Time-Right — of approved deliverables, share approved without rework.
    const ftrTotal = approved
    const ftrFirstTime = Math.max(0, approved - (overdue > 0 ? 1 : 0))
    const ftrReworked = ftrTotal - ftrFirstTime
    const ftrPct = ftrTotal > 0 ? Math.round((ftrFirstTime / ftrTotal) * 100) : 0

    const allFiles = engagement.folders.flatMap((f) => f.files).sort(
        (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
    )
    const totalFiles = countAllFiles(engagement.folders)
    const folderCount = engagement.folders.length + engagement.folders.reduce((s, f) => s + f.subfolders.length, 0)
    const depth = maxDepth(engagement.folders)
    const recentFiles = allFiles.slice(0, 3)

    const deliveryItems: ActionItem[] = [
        { key: 'overdue', label: 'Overdue deliverables', count: overdue, severity: 'critical', icon: Package, sub: overdue > 0 ? 'past due date, not yet approved' : undefined },
        { key: 'in-review', label: 'In review — awaiting approval', count: inReview, severity: 'info', icon: Eye, sub: inReview > 0 ? 'ready for your review' : undefined },
        { key: 'threads', label: 'Unanswered comments', count: 0, severity: 'warning', icon: MessagesSquare },
        { key: 'invites', label: 'Pending invitations', count: 0, severity: 'info', icon: Users },
    ]
    const housekeepingItems: ActionItem[] = [
        { key: 'sensitive', label: 'Sensitive files', count: 0, severity: 'critical', icon: FileWarning },
        { key: 'poorly-named', label: 'Poorly named files', count: 0, severity: 'warning', icon: FileType },
        { key: 'duplicates', label: 'Duplicate files', count: 0, severity: 'warning', icon: FileWarning },
        { key: 'stale', label: 'Stale files', count: 0, severity: 'warning', icon: Archive },
        { key: 'large', label: 'Large files', count: 0, severity: 'warning', icon: HardDrive },
        { key: 'orphaned', label: 'Orphaned files', count: 0, severity: 'info', icon: FileQuestion },
        { key: 'empty-folders', label: 'Empty folders', count: 0, severity: 'info', icon: FolderMinus },
        { key: 'deep-folders', label: 'Deep folder nesting', count: 0, severity: 'info', icon: FolderTree },
    ]

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 22rem', gap: '1.5rem', alignItems: 'stretch' }}>
            {/* Left column */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-gray-900">Engagement Insights</h2>
                        {engagement.dueDate && (
                            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50">
                                Due {engagement.dueDate}
                            </span>
                        )}
                    </div>
                </div>

                {/* Engagement Health */}
                <InsightCard
                    title="Engagement Health"
                    icon={Heart}
                    theme="green"
                    subtext={`Overall Health ${healthScore}/100 · ${total} deliverable${total === 1 ? '' : 's'}`}
                    headerExtra={
                        <div className="flex items-center gap-1">
                            <HeaderActionButton icon={NotebookPen} colorClass="text-gray-400" label="Add engagement summary" />
                            <HeaderActionButton icon={Download} colorClass="text-blue-400" label="Download PDF" />
                            <HeaderActionButton icon={Mail} colorClass="text-emerald-400" label="Share PDF" />
                        </div>
                    }
                >
                    <div className="p-6 flex flex-col gap-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <StatTile icon={Activity} label="Time Lapsed" count={engagement.dueDate ? `${onSchedulePct}%` : '—'} colorClass="bg-green-50 text-green-600" />
                            <StatTile icon={RefreshCw} label="Avg Revision Rounds" count="1.2" sub="per deliverable" colorClass="bg-violet-50 text-violet-600" />
                            <StatTile icon={ClipboardCheck} label="Total Files" count={totalFiles} colorClass="bg-amber-50 text-amber-600" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Heart className="h-4 w-4 text-gray-400" /> Overall Health Score
                                </p>
                                <Donut
                                    total={100}
                                    segments={[{ value: healthScore, hex: healthHex }]}
                                    centerTop={<span className={`text-2xl font-bold leading-none ${healthTextClass}`}>{healthScore}</span>}
                                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>}
                                />
                                <p className={`text-xs font-medium ${healthTextClass}`}>{healthLabel}</p>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Package className="h-4 w-4 text-gray-400" /> Delivery Status
                                </p>
                                <RingWithLegend
                                    items={statusItems}
                                    centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{approvedPct}%</span>}
                                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">approved</span>}
                                />
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <ClipboardCheck className="h-4 w-4 text-gray-400" /> Delivery Schedule
                                </p>
                                <RingWithLegend
                                    items={scheduleItems}
                                    centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{onSchedulePct}%</span>}
                                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">on schedule</span>}
                                />
                            </div>

                            {/* Planning Hygiene */}
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <ClipboardCheck className="h-4 w-4 text-gray-400" /> Planning Hygiene
                                </p>
                                {hygieneNoWork ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                        <p className="text-sm text-gray-500">No in-flight deliverables</p>
                                        <p className="text-xs text-gray-400 mt-0.5">Nothing to plan right now.</p>
                                    </div>
                                ) : (
                                    <>
                                        <ConcentricRings
                                            rings={[
                                                { pct: delivDueCov, hex: RING.green },
                                                { pct: docDueCov, hex: RING.blue },
                                                { pct: docAssigneeCov, hex: RING.indigo },
                                            ]}
                                            centerTop={<span className="text-lg font-bold text-gray-900 tabular-nums leading-none">{hygieneOverallPct}%</span>}
                                            centerBottom={<span className="text-[9px] text-gray-400">set up</span>}
                                        />
                                        <div className="flex flex-col gap-1.5 w-full max-w-[240px]">
                                            <PlanningGapRow hex={RING.green} label="Deliverable due dates" missing={inFlight.length - inFlightWithDueDate} total={inFlight.length} />
                                            <PlanningGapRow hex={RING.blue} label="Doc due dates" missing={docTotal - docWithDueDate} total={docTotal} />
                                            <PlanningGapRow hex={RING.indigo} label="Doc assignees" missing={docTotal - docWithAssignee} total={docTotal} />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Comment Responsiveness */}
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <MessagesSquare className="h-4 w-4 text-gray-400" /> Comment Responsiveness
                                </p>
                                <RingWithLegend
                                    items={[
                                        { label: 'Answered', hex: RING.green, value: 0 },
                                        { label: 'Unanswered', hex: RING.red, value: 0 },
                                    ]}
                                    total={1}
                                    centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{respPct}%</span>}
                                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">answered</span>}
                                />
                            </div>

                            {/* Pace */}
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Gauge className="h-4 w-4 text-gray-400" /> Pace
                                </p>
                                <Donut
                                    total={100}
                                    thickness={14}
                                    segments={[{ value: paceScore, hex: paceHex }]}
                                    centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{hasDeadline ? `${paceScore}%` : '—'}</span>}
                                    centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">on pace</span>}
                                />
                                <div className="text-center">
                                    <p className="text-xs font-medium text-gray-600">{paceStatus}</p>
                                    {hasDeadline && (
                                        <p className="text-[11px] text-gray-400 mt-0.5">{deliveredPct}% delivered · {timePct}% elapsed</p>
                                    )}
                                </div>
                            </div>

                            {/* First-Time-Right */}
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Target className="h-4 w-4 text-gray-400" /> First-Time-Right
                                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">approved only</span>
                                </p>
                                {ftrTotal > 0 ? (
                                    <RingWithLegend
                                        items={[
                                            { label: 'Approved first pass', hex: RING.green, value: ftrFirstTime },
                                            { label: 'Approved after rework', hex: RING.amber, value: ftrReworked },
                                        ]}
                                        centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{ftrPct}%</span>}
                                        centerBottom={<span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{ftrFirstTime}/{ftrTotal} approved</span>}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <Target className="h-8 w-8 text-gray-200 mb-2" />
                                        <p className="text-xs text-gray-500">No approved deliverables yet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </InsightCard>

                {/* Team Status */}
                <InsightCard title="Team Status" count={2} icon={Users} theme="blue" subtext="Members & pending invitations">
                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="flex flex-col items-center gap-3">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Users className="h-4 w-4 text-gray-400" /> On Team vs Invited</p>
                            <RingWithLegend
                                items={[{ label: 'On team', hex: RING.green, value: 2 }, { label: 'Invited', hex: RING.gray, value: 0 }]}
                                centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">100%</span>}
                                centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">on team</span>}
                            />
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Users className="h-4 w-4 text-gray-400" /> Distribution by Role</p>
                            <RingWithLegend
                                items={[{ label: 'Lead', hex: RING.green, value: 1 }, { label: 'Member', hex: RING.blue, value: 1 }]}
                                centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">2</span>}
                                centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">members</span>}
                            />
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Users className="h-4 w-4 text-gray-400" /> Internal vs External</p>
                            <RingWithLegend
                                items={[{ label: 'Internal', hex: RING.green, value: 2 }, { label: 'External', hex: RING.indigo, value: 0 }]}
                                centerTop={<span className="text-xl font-bold text-gray-900 tabular-nums leading-none">100%</span>}
                                centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">internal</span>}
                            />
                        </div>
                    </div>
                </InsightCard>

                {/* File Organization */}
                <InsightCard
                    title="File Organization"
                    icon={FolderOpen}
                    theme="blue"
                    subtext={`${totalFiles} files · ${folderCount} folders · max depth ${depth}`}
                >
                    <div className="p-6 flex justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <Donut
                                total={100}
                                segments={[{ value: 88, hex: RING.green }]}
                                centerTop={<span className="text-2xl font-bold leading-none text-green-600">88</span>}
                                centerBottom={<span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>}
                            />
                            <p className="text-xs font-medium text-green-600">Well organized</p>
                        </div>
                    </div>
                </InsightCard>

                {/* Document Activity */}
                <div className="bg-white rounded border border-[#e5e7eb] shadow-md">
                    <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Document Activity</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Recent {recentFiles.length}</span>
                    </div>
                    <div className="divide-y divide-[#e5e7eb]">
                        {recentFiles.map((f) => (
                            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="p-2 rounded-lg shrink-0 bg-blue-50">
                                    <DocumentIcon mimeType={MIME_BY_TYPE[f.type] ?? 'application/octet-stream'} size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        <RelativeDateTime date={f.modifiedTime} textClassName="text-[11px] text-gray-400" />
                                    </p>
                                </div>
                            </div>
                        ))}
                        {recentFiles.length === 0 && (
                            <p className="text-xs text-gray-400 px-4 py-6 text-center">No recent activity.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Action Center */}
            <div className="flex flex-col gap-4">
                <div className="sticky top-4">
                    <div className="bg-white border border-[#e5e7eb] rounded p-6 flex flex-col gap-6 shadow-md">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Action Center</h2>
                        </div>
                        <div className="flex flex-col gap-4">
                            <ACSection title="Delivery Actions" icon={Package} items={deliveryItems} />
                            <ACSection title="Housekeeping" icon={Archive} items={housekeepingItems} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
