'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, Briefcase, CheckCircle2, ChevronLeft, ChevronRight, Inbox, ListChecks, MailWarning, MessagesSquare, RefreshCw, TrendingUp, UserMinus, Users } from 'lucide-react'
import { ActionSection, type ActionItem, type ActionSeverity } from '@/components/dashboard/action-list'
import { formatValue } from '@/components/dashboard/pipeline-bar'
import { Hint } from '@/components/ui/tooltip'
import { ShimmerBlock } from '@/components/ui/shimmer'
import { cn, formatRelativeTime } from '@/lib/utils'
import { firmActionCount, type FirmActionsData } from '@/lib/insights/firm-actions'

/*
 * The firm Action Center (.claude/plans/firm-overview-redesign.md): two groups side by side, as on the
 * engagement — Engagements and Clients — each item a thing to do, opening the list to do it from.
 * Everything clear is one line. Presentational: the app feeds it from the firm insights route, the
 * tour from its sample firm.
 */

/** Where rows lead: the app's routes, or the tour's. */
export interface FirmActionLinks {
    engagement: (clientSlug: string, engagementSlug: string, tab?: 'analytics' | 'comments' | 'members') => string
    client: (clientSlug: string, tab?: 'settings') => string
}

type Kind = 'overdue' | 'threads' | 'setup' | 'prospects' | 'idle' | 'invites'

