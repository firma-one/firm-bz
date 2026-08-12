'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlarmClock, Bookmark, Briefcase, Clock, History, SquareX, Users } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEMO_BOOKMARKS, DEMO_RECENTS, DEMO_REMINDERS } from '@/lib/demo/demo-topbar-data'

function useOutsideClose(ref: React.RefObject<HTMLDivElement | null>, open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open, ref, onClose])
}

function relativeDueLabel(delta: number): string {
    if (delta >= 2) return `Due in ${delta} days`
    if (delta === 1) return 'Due tomorrow'
    if (delta === 0) return 'Due today'
    if (delta === -1) return '1 day overdue'
    return `${Math.abs(delta)} days overdue`
}

/** Static counterpart to reminders-panel.tsx — same trigger/panel chrome, fixed sample reminders. */
export function DemoRemindersButton() {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useOutsideClose(ref, open, () => setOpen(false))
    const urgentCount = DEMO_REMINDERS.filter((r) => r.delta <= 0).length

    return (
        <div className="relative" ref={ref}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label="Reminders"
                        onClick={() => setOpen((v) => !v)}
                        className="p-2 hover:bg-orange-50 rounded-xl transition-colors relative"
                        style={{ color: '#C4572B' }}
                    >
                        <AlarmClock className="h-5 w-5" />
                        {DEMO_REMINDERS.length > 0 && (
                            <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none" style={{ background: '#C4572B' }}>
                                {DEMO_REMINDERS.length}
                            </span>
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Reminders</TooltipContent>
            </Tooltip>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[340px] border border-[#e5e7eb] rounded shadow-lg z-50 overflow-hidden bg-white">
                    <div className="px-4 py-3 bg-[#f9f9fb] border-b border-[#e5e7eb] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Reminders</span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none text-white" style={{ background: '#C4572B' }}>
                                {DEMO_REMINDERS.length}
                            </span>
                            {urgentCount > 0 && (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none border" style={{ background: '#FDF0EA', color: '#7A2414', borderColor: '#D9937A' }}>
                                    {urgentCount} overdue
                                </span>
                            )}
                        </div>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                            <SquareX className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto bg-white">
                        {DEMO_REMINDERS.map((r) => {
                            const Icon = r.entityType === 'client' ? Users : AlarmClock
                            const accentBorder = r.delta <= 0 ? '#C4572B' : '#E8B99F'
                            const chipColor = r.delta <= 0 ? '#7A2414' : '#8B3A1C'
                            return (
                                <div
                                    key={r.id}
                                    className="grid px-3 py-2 rounded border border-[#e5e7eb] bg-white hover:border-[#e5e7eb] hover:shadow-sm transition-all"
                                    style={{ borderLeftWidth: '3px', borderLeftColor: accentBorder }}
                                >
                                    <div className="flex items-start gap-1.5 min-w-0">
                                        <Icon className="h-3.5 w-3.5 shrink-0 text-[#45474c] mt-0.5" />
                                        <div className="min-w-0">
                                            <span className="text-[0.8125rem] font-semibold line-clamp-2 leading-snug text-[#1b1b1d]">{r.action}</span>
                                            {r.note && <p className="text-[11px] text-[#45474c]/70 line-clamp-1 mt-0.5 font-normal">{r.note}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Clock className="h-3 w-3 shrink-0" style={{ color: chipColor }} />
                                        <span className="text-[11px] font-medium" style={{ color: chipColor }}>{relativeDueLabel(r.delta)}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

/** Static counterpart to app-topbar.tsx's Recents dropdown — same panel chrome, fixed sample recent items. */
export function DemoRecentsButton() {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useOutsideClose(ref, open, () => setOpen(false))

    return (
        <div className="relative" ref={ref}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label="Recents"
                        onClick={() => setOpen((v) => !v)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-firma hover:bg-firma/10 transition-colors relative"
                    >
                        <History className="h-5 w-5" />
                        {DEMO_RECENTS.length > 0 && (
                            <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 bg-firma text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                                {DEMO_RECENTS.length}
                            </span>
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Recents</TooltipContent>
            </Tooltip>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[340px] border border-[#e5e7eb] rounded shadow-lg z-50 overflow-hidden bg-white">
                    <div className="px-4 py-3 bg-[#f9f9fb] border-b border-[#e5e7eb] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Recents</span>
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none bg-firma text-white">
                                {DEMO_RECENTS.length}
                            </span>
                        </div>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                            <SquareX className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto bg-white">
                        {DEMO_RECENTS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className="grid px-3 py-2 rounded border border-[#e5e7eb] bg-white hover:border-[#e5e7eb] hover:shadow-sm transition-all group"
                                style={{ borderLeftWidth: '3px', borderLeftColor: item.type === 'client' ? '#5A78FF' : '#06966A' }}
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {item.type === 'client' ? (
                                        <Users className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                                    ) : (
                                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#45474c]" />
                                    )}
                                    <span className="text-[0.8125rem] font-semibold text-[#1b1b1d] truncate flex-1 group-hover:text-primary transition-colors">
                                        {item.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <History className="h-3 w-3 shrink-0 text-[#9ca3af]" />
                                    <span className="text-[11px] text-[#9ca3af]">
                                        {item.type === 'client' ? 'Client' : 'Engagement'} · {item.visitedMinutesAgo}m ago
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

/** Static counterpart to app-topbar.tsx's Bookmarks dropdown — same panel chrome, fixed sample bookmarks. */
export function DemoBookmarksButton() {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useOutsideClose(ref, open, () => setOpen(false))

    return (
        <div className="relative" ref={ref}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label="Bookmarks"
                        onClick={() => setOpen((v) => !v)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-[#5A78FF] hover:bg-[#5A78FF]/10 transition-colors relative"
                    >
                        <Bookmark className="h-5 w-5" />
                        {DEMO_BOOKMARKS.length > 0 && (
                            <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-1 bg-[#5A78FF] text-white text-[9px] font-bold rounded-full border border-white flex items-center justify-center leading-none">
                                {DEMO_BOOKMARKS.length}
                            </span>
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Bookmarks</TooltipContent>
            </Tooltip>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[360px] bg-white border border-[#e5e7eb] rounded shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#e5e7eb] bg-[#f9f9fb]">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[0.8125rem] font-bold text-[#1b1b1d] tracking-tight">Bookmarks</span>
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums leading-none bg-[#5A78FF] text-white">{DEMO_BOOKMARKS.length}</span>
                            </div>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded hover:bg-[#f3f4f6] text-[#45474c] hover:text-[#1b1b1d] transition-colors">
                                <SquareX className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-3 space-y-2 max-h-[380px] overflow-y-auto">
                        {DEMO_BOOKMARKS.map((b) => (
                            <Link
                                key={b.id}
                                href={b.href}
                                onClick={() => setOpen(false)}
                                className="group flex items-start gap-2 p-3 rounded border border-[#e5e7eb] bg-white hover:bg-[#f9f9fb]"
                            >
                                <div className="flex-1 min-w-0 text-left">
                                    <p className="text-[0.8125rem] font-medium text-[#1b1b1d] truncate">{b.label}</p>
                                    <p className="text-xs text-[#45474c] truncate">{b.sublabel}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
