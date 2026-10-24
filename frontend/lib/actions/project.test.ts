import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Changing an engagement's due date tells every other member, in the Inbox and — when it's due
 * within a day — by email. It never did: the rows read `hours` before it was declared and named
 * columns the table doesn't have, and the surrounding try swallowed both.
 */

const { prisma, notify } = vi.hoisted(() => ({
    prisma: {
        engagement: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
        engagementMember: { findMany: vi.fn() },
        notification: { createMany: vi.fn(async () => ({ count: 0 })) },
    },
    notify: {
        sendEventEmailToUser: vi.fn(async () => {}),
        buildAbsoluteUrl: (path: string | null | undefined) => (path ? `https://app.test${path}` : null),
    },
}))

const chain: unknown = new Proxy(() => chain, { get: () => () => chain })

vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/lib/notify-event', () => notify)
vi.mock('@/lib/permission-helpers', () => ({ canViewProjectSettings: vi.fn(async () => true) }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-lead' } } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ ensureFirmAgentUser: vi.fn() }))
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: vi.fn(async () => {}) }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveClientConnector: vi.fn() }))
vi.mock('@/lib/connectors/registry', () => ({ getStorageAdapter: vi.fn(), getPermissionAdapter: vi.fn() }))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({ ensureAppFolderStructure: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateEngagement } from './project'

beforeEach(() => {
    vi.clearAllMocks()
    prisma.engagement.findFirst.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => {
        if (select.status) {
            return {
                firmId: 'firm-1', clientId: 'client-1', dueDate: new Date('2026-11-01T12:00:00Z'), kickoffDate: null,
                status: 'ACTIVE', settings: {}, firm: { group: { slug: 'grp' } },
            }
        }
        if (select.slug) return { name: 'Q2 Go-To-Market', slug: 'q2-gtm', settings: {} }
        return { id: 'eng-1', firmId: 'firm-1', clientId: 'client-1' }
    })
    prisma.engagementMember.findMany.mockResolvedValue([{ userId: 'u-member' }, { userId: 'u-client' }])
})

describe('updateEngagement due-date notification', () => {
    it('tells every other member, with the engagement, its date as Nov 30, 2026 and a link', async () => {
        await updateEngagement('eng-1', { dueDate: '2026-11-30T12:00:00Z' }, 'acme', 'contoso')

        expect(prisma.engagementMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { engagementId: 'eng-1', userId: { not: 'u-lead' } },
        }))
        const { data } = (prisma.notification.createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }])[0]
        expect(data.map((r) => r.userId)).toEqual(['u-member', 'u-client'])
        expect(data[0]).toMatchObject({
            firmId: 'firm-1',
            clientId: 'client-1',
            engagementId: 'eng-1',
            type: 'PROJECT_DUE_DATE_SET',
            priority: 'WARNING',
            title: 'Engagement due date updated',
            body: 'Q2 Go-To-Market due on Nov 30, 2026',
            dedupeKey: 'project:eng-1:due:2026-11-30',
        })
        expect(data[0]).not.toHaveProperty('organizationId')
        expect(data[0]).not.toHaveProperty('projectId')
        expect(data[0].ctaUrl).toContain('q2-gtm')
        expect(notify.sendEventEmailToUser).not.toHaveBeenCalled()
    })

    it('is critical, and emailed, when due within a day', async () => {
        await updateEngagement('eng-1', { dueDate: new Date(Date.now() + 3 * 3600_000).toISOString() }, 'acme', 'contoso')

        const { data } = (prisma.notification.createMany.mock.calls[0] as unknown as [{ data: Record<string, unknown>[] }])[0]
        expect(data[0].priority).toBe('CRITICAL')
        expect(notify.sendEventEmailToUser).toHaveBeenCalledTimes(2)
        const render = (notify.sendEventEmailToUser.mock.calls[0] as unknown as [string, () => { subject: string; html: string }])[1]
        const { subject, html } = render()
        expect(subject).toBe('Engagement due soon')
        expect(html).toContain('Q2 Go-To-Market')
        expect(html).toContain('https://app.test/')
    })

    it('stays quiet when the date did not change', async () => {
        await updateEngagement('eng-1', { dueDate: '2026-11-01T12:00:00Z' }, 'acme', 'contoso')
        expect(prisma.notification.createMany).not.toHaveBeenCalled()
    })
})
