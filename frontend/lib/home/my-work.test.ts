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
        client: { name: 'Contoso', slug: 'contoso', firmId: 'f1' }, members: [{ role }], ...over,
    }
}

function reminder(over: Partial<ReminderWithContext>): ReminderWithContext {
    return {
        id: 'r', entityKey: 'platform.engagements', entityValue: 'x', action: 'Follow-up', dateKey: 'dueDate', dateValue: soon.toISOString(),
        hiddenAt: null, entityName: 'Thing', entitySlug: null, firmSlug: 'acme', firmId: 'f1', ctaUrl: '/go', delta: 3,
        label: 'Due in 3 days', labelStyle: 'slate', ...over,
    }
}

const ACME = { id: 'f1', name: 'Acme', slug: 'acme', groupSlug: 'g' }
const BETA = { id: 'f2', name: 'Beta', slug: 'beta', groupSlug: 'h' }
const base = { userId: 'u1', firms: [ACME], reminders: [] as ReminderWithContext[] }

/** $queryRaw is a tagged template: identify which query ran by its SQL text. */
const IS_REVIEW = "'status' = 'in_review'"
const IS_CHANGES = "'DOCUMENT_STATUS_CHANGED'"
const IS_COMMENTS = 'doc_comment_messages'
function routeRaw(results: { review?: unknown[]; intake?: unknown[]; assigned?: unknown[]; changes?: unknown[]; comments?: unknown[] }) {
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
        const sql = strings.join('?')
        if (sql.includes(IS_CHANGES)) return Promise.resolve(results.changes ?? [])
        if (sql.includes(IS_COMMENTS)) return Promise.resolve(results.comments ?? [])
        if (sql.includes(IS_REVIEW)) return Promise.resolve(results.review ?? [])
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
    it('starts from the caller\'s own engagement memberships in the given firms', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([])
        await getMyWork({ ...base, firms: [ACME, BETA] })
        expect(prisma.engagement.findMany.mock.calls[0][0].where).toEqual({
            isDeleted: false,
            client: { firmId: { in: ['f1', 'f2'] } },
            members: { some: { userId: 'u1' } },
        })
    })

    it('queries nothing when there are no firms', async () => {
        expect(await getMyWork({ ...base, firms: [] })).toEqual({ engagements: [], needsYou: [], dueSoon: [] })
        expect(prisma.engagement.findMany).not.toHaveBeenCalled()
    })

    it('links each engagement under its own firm and tags its items with that firm', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([
            eng('a', 'eng_member'),
            eng('b', 'eng_member', { client: { name: 'Globex', slug: 'globex', firmId: 'f2' } }),
        ])
        routeRaw({ assigned: [{ id: 'd1', engagementId: 'b', fileName: 'Return', dueDate: soon, status: 'to_do' }] })
        const work = await getMyWork({ ...base, firms: [ACME, BETA] })
        expect(work.engagements.map((e) => [e.href, e.firmId])).toEqual([
            ['/d/g/f/acme/c/contoso/e/a', 'f1'],
            ['/d/h/f/beta/c/globex/e/b', 'f2'],
        ])
        expect(work.dueSoon[0]).toMatchObject({ firmId: 'f2', href: '/d/h/f/beta/c/globex/e/b/shares/board' })
    })

    it('runs no approval queries for a user who leads nothing', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([eng('e1', 'eng_member')])
        const work = await getMyWork(base)
        const sqls = prisma.$queryRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join('?'))
        expect(sqls.some((s) => s.includes(IS_REVIEW))).toBe(false)
        expect(sqls.some((s) => s.includes("= 'PENDING'"))).toBe(false)
        expect(sqls.some((s) => s.includes(IS_COMMENTS))).toBe(false)
        expect(prisma.engagement.findMany).toHaveBeenCalledTimes(1)
        expect(work.needsYou).toEqual([])
    })

    it('limits approvals to engagements the caller leads', async () => {
        prisma.engagement.findMany
            .mockResolvedValueOnce([eng('lead', 'eng_admin'), eng('member', 'eng_member')])
        routeRaw({
            review: [{ id: 'd1', engagementId: 'lead', fileName: 'Q3 Report', updatedAt: past }],
            intake: [{ id: 'd2', engagementId: 'lead', fileName: 'Client upload', createdAt: past }],
        })
        const work = await getMyWork(base)
        const reviewCall = prisma.$queryRaw.mock.calls.find((c: any[]) => (c[0] as string[]).join('?').includes(IS_REVIEW))!
        expect(reviewCall).toContainEqual(['lead']) // only lead engagement ids are passed
        // No AI-summary item: drafts are published or discarded in one sitting, never left waiting.
        expect(work.needsYou.map((n) => n.kind)).toEqual(['deliverable_review', 'intake'])
        expect(work.needsYou[0]).toMatchObject({ title: 'Q3 Report', context: 'Contoso · Eng lead', href: '/d/g/f/acme/c/contoso/e/lead/shares/board' })
        expect(prisma.engagement.findMany).toHaveBeenCalledTimes(1)
    })
})

