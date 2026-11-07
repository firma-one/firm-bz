import { beforeEach, describe, expect, it, vi } from 'vitest'

// A file outside any deliverable has a stage for the firm's own tracking: moving it must never open it
// to clients, which is what a deliverable document's forward move does.

const { update, sync, notify, members, queries } = vi.hoisted(() => ({
    queries: [] as string[],
    update: vi.fn(async (_args: unknown) => ({})),
    sync: vi.fn(async () => {}),
    notify: vi.fn(async (_rows: unknown[]) => {}),
    members: [{ userId: 'lead' }, { userId: 'staff-member' }],
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: { update },
        engagementMember: { findMany: async () => members },
        engagementDocumentSharingUser: { upsert: async () => ({}) },
        $queryRawUnsafe: async (query: string) => { queries.push(query); return [] },
    },
}))
vi.mock('@/lib/sync-document-sharing', () => ({ syncDocumentSharingUsers: sync }))
vi.mock('@/lib/audit', () => {
    const chain: any = new Proxy({}, { get: (_t, k) => (k === 'fireAndForget' ? () => {} : () => chain) })
    return { audit: () => chain, AUDIT_EVENT: {}, AUDIT_SCOPE: {} }
})
vi.mock('@/lib/firm-reminder-config', () => ({
    getFirmReminderConfig: async () => ({ events: { statusChanged: { inApp: true, email: false }, documentRejected: { inApp: true, email: false } } }),
}))
vi.mock('@/lib/notify-event', () => ({ createEventNotifications: notify, sendEventEmailToUser: vi.fn(), buildAbsoluteUrl: (url: string | null) => url }))
vi.mock('@/lib/reminders/entity-registry', () => ({ resolveEntity: async () => ({ name: 'Engagement', ctaUrl: '/d/g/f/a/c/b/e/x/shares' }) }))
vi.mock('@/lib/email-templates/document-status-changed', () => ({ renderDocumentStatusChangedEmail: vi.fn() }))

import { applyStageChange } from './apply-stage-change'

const ctx = { projectId: 'p', firmId: 'f', clientId: 'c', actorUserId: 'lead' }
const row = (settings: object = {}, createdBy: string | null = 'staff-member') => ({ id: 'd1', externalId: 'ext-d1', fileName: 'Plan.xlsx', settings, createdBy, isFolder: false })
const savedShare = () => ((update.mock.calls[0][0] as any).data.settings.share ?? {})
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    update.mockClear()
    sync.mockClear()
    notify.mockClear()
    queries.length = 0
})

describe('applyStageChange', () => {
    it("opens a deliverable's document to clients as it moves forward", async () => {
        await applyStageChange(row(), 'in_review', ctx)
        await settle()
        expect(savedShare().externalCollaborator.enabled).toBe(true)
        expect(savedShare().guest.enabled).toBe(true)
        expect(sync).toHaveBeenCalled()
    })

    it("stops at anything private when it writes sharing rows for what's inside a folder", async () => {
        await applyStageChange({ ...row(), isFolder: true }, 'in_review', ctx)
        await settle()
        expect(queries).toHaveLength(1)
        // In the starting rows and in the walk down, so a private folder hides all it holds.
        expect(queries[0].match(/<> 'private'/g)).toHaveLength(2)
    })

    it('never opens a file outside a deliverable to clients, at any stage', async () => {
        for (const stage of ['to_do', 'in_progress', 'in_review', 'approved'] as const) {
            update.mockClear()
            await applyStageChange(row(), stage, ctx, { internalOnly: true })
            expect(savedShare().externalCollaborator?.enabled).not.toBe(true)
            expect(savedShare().guest?.enabled).not.toBe(true)
        }
        await settle()
        expect(sync).not.toHaveBeenCalled()
    })

    it('still records the stage of a file outside a deliverable', async () => {
        await applyStageChange(row(), 'in_progress', ctx, { internalOnly: true })
        expect((update.mock.calls[0][0] as any).data.settings.activity.status).toBe('in_progress')
    })

    it('tells the firm, linking to the file in Files', async () => {
        await applyStageChange(row(), 'in_progress', ctx, { internalOnly: true })
        await vi.waitFor(() => expect(notify).toHaveBeenCalled())
        const rows = notify.mock.calls[0][0] as { userId: string; ctaUrl: string }[]
        expect(rows.map((r) => r.userId)).toEqual(['staff-member'])
        expect(rows[0].ctaUrl).toBe('/d/g/f/a/c/b/e/x/files#doc-file:d1')
    })

    it("doesn't tell a client who added the file that it was sent back", async () => {
        await applyStageChange(row({ activity: { status: 'in_review' } }, 'client-user'), 'in_progress', ctx, { internalOnly: true })
        await settle()
        expect(notify).not.toHaveBeenCalled()
    })

    it('tells a teammate who added the file that it was sent back', async () => {
        await applyStageChange(row({ activity: { status: 'in_review' } }), 'in_progress', ctx, { internalOnly: true })
        await vi.waitFor(() => expect(notify).toHaveBeenCalled())
        expect((notify.mock.calls[0][0] as { userId: string }[]).map((r) => r.userId)).toEqual(['staff-member'])
    })
})
