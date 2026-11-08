import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// What the comments pane says when something fails (error-handling audit CM-1, P1-70, P1-71, P1-72,
// P2-21): a failed load is never "No comments yet", a refused post keeps its text, a reaction that
// didn't save is taken back with the reason, and the poster is told who a mention didn't reach.

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { id: 'me', email: 'me@firm.com', user_metadata: {} } }),
}))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({ clearPane: vi.fn(), canClose: () => true }) }))
const { toasts } = vi.hoisted(() => ({ toasts: [] as { type: string; title: string; message?: string; action?: { label: string; onClick: () => void } }[] }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: (t: any) => toasts.push(t) }) }))

import { DocumentDocCommentsPane } from './document-doc-comments-pane'

const MEMBERS = [
    { userId: 'me', email: 'me@firm.com', name: 'Me Myself', role: 'eng_admin' },
    { userId: 'u1', email: 'ana@firm.com', name: 'Ana Lopez', role: 'eng_member' },
    { userId: 'u2', email: 'raj@firm.com', name: 'Raj Patel', role: 'eng_member' },
]

type Reply = { ok: boolean; status?: number; body?: unknown } | 'drop'
let routes: { load: Reply; members: Reply; post: Reply; patch: (recipientId: string) => Reply; reaction: Reply; del: Reply }
let calls: { method: string; url: string; body: any }[]
let existing: any[]

const reply = (r: Reply) => {
    if (r === 'drop') throw new TypeError('Failed to fetch')
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body ?? {} } as Response
}

