import type { ReactNode } from 'react'
import { BarChart3, Briefcase, Building2, CalendarDays, ChevronsUpDown, ClipboardList, Command, Compass, Contact, CreditCard, Folder, Home, Inbox, Info, LayoutGrid, LifeBuoy, List, MessagesSquare, Play, Plus, Search, Settings, StepForward, UserCircle, Users } from 'lucide-react'
import { Brio } from '@/components/ui/brio'
import { ClientIcon } from '@/components/ui/client-icon'
import { cn } from '@/lib/utils'
import { tourNode, type TourMode, type TourNodeId } from '@/lib/demo/tour-chapters'

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

/** Each mode's name, icon and what happens in it, in a few words: the mode cards and the mode pill. */
export const TOUR_MODE_LABELS: Record<TourMode, { label: string; icon: ReactNode; short: string }> = {
    autoplay: { label: 'Autoplay', icon: <Play />, short: 'Plays itself' },
    step: { label: 'Step by step', icon: <StepForward />, short: 'You click Next' },
    explore: { label: 'Explore', icon: <Compass />, short: 'You click around' },
}

/** The tour's frosted glass: a mostly opaque white over a blur of the page, with a faint edge, so
 * text on it reads whatever is behind. For the tour panel and the step cards; the
 * app's own surfaces stay solid. */
export const TOUR_GLASS_CLASS = 'border border-white/70 bg-white/90 shadow-popover ring-1 ring-black/[0.06] backdrop-blur-xl backdrop-saturate-150'

/** The step card's glass, nearly opaque: Joyride's card wrapper keeps the blur from reaching the
 * page, so only the white stands between the copy and the page behind. */
export const TOUR_CARD_GLASS_CLASS = cn(TOUR_GLASS_CLASS, 'bg-white/[0.97]')