const KINDS: Record<Kind, { label: string; sub: string; how: string; icon: React.ElementType; severity: ActionSeverity }> = {
    overdue: { label: 'Extend or close overdue engagements', sub: 'Past their due date', how: 'Move the due date in the engagement’s header, or close the engagement if the work is done.', icon: AlertTriangle, severity: 'critical' },
    threads: { label: 'Reply to client comments', sub: 'The client wrote last', how: 'Threads where the client had the last word. Reply, or resolve the thread.', icon: MessagesSquare, severity: 'warning' },
    setup: { label: 'Finish engagement setup', sub: 'No lead, due date or deliverables yet', how: 'An engagement can’t be tracked without a lead, a due date and its deliverables. Set them in its header, and mark deliverables on its Board.', icon: ListChecks, severity: 'warning' },
    invites: { label: 'Resend invitations', sub: 'Expired, or expiring within 3 days', how: 'Invitations to join an engagement. Resend from its Members tab, so they can still join.', icon: MailWarning, severity: 'warning' },
    idle: { label: 'Start work with idle clients', sub: 'Active, with no active engagement', how: 'Start an engagement for them, or mark the client as past.', icon: UserMinus, severity: 'info' },
    prospects: { label: 'Decide on prospects', sub: 'Past their expected close, or none set', how: 'Make the prospect an active client, mark it as past, or set its expected close date in its settings.', icon: TrendingUp, severity: 'warning' },
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** One thing to act on, opening where it's done (in a new tab, as the Overview's links do). */
function Row({ href, title, detail, meta, tone = 'muted' }: { href: string; title: string; detail?: string; meta?: string; tone?: 'danger' | 'warning' | 'muted' }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="group/row flex items-center gap-3 rounded-control px-2 py-2 transition-colors hover:bg-surface-hover">
            <div className="min-w-0 flex-1">
                <p className="truncate text-ui text-fg">{title}</p>
                {detail && <p className="truncate text-small text-fg-muted">{detail}</p>}
            </div>
            {meta && (
                <span className={cn('shrink-0 text-small tabular-nums', tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-tag-orange-fg' : 'text-fg-subtle')}>{meta}</span>
            )}
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover/row:opacity-100" />
        </a>
    )
}

function rowsFor(kind: Kind, a: FirmActionsData, links: FirmActionLinks) {
    switch (kind) {
        case 'overdue':
            return a.overdueEngagements.map((e) => (
                <Row key={e.engagementId} href={links.engagement(e.clientSlug, e.slug, 'analytics')} title={e.name} detail={e.clientName} meta={`${plural(e.daysOverdue, 'day')} overdue`} tone="danger" />
            ))
        case 'threads':
            return a.threads.map((t) => (
                <Row key={t.threadId} href={links.engagement(t.clientSlug, t.engagementSlug, 'comments')} title={t.documentName} detail={[t.engagementName, t.lastMessage].filter(Boolean).join(' · ')} meta={formatRelativeTime(t.lastMessageAt)} />
            ))
        case 'setup':
            return a.setupGaps.map((e) => (
                <Row key={e.engagementId} href={links.engagement(e.clientSlug, e.slug, 'analytics')} title={e.name} detail={e.clientName} meta={e.missing.map((m) => `No ${m}`).join(' · ')} tone="warning" />
            ))
        case 'prospects':
            return a.prospects.map((p) => (
                <Row
                    key={p.clientId}
                    href={links.client(p.clientSlug, 'settings')}
                    title={p.clientName}
                    detail={p.expectedCloseDate ? `Prospect · expected to close ${shortDate(p.expectedCloseDate)}` : 'Prospect'}
                    meta={p.daysPast != null ? `${plural(p.daysPast, 'day')} past` : 'No expected close'}
                    tone={p.daysPast != null ? 'danger' : 'warning'}
                />
            ))
        case 'idle':
            return a.idleClients.map((c) => (
                <Row key={c.clientId} href={links.client(c.clientSlug)} title={c.clientName} detail={c.pastValue > 0 ? `${formatValue(c.pastValue, a.currencySymbol)} in past engagements` : 'No engagements yet'} />
            ))
        case 'invites':
            return a.invitations.map((i) => (
                <Row
                    key={i.invitationId}
                    href={links.engagement(i.clientSlug, i.engagementSlug, 'members')}
                    title={i.email}
                    detail={i.engagementName}
                    meta={i.daysUntilExpiry < 0 ? `Expired ${plural(-i.daysUntilExpiry, 'day')} ago` : i.daysUntilExpiry === 0 ? 'Expires today' : `Expires in ${plural(i.daysUntilExpiry, 'day')}`}
                    tone={i.daysUntilExpiry <= 0 ? 'danger' : 'warning'}
                />
            ))
    }
}

function countOf(kind: Kind, a: FirmActionsData): number {
    return {
        overdue: a.overdueEngagements.length,
        threads: a.threads.length,
        setup: a.setupGaps.length,
        prospects: a.prospects.length,
        idle: a.idleClients.length,
        invites: a.invitations.length,
    }[kind]
}

export function FirmActions({ data, loading = false, onRefresh, links }: {
    data: FirmActionsData | null
    loading?: boolean
    onRefresh?: () => void
    links: FirmActionLinks
}) {
    const [view, setView] = useState<Kind | null>(null)
    const [showChecks, setShowChecks] = useState(false)

    const item = (kind: Kind): ActionItem => ({
        key: kind,
        label: KINDS[kind].label,
        sub: KINDS[kind].sub,
        icon: KINDS[kind].icon,
        severity: KINDS[kind].severity,
        count: data ? countOf(kind, data) : 0,
        onSelect: () => setView(kind),
    })
    const engagements = (['overdue', 'threads', 'setup', 'invites'] as const).map(item)
    const clients = (['idle', 'prospects'] as const).map(item)
    const attention = data ? firmActionCount(data) : 0
    const checks = engagements.length + clients.length
    // Opened from the all-clear line, the checks show at once rather than behind two more toggles.
    const groups = (opened: boolean) => (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ActionSection title="Engagements" icon={Briefcase} items={engagements} defaultShowClear={opened} />
            <ActionSection title="Clients" icon={Users} items={clients} defaultShowClear={opened} />
        </div>
    )

    return (
        <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Inbox className="h-4 w-4 shrink-0 text-fg-subtle" />
                    <h2 className="truncate text-h3 text-fg">Action Center</h2>
                    {!loading && attention > 0 && <span className="text-small tabular-nums text-fg-subtle">{attention}</span>}
                </div>
                {onRefresh && (
                    <Hint label="Refresh">
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="rounded-control p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg print:hidden"
                            aria-label="Refresh action center"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </Hint>
                )}
            </div>

            {!data ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true">
                    <ShimmerBlock className="h-10 w-full" />
                    <ShimmerBlock className="h-10 w-full" />
                </div>
            ) : view ? (
                <div key={view} className="flex flex-col gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 border-b border-line pb-3">
                        <button
                            type="button"
                            onClick={() => setView(null)}
                            className="group/back inline-flex items-center gap-1 text-small text-fg-subtle transition-colors hover:text-fg-muted"
                        >
                            <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover/back:-translate-x-0.5" />
                            Back
                        </button>
                        <span className="text-small text-fg-subtle">·</span>
                        <span className="truncate text-small font-medium text-fg-muted">{KINDS[view].label}</span>
                        <span className="ml-auto shrink-0 text-small tabular-nums text-fg-subtle">{countOf(view, data)}</span>
                    </div>
                    <p className="px-2 text-small text-fg-subtle">{KINDS[view].how}</p>
                    <div className="flex flex-col">{rowsFor(view, data, links)}</div>
                </div>
            ) : attention === 0 ? (
                // Nothing to do is one line, not two groups of zeros.
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-2 text-small">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-action" />
                        <span className="text-fg-muted">All clear</span>
                        <span className="text-fg-subtle">·</span>
                        <button
                            type="button"
                            onClick={() => setShowChecks((v) => !v)}
                            aria-expanded={showChecks}
                            className="inline-flex items-center gap-1 rounded-control text-fg-subtle transition-colors hover:text-fg-muted"
                        >
                            {checks} checks passed
                            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showChecks ? 'rotate-90' : ''}`} />
                        </button>
                    </div>
                    {showChecks && groups(true)}
                </div>
            ) : (
                groups(false)
            )}
        </section>
    )
}
