import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }))
vi.mock('next/navigation', () => ({ usePathname: () => '/d/u/home', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))

// The sidebar's firm on Home: none (outside the app shell) unless a test sets one.
const shell = vi.hoisted(() => ({ value: null as null | { firms: Array<{ id: string; name: string; slug: string }>; firmSlug: string | null } }))
vi.mock('@/components/shell/shell-data-context', () => ({ useOptionalShellData: () => shell.value }))

import { DayBrief, DemoDayBrief, DAY_BRIEF_EMPTY, DAY_BRIEF_ITEMS_LINE, DAY_BRIEF_UNCHANGED, demoDayBriefText, briefParagraphs, rewriteHint } from './day-brief'
import { HomeView } from './home-view'
import type { MyWork } from '@/lib/home/my-work'

const BRIEF = {
    text: '**Two client threads have waited since Monday**: QSR-9 · Market Report and NPT-4 · Workpapers.\n\nQSR-12 · Pricing is due **tomorrow**.',
    date: '2026-11-12',
    generatedAt: '2026-11-12T08:02:00Z',
}

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn()

beforeEach(() => {
    shell.value = null
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('DayBrief', () => {
    it('shows Brio\'s day: the lead phrase in bold, when it was written, where the items are and the policy line', async () => {
        fetchMock.mockResolvedValue(ok({ brief: BRIEF }))
        render(<DayBrief />)

        const lead = await screen.findByText('Two client threads have waited since Monday')
        expect(lead.tagName).toBe('STRONG')
        // Bold is the first paragraph's lead phrase only.
        expect(screen.getByText('QSR-12 · Pricing is due tomorrow.').querySelector('strong')).toBeNull()
        expect(screen.getByRole('heading', { name: 'Your day' })).toBeTruthy()
        expect(screen.getByText(/^Written .+ · .+/)).toBeTruthy()
        // Where the items are, in words: no link or button down to them.
        expect(screen.getByText(DAY_BRIEF_ITEMS_LINE)).toBeTruthy()
        expect(screen.queryByRole('link')).toBeNull()
        expect(screen.getByText('Brio reports what the data shows. Decisions stay with you.')).toBeTruthy()
        // Rewrite is the sparkle at the heading's right, an icon with no words of its own.
        const rewrite = screen.getByRole('button', { name: 'Rewrite with Brio' })
        expect(rewrite.textContent).toBe('')
        expect(rewrite.closest('section')?.querySelector('h2')?.parentElement?.contains(rewrite)).toBe(true)
        expect(fetchMock).toHaveBeenCalledWith('/api/me/day-brief', expect.objectContaining({ method: 'GET' }))
    })

    it('shows a quiet skeleton while Brio writes', async () => {
        let answer: (r: Response) => void = () => {}
        fetchMock.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve }))
        render(<DayBrief />)
        expect(screen.getByRole('status').textContent).toBe('Brio is writing your day')
        answer(ok({ brief: BRIEF }))
        expect(await screen.findByText('Two client threads have waited since Monday')).toBeTruthy()
    })

    it('says why it failed, once, and Try again asks again', async () => {
        fetchMock.mockResolvedValueOnce(ok({ error: "Brio couldn't write your day. Try again." }, 500))
        render(<DayBrief />)
        const alert = await screen.findByRole('alert')
        expect(alert.textContent).toBe("Brio couldn't write your day.Try again")

        fetchMock.mockResolvedValueOnce(ok({ brief: BRIEF }))
        fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Two client threads have waited since Monday')).toBeTruthy()
    })

    it('says Brio couldn\'t be reached when the request never left', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
        render(<DayBrief />)
        expect((await screen.findByRole('alert')).textContent).toContain("Couldn't reach Brio. Check your connection and try again.")
    })

    it('says so in one quiet line when there is nothing to brief', async () => {
        fetchMock.mockResolvedValue(ok({ brief: null, empty: true }))
        render(<DayBrief />)
        expect(await screen.findByText(DAY_BRIEF_EMPTY)).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Rewrite with Brio' })).toBeNull()
    })

    it('is left out when Brio is not configured', async () => {
        fetchMock.mockResolvedValue(ok({ brief: null, available: false }))
        const { container } = render(<DayBrief />)
        await waitFor(() => expect(container.innerHTML).toBe(''))
    })

    it("asks for the brief, and rewrites it, billed to the firm selected in the sidebar", async () => {
        shell.value = { firms: [{ id: 'f1', name: 'FirmaOne', slug: 'firmaone' }, { id: 'f2', name: 'Halden', slug: 'halden' }], firmSlug: 'halden' }
        fetchMock.mockResolvedValue(ok({ brief: BRIEF }))
        render(<DayBrief />)
        await screen.findByText('Two client threads have waited since Monday')
        expect(fetchMock).toHaveBeenCalledWith('/api/me/day-brief?firm=f2', expect.objectContaining({ method: 'GET' }))
        fireEvent.click(screen.getByRole('button', { name: 'Rewrite with Brio' }))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/me/day-brief?firm=f2', expect.objectContaining({ method: 'POST' })))
    })

    it("names whose credits a rewrite uses", () => {
        expect(rewriteHint('FirmaOne')).toBe('Uses 1 FirmaOne credit, only when your items have changed')
        expect(rewriteHint(null)).toBe('1 credit, only when your items have changed')
    })

    it('Rewrite with nothing changed keeps the brief and says so', async () => {
        fetchMock.mockResolvedValueOnce(ok({ brief: BRIEF }))
        render(<DayBrief />)
        await screen.findByText('Two client threads have waited since Monday')

        fetchMock.mockResolvedValueOnce(ok({ brief: BRIEF, unchanged: true }))
        fireEvent.click(screen.getByRole('button', { name: 'Rewrite with Brio' }))
        expect(await screen.findByText(DAY_BRIEF_UNCHANGED)).toBeTruthy()
        expect(fetchMock).toHaveBeenLastCalledWith('/api/me/day-brief', expect.objectContaining({ method: 'POST' }))
        expect(screen.getByText('Two client threads have waited since Monday')).toBeTruthy()
    })

    it('a failed Rewrite keeps the brief on screen and says why', async () => {
        fetchMock.mockResolvedValueOnce(ok({ brief: BRIEF }))
        render(<DayBrief />)
        await screen.findByText('Two client threads have waited since Monday')

        fetchMock.mockResolvedValueOnce(ok({ error: "Brio couldn't write your day. Try again." }, 500))
        fireEvent.click(screen.getByRole('button', { name: 'Rewrite with Brio' }))
        expect((await screen.findByRole('alert')).textContent).toBe("Brio couldn't write your day. Try again.")
        expect(screen.getByText('Two client threads have waited since Monday')).toBeTruthy()
    })
})

