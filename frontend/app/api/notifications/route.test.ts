import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getHomeFirms } = vi.hoisted(() => ({
    prisma: {
        notification: {
            findMany: vi.fn(),
            count: vi.fn(),
            deleteMany: vi.fn(),
            updateMany: vi.fn(),
        },
        firmMember: { findFirst: vi.fn() },
    },
    getHomeFirms: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => ({ data: { user: { id: 'u1', app_metadata: {} } } }),
            getSession: async () => ({ data: { session: { access_token: 't' } } }),
        },
    }),
}))
vi.mock('@/lib/prisma', () => ({ getPrismaWithRls: () => prisma }))
vi.mock('@/lib/permission-helpers', () => ({ canManageClient: vi.fn(), canManageProject: vi.fn() }))
vi.mock('@/lib/home/home-firms', () => ({ getHomeFirms }))

import { GET, PATCH, DELETE } from './route'

const ALL_FIRMS_WHERE = { userId: 'u1', OR: [{ firmId: { in: ['f1', 'f2'] } }, { scope: 'PLATFORM' }] }

function req(url: string, init?: { method?: string; body?: unknown }) {
    return new NextRequest(`http://localhost${url}`, {
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } } : {}),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    getHomeFirms.mockResolvedValue({ firms: [{ id: 'f1' }, { id: 'f2' }], unavailable: [{ id: 'locked' }] })
    prisma.notification.findMany.mockResolvedValue([])
    prisma.notification.count.mockResolvedValue(0)
})

describe('/api/notifications?firms=all', () => {
    it('lists the caller\'s own notifications in the firms they may open, plus platform-wide ones', async () => {
        prisma.notification.findMany.mockResolvedValue([
            { id: 'n1', firmId: 'f2', createdAt: new Date('2026-10-15T10:00:00Z'), readAt: null },
        ])
        // A firmId in the request never widens or replaces the server-computed firm list.
        const res = await GET(req('/api/notifications?firms=all&firmId=someone-elses-firm'))
        const json = await res.json()

        const list = prisma.notification.findMany.mock.calls.find((c: any[]) => c[0].take === 50)![0]
        // A retracted update (an earlier "due on …" whose date changed) is neither listed nor counted.
        expect(list.where).toEqual({ ...ALL_FIRMS_WHERE, dismissedAt: null })
        expect(prisma.notification.count).toHaveBeenCalledWith({ where: { ...ALL_FIRMS_WHERE, dismissedAt: null, readAt: null } })
        expect(list.select.firmId).toBe(true)
        expect(json.notifications).toEqual([{ id: 'n1', firmId: 'f2', createdAt: '2026-10-15T10:00:00.000Z', readAt: null }])
        expect(json.canBroadcast).toBe(false)
    })

    it('marks all read across those firms only', async () => {
        await PATCH(req('/api/notifications?firms=all', { method: 'PATCH', body: { markAllRead: true } }))
        expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ ...ALL_FIRMS_WHERE, readAt: null })
    })

    it('dismisses only the caller\'s own rows, whichever firm they are in', async () => {
        await DELETE(req('/api/notifications?firms=all', { method: 'DELETE', body: { ids: ['n1', 'n2'] } }))
        expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n2'] }, userId: 'u1' } })
    })

    it('keeps the single-firm behavior without the flag', async () => {
        prisma.firmMember.findFirst.mockResolvedValue(null)
        await GET(req('/api/notifications?firmId=f1'))
        const list = prisma.notification.findMany.mock.calls.find((c: any[]) => c[0].take === 30)![0]
        expect(list.where).toEqual({ userId: 'u1', OR: [{ firmId: 'f1' }, { scope: 'PLATFORM' }], dismissedAt: null })
        expect(getHomeFirms).not.toHaveBeenCalled()
    })
})
