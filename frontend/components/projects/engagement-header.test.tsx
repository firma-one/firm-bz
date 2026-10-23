import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { updateProject, refresh } = vi.hoisted(() => ({ updateProject: vi.fn(async () => ({})), refresh: vi.fn() }))
vi.mock('@/lib/actions/project', () => ({ updateProject }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
vi.mock('@/components/ui/tooltip', () => ({
    Tooltip: ({ children }: any) => <>{children}</>,
    TooltipTrigger: ({ children }: any) => <>{children}</>,
    TooltipContent: () => null,
    Hint: ({ children }: any) => <>{children}</>,
}))

import { EngagementHeader } from './engagement-header'

const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ members: [
    { userId: 'u1', name: 'Pat Lee', role: 'eng_admin', avatarUrl: null, isAgent: false },
    { userId: 'u2', name: 'Sam Roy', role: 'eng_member', avatarUrl: null, isAgent: false },
    { userId: 'brio', name: 'Brio', role: 'eng_admin', avatarUrl: null, isAgent: true },
] }) }))

const props = {
    projectId: 'e1', groupSlug: 'g', orgSlug: 'acme', clientSlug: 'contoso', clientName: 'Contoso',
    name: 'FY26 Audit', status: 'ACTIVE' as const, kickoffDate: null, dueDate: '2026-11-30T00:00:00.000Z',
    canManage: true, showPeople: true, membersHref: '/d/g/f/acme/c/contoso/e/fy26/members',
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
})

describe('EngagementHeader', () => {
    it('shows the lead (never the agent) and member count for internal users', async () => {
        render(<EngagementHeader {...props} />)
        expect(await screen.findByText('Pat Lee')).toBeTruthy()
        expect(screen.queryByText('Brio')).toBeNull()
        expect(screen.getByText('2')).toBeTruthy()
    })

    it('does not load or show people for external guests', () => {
        render(<EngagementHeader {...props} showPeople={false} />)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(screen.queryByText('No lead')).toBeNull()
    })

    it('lets a lead change status inline, but never to Completed', async () => {
        render(<EngagementHeader {...props} />)
        fireEvent.click(screen.getByRole('button', { name: /Active/ }))
        expect(await screen.findByText('Paused')).toBeTruthy()
        expect(screen.queryByText('Completed')).toBeNull()
        fireEvent.click(screen.getByText('Paused'))
        await waitFor(() => expect(updateProject).toHaveBeenCalledWith('e1', { status: 'PAUSED' }, 'acme', 'contoso'))
        expect(refresh).toHaveBeenCalled()
    })

    it('is read-only for members without manage rights, and for completed engagements', () => {
        const { unmount } = render(<EngagementHeader {...props} canManage={false} showPeople={false} />)
        expect(screen.queryByRole('button', { name: /Active/ })).toBeNull()
        unmount()
        render(<EngagementHeader {...props} status="COMPLETED" showPeople={false} />)
        expect(screen.queryByRole('button', { name: /Completed/ })).toBeNull()
    })
})
