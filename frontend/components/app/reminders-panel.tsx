"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { usePathname } from "next/navigation"
import { ArrowUpRight, BellOff, Building2, CalendarClock, CheckCircle2, ChevronRight, Clock, Eye, EyeOff, FileText, SquareX, Undo2, Users } from "lucide-react"
import Link from "next/link"
import {
    getUserReminders,
    markReminderDone,
    hideReminder,
    showReminder,
    type ReminderWithContext,
} from "@/lib/actions/user-reminders"
import { Tip } from "@/components/ui/tip"

const ENTITY_KEY_ICON: Record<string, React.ElementType> = {
    'platform.clients': Users,
    'platform.engagements': CalendarClock,
    'platform.firms': Building2,
    'platform.documents': FileText,
}

function getEntityIcon(entityKey: string): React.ElementType {
    const tableKey = entityKey.split('.').slice(0, 2).join('.')
    return ENTITY_KEY_ICON[tableKey] ?? CalendarClock
}

// All accents are hues of the Reminders signature color #C4572B
function itemAccent(style: ReminderWithContext['labelStyle']): {
    border: string; chipText: string
} {
    switch (style) {
        case 'amber': return { border: '#C4572B', chipText: '#7A2414' }
        case 'orange': return { border: '#A33D1E', chipText: '#5A1409' }
        case 'red':    return { border: '#7A2414', chipText: '#3D0D04' }
        default:       return { border: '#E8B99F', chipText: '#8B3A1C' }
    }
}

function relativeDueLabel(delta: number): string {
    if (delta >= 2) return `Due in ${delta} days`
    if (delta === 1) return 'Due tomorrow'
    if (delta === 0) return 'Due today'
    if (delta === -1) return '1 day overdue'
    return `${Math.abs(delta)} days overdue`
}

function fullDateLabel(followUpDate: string): string {
    return new Date(followUpDate).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
}

type ReminderRowProps = {
    r: ReminderWithContext
    isPending: boolean
    acting: string | null
    onDone: (id: string) => void
    onUndoDone: (id: string) => void
    onHide: (id: string) => void
    onShow: (id: string) => void
    onNavigate: () => void
}

