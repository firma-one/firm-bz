import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db, users } = vi.hoisted(() => ({
    db: { folders: [] as any[], leads: [] as any[] },
    users: {} as Record<string, any>,
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { findMany: vi.fn(async () => db.folders) },
        engagementMember: { findMany: vi.fn(async () => db.leads) },
    },
}))
vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({ auth: { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ?? null } }) } } }),
}))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({
    isAgentUser: (u: { email?: string }) => u?.email === 'brio@firma.ai',
}))

import { buildFirmEngagementRows } from './firm-engagement-rows'

const NOW = new Date('2026-10-17T12:00:00Z')
const ENG = {
    id: 'e1', name: 'GTM', slug: 'gtm', kickoffDate: null, createdAt: new Date('2026-09-01T00:00:00Z'),
    dueDate: new Date('2026-12-01T00:00:00Z'), client: { name: 'Acme', slug: 'acme' },
}
const deliverable = (status: string | undefined, due?: string) => ({
    engagementId: 'e1',
    settings: { share: { createdAt: '2026-09-02' }, ...(status ? { activity: { status } } : {}) },
    dueDate: due ? new Date(due) : null,
})

beforeEach(() => {
    db.folders = []
    db.leads = []
    for (const k of Object.keys(users)) delete users[k]
})

describe('buildFirmEngagementRows', () => {
    it('counts the deliverables by stage, and the overdue ones not yet approved', async () => {
        db.folders = [
            deliverable(undefined),                       // no status yet: to do
            deliverable('in_progress', '2026-10-01'),     // overdue
            deliverable('in_review'),
            deliverable('done', '2026-10-01'),            // the old name for approved: not overdue
            { engagementId: 'e1', settings: {}, dueDate: null }, // a plain folder, not a deliverable
            { ...deliverable('approved'), engagementId: 'other' },
        ]
        const [row] = await buildFirmEngagementRows([ENG], NOW)
        expect(row.deliverables).toEqual({ total: 4, toDo: 1, inProgress: 1, inReview: 1, approved: 1, overdue: 1 })
        // No kickoff: the timeline starts when the engagement was created.
        expect(row.startDate).toBe('2026-09-01T00:00:00.000Z')
        expect(row).toMatchObject({ clientName: 'Acme', clientSlug: 'acme', dueDate: '2026-12-01T00:00:00.000Z' })
    })

    it('names the first lead who is a person, never Brio', async () => {
        db.leads = [{ engagementId: 'e1', userId: 'brio' }, { engagementId: 'e1', userId: 'u1' }]
        users.brio = { email: 'brio@firma.ai', user_metadata: {} }
        users.u1 = { email: 'ana@firm.com', user_metadata: { full_name: 'Ana Lopez', avatar_url: 'https://x/a.png' } }
        const [row] = await buildFirmEngagementRows([ENG], NOW)
        expect(row.lead).toEqual({ name: 'Ana Lopez', avatarUrl: 'https://x/a.png' })
    })

    it('has no lead when none is set', async () => {
        const [row] = await buildFirmEngagementRows([ENG], NOW)
        expect(row.lead).toBeNull()
    })

    it('does nothing for no engagements', async () => {
        expect(await buildFirmEngagementRows([], NOW)).toEqual([])
    })
})
