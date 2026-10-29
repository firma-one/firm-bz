import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// The deliverable thread's internal notes, and opening it from one of its documents (2026-10-29).

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { id: 'me', email: 'me@firm.com', user_metadata: {} } }),
}))
vi.mock('@/lib/right-pane-context', () => ({ useRightPane: () => ({ clearPane: vi.fn() }) }))

import { DocumentDocCommentsPane } from './document-doc-comments-pane'

let myRole = 'eng_admin'
let existing: any[] = []
let posted: any[] = []

beforeEach(() => {
    myRole = 'eng_admin'
    existing = []
    posted = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = init?.body ? JSON.parse(init.body as string) : null
        const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response
        if (url.includes('/members')) {
            return json({ members: [
                { userId: 'me', email: 'me@firm.com', name: 'Me Myself', role: myRole },
                { userId: 'ana', email: 'ana@firm.com', name: 'Ana Lopez', role: 'eng_member' },
                { userId: 'carl', email: 'carl@client.com', name: 'Carl Client', role: 'eng_viewer' },
            ] })
        }
        if (url.endsWith('/read') || url.includes('filter=mentions') || url.includes('/reminders')) return json({ mentions: [], reminders: [] })
        if (method === 'POST') {
            posted.push(body)
            return json({ message: { id: 'm-new', createdAt: new Date().toISOString(), authorUserId: 'me', content: body.content, isInternal: !!body.internal } })
        }
        return json({ messages: existing })
    }))
})
afterEach(() => vi.unstubAllGlobals())

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

describe('internal notes in the thread', () => {
    it("offers the firm a Reply / Internal note choice, and posts an internal note as one", async () => {
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" />)
        await settle()
        fireEvent.click(screen.getByRole('radio', { name: /Internal note/ }))
        const box = screen.getByLabelText('Internal note') as HTMLTextAreaElement
        expect(box.placeholder).toMatch(/only the firm's team/)
        fireEvent.change(box, { target: { value: 'Pricing needs partner sign-off' } })
        await act(async () => { fireEvent.submit(box.closest('form')!) })
        expect(posted[0]).toEqual({ content: 'Pricing needs partner sign-off', internal: true })
    })

    it('gives a client no such choice', async () => {
        myRole = 'eng_viewer'
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" />)
        await settle()
        expect(screen.queryByRole('radio', { name: /Internal note/ })).toBeNull()
    })

    it('marks an internal note in the thread', async () => {
        existing = [
            { id: 'm1', createdAt: '2026-10-28T10:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Shared update', reactions: {} },
            { id: 'm2', createdAt: '2026-10-28T11:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Between us', reactions: {}, isInternal: true },
        ]
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" />)
        await settle()
        expect(screen.getAllByText('Internal')).toHaveLength(1)
    })
})

describe('opened from one of its documents', () => {
    beforeEach(() => {
        existing = [
            { id: 'm1', createdAt: '2026-10-28T10:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Budget numbers look off in #QSR-16', reactions: {} },
            { id: 'm2', createdAt: '2026-10-28T11:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Deck is ready for review', reactions: {} },
        ]
    })

    it('shows the comments tagging that document first, with the whole thread a click away', async () => {
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" initialDraft="#QSR-16 " focusDocId="QSR-16" />)
        await settle()
        expect(screen.getByRole('radio', { name: /About this file · 1/ }).getAttribute('aria-checked')).toBe('true')
        expect(screen.queryByText('Deck is ready for review')).toBeNull()
        fireEvent.click(screen.getByRole('radio', { name: /Whole thread · 2/ }))
        expect(screen.getByText('Deck is ready for review')).toBeTruthy()
    })

    it('starts a new comment with its tag, and again after sending', async () => {
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" initialDraft="#QSR-16 " focusDocId="QSR-16" />)
        await settle()
        const box = screen.getByLabelText('Comment') as HTMLTextAreaElement
        expect(box.value).toBe('#QSR-16 ')
        fireEvent.change(box, { target: { value: '#QSR-16 Updated the totals' } })
        await act(async () => { fireEvent.submit(box.closest('form')!) })
        expect(posted[0].content).toBe('#QSR-16 Updated the totals')
        expect(box.value).toBe('#QSR-16 ')
    })
})

describe('filtering by visibility', () => {
    beforeEach(() => {
        existing = [
            { id: 'm1', createdAt: '2026-10-28T08:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Sent the draft to the client', reactions: {} },
            { id: 'm2', createdAt: '2026-10-28T09:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Pricing stays between us', reactions: {}, isInternal: true },
            { id: 'm3', createdAt: '2026-10-28T10:00:00Z', authorUserId: 'carl', authorEmail: 'carl@client.com', content: 'Looks good, thanks', reactions: {} },
            { id: 'm4', createdAt: '2026-10-28T11:00:00Z', authorUserId: 'ana', authorEmail: 'ana@firm.com', content: 'Partner signed off', reactions: {}, isInternal: true },
        ]
    })

    const openVisibility = async () => {
        const pill = screen.getByRole('button', { name: /Visibility/ })
        pill.focus()
        fireEvent.keyDown(pill, { key: 'Enter' })
        return screen.findByRole('menu')
    }

    it('narrows the thread to internal notes, or to replies', async () => {
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" />)
        await settle()
        await openVisibility()
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Internal notes/ }))
        expect(screen.queryByText('Sent the draft to the client')).toBeNull()
        expect(screen.getByText('Pricing stays between us')).toBeTruthy()
        expect(screen.getByText('Partner signed off')).toBeTruthy()
        expect(screen.getByText('2 of 4 comments')).toBeTruthy()
    })

    it('counts each kind in the menu', async () => {
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" />)
        await settle()
        await openVisibility()
        expect(screen.getByRole('menuitemcheckbox', { name: /Replies\s*2/ })).toBeTruthy()
        expect(screen.getByRole('menuitemcheckbox', { name: /Internal notes\s*2/ })).toBeTruthy()
    })

    it("isn't offered to a client, who sees only replies anyway", async () => {
        myRole = 'eng_viewer'
        existing = existing.filter((m) => !m.isInternal).concat([
            { id: 'm5', createdAt: '2026-10-28T12:00:00Z', authorUserId: 'carl', authorEmail: 'carl@client.com', content: 'One more thing', reactions: {} },
            { id: 'm6', createdAt: '2026-10-28T13:00:00Z', authorUserId: 'carl', authorEmail: 'carl@client.com', content: 'And another', reactions: {} },
        ])
        render(<DocumentDocCommentsPane engagementId="e1" documentId="deliv-1" documentName="Deck" />)
        await settle()
        expect(screen.getByRole('button', { name: /People/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Visibility/ })).toBeNull()
    })
})
