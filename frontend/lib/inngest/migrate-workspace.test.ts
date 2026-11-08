import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A workspace move that gives up is recorded as failed. Clearing maintenance closes the active migration,
 * and it used to close it as completed before `failed` could be written, so the run read as a success.
 */

const { db } = vi.hoisted(() => ({
    db: {
        settings: {} as Record<string, unknown>,
        migration: null as null | { id: string; status: string },
        statusWrites: [] as string[],
    },
}))

vi.mock('./client', () => ({
    inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
    safeInngestSend: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: vi.fn() } } }) }))
vi.mock('@/lib/connectors/trash-undo', () => ({ TRASH_UNDO_WINDOW_SECONDS: 60, wasRestoredFromBin: vi.fn() }))
vi.mock('@/lib/services/search-service', () => ({ SearchService: {} }))
vi.mock('@/lib/connectors/registry', () => ({ getPermissionAdapter: vi.fn(), getMigrationAdapter: vi.fn(), getConnectorInstance: vi.fn() }))
vi.mock('@/lib/prisma', () => {
    const active = (where: { status?: { in?: string[] } }) =>
        db.migration && (!where?.status?.in || where.status.in.includes(db.migration.status)) ? { ...db.migration, firmId: 'f1', connectorId: 'c', oldRootFolderId: null, newRootFolderId: 'n', initiatedBy: 'u', initiatedAt: new Date(), graceEndsAt: null, maintenanceStartedAt: null, maintenanceEndedAt: null, estimatedMinutes: null, inngestRunId: null } : null
    return {
        prisma: {
            firm: {
                findUnique: async () => ({ id: 'f1', settings: { ...db.settings } }),
                update: async ({ data }: { data: { settings: Record<string, unknown> } }) => { db.settings = data.settings; return {} },
            },
            firmWorkspaceMigration: {
                findFirst: async ({ where }: { where: { status?: { in?: string[] } } }) => active(where),
                update: async ({ data }: { data: { status: string } }) => {
                    db.statusWrites.push(data.status)
                    if (db.migration) db.migration.status = data.status
                    return {}
                },
            },
        },
    }
})

import { migrateWorkspaceRoot } from './functions'
import { setMaintenanceMode } from '@/lib/firm-maintenance'

const onFailure = (migrateWorkspaceRoot as unknown as { config: { onFailure: (ctx: unknown) => Promise<void> } }).config.onFailure

beforeEach(() => {
    db.settings = { maintenanceMode: { active: true }, migrationPending: { initiatedAt: 'now' }, other: 'kept' }
    db.migration = { id: 'm1', status: 'in_progress' }
    db.statusWrites = []
})

describe('a workspace move that gives up', () => {
    it('is recorded as failed, never completed', async () => {
        await onFailure({ error: new Error('Drive down'), event: { data: { event: { data: { firmId: 'f1' } } } } })
        expect(db.statusWrites).toEqual(['failed'])
        expect(db.migration?.status).toBe('failed')
    })

    it("clears maintenance and the pending banner without losing the firm's other settings", async () => {
        await onFailure({ error: new Error('Drive down'), event: { data: { event: { data: { firmId: 'f1' } } } } })
        expect(db.settings).toEqual({ maintenanceMode: null, migrationPending: null, other: 'kept' })
    })
})

describe('clearing maintenance', () => {
    it('closes the active migration as completed by default', async () => {
        await setMaintenanceMode('f1', null)
        expect(db.statusWrites).toEqual(['completed'])
    })

    it.each(['failed', 'failed_partial'] as const)('closes it as %s when the run says so', async (endStatus) => {
        await setMaintenanceMode('f1', null, { endStatus })
        expect(db.statusWrites).toEqual([endStatus])
    })
})
