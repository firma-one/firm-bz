import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Who may read and change an engagement's RAID log, and what each refusal says: Leads and Contributors ·
 * Full Access only, a completed engagement read only, and Check now over the credit allowance a 429.
 * The store, the sync and the check are stubbed (their own tests cover them); nothing reaches Anthropic.
 */

const h = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 25
        used = 25
    }
    return {
        LimitError,
        user: { id: 'u1', email: 'alex@firm.com', user_metadata: { full_name: 'Alex Jordan' } } as object | null,
        canEdit: true,
        canViewInternal: true,
        status: 'ACTIVE' as string,
        sync: vi.fn(async () => {}),
        loadRaidLog: vi.fn(),
        addRaidItem: vi.fn(),
        accept: vi.fn(),
        dismiss: vi.fn(),
        edit: vi.fn(),
        close: vi.fn(),
        reopen: vi.fn(),
        count: vi.fn(async () => 7),
        runRaidCheck: vi.fn(),
    }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ firmId: 'f1', orgId: 'f1', clientId: 'c1', projectId: 'p1' }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canEditProject: async () => h.canEdit,
    canViewProjectInternalTabs: async () => h.canViewInternal,
}))
vi.mock('@/lib/engagement-access', () => ({
    blockIfEngagementCompleted: async () => (h.status === 'COMPLETED'
        ? NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
        : null),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: { engagement: { findUnique: async () => ({ status: h.status, settings: { raid: { lastCheckedAt: '2026-11-12T08:02:00.000Z' } } }) } },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({ isAiConfigured: () => true }))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: vi.fn(), AiCreditLimitError: h.LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/raid/raid-sync', () => ({ syncRaidSignals: h.sync }))
vi.mock('@/lib/raid/raid-check', () => ({ runRaidCheck: h.runRaidCheck }))
vi.mock('@/lib/raid/raid-fingerprint', () => ({
    loadConversationStamps: async () => ({ threads: [], memos: [] }),
    conversationStateOf: () => 'changed',
}))
vi.mock('@/lib/raid/raid-store', () => ({
    loadRaidLog: h.loadRaidLog,
    addRaidItem: h.addRaidItem,
    acceptRaidSuggestion: h.accept,
    dismissRaidSuggestion: h.dismiss,
    editRaidItem: h.edit,
    closeRaidItem: h.close,
    reopenRaidItem: h.reopen,
    raidOpenCountFor: h.count,
    lastCheckedAtOf: (s: { raid?: { lastCheckedAt?: string } }) => s?.raid?.lastCheckedAt ?? null,
    raidActor: (u: { id: string }) => ({ userId: u.id, firstName: 'Alex' }),
}))

import { GET, POST } from './route'
import { PATCH } from './[itemId]/route'
import { POST as CHECK } from './check/route'
import { BRIO_RAID_FAILED } from '@/lib/ai/brio-failure'

const ITEM = '44444444-4444-4444-8444-444444444444'
const params = { params: Promise.resolve({ projectId: 'p1' }) }
const itemParams = { params: Promise.resolve({ projectId: 'p1', itemId: ITEM }) }
const url = (path = '') => `http://localhost/api/projects/p1/raid${path}`
const get = (query = '') => GET(new NextRequest(url(query)), params)
const post = (body: unknown = { type: 'RISK', title: 'Data may arrive late' }) =>
    POST(new NextRequest(url(), { method: 'POST', body: JSON.stringify(body) }), params)
const patch = (body: unknown = { action: 'close' }) =>
    PATCH(new NextRequest(url(`/${ITEM}`), { method: 'PATCH', body: JSON.stringify(body) }), itemParams)
const check = () => CHECK(new NextRequest(url('/check'), { method: 'POST' }), params)

const LOG = { items: [], suggestions: [], members: [] }

beforeEach(() => {
    h.user = { id: 'u1', email: 'alex@firm.com', user_metadata: { full_name: 'Alex Jordan' } }
    h.canEdit = true
    h.canViewInternal = true
    h.status = 'ACTIVE'
    h.sync.mockClear()
    h.loadRaidLog.mockReset().mockResolvedValue(LOG)
    h.addRaidItem.mockReset().mockResolvedValue({ id: ITEM })
    for (const fn of [h.accept, h.dismiss, h.edit, h.close, h.reopen]) fn.mockReset().mockResolvedValue(undefined)
    h.runRaidCheck.mockReset().mockResolvedValue({ ok: true, status: 'checked', suggested: 2, dropped: 0, unreadMemos: [], lastCheckedAt: '2026-11-12T09:00:00.000Z' })
})

describe('who', () => {
    it('401 when signed out', async () => {
        h.user = null
        expect((await get()).status).toBe(401)
        expect((await post()).status).toBe(401)
        expect((await patch()).status).toBe(401)
        expect((await check()).status).toBe(401)
    })

    it('403 for a Reviewer, everywhere, and nothing is read or written', async () => {
        h.canEdit = false
        h.canViewInternal = false
        for (const res of [await get(), await get('?view=count'), await post(), await patch(), await check()]) {
            expect(res.status).toBe(403)
            expect((await res.json()).error).toBe('The RAID log is for a Lead or a Contributor · Full Access only.')
        }
        expect(h.sync).not.toHaveBeenCalled()
        expect(h.loadRaidLog).not.toHaveBeenCalled()
        expect(h.count).not.toHaveBeenCalled()
        expect(h.addRaidItem).not.toHaveBeenCalled()
        expect(h.close).not.toHaveBeenCalled()
        expect(h.runRaidCheck).not.toHaveBeenCalled()
    })

    it('403 for a Contributor · Limited Access, who can edit but not see what is internal', async () => {
        h.canViewInternal = false
        expect((await get()).status).toBe(403)
        expect((await post()).status).toBe(403)
        expect((await patch({ action: 'accept' })).status).toBe(403)
        expect((await check()).status).toBe(403)
        expect(h.accept).not.toHaveBeenCalled()
    })

    it('a Lead reads the log, synced first, with when Brio last checked', async () => {
        const res = await get()
        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual({ ...LOG, lastCheckedAt: '2026-11-12T08:02:00.000Z', conversation: 'changed', readOnly: false, canCheck: true })
        expect(h.sync).toHaveBeenCalledWith('p1', 'f1')
    })

    it('answers the count alone for the Discussions switch', async () => {
        expect(await (await get('?view=count')).json()).toEqual({ data: { count: 7 } })
        expect(h.loadRaidLog).not.toHaveBeenCalled()
    })
})

describe('a completed engagement', () => {
    beforeEach(() => { h.status = 'COMPLETED' })

    it('is read only: the log is listed as it was, without a sync', async () => {
        const res = await get()
        expect(res.status).toBe(200)
        expect((await res.json()).data.readOnly).toBe(true)
        expect(h.sync).not.toHaveBeenCalled()
    })

    it('refuses every write, and Check now', async () => {
        for (const res of [await post(), await patch({ action: 'accept' }), await patch({ action: 'edit', notes: 'x' }), await check()]) {
            expect(res.status).toBe(403)
            expect((await res.json()).error).toBe("This engagement is completed, so it's read only.")
        }
        expect(h.addRaidItem).not.toHaveBeenCalled()
        expect(h.accept).not.toHaveBeenCalled()
        expect(h.edit).not.toHaveBeenCalled()
        expect(h.runRaidCheck).not.toHaveBeenCalled()
    })
})

describe('writes', () => {
    it('adds a person\'s entry as them', async () => {
        const res = await post({ type: 'ASSUMPTION', title: 'K-1s arrive by Nov 20', notes: 'Check Nov 23' })
        expect(res.status).toBe(201)
        expect(h.addRaidItem).toHaveBeenCalledWith(expect.objectContaining({
            engagementId: 'p1', firmId: 'f1', actor: { userId: 'u1', firstName: 'Alex' }, type: 'ASSUMPTION', title: 'K-1s arrive by Nov 20', notes: 'Check Nov 23',
        }))
    })

    it('routes each action, passing only the fields sent', async () => {
        await patch({ action: 'accept' })
        await patch({ action: 'dismiss' })
        await patch({ action: 'edit', notes: 'Re-plan on the call' })
        await patch({ action: 'reopen' })
        expect(h.accept).toHaveBeenCalledWith('p1', { userId: 'u1', firstName: 'Alex' }, ITEM)
        expect(h.dismiss).toHaveBeenCalled()
        expect(h.edit).toHaveBeenCalledWith('p1', expect.anything(), ITEM, { notes: 'Re-plan on the call' })
        expect(h.reopen).toHaveBeenCalled()
    })

    it('400 with words for an unknown action', async () => {
        const res = await patch({ action: 'delete' })
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/accept, dismiss, edit, close or reopen/)
    })
})

describe('Check now', () => {
    it('runs the check as the person who pressed it, after a fresh sync', async () => {
        const res = await check()
        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual({ status: 'checked', suggested: 2, dropped: 0, lastCheckedAt: '2026-11-12T09:00:00.000Z' })
        expect(h.sync).toHaveBeenCalledWith('p1', 'f1', { force: true })
        expect(h.runRaidCheck).toHaveBeenCalledWith({ engagementId: 'p1', firmId: 'f1', userId: 'u1' })
    })

    it("429 with the limit's own words when the group's credits have run out", async () => {
        h.runRaidCheck.mockRejectedValue(new h.LimitError('Your group has used all 25 AI credits for this period.'))
        const res = await check()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe('Your group has used all 25 AI credits for this period.')
    })

    it("a refusal is a failure in Brio's words", async () => {
        h.runRaidCheck.mockResolvedValue({ ok: false, reason: 'declined' })
        const res = await check()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe(BRIO_RAID_FAILED)
    })

    it('any other failure says what Brio could not do, never the error itself', async () => {
        h.runRaidCheck.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'))
        const res = await check()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe(BRIO_RAID_FAILED)
    })

    it('says which memo it could not read', async () => {
        h.runRaidCheck.mockResolvedValue({ ok: true, status: 'checked', suggested: 0, dropped: 0, unreadMemos: ['Call with Dana'], lastCheckedAt: 'x' })
        expect((await (await check()).json()).warning).toBe('Brio couldn\'t read the memo “Call with Dana” from storage, so it was left out.')
    })
})
