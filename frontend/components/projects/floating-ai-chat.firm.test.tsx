import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * The floating Brio panel with the firm as its subject (Ask Brio about the firm, on the firm
 * Overview): it asks the firm route with the session's token, links the engagements an answer
 * names and opens them in place, shows no engagement-only controls (thumbs, tasks, scope switch),
 * keeps its conversations under the firm, and arrives collapsed. Fetch is mocked throughout.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

import { EngagementAiChat, type FirmChatSubject } from './engagement-ai-chat'
import { FloatingAiChat } from './floating-ai-chat'
import { FOLLOWUP_MARKER } from '@/lib/ai/engagement-chat'
import { FIRM_CHAT_CAPABILITY, formatFirmSourcesLine } from '@/lib/ai/firm-chat'
import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'

const encoder = new TextEncoder()

/** A response whose body sends `chunks`, then ends. */
function streamed(chunks: string[]) {
    const queue = [...chunks]
    return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
            const next = queue.shift()
            if (next !== undefined) controller.enqueue(encoder.encode(next))
            else controller.close()
        },
    }))
}

const FIRM: FirmChatSubject = { kind: 'firm', firmId: 'f1', groupSlug: 'g', firmSlug: 'acme', accessToken: 't' }
const PLACEHOLDER = 'Ask about engagements, clients or deadlines'
const ENGAGEMENT_HREF = '/d/g/f/acme/c/northwind/e/q4-growth/analytics'

/** The answer the route streams: text quoting two names, the follow-ups, then its links line. */
const answer = () => streamed([
    '"Q4 Growth Strategy" is late; "Made Up" is not a real one.',
    `\n${FOLLOWUP_MARKER}\nWhich of these have client threads waiting?`,
    formatFirmSourcesLine({ engagements: [{ name: 'Q4 Growth Strategy', clientSlug: 'northwind', slug: 'q4-growth' }], drewOn: 12 }),
])

function ask(question: string) {
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: question } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
}

