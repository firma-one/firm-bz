import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

const render = (ui: React.ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>)

const { pane, toast } = vi.hoisted(() => ({
    pane: { setContent: vi.fn(), setTitle: vi.fn() },
    toast: { addToast: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }))
vi.mock('@/lib/right-pane-context', () => ({
    useRightPane: () => ({
        content: null, hasRightPane: true, clearPane: vi.fn(), setBeforeClose: vi.fn(), setHeaderIcon: vi.fn(),
        setHeaderSubtitle: vi.fn(), setHeaderActions: vi.fn(), setContent: pane.setContent, setTitle: pane.setTitle,
    }),
}))
// The live source talks to Supabase and a server action; these tests always pass their own.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))
vi.mock('@/app/actions/submit-ticket', () => ({ submitErrorTicket: vi.fn() }))

import { SupportView } from './support-view'
import type { SupportSource } from './support-store'
import type { SupportTicket } from '@/lib/support/ticket-view'

const ticket = (over: Partial<SupportTicket>): SupportTicket => ({
    ticketNumber: 'TKT-1', kind: 'BUG', status: 'NEW', title: 'A request', body: '', createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z', firm: { name: 'Acme Firm', slug: 'acme' }, client: null, engagement: null,
    raisedBy: { name: 'Deepak Shettigar', email: 'deepak@acme.com' }, auto: false, browser: null, failure: null,
    attachments: [], comments: [], ...over,
})

const source = (tickets: SupportTicket[]): SupportSource => ({
    load: async () => tickets,
    create: vi.fn(async () => 'TKT-NEW'),
    addComment: vi.fn(),
    setStatus: vi.fn(async () => {}),
    addFiles: vi.fn(async () => ({ attached: [], failed: 0 })),
    removeFile: vi.fn(async () => {}),
})

const TICKETS = [
    ticket({ ticketNumber: 'TKT-OPEN', title: 'Upload fails', status: 'IN_PROGRESS', client: { name: 'DataSentry', slug: 'ds' }, engagement: { name: 'Q2 GTM', slug: 'q2' },
        comments: [{ id: 'c1', content: 'Still broken', createdAt: '2026-10-21T10:00:00.000Z', authorName: 'Deepak Shettigar', authorEmail: 'deepak@acme.com', fromFirma: false }] }),
    ticket({ ticketNumber: 'TKT-DONE', title: 'Calendar off by a day', status: 'RESOLVED' }),
]

beforeEach(() => vi.clearAllMocks())

describe('SupportView', () => {
    it('lists a firm’s open requests by default, and the rest under Resolved', async () => {
        render(<SupportView firmSlug="acme" firmName="Acme Firm" myEmail="deepak@acme.com" engagements={[]} source={source(TICKETS)} />)
        expect(await screen.findByText('Upload fails')).toBeTruthy()
        expect(screen.queryByText('Calendar off by a day')).toBeNull()
        fireEvent.click(screen.getByRole('tab', { name: /Resolved/ }))
        expect(screen.getByText('Calendar off by a day')).toBeTruthy()
        expect(screen.getByRole('button', { name: /New request/ })).toBeTruthy()
    })

    it('opens a request in the right pane', async () => {
        render(<SupportView firmSlug="acme" firmName="Acme Firm" myEmail="deepak@acme.com" engagements={[]} source={source(TICKETS)} />)
        fireEvent.click(await screen.findByText('Upload fails'))
        await waitFor(() => expect(pane.setTitle).toHaveBeenCalledWith('TKT-OPEN'))
        expect(pane.setContent).toHaveBeenCalled()
    })

    it('on the Firma side: no heading or New request, each request names its firm, and the firm’s word is the team’s turn', async () => {
        render(<SupportView side="firma" bare firmSlug={null} firmName="Firma" myEmail="staff@firma.bz" engagements={[]} source={source(TICKETS)} />)
        const row = (await screen.findByText('Upload fails')).closest('tr')!
        expect(screen.queryByRole('heading', { name: 'Customer requests' })).toBeNull()
        expect(screen.queryByRole('button', { name: /New request/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Raised by me/ })).toBeNull()
        expect(within(row).getByText(/Acme Firm/)).toBeTruthy()
        expect(within(row).getByText('Deepak').className).toContain('text-fg')
    })
})
