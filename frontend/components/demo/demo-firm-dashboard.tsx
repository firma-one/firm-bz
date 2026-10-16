'use client'

import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart3, CalendarDays, ClipboardList, Plus, Printer, Search, UserPlus, Users } from 'lucide-react'
import { PageHeading } from '@/components/ui/page-heading'
import { AccessLock } from '@/components/ui/access-lock'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { ViewModeToggle } from '@/components/ui/view-mode-toggle'
import { ClientList } from '@/components/projects/client-list'
import type { ClientSummary } from '@/lib/actions/hierarchy'
import type { DemoFirm } from '@/lib/demo/static-demo-data'
import { DemoFirmOverview } from '@/components/demo/demo-firm-overview'
import { DemoFirmDocSearch } from '@/components/demo/demo-firm-doc-search'
import { DEMO_MEMBERS, DemoFirmMembers } from '@/components/demo/demo-firm-members'
import { DemoFirmAudit } from '@/components/demo/demo-firm-audit'
import { DemoCalendarView } from '@/components/demo/demo-calendar-view'

const ADMIN_ONLY = 'Firm admins only — hidden from other members'
const NOT_IN_DEMO = 'Not available in this demo'

const VIEWS: Record<string, { title: string; icon: ReactNode; lock?: boolean; description?: string }> = {
    analytics: { title: 'Overview', icon: <BarChart3 />, lock: true },
    clients: { title: 'Clients', icon: <Users /> },
    calendar: { title: 'Calendar', icon: <CalendarDays /> },
    'doc-search': { title: 'Doc Search', icon: <Search />, description: 'Search documents across every client and engagement you have access to.' },
    members: { title: 'Members', icon: <Users />, lock: true, description: "Firm administrators manage the firm's settings, members and every client." },
    audit: { title: 'Audit', icon: <ClipboardList />, lock: true },
}

/** A disabled action with the "not in this demo" hint. Hint needs a ref-taking child, so a span. */
function InertButton({ children, tour }: { children: ReactNode; tour?: string }) {
    return (
        <Hint label={NOT_IN_DEMO} side="bottom">
            <span data-demo-tour={tour}>
                <Button size="sm" type="button" disabled>{children}</Button>
            </span>
        </Hint>
    )
}

/** The sample clients in the shape the app's ClientList renders. */
function toClientSummaries(firm: DemoFirm): ClientSummary[] {
    return firm.clients.map((c, i) => ({
        id: c.slug,
        name: c.name,
        slug: c.slug,
        status: c.status ?? 'ACTIVE',
        industry: c.industry ?? null,
        followUpDate: c.followUpDate ? new Date(c.followUpDate) : null,
        brandLogoUrl: null,
        brandPrimaryColor: null,
        engagements: c.engagements.map((e) => ({ id: e.slug })),
        // Staggered so the table reads like a live firm.
        updatedAt: new Date(Date.now() - (i + 1) * 3 * 3600_000),
    }) as unknown as ClientSummary)
}

/**
 * Static counterpart to firm-clients-view.tsx: as in the app, the sidebar picks the view and each
 * view opens with its own heading — no tab strip, no firm banner (the header bar names the firm).
 */
export function DemoFirmDashboard({ firm }: { firm: DemoFirm }) {
    const tabParam = useSearchParams()?.get('tab') || 'clients'
    const view = VIEWS[tabParam] ? tabParam : 'clients'
    const meta = VIEWS[view]
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')

    const count = view === 'clients' ? firm.clients.length : view === 'members' ? DEMO_MEMBERS.length : undefined

    const actions =
        view === 'analytics' ? (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Print
            </Button>
        ) : view === 'clients' ? (
            <>
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
                <InertButton tour="firm-add-client-btn"><Plus className="h-3.5 w-3.5" />New client</InertButton>
            </>
        ) : view === 'members' ? (
            <InertButton><UserPlus className="h-3.5 w-3.5" />Invite</InertButton>
        ) : undefined

    return (
        <div className="flex flex-col">
            <PageHeading
                className="pb-4 print:hidden"
                icon={meta.icon}
                title={
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{meta.title}</span>
                        {count !== undefined && count > 0 && <span className="text-h3 font-normal tabular-nums text-fg-subtle">{count}</span>}
                        {meta.lock && <AccessLock label={ADMIN_ONLY} className="[&_svg]:h-3.5 [&_svg]:w-3.5" />}
                    </span>
                }
                description={meta.description}
                actions={actions}
            />

            {view === 'analytics' && <DemoFirmOverview firm={firm} />}
            {view === 'clients' && (
                <ClientList
                    clients={toClientSummaries(firm)}
                    groupSlug=""
                    orgSlug=""
                    viewMode={viewMode}
                    hrefFor={(c) => `/demo/${c.slug}`}
                />
            )}
            {view === 'calendar' && <DemoCalendarView firm={firm} />}
            {view === 'doc-search' && <DemoFirmDocSearch firm={firm} />}
            {view === 'members' && <DemoFirmMembers />}
            {view === 'audit' && <DemoFirmAudit firm={firm} />}
        </div>
    )
}