/** A conversation as chat-conversations.ts stores it. */
const storedConversation = (id: string, question: string) => ({
    id,
    title: question,
    messages: [
        { role: 'user', content: question, at: Date.now() },
        { role: 'assistant', content: 'An earlier answer.', at: Date.now() },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
})

beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
beforeEach(() => {
    window.localStorage.clear()
    push.mockClear()
    Element.prototype.scrollTo = vi.fn() as never
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

describe('EngagementAiChat with the firm as its subject', () => {
    it('asks the firm route with the session’s bearer token, and sends no scope', async () => {
        const fetchMock = vi.fn(async () => answer())
        vi.stubGlobal('fetch', fetchMock)
        render(<EngagementAiChat subject={FIRM} />)
        ask('Which engagements are slipping?')

        await screen.findByRole('link', { name: '"Q4 Growth Strategy"' })
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('/api/firms/f1/ai-chat')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
        expect(JSON.parse(init.body as string)).toEqual({ question: 'Which engagements are slipping?', history: [] })
    // The first Markdown render is slow on a busy machine; the default 5s has run out under load.
    }, 15_000)

    it('links the engagements the server resolved, opens them in place, and leaves a Cmd-click to the browser', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => answer()))
        render(<EngagementAiChat subject={FIRM} />)
        ask('Which engagements are slipping?')

        const link = await screen.findByRole('link', { name: '"Q4 Growth Strategy"' })
        expect(link.getAttribute('href')).toBe(ENGAGEMENT_HREF)
        // A name the server didn't resolve stays text.
        expect(screen.queryByRole('link', { name: /Made Up/ })).toBeNull()
        expect(screen.getByText('Based on 12 engagements')).toBeTruthy()
        expect(screen.getByRole('button', { name: /Which of these have client threads waiting\?/ })).toBeTruthy()

        fireEvent.click(link)
        expect(push).toHaveBeenCalledWith(ENGAGEMENT_HREF)

        // Cmd-click: not intercepted, so the browser opens the link in a new tab.
        push.mockClear()
        let prevented: boolean | null = null
        const record = (e: MouseEvent) => { prevented = e.defaultPrevented; e.preventDefault() }
        window.addEventListener('click', record)
        fireEvent.click(link, { metaKey: true })
        window.removeEventListener('click', record)
        expect(prevented).toBe(false)
        expect(push).not.toHaveBeenCalled()
    }, 15_000)

    it('shows no rating thumbs, no Files tasks and no scope switch', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => answer()))
        const run = vi.fn()
        render(<EngagementAiChat subject={FIRM} actions={[{ id: 'review', label: 'Review folder organization', description: 'Looks over the folders.', run }]} />)

        // Named, never switched.
        expect(screen.getByText('This firm')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Change scope/ })).toBeNull()
        expect(screen.queryByText('Review folder organization')).toBeNull()

        ask('Which engagements are slipping?')
        await screen.findByRole('link', { name: '"Q4 Growth Strategy"' })
        expect(screen.getByRole('button', { name: 'Copy answer' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Good response' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Bad response' })).toBeNull()
        expect(screen.queryByText('Review folder organization')).toBeNull()
    }, 15_000)

    it('opens on the firm’s own starting questions and says what it can do', () => {
        const data = {
            unansweredThreads: [{
                engagementId: 'e1', engagementName: 'Q4 Growth Strategy', engagementSlug: 'q4-growth', clientName: 'Northwind',
                clientSlug: 'northwind', documentName: 'Plan.xlsx', lastMessage: '', lastMessageAt: new Date().toISOString(),
            }],
        } as unknown as FirmInsightsResponse
        const { container } = render(<EngagementAiChat subject={{ ...FIRM, data }} />)

        expect(container.textContent).toContain('about the firm')
        expect(screen.getAllByText(FIRM_CHAT_CAPABILITY).length).toBeGreaterThan(0)
        expect(screen.getByRole('button', { name: /Which client threads are waiting on us\?/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /Where does the firm stand today\?/ })).toBeTruthy()
        // Never the engagement's.
        expect(screen.queryByPlaceholderText(/about this engagement/)).toBeNull()
    })

    it('answers plainly off-topic questions itself, in the firm’s words, without a request', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        render(<EngagementAiChat subject={FIRM} />)
        ask('Write a python script to parse CSV files')
        expect(await screen.findByText(/I can only answer questions about this firm/)).toBeTruthy()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('keeps its conversations under the firm, never mixed with an engagement’s', async () => {
        // An engagement that happens to share the id: its list must stay its own.
        const engagementKey = 'fm_chat_conversations_overview_f1'
        window.localStorage.setItem(engagementKey, JSON.stringify([storedConversation('c-eng', 'What is late on this engagement?')]))
        const engagementBefore = window.localStorage.getItem(engagementKey)

        vi.stubGlobal('fetch', vi.fn(async () => answer()))
        const { unmount } = render(<EngagementAiChat subject={FIRM} />)
        expect(screen.queryByText('What is late on this engagement?')).toBeNull()

        ask('Which engagements are slipping?')
        await screen.findByRole('link', { name: '"Q4 Growth Strategy"' })
        await waitFor(() => {
            const stored = JSON.parse(window.localStorage.getItem('fm_chat_conversations_firm_f1') ?? '[]')
            expect(stored).toHaveLength(1)
            expect(stored[0].title).toBe('Which engagements are slipping?')
        })
        expect(window.localStorage.getItem(engagementKey)).toBe(engagementBefore)
        unmount()

        // Back on the firm Overview: the firm's conversation resumes, its answer still linked.
        render(<EngagementAiChat subject={FIRM} />)
        expect(await screen.findByRole('link', { name: '"Q4 Growth Strategy"' })).toBeTruthy()
        expect(screen.getAllByText('Which engagements are slipping?').length).toBeGreaterThan(0)
        expect(screen.queryByText('What is late on this engagement?')).toBeNull()
    }, 15_000)
})

describe('FloatingAiChat with the firm as its subject', () => {
    const panel = () => document.body.querySelector('[data-ai-chat-panel]') as HTMLElement

    it('arrives collapsed to its launcher, even where an engagement page’s docked pane reopens', () => {
        window.localStorage.setItem('fm_ai_chat_layout', 'dock')
        window.localStorage.setItem('fm_ai_chat_dock_open', '1')
        render(<FloatingAiChat subject={FIRM} />)

        const launcher = screen.getByRole('button', { name: 'Open the firm assistant' })
        expect(launcher.textContent).toContain('about the firm')
        expect(panel().className).toContain('hidden')
        // The engagement pages' docked state is theirs: left as it was.
        expect(window.localStorage.getItem('fm_ai_chat_dock_open')).toBe('1')

        fireEvent.click(launcher)
        expect(panel().className).not.toMatch(/(^|\s)hidden(\s|$)/)
        expect(within(panel()).getByPlaceholderText(PLACEHOLDER)).toBeTruthy()
        expect(window.localStorage.getItem('fm_ai_chat_dock_open')).toBe('1')
    })

    it('leaves the engagement panel as it was: a docked pane left open comes back open', () => {
        window.localStorage.setItem('fm_ai_chat_layout', 'dock')
        window.localStorage.setItem('fm_ai_chat_dock_open', '1')
        render(<FloatingAiChat projectId="p1" />)

        expect(screen.queryByRole('button', { name: 'Open the engagement assistant' })).toBeNull()
        expect(panel().className).not.toMatch(/(^|\s)hidden(\s|$)/)
        expect(within(panel()).getByPlaceholderText(/Ask Brio about this engagement/)).toBeTruthy()
    })
})
