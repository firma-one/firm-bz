'use client'

import type { ReactNode } from 'react'
import { BarChart3, Briefcase, Building2, CalendarDays, ChevronsUpDown, ClipboardList, Command, Compass, Contact, CreditCard, Folder, Home, Inbox, Info, LayoutGrid, LifeBuoy, List, MessagesSquare, Play, Plus, Search, Settings, StepForward, UserCircle, Users } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { ClientIcon } from '@/components/ui/client-icon'
import { Hint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { TOUR_MODES, tourNode, type TourMode, type TourNodeId } from '@/lib/demo/tour-chapters'

/** Each chapter's and section's icon, as the app shows its page in the sidebar, the tabs or the
 * profile menu. Brio has none: its title is its own mark, sparkle included. */
export const TOUR_NODE_ICONS: Record<TourNodeId, ReactNode | null> = {
    search: <Command />,
    home: <Home />,
    inbox: <Inbox />,
    profile: <UserCircle />,
    firm: <Building2 />,
    'firm-switcher': <ChevronsUpDown />,
    'firm-overview': <BarChart3 />,
    'doc-search': <Search />,
    calendar: <CalendarDays />,
    'firm-members': <Users />,
    'firm-audit': <ClipboardList />,
    'firm-settings': <Settings />,
    clients: <ClientIcon />,
    'all-clients': <List />,
    contacts: <Contact />,
    'new-client': <Plus />,
    engagements: <Briefcase />,
    'all-engagements': <List />,
    'new-engagement': <Plus />,
    'engagement-overview': <BarChart3 />,
    files: <Folder />,
    'file-details': <Info />,
    board: <LayoutGrid />,
    'deliverable-details': <Info />,
    discussions: <MessagesSquare />,
    'engagement-members': <Users />,
    'engagement-audit': <ClipboardList />,
    'engagement-settings': <Settings />,
    brio: null,
    support: <LifeBuoy />,
    billing: <CreditCard />,
}

/** A node's title for display: Brio's through its branding component, the rest as written. */
export function TourNodeTitle({ id }: { id: TourNodeId }) {
    return id === 'brio' ? <Brio /> : <>{tourNode(id).title}</>
}

/** Where a node sits in the outline, for display: Engagements › Files › Details. */
export function TourNodePlace({ id }: { id: TourNodeId }) {
    const node = tourNode(id)
    return (
        <>
            {[...node.ancestors.map((a) => a.id), id].map((part, i) => (
                <span key={part}>{i > 0 && ' › '}<TourNodeTitle id={part} /></span>
            ))}
        </>
    )
}

/** Each mode's name, icon and what it does, for the mode switch. */
export const TOUR_MODE_LABELS: Record<TourMode, { label: string; icon: ReactNode; description: string }> = {
    autoplay: { label: 'Autoplay', icon: <Play />, description: 'Plays by itself, a few seconds a step. Pause any time, or point at a card to read it.' },
    step: { label: 'Step by step', icon: <StepForward />, description: 'Moves on when you click Next.' },
    explore: { label: 'Explore', icon: <Compass />, description: 'No step cards: the outline takes you to each page and points out where things are.' },
}

/** The three modes side by side, the current one selected; in the chapter picker and the outline
 * pane. Compact (the pane) names only the current one; the others are icons, named on hover. */
export function TourModeSwitch({ value, onChange, compact = false, className }: { value: TourMode; onChange: (mode: TourMode) => void; compact?: boolean; className?: string }) {
    return (
        <div role="radiogroup" aria-label="How the tour plays" className={cn('flex rounded-control border border-line bg-surface-subtle p-0.5', className)}>
            {TOUR_MODES.map((mode) => {
                const selected = value === mode
                const named = !compact || selected
                const item = (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={named ? undefined : TOUR_MODE_LABELS[mode].label}
                        onClick={() => onChange(mode)}
                        className={cn(
                            'flex h-6 min-w-0 items-center justify-center gap-1.5 rounded-[4px] text-caption outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action/30 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
                            named ? 'flex-1 px-2' : 'w-8 shrink-0',
                            selected ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                        )}
                    >
                        {TOUR_MODE_LABELS[mode].icon}
                        {named && <span className="truncate">{TOUR_MODE_LABELS[mode].label}</span>}
                    </button>
                )
                return named ? item : <Hint key={mode} label={TOUR_MODE_LABELS[mode].label} side="top">{item}</Hint>
            })}
        </div>
    )
}