beforeEach(() => {
    toasts.length = 0
    calls = []
    existing = []
    routes = {
        load: { ok: true, body: { messages: existing } },
        members: { ok: true, body: { members: MEMBERS } },
        post: { ok: true },
        patch: () => ({ ok: true, body: { success: true } }),
        reaction: { ok: true, body: {} },
        del: { ok: true, body: { success: true } },
    }
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(init.body as string) : null
        calls.push({ method, url, body })
        if (url.endsWith('/read')) return reply({ ok: true })
        if (url.includes('/members')) return reply(routes.members)
        if (url.includes('filter=mentions')) return reply({ ok: true, body: { mentions: [] } })
        if (url.includes('/reminders')) return reply({ ok: true, body: { reminders: [] } })
        if (url.includes('/reactions')) return reply(routes.reaction)
        if (method === 'POST') {
            const r = routes.post
            if (r !== 'drop' && r.ok) return reply({ ok: true, body: { message: { id: 'm-new', createdAt: new Date().toISOString(), authorUserId: 'me', authorEmail: 'me@firm.com', content: body.content } } })
            return reply(r)
        }
        if (method === 'PATCH') return reply(routes.patch(body.recipientId))
        if (method === 'DELETE') return reply(routes.del)
        return reply(routes.load === 'drop' || !routes.load.ok ? routes.load : { ok: true, body: { messages: existing } })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const renderPane = () => render(<DocumentDocCommentsPane engagementId="e1" documentId="d1" documentName="Report" />)
const type = (box: HTMLTextAreaElement, value: string) =>
    fireEvent.change(box, { target: { value, selectionStart: value.length, selectionEnd: value.length } })

/** Writes a comment mentioning the given people, picked from the "@" menu, and sends it. */
async function postMentioning(names: string[]) {
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    let text = 'Please review'
    for (const name of names) {
        text = `${text} @${name.split(' ')[0].slice(0, 2)}`
        type(box, text)
        fireEvent.click(await screen.findByRole('option', { name: new RegExp(name) }))
        text = box.value.trimEnd()
    }
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter', metaKey: true }) })
    await settle()
}

describe('a failed load of the thread (P1-71)', () => {
    it('says why with a way to try again, never "No comments yet"', async () => {
        routes.load = { ok: false, status: 500, body: { error: "Couldn't load the comments. Try again." } }
        renderPane()
        await settle()
        expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load the comments/)
        expect(screen.queryByText(/No comments yet/)).toBeNull()

        routes.load = { ok: true }
        existing.push({ id: 'm1', createdAt: new Date().toISOString(), authorUserId: 'u1', authorEmail: 'ana@firm.com', content: 'First draft is up' })
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('First draft is up')).toBeTruthy()
    })

    it('says a dropped connection is the reason', async () => {
        routes.load = 'drop'
        renderPane()
        await settle()
        expect(screen.getByText(/Couldn't reach/)).toBeTruthy()
    })
})

describe('posting (P1-70)', () => {
    it('keeps the text in the box and says why when the post is refused', async () => {
        routes.post = { ok: false, status: 409, body: { error: 'This engagement is completed, so it is read only.' } }
        renderPane()
        await settle()
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        type(box, 'Looks good to me')
        await act(async () => { fireEvent.keyDown(box, { key: 'Enter', metaKey: true }) })
        await settle()
        expect(toasts).toEqual([expect.objectContaining({ type: 'error', title: "Couldn't post your comment", message: expect.stringMatching(/read only.*still in the box/) })])
        expect(box.value).toBe('Looks good to me')
    })

    it('says so when the request never got there', async () => {
        routes.post = 'drop'
        renderPane()
        await settle()
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        type(box, 'Hello')
        await act(async () => { fireEvent.keyDown(box, { key: 'Enter', metaKey: true }) })
        await settle()
        expect(toasts[0].message).toMatch(/Couldn't reach/)
        expect(box.value).toBe('Hello')
    })
})

describe('notifying the people mentioned (CM-1)', () => {
    it('posts the comment, and names who wasn’t notified with the reason', async () => {
        routes.patch = (id) => (id === 'u2' ? { ok: false, status: 500, body: { error: "The reminder wasn't saved on our side. Try again." } } : { ok: true })
        renderPane()
        await settle()
        await postMentioning(['Ana Lopez', 'Raj Patel'])
        expect(screen.getByText(/Please review/)).toBeTruthy()
        expect(toasts).toHaveLength(1)
        expect(toasts[0]).toMatchObject({ type: 'warning', title: 'Comment posted' })
        expect(toasts[0].message).toBe("Couldn't notify Raj Patel · The reminder wasn't saved on our side. Try again.")
    })

    it('Try again resends only to the people it missed', async () => {
        let rajFails = true
        routes.patch = (id) => (id === 'u2' && rajFails ? 'drop' : { ok: true })
        renderPane()
        await settle()
        await postMentioning(['Ana Lopez', 'Raj Patel'])
        expect(toasts[0].message).toMatch(/^Couldn't notify Raj Patel · Couldn't reach/)
        rajFails = false
        calls = []
        await act(async () => { toasts[0].action!.onClick() })
        await settle()
        expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body.recipientId)).toEqual(['u2'])
        expect(toasts).toHaveLength(1)
    })

    it('says nothing more when everyone was notified', async () => {
        renderPane()
        await settle()
        await postMentioning(['Ana Lopez'])
        expect(calls.some((c) => c.method === 'PATCH' && c.body.recipientId === 'u1')).toBe(true)
        expect(toasts).toEqual([])
    })
})

describe('reactions (P1-72)', () => {
    const withReaction = () => existing.push({
        id: 'm1', createdAt: new Date().toISOString(), authorUserId: 'u1', authorEmail: 'ana@firm.com', content: 'Ready for review',
        reactions: { thumbs_up: { count: 1, users: ['ana@firm.com'] } },
    })
    const pill = () => screen.getAllByRole('button').find((b) => b.className.includes('rounded-full') && /\d/.test(b.textContent ?? ''))!

    it('takes back a reaction the server refused, and says why', async () => {
        withReaction()
        routes.reaction = { ok: false, status: 404, body: { error: 'This comment is no longer there.' } }
        renderPane()
        await settle()
        expect(pill().textContent).toBe('1')
        await act(async () => { fireEvent.click(pill()) })
        await settle()
        expect(pill().textContent).toBe('1')
        expect(toasts).toEqual([{ type: 'error', title: "Couldn't add the reaction", message: 'This comment is no longer there.' }])
    })

    it('takes it back when the request never got there', async () => {
        withReaction()
        routes.reaction = 'drop'
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(pill()) })
        await settle()
        expect(pill().textContent).toBe('1')
        expect(toasts[0].message).toMatch(/Couldn't reach/)
    })

    it('keeps a reaction the server took', async () => {
        withReaction()
        renderPane()
        await settle()
        await act(async () => { fireEvent.click(pill()) })
        await settle()
        expect(pill().textContent).toBe('2')
        expect(toasts).toEqual([])
    })
})

describe('deleting (P1-70)', () => {
    it('keeps the comment and says why when the delete is refused', async () => {
        existing.push({ id: 'm1', createdAt: new Date().toISOString(), authorUserId: 'me', authorEmail: 'me@firm.com', content: 'Typo here' })
        routes.del = { ok: false, status: 409, body: { error: 'Cannot delete a comment that has follow-up replies' } }
        renderPane()
        await settle()
        fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes' })) })
        await settle()
        expect(screen.getByText('Typo here')).toBeTruthy()
        expect(toasts).toEqual([{ type: 'error', title: "Couldn't delete the comment", message: 'Cannot delete a comment that has follow-up replies' }])
    })
})

describe('the people on the engagement (P2-21)', () => {
    it('"@" says they couldn’t be loaded, and loads them on Try again', async () => {
        routes.members = { ok: false, status: 500, body: { error: "Couldn't load the people on this engagement. Try again." } }
        renderPane()
        await settle()
        const box = screen.getByRole('textbox') as HTMLTextAreaElement
        type(box, 'Hi @')
        expect(await screen.findByText(/Couldn't load the people on this engagement/)).toBeTruthy()
        expect(screen.queryByRole('option')).toBeNull()

        routes.members = { ok: true, body: { members: MEMBERS } }
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
        await settle()
        type(box, 'Hi @A')
        expect(await screen.findByRole('option', { name: /Ana Lopez/ })).toBeTruthy()
    })
})
