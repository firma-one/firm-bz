import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// Resolving or reopening a discussion that can't be saved answers why (error-handling audit P1-74).

const { st } = vi.hoisted(() => ({ st: { fails: false, calls: [] as (string | null)[] } }))

vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementCompleted: async () => null }))
vi.mock('@/lib/comments/discussions', () => ({
    discussionAccess: async () => ({ userId: 'me', documentId: 'd1' }),
    setDiscussionResolved: async (_doc: string, _eng: string, by: string | null) => {
        if (st.fails) throw new Error('connection reset')
        st.calls.push(by)
    },
}))

import { DELETE, POST } from './route'

const ctx = { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) }

beforeEach(() => {
    st.fails = false
    st.calls = []
})

describe('resolve and reopen', () => {
    it('resolves, by the caller', async () => {
        const res = await POST({} as never, ctx)
        expect(await res.json()).toEqual({ ok: true, resolved: true })
        expect(st.calls).toEqual(['me'])
    })

    it('reopens', async () => {
        const res = await DELETE({} as never, ctx)
        expect(await res.json()).toEqual({ ok: true, resolved: false })
        expect(st.calls).toEqual([null])
    })

    it('answers in words when it could not be saved', async () => {
        st.fails = true
        const res = await POST({} as never, ctx)
        expect(res).toBeInstanceOf(NextResponse)
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("It wasn't saved on our side. Try again.")
    })
})