describe('getMyWork — what is waiting on you', () => {
    it('lists client comments no one has answered, for the lead, linked to the comment', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([eng('lead', 'eng_admin')])
        routeRaw({ comments: [{ id: 'm9', engagementId: 'lead', projectDocumentId: 'doc1', fileName: 'Draft memo', createdAt: past }] })
        const work = await getMyWork(base)
        expect(work.needsYou).toEqual([
            expect.objectContaining({
                id: 'comment:doc1', kind: 'client_comment', title: 'Draft memo', actionLabel: 'Reply',
                href: expect.stringContaining('/d/g/f/acme/c/contoso/e/lead'),
            }),
        ])
        expect(work.needsYou[0].href).toContain('m9')
    })

    it('lists changes requested on what the caller owns, hidden from an external role that may not see the stage', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([eng('int', 'eng_member'), eng('ev', 'eng_viewer')])
        routeRaw({
            changes: [
                { id: 'c1', engagementId: 'int', fileName: 'Pricing deck', eventAt: past },
                { id: 'c2', engagementId: 'ev', fileName: 'Hidden rework', eventAt: past },
            ],
        })
        const work = await getMyWork(base)
        const changesCall = prisma.$queryRaw.mock.calls.find((c: any[]) => (c[0] as string[]).join('?').includes(IS_CHANGES))!
        expect(changesCall).toContain('u1') // owned by the caller, sent back by someone else
        expect(work.needsYou.map((n) => [n.kind, n.title])).toEqual([['changes_requested', 'Pricing deck']])
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
    it('keeps only the given firms\' visible reminders: review requests and undated ones to Needs you, dated ones to Due soon', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([])
        const work = await getMyWork({
            ...base,
            reminders: [
                reminder({ id: 'mention', action: 'Review comment', entityName: 'Engagement letter' }),
                reminder({ id: 'follow', action: 'Follow-up', delta: 2 }),
                reminder({ id: 'far', action: 'Follow-up', delta: 40 }),
                reminder({ id: 'other-firm', action: 'Review document', firmId: 'f2' }),
                reminder({ id: 'hidden', action: 'Review document', hiddenAt: '2026-10-01' }),
                reminder({ id: 'reconnect', action: 'Reconnect Drive', dateKey: null, dateValue: null, delta: null }),
            ],
        })
        expect(work.needsYou.map((n) => n.id)).toEqual(['reminder:mention', 'reminder:reconnect'])
        expect(work.dueSoon.map((d) => d.id)).toEqual(['reminder:follow'])
    })

    it('a dated reminder due today or overdue needs you (counted, with its due label); one due later stays a deadline', async () => {
        const work = await getMyWork({
            ...base,
            reminders: [
                reminder({ id: 'kickoff', action: 'Engagement kickoff', delta: -18, label: '18 days overdue' }),
                reminder({ id: 'today', action: 'Follow-up', delta: 0, label: 'Today' }),
                reminder({ id: 'soon', action: 'Follow-up', delta: 2 }),
            ],
        })
        expect(work.needsYou.map((n) => n.id)).toEqual(['reminder:kickoff', 'reminder:today'])
        expect(work.needsYou[0]).toMatchObject({ dueLabel: '18 days overdue', overdue: true })
        expect(work.needsYou[1]).toMatchObject({ dueLabel: 'Today', overdue: false })
        expect(work.dueSoon.map((d) => d.id)).toEqual(['reminder:soon'])
    })
})

describe('getMyWork — client comments awaiting a reply', () => {
    it('counts the conversation with the client only: no internal notes, no resolved discussions', async () => {
        prisma.engagement.findMany.mockResolvedValueOnce([eng('e1', 'eng_admin')])
        await getMyWork(base)
        const sql = prisma.$queryRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join('?')).find((s) => s.includes(IS_COMMENTS))!
        expect(sql).toContain('"isInternal" = false')
        expect(sql).toContain('doc_comment_threads')
        expect(sql).toContain('"resolvedAt" IS NULL')
    })
})
