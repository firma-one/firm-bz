import { describe, it, expect, vi, beforeEach } from 'vitest'

const { engagementFindMany, getUserById } = vi.hoisted(() => ({ engagementFindMany: vi.fn(), getUserById: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { getUserById } } }) }))
vi.mock('@/lib/reminders/reminder-service', () => ({ getReminderKeysForUser: async () => new Set<string>() }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findMany: (...a: unknown[]) => engagementFindMany(...a) },
        engagementDocument: { findMany: async () => [] },
    },
}))

import { loadCalendarData } from './calendar-data'

const ACME = { id: 'f1', slug: 'acme', groupSlug: 'g' }
const BETA = { id: 'f2', slug: 'beta', groupSlug: 'h' }
const from = new Date('2026-10-14T00:00:00Z')
const to = new Date('2026-10-23T00:00:00Z')

function engagement(id: string, firmId: string, dates: { kickoffDate?: Date; dueDate?: Date }, documents: unknown[] = []) {
    return {
        id, firmId, name: `Eng ${id}`, slug: id, clientId: 'c', status: 'ACTIVE',
        kickoffDate: dates.kickoffDate ?? null, dueDate: dates.dueDate ?? null, followUpDate: null,
        client: { name: 'Contoso', slug: 'contoso' }, members: [{ role: 'eng_member' }], documents,
    }
}

beforeEach(() => vi.clearAllMocks())

describe('loadCalendarData', () => {
    it('queries nothing without firms', async () => {
        expect(await loadCalendarData({ userId: 'u1', firms: [] })).toEqual({ engagements: [], events: [] })
        expect(engagementFindMany).not.toHaveBeenCalled()
    })

    it('limits a windowed query to the caller\'s engagements in the given firms with something dated inside', async () => {
        engagementFindMany.mockResolvedValue([])
        await loadCalendarData({ userId: 'u1', firms: [ACME, BETA], window: { from, to } })
        const { where, select } = engagementFindMany.mock.calls[0][0]
        expect(where).toMatchObject({ firmId: { in: ['f1', 'f2'] }, isDeleted: false, members: { some: { userId: 'u1' } } })
        expect(where.OR).toHaveLength(4)
        expect(select.documents.where).toEqual({ dueDate: { gte: from, lte: to } })
    })

    it('keeps only events inside the window, linked under each engagement\'s firm', async () => {
        engagementFindMany.mockResolvedValue([
            engagement('a', 'f1', { kickoffDate: new Date('2026-09-01T00:00:00Z'), dueDate: new Date('2026-10-16T00:00:00Z') }),
            engagement('b', 'f2', { dueDate: new Date('2026-10-20T00:00:00Z') }),
        ])
        const { events } = await loadCalendarData({ userId: 'u1', firms: [ACME, BETA], window: { from, to }, withAssignees: false })
        expect(events.map((e) => [e.id, e.firmId, e.ctaUrl])).toEqual([
            ['a:due', 'f1', '/d/g/f/acme/c/contoso/e/a'],
            ['b:due', 'f2', '/d/h/f/beta/c/contoso/e/b'],
        ])
    })

    it('skips assignee lookups when asked to', async () => {
        const doc = { id: 'd1', externalId: 'x', fileName: 'Return', dueDate: new Date('2026-10-18T00:00:00Z'), isFolder: false, parentId: null, docId: null, settings: { assigneeUserId: 'u9' } }
        engagementFindMany.mockResolvedValue([engagement('a', 'f1', {}, [doc])])
        const { events } = await loadCalendarData({ userId: 'u1', firms: [ACME], window: { from, to }, withAssignees: false })
        expect(events.map((e) => e.documentId)).toEqual(['d1'])
        expect(getUserById).not.toHaveBeenCalled()
    })
})