function ReminderRow({ r, isPending, acting, onDone, onUndoDone, onHide, onShow, onNavigate }: ReminderRowProps) {
    const hidden = r.hiddenAt !== null
    const accent = itemAccent(r.labelStyle)
    const Icon = getEntityIcon(r.entityKey)
    return (
        <div
            className={`group grid px-3 py-2 rounded-[2px] border transition-all ${
                isPending
                    ? 'border-[#e5e7eb] bg-[#f9f9fb] opacity-60'
                    : hidden
                    ? 'border-[#e5e7eb] bg-[#f9f9fb] hover:bg-white hover:border-[#e5e7eb]'
                    : 'border-[#e5e7eb] bg-white hover:border-[#e5e7eb] hover:shadow-sm'
            }`}
            style={{ borderLeftWidth: '3px', borderLeftColor: isPending ? '#C4572B' : hidden ? '#E8E8E8' : accent.border }}
        >
            {/* Row 1: [icon + action + chevron] | undo/done button */}
            <div className="flex items-center justify-between gap-2">
                <Tip label={r.entityName} position="bottom">
                <a
                    href={r.ctaUrl ?? '#'}
                    className="flex items-center gap-1.5 min-w-0 group/link"
                    onClick={onNavigate}
                >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                    <span className={`text-[0.8125rem] font-semibold truncate leading-snug transition-colors group-hover/link:text-[#C4572B] ${hidden || isPending ? 'text-[#45474c]' : 'text-[#1b1b1d]'} ${isPending ? 'line-through' : ''}`}>
                        {r.action}
                    </span>
                    {r.note && (
                        <span className="text-[11px] text-[#45474c] truncate ml-1 font-normal">{r.note}</span>
                    )}
                    <ChevronRight className="h-3 w-3 shrink-0 text-[#45474c]/40 group-hover/link:text-[#C4572B]/60 transition-colors" />
                </a>
                </Tip>
                <div className="flex items-center gap-1">
                    {isPending ? (
                        <Tip label="Keep reminder" position="bottom-right">
                            <button
                                type="button"
                                onClick={() => onUndoDone(r.id)}
                                className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-[2px] border border-[#C4572B]/30 bg-white text-[#C4572B]/60 hover:text-[#C4572B] hover:border-[#C4572B] transition-colors"
                            >
                                <Undo2 className="h-3 w-3" />
                            </button>
                        </Tip>
                    ) : (
                        <Tip label="Mark done" position="bottom-right">
                            <button
                                type="button"
                                disabled={acting === r.id}
                                onClick={() => onDone(r.id)}
                                className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-[2px] border border-[#e5e7eb] bg-white text-[#45474c]/50 hover:text-emerald-600 hover:border-emerald-300 disabled:opacity-40 transition-colors"
                            >
                                <CheckCircle2 className="h-3 w-3" />
                            </button>
                        </Tip>
                    )}
                    {/* Hide/Show button — hidden from UI until UX is validated; restore when needed
                    <Tip label={hidden ? 'Show reminder' : 'Hide reminder'} position="bottom-right">
                        <button
                            type="button"
                            disabled={acting === r.id || isPending}
                            onClick={() => hidden ? onShow(r.id) : onHide(r.id)}
                            className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-[2px] border border-[#e5e7eb] bg-white text-[#45474c]/50 hover:text-[#45474c] hover:border-[#e5e7eb] disabled:opacity-40 transition-colors"
                        >
                            {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </button>
                    </Tip>
                    */}
                </div>
            </div>
            {/* Row 2: due date or pending countdown */}
            {isPending ? (
                <div className="mt-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Clock className="h-3 w-3 shrink-0 text-[#C4572B]/50" />
                        <span className="text-[11px] font-medium text-[#C4572B]/60">Marking done…</span>
                    </div>
                    <div className="h-0.5 w-full rounded-full bg-[#e5e7eb] overflow-hidden">
                        <div
                            className="h-full rounded-full bg-[#C4572B]"
                            style={{ animation: 'reminder-undo-shrink 10s linear forwards' }}
                        />
                    </div>
                </div>
            ) : (
                <Tip label={r.dateValue ? fullDateLabel(r.dateValue) : ''}>
                    <div className={`flex items-center gap-1.5 mt-0.5 ${hidden ? 'opacity-40' : ''}`}>
                        <Clock className="h-3 w-3 shrink-0" style={{ color: hidden ? '#45474c' : accent.chipText }} />
                        <span className="text-[11px] font-medium" style={{ color: hidden ? '#45474c' : accent.chipText }}>
                            {r.delta !== null ? relativeDueLabel(r.delta) : r.label}
                        </span>
                    </div>
                </Tip>
            )}
        </div>
    )
}

type Props = { onCountChange?: (count: number) => void }

export function RemindersPanel({ onCountChange }: Props) {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [reminders, setReminders] = useState<ReminderWithContext[]>([])
    const [loading, setLoading] = useState(false)
    const [acting, setActing] = useState<string | null>(null)
    const [showHidden, setShowHidden] = useState(false)
    const [pendingDoneIds, setPendingDoneIds] = useState<Set<string>>(new Set())
    const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    const mountedRef = useRef(false)

    const isHidden = (r: ReminderWithContext) => r.hiddenAt !== null
    const sorted = [...reminders].sort((a, b) => {
      // Overdue (most overdue first) → due today → upcoming (soonest first) → no date
      const aPriority = a.delta === null ? 3 : a.delta < 0 ? 0 : a.delta === 0 ? 1 : 2
      const bPriority = b.delta === null ? 3 : b.delta < 0 ? 0 : b.delta === 0 ? 1 : 2
      if (aPriority !== bPriority) return aPriority - bPriority
      if (a.delta !== null && b.delta !== null) return a.delta - b.delta
      return 0
    })
    const visible = sorted.filter((r) => !isHidden(r))
    const hidden = sorted.filter((r) => isHidden(r))
    const displayed = (showHidden ? sorted : visible).slice(0, 5)
    const urgentCount = visible.filter((r) => r.delta !== null && r.delta <= 0).length

    const load = useCallback(async () => {
        setLoading(true)
        try { setReminders(await getUserReminders()) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load(); mountedRef.current = true }, [load])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (mountedRef.current) load() }, [pathname])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (open) load() }, [open])
    useEffect(() => {
        const h = () => load()
        window.addEventListener('firma-reminders-updated', h)
        return () => window.removeEventListener('firma-reminders-updated', h)
    }, [load])
    useEffect(() => {
        return () => { Object.values(pendingTimers.current).forEach(clearTimeout) }
    }, [])
    useEffect(() => { onCountChange?.(urgentCount) }, [urgentCount, onCountChange])
    useEffect(() => {
        if (!open) return
        const h = (e: MouseEvent) => { if (!(e.target as Element).closest('.reminders-container')) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [open])

    function handleDone(id: string) {
        setPendingDoneIds((prev) => new Set(prev).add(id))
        pendingTimers.current[id] = setTimeout(async () => {
            setPendingDoneIds((prev) => { const s = new Set(prev); s.delete(id); return s })
            delete pendingTimers.current[id]
            setActing(id)
            try { await markReminderDone(id); await load() }
            finally { setActing(null) }
        }, 10_000)
    }
    function handleUndoDone(id: string) {
        clearTimeout(pendingTimers.current[id])
        delete pendingTimers.current[id]
        setPendingDoneIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
    async function handleHide(id: string) {
        setActing(id)
        try { await hideReminder(id); await load() }
        finally { setActing(null) }
    }
    async function handleShow(id: string) {
        setActing(id)
        try { await showReminder(id); await load() }
        finally { setActing(null) }
    }

    return (
        <div className="relative reminders-container">
            <Tip label="Reminders" position="bottom">
            <button
                type="button"
                aria-label="Reminders"
                onClick={() => setOpen((v) => !v)}
                className="p-2 hover:bg-orange-50 rounded-xl transition-colors relative"
                style={{ color: '#C4572B' }}
            >
                <CalendarClock className="h-5 w-5" />
                {reminders.length > 0 ? (
                    <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none" style={{ background: '#C4572B' }}>
                        {reminders.length}
                    </span>
                ) : null}
            </button>
            </Tip>

            {open ? (
                <div className="absolute right-0 top-full mt-2 w-[340px] border border-[#e5e7eb] rounded-[2px] shadow-lg z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 bg-[#f9f9fb] border-b border-[#e5e7eb] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Reminders</span>
                            {reminders.length > 0 ? (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none text-white" style={{ background: '#C4572B' }}>
                                    {reminders.length}
                                </span>
                            ) : null}
                            {urgentCount > 0 ? (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none border" style={{ background: '#FDF0EA', color: '#7A2414', borderColor: '#D9937A' }}>
                                    {urgentCount} overdue
                                </span>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                            {hidden.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setShowHidden((v) => !v)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[11px] font-medium text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f3f4f6] transition-colors"
                                >
                                    {showHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    {`Hidden · ${hidden.length}`}
                                </button>
                            ) : null}
                            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                                className="p-1 rounded-[2px] hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                                <SquareX className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <style>{`@keyframes reminder-undo-shrink { from { width: 100% } to { width: 0% } }`}</style>
                    <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto bg-white">
                        {loading ? (
                            <div className="text-center py-8 text-[0.8125rem] text-[#45474c]">Loading…</div>
                        ) : displayed.length === 0 ? (
                            <div className="text-center py-8">
                                <BellOff className="h-7 w-7 mx-auto mb-2 text-[#e5e7eb]" />
                                <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">No reminders</p>
                                <p className="text-xs text-[#45474c] mt-0.5">Overdue and upcoming follow-ups appear here.</p>
                            </div>
                        ) : (
                            displayed.map((r) => (
                                <ReminderRow
                                    key={r.id}
                                    r={r}
                                    isPending={pendingDoneIds.has(r.id)}
                                    acting={acting}
                                    onDone={handleDone}
                                    onUndoDone={handleUndoDone}
                                    onHide={handleHide}
                                    onShow={handleShow}
                                    onNavigate={() => setOpen(false)}
                                />
                            ))
                        )}
                    </div>
                    {!loading && displayed.length > 0 && (
                        <div className="sticky bottom-0 bg-white border-t border-[#e5e7eb] px-3 py-2 flex items-center justify-between">
                            <span className="text-[11px] text-[#45474c]">
                                {displayed.length} {displayed.length === 1 ? 'reminder' : 'reminders'}
                            </span>
                            <Link
                                href="/d/u/reminders"
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-0.5 text-[11px] font-semibold text-firma hover:text-firma/80"
                            >
                                View all <ArrowUpRight className="h-3 w-3" />
                            </Link>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