describe('briefParagraphs', () => {
    it('keeps three paragraphs and renders no HTML from the text', () => {
        const parts = briefParagraphs('One <b>x</b>\n\nTwo\n\nThree\n\nFour')
        expect(parts).toHaveLength(3)
        expect(parts[0]).toBe('One <b>x</b>')
    })
})

const demoWork: MyWork = {
    engagements: [],
    needsYou: [
        { id: 'a', kind: 'deliverable_review', firmId: 'demo', title: 'Market Report', context: 'Acme · Strategy', href: '/a', actionLabel: 'Review', at: null },
        { id: 'b', kind: 'deliverable_review', firmId: 'demo', title: 'Pricing Model', context: 'Acme · Strategy', href: '/b', actionLabel: 'Review', at: null },
        { id: 'c', kind: 'client_comment', firmId: 'demo', title: 'Interview Notes', context: 'Acme · Strategy', href: '/c', actionLabel: 'Reply', at: null },
        { id: 'd', kind: 'intake', firmId: 'demo', title: '3 files from Acme', context: 'Acme · Strategy', href: '/d', actionLabel: 'Approve upload', at: null },
    ],
    dueSoon: [],
}

describe('the tour\'s Your day', () => {
    it('is written from the demo\'s own data, in the shape Brio writes it', () => {
        const text = demoDayBriefText(demoWork, new Date('2026-11-12T08:00:00'))!
        const [first, second] = text.split('\n\n')
        expect(first).toBe('**Two deliverables are waiting for your approval**: Market Report and Pricing Model.')
        expect(second).toBe('Interview Notes has a client comment awaiting your reply and a client upload (3 files from Acme) is waiting for your approval.')
        expect(demoDayBriefText({ engagements: [], needsYou: [], dueSoon: [] }, new Date())).toBeNull()
    })

    it('makes no calls, and Rewrite answers as the app does when nothing changed', async () => {
        vi.useFakeTimers()
        try {
            render(<DemoDayBrief work={demoWork} />)
            expect(screen.getByText('Two deliverables are waiting for your approval').tagName).toBe('STRONG')
            const sparkle = screen.getByRole('button', { name: 'Rewrite with Brio' })
            fireEvent.click(sparkle)
            // While it writes, the heading says so in the time's place and the sparkle waits.
            expect(screen.getByText('Brio is rewriting…')).toBeTruthy()
            expect(sparkle.getAttribute('aria-disabled')).toBe('true')
            vi.advanceTimersByTime(1000)
            expect(await vi.waitFor(() => screen.getByText(DAY_BRIEF_UNCHANGED))).toBeTruthy()
        } finally {
            vi.useRealTimers()
        }
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('on Home', () => {
    const work: MyWork = {
        engagements: [],
        needsYou: [{ id: 'n1', kind: 'deliverable_review', firmId: 'f1', title: 'Q3 Report', context: 'Globex · Tax', href: '/b', actionLabel: 'Review', at: null }],
        dueSoon: [],
    }
    const home = (readOnly = false) =>
        render(
            <HomeView
                firstName="Dee"
                firms={[{ id: 'f1', name: 'Acme', slug: 'acme', groupSlug: 'g' }]}
                selectedFirm={null}
                unavailable={[]}
                recents={[]}
                calendarEvents={[]}
                work={work}
                bookmarks={[]}
                readOnly={readOnly}
            />,
        )

    it('sits above Needs you, and says the items are below', async () => {
        fetchMock.mockResolvedValue(ok({ brief: BRIEF }))
        home()
        const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
        expect(headings.indexOf('Your day')).toBe(0)
        expect(headings.indexOf('Your day')).toBeLessThan(headings.indexOf('Needs you'))
        expect(screen.getByText('Q3 Report').closest('#needs-you')).toBeTruthy()
        expect(await screen.findByText(DAY_BRIEF_ITEMS_LINE)).toBeTruthy()
    })

    it('on the public demo, is written from the sample data with no call', () => {
        home(true)
        expect(screen.getByRole('heading', { name: 'Your day' })).toBeTruthy()
        expect(screen.getByText('One deliverable is waiting for your approval')).toBeTruthy()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
