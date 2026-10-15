import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'

const { prisma } = vi.hoisted(() => ({
    prisma: {
        engagement: { findMany: vi.fn() },
        $queryRaw: vi.fn(),
    },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { getMyWork } from './my-work'

const soon = new Date(Date.now() + 3 * 86_400_000)
const past = new Date(Date.now() - 3 * 86_400_000)

function eng(id: string, role: string, over: Record<string, unknown> = {}) {
    return {
        id, name: `Eng ${id}`, slug: id, status: 'ACTIVE', dueDate: null, updatedAt: new Date('2026-10-14T10:00:00Z'),
        client: { name: 'Contoso', slug: 'contoso' }, members: [{ role }], ...over,
    }
}

function reminder(over: Partial<ReminderWithContext>): ReminderWithContext {
    return {
        id: 'r', entityKey: 'platform.engagements', entityValue: 'x', action: 'Follow-up', dateKey: 'dueDate', dateValue: soon.toISOString(),
        hiddenAt: null, entityName: 'Thing', entitySlug: null, firmSlug: 'acme', firmId: 'f1', ctaUrl: '/go', delta: 3,
        label: 'Due in 3 days', labelStyle: 'slate', ...over,
    }
}

const base = { userId: 'u1', firmId: 'f1', groupSlug: 'g', firmSlug: 'acme', reminders: [] as ReminderWithContext[] }

/** $queryRaw is a tagged template: identify which query ran by its SQL text. */
function routeRaw(results: { review?: unknown[]; intake?: unknown[]; assigned?: unknown[] }) {
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
        const sql = strings.join('?')
        if (sql.includes("'in_review'")) return Promise.resolve(results.review ?? [])
        if (sql.includes("= 'PENDING'")) return Promise.resolve(results.intake ?? [])
        if (sql.includes('assigneeUserId')) return Promise.resolve(results.assigned ?? [])
        return Promise.resolve([])
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    routeRaw({})
})

describe('getMyWork — scope', () => {
    it('starts from the caller\'s own engagement memberships in this firm', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([])
        await getMyWork(base)
        expect(prisma.engagement.findMany.mock.calls[0][0].where).toEqual({
            isDeleted: false,
            client: { firmId: 'f1' },
            members: { some: { userId: 'u1' } },
        })
    })

    it('runs no approval queries for a user who leads nothing', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([eng('e1', 'eng_member')])
        const work = await getMyWork(base)
        const sqls = prisma.$queryRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join('?'))
        expect(sqls.some((s) => s.includes("'in_review'"))).toBe(false)
        expect(sqls.some((s) => s.includes("= 'PENDING'"))).toBe(false)
        expect(prisma.engagement.findMany).toHaveBeenCalledTimes(1) // no AI-draft lookup either
        expect(work.needsYou).toEqual([])
    })

    it('limits approvals to engagements the caller leads', async () => {
        prisma.engagement.findMany
            .mockResolvedValueOnce([eng('lead', 'eng_admin'), eng('member', 'eng_member')])
            .mockResolvedValueOnce([{ id: 'lead' }]) // AI draft pending
        routeRaw({
            review: [{ id: 'd1', engagementId: 'lead', fileName: 'Q3 Report', updatedAt: past }],
            intake: [{ id: 'd2', engagementId: 'lead', fileName: 'Client upload', createdAt: past }],
        })
        const work = await getMyWork(base)
        const reviewCall = prisma.$queryRaw.mock.calls.find((c: any[]) => (c[0] as string[]).join('?').includes("'in_review'"))!
        expect(reviewCall).toContainEqual(['lead']) // only lead engagement ids are passed
        expect(work.needsYou.map((n) => n.kind)).toEqual(['deliverable_review', 'intake', 'ai_summary'])
        expect(work.needsYou[0]).toMatchObject({ title: 'Q3 Report', context: 'Contoso · Eng lead', href: '/d/g/f/acme/c/contoso/e/lead/shares/board' })
        expect(prisma.engagement.findMany.mock.calls[1][0].where.id).toEqual({ in: ['lead'] })
    })
})

describe('getMyWork — due soon', () => {
    it('hides assigned deliverables at stages an external role may not see', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([eng('ev', 'eng_viewer'), eng('int', 'eng_member')])
        routeRaw({
            assigned: [
                { id: 'a1', engagementId: 'ev', fileName: 'Hidden draft', dueDate: soon, status: 'to_do' },
                { id: 'a2', engagementId: 'ev', fileName: 'Visible review', dueDate: soon, status: 'in_review' },
                { id: 'a3', engagementId: 'int', fileName: 'Internal to-do', dueDate: past, status: 'to_do' },
            ],
        })
        const work = await getMyWork(base)
        const titles = work.dueSoon.map((d) => d.title)
        expect(titles).not.toContain('Hidden draft')
        expect(titles).toEqual(expect.arrayContaining(['Visible review', 'Internal to-do']))
        expect(work.dueSoon.find((d) => d.title === 'Internal to-do')!.overdue).toBe(true)
    })

    it('includes due engagements only for their lead, and never completed ones', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([
            eng('led', 'eng_admin', { dueDate: soon }),
            eng('done', 'eng_admin', { dueDate: soon, status: 'COMPLETED' }),
            eng('member', 'eng_member', { dueDate: soon }),
        ])
        prisma.engagement.findMany.mockResolvedValueOnce([])
        const work = await getMyWork(base)
        expect(work.dueSoon.filter((d) => d.kind === 'engagement').map((d) => d.title)).toEqual(['Eng led'])
    })
})

describe('getMyWork — reminders', () => {
    it('keeps only this firm\'s visible reminders: review requests to Needs you, dated ones to Due soon', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([])
        const work = await getMyWork({
            ...base,
            reminders: [
                reminder({ id: 'mention', action: 'Review comment', entityName: 'Engagement letter' }),
                reminder({ id: 'follow', action: 'Follow-up', delta: 2 }),
                reminder({ id: 'far', action: 'Follow-up', delta: 40 }),
                reminder({ id: 'other-firm', action: 'Review document', firmId: 'f2' }),
                reminder({ id: 'hidden', action: 'Review document', hiddenAt: '2026-10-01' }),
            ],
        })
        expect(work.needsYou.map((n) => n.id)).toEqual(['reminder:mention'])
        expect(work.dueSoon.map((d) => d.id)).toEqual(['reminder:follow'])
    })
})
