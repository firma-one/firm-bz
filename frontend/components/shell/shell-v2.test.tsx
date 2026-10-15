import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ShellSidebarData } from '@/lib/actions/shell'

// ── Mocks ────────────────────────────────────────────────────────────────────────────────────────
let pathname = '/d/acme-group/f/acme/c/contoso/e/fy26-audit/files'
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useSearchParams: () => search,
}))
vi.mock('next/link', () => ({
    default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { email: 'pat@acme.test', user_metadata: { full_name: 'Pat Lee' } }, signOut: vi.fn() }),
}))
vi.mock('@/lib/actions/user-ui-prefs', () => ({ setUiShell: vi.fn(), setSidebarCollapsed: vi.fn() }))
vi.mock('@/lib/actions/firms', () => ({ switchFirm: vi.fn() }))
vi.mock('@/components/app/ai-credits-indicator', () => ({ AiCreditsIndicator: () => null }))
vi.mock('@/lib/actions/user-reminders', () => ({ checkDailyReminderDigest: vi.fn(async () => ({ notify: false, count: 0, overdue: 0 })) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const DATA: ShellSidebarData = {
    firm: { id: 'f1', name: 'Acme Advisory', slug: 'acme', groupSlug: 'acme-group' },
    clients: [
        {
            id: 'c1', name: 'Contoso', slug: 'contoso', status: 'ACTIVE',
            engagements: [
                { id: 'e1', name: 'FY26 Audit', slug: 'fy26-audit', status: 'ACTIVE', dueDate: null, role: 'eng_admin', href: '/d/acme-group/f/acme/c/contoso/e/fy26-audit' },
                { id: 'e2', name: 'FY24 Audit', slug: 'fy24-audit', status: 'COMPLETED', dueDate: null, role: 'eng_admin', href: '/d/acme-group/f/acme/c/contoso/e/fy24-audit' },
            ],
        },
        {
            id: 'c2', name: 'Fabrikam', slug: 'fabrikam', status: 'ACTIVE',
            engagements: [
                { id: 'e3', name: 'Tax Advisory', slug: 'tax-advisory', status: 'PLANNED', dueDate: null, role: 'eng_member', href: '/d/acme-group/f/acme/c/fabrikam/e/tax-advisory' },
            ],
        },
        {
            id: 'c3', name: 'Northwind', slug: 'northwind', status: 'PAST',
            engagements: [
                { id: 'e4', name: 'Closed Deal', slug: 'closed-deal', status: 'COMPLETED', dueDate: null, role: 'eng_member', href: '/d/acme-group/f/acme/c/northwind/e/closed-deal' },
            ],
        },
    ],
    favorites: [
        { id: 'b1', kind: 'document', label: 'Engagement letter.pdf', href: '/api/deeplink?doc=1', context: 'FY26 Audit' },
    ],
    isExternalOnly: false,
}

let shell: any
vi.mock('./shell-data-context', () => ({ useShellData: () => shell }))

import { SidebarV2 } from './sidebar-v2'
import { HeaderBar } from './header-bar'

function setShell(overrides: Partial<typeof shell> = {}, data: Partial<ShellSidebarData> = {}) {
    shell = {
        firms: [{ id: 'f1', name: 'Acme Advisory', slug: 'acme', groupSlug: 'acme-group', groupName: 'Acme Group' }],
        firmSlug: 'acme',
        groupSlug: 'acme-group',
        firmInUrl: true,
        data: { ...DATA, ...data },
        loading: false,
        canManage: false,
        inboxCountFor: (firmId: string | null | undefined) => (firmId === 'f1' ? 3 : 0),
        refresh: vi.fn(),
        ...overrides,
    }
}

beforeEach(() => {
    pathname = '/d/acme-group/f/acme/c/contoso/e/fy26-audit/files'
    search = new URLSearchParams()
    setShell()
})

// ── Sidebar ──────────────────────────────────────────────────────────────────────────────────────
describe('SidebarV2', () => {
    it('lists the caller\'s open engagements under their clients and hides completed ones', () => {
        render(<SidebarV2 />)
        expect(screen.getByText('FY26 Audit')).toBeTruthy()
        expect(screen.getByText('Tax Advisory')).toBeTruthy()
        expect(screen.queryByText('FY24 Audit')).toBeNull()
        // A client with only completed engagements is reachable from "All clients", not the tree.
        expect(screen.queryByText('Northwind')).toBeNull()
    })

    it('marks the engagement the user is on as the current page', () => {
        render(<SidebarV2 />)
        const link = screen.getByText('FY26 Audit').closest('a')!
        expect(link.getAttribute('aria-current')).toBe('page')
        expect(link.getAttribute('href')).toBe('/d/acme-group/f/acme/c/contoso/e/fy26-audit')
    })

    it('hides admin-only firm items from members', () => {
        render(<SidebarV2 />)
        expect(screen.getByText('Calendar')).toBeTruthy()
        expect(screen.getByText('Doc Search')).toBeTruthy()
        expect(screen.queryByText('Overview')).toBeNull()
        expect(screen.queryByText('Members')).toBeNull()
        expect(screen.queryByText('Settings')).toBeNull()
    })

    it('shows admin-only firm items when the caller can manage the firm', () => {
        setShell({ canManage: true })
        render(<SidebarV2 />)
        expect(screen.getByText('Overview')).toBeTruthy()
        expect(screen.getByText('Members')).toBeTruthy()
        expect(screen.getByText('Settings')).toBeTruthy()
    })

    it('gives external (EC/EV-only) users the client-facing view without firm navigation', () => {
        setShell({}, { isExternalOnly: true })
        render(<SidebarV2 />)
        expect(screen.getByText('Shared with you')).toBeTruthy()
        expect(screen.queryByText('Calendar')).toBeNull()
        expect(screen.queryByText('Doc Search')).toBeNull()
    })

    it('shows favorites with their deeplink', () => {
        render(<SidebarV2 />)
        const fav = screen.getByText('Engagement letter.pdf').closest('a')!
        expect(fav.getAttribute('href')).toBe('/api/deeplink?doc=1')
    })

    it('links Inbox to the firm inbox with its unread count', () => {
        render(<SidebarV2 />)
        const inbox = screen.getByText('Inbox').closest('a')!
        expect(inbox.getAttribute('href')).toBe('/d/acme-group/f/acme/inbox')
        expect(within(inbox).getByText('3')).toBeTruthy()
    })

    it('offers the collapse control only when given a collapse handler', () => {
        const { unmount } = render(<SidebarV2 />)
        expect(screen.queryByLabelText('Collapse sidebar')).toBeNull()
        unmount()
        render(<SidebarV2 onCollapse={() => {}} />)
        expect(screen.getByLabelText('Collapse sidebar')).toBeTruthy()
    })
})

// ── Header breadcrumbs ───────────────────────────────────────────────────────────────────────────
describe('HeaderBar breadcrumbs', () => {
    const header = () => render(<HeaderBar sidebarCollapsed={false} onExpandSidebar={() => {}} onOpenMobileNav={() => {}} />)

    it('names firm, client, engagement and tab from the shell data', () => {
        header()
        const nav = screen.getByLabelText('Breadcrumb')
        expect(within(nav).getByText('Acme Advisory').getAttribute('href')).toBe('/d/acme-group/f/acme')
        expect(within(nav).getByText('Contoso').getAttribute('href')).toBe('/d/acme-group/f/acme/c/contoso')
        expect(within(nav).getByText('FY26 Audit').getAttribute('href')).toBe('/d/acme-group/f/acme/c/contoso/e/fy26-audit')
        expect(within(nav).getByText('Files').getAttribute('aria-current')).toBe('page')
    })

    it('labels firm tabs', () => {
        pathname = '/d/acme-group/f/acme'
        search = new URLSearchParams('tab=calendar')
        header()
        expect(within(screen.getByLabelText('Breadcrumb')).getByText('Calendar')).toBeTruthy()
    })

    it('falls back to the slug when the entity is not in the caller\'s data', () => {
        pathname = '/d/acme-group/f/acme/c/unknown-co'
        header()
        expect(within(screen.getByLabelText('Breadcrumb')).getByText('Unknown Co')).toBeTruthy()
    })

    it('labels the inbox and points the header Inbox link at it', () => {
        pathname = '/d/acme-group/f/acme/inbox'
        header()
        expect(within(screen.getByLabelText('Breadcrumb')).getByText('Inbox')).toBeTruthy()
        expect(screen.getByLabelText('Inbox, 3 unread').getAttribute('href')).toBe('/d/acme-group/f/acme/inbox')
    })

    it('names personal pages', () => {
        pathname = '/d/u/reminders'
        header()
        expect(within(screen.getByLabelText('Breadcrumb')).getByText('Reminders')).toBeTruthy()
    })
})
