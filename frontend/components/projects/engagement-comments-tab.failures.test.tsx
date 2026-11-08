import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, within } from '@testing-library/react'

// The Discussions page when something fails (error-handling audit P1-74, P2-21): resolve and reopen say
// why, a failed list load is never "No discussions yet", and missing people are said.

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', email: 'me@firm.com' } }) }))
const { toasts, pane } = vi.hoisted(() => ({
    toasts: [] as { type: string; title: string; message?: string }[],
    pane: { actions: null as React.ReactNode, content: null as React.ReactNode },
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ addToast: (t: any) => toasts.push(t) }) }))
vi.mock('@/lib/right-pane-context', () => ({
    useRightPane: () => ({
        hasRightPane: true,
        content: pane.content,
        setContent: (c: React.ReactNode) => { pane.content = c },
        setHeaderActions: (a: React.ReactNode) => { pane.actions = a },
        setBeforeClose: () => {},
        setTitle: () => {},
        setHeaderIcon: () => {},
        setHeaderSubtitle: () => {},
    }),
}))
vi.mock('@/components/projects/document-doc-comments-pane', () => ({ DocumentDocCommentsPane: () => null }))

import { EngagementCommentsTab } from './engagement-comments-tab'

type Reply = { ok: boolean; status?: number; body?: unknown } | 'drop'
let routes: { list: Reply; members: Reply; resolve: Reply }

const ROW = { projectDocumentId: 'd1', documentName: 'Market report', docId: 'QSR-9', kind: 'deliverable', count: 2, latest: null }

const reply = (r: Reply) => {
    if (r === 'drop') throw new TypeError('Failed to fetch')
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body ?? {} } as Response
}

beforeEach(() => {
    toasts.length = 0
    pane.actions = null
    pane.content = null
    routes = {
        list: { ok: true, body: { documents: [ROW] } },
        members: { ok: true, body: { members: [{ userId: 'me', email: 'me@firm.com', name: 'Me', role: 'eng_admin' }] } },
        resolve: { ok: true, body: { ok: true } },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('/members')) return reply(routes.members)
        if (url.includes('/resolve')) return reply(routes.resolve)
        if (url.includes('filter=mentions')) return reply({ ok: true, body: { mentions: [] } })
        return reply(routes.list)
    }))
})
afterEach(() => vi.unstubAllGlobals())

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

/** Opens the discussion in the pane and presses its Resolve, from the pane's header. */
async function resolveFromPane() {
    const view = render(<EngagementCommentsTab projectId="p1" />)
    await settle()
    fireEvent.click(screen.getByText('Market report'))
    view.rerender(<EngagementCommentsTab projectId="p1" />)
    await settle()
    const header = render(<>{pane.actions}</>)
    await act(async () => { fireEvent.click(within(header.container).getByRole('button', { name: 'Resolve' })) })
    await settle()
}

describe('resolving a discussion (P1-74)', () => {
    it('says why it was refused', async () => {
        routes.resolve = { ok: false, status: 409, body: { error: 'This engagement is completed, so it is read only.' } }
        await resolveFromPane()
        expect(toasts).toEqual([{ type: 'error', title: 'Couldn’t resolve this discussion', message: 'This engagement is completed, so it is read only.' }])
    })

    it('says so when the request never got there', async () => {
        routes.resolve = 'drop'
        await resolveFromPane()
        expect(toasts).toHaveLength(1)
        expect(toasts[0].title).toBe('Couldn’t resolve this discussion')
        expect(toasts[0].message).toMatch(/Couldn't reach/)
    })

    it('confirms when it worked', async () => {
        await resolveFromPane()
        expect(toasts).toEqual([{ type: 'success', title: 'Discussion resolved' }])
    })
})

describe('a failed load of the list', () => {
    it('says why with a way to try again, never "No discussions yet"', async () => {
        routes.list = { ok: false, status: 500, body: { error: "Couldn't load the discussions. Try again." } }
        render(<EngagementCommentsTab projectId="p1" />)
        await settle()
        expect(screen.getByText("Couldn't load the discussions")).toBeTruthy()
        expect(screen.queryByText('No discussions yet')).toBeNull()

        routes.list = { ok: true, body: { documents: [ROW] } }
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
        await settle()
        expect(screen.getByText('Market report')).toBeTruthy()
    })
})

describe('the people on the engagement (P2-21)', () => {
    it('says they couldn’t be loaded, and loads them on Try again', async () => {
        routes.members = { ok: false, status: 500, body: { error: "Couldn't load the people on this engagement. Try again." } }
        render(<EngagementCommentsTab projectId="p1" />)
        await settle()
        expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load the people on this engagement/)

        routes.members = { ok: true, body: { members: [] } }
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
        await settle()
        expect(screen.queryByText(/Couldn't load the people/)).toBeNull()
    })
})
