import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** CN-7: Cancel answers an error once the migration has started, and puts the old root back when it can. */

const { db, maint } = vi.hoisted(() => ({
    db: { count: 1, connectorSettings: { rootFolderId: 'new-root' } as any, connectorUpdates: [] as any[] },
    maint: {
        active: null as any,
        pending: null as any,
        setPending: vi.fn(async () => undefined),
        setState: vi.fn(async () => undefined),
        setMode: vi.fn(async () => undefined),
    },
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }),
}))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        firmMember: { findFirst: vi.fn(async () => ({ role: 'firm_admin' })) },
        firmWorkspaceMigration: { updateMany: vi.fn(async () => ({ count: db.count })) },
        connector: {
            findUnique: vi.fn(async () => ({ settings: db.connectorSettings })),
            update: vi.fn(async (arg: any) => {
                db.connectorUpdates.push(arg)
                return {}
            }),
        },
    },
}))
vi.mock('@/lib/firm-maintenance', () => ({
    getMaintenanceMode: vi.fn(),
    getMigrationPending: vi.fn(async () => maint.pending),
    setMaintenanceMode: maint.setMode,
    setMigrationState: maint.setState,
    setMigrationPending: maint.setPending,
    getLatestMigration: vi.fn(),
    getActiveMigration: vi.fn(async () => maint.active),
    updateMigrationStatus: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { POST } from './route'

const act = (action: string) =>
    POST(
        new NextRequest(new URL('/api/firm/maintenance', 'http://localhost'), {
            method: 'POST',
            headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
            body: JSON.stringify({ action, firmId: 'f1' }),
        })
    )

beforeEach(() => {
    vi.clearAllMocks()
    db.count = 1
    db.connectorSettings = { rootFolderId: 'new-root' }
    db.connectorUpdates = []
    maint.active = null
    maint.pending = null
})

describe('cancel-migration', () => {
    it('answers "already started" once the migration is in progress, and clears nothing', async () => {
        maint.active = { id: 'm1', status: 'in_progress', connectorId: 'conn', oldRootFolderId: 'old-root', newRootFolderId: 'new-root' }
        const res = await act('cancel-migration')
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('The migration has already started.')
        expect(maint.setPending).not.toHaveBeenCalled()
    })

    it('answers "already started" when the job won the race', async () => {
        maint.active = { id: 'm1', status: 'pending_grace', connectorId: 'conn', oldRootFolderId: 'old-root', newRootFolderId: 'new-root' }
        db.count = 0
        expect((await act('cancel-migration')).status).toBe(409)
    })

    it('cancels during the grace period and puts the old workspace root back', async () => {
        maint.active = { id: 'm1', status: 'pending_grace', connectorId: 'conn', oldRootFolderId: 'old-root', newRootFolderId: 'new-root' }
        const res = await act('cancel-migration')
        expect(res.status).toBe(200)
        expect(db.connectorUpdates[0].data.settings).toMatchObject({ rootFolderId: 'old-root', parentFolderId: 'old-root' })
        expect(maint.setPending).toHaveBeenCalledWith('f1', null)
    })

    it('asks to try again while the job has not recorded the migration yet', async () => {
        maint.pending = { initiatedAt: new Date().toISOString(), estimatedStartMinutes: 2, initiatedBy: 'u1' }
        const res = await act('cancel-migration')
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('not_ready')
    })
})

describe('force-unlock', () => {
    it('says why when unlocking fails', async () => {
        maint.setMode.mockRejectedValueOnce(new Error('db down'))
        const res = await act('force-unlock')
        expect(res.status).toBe(500)
        expect((await res.json()).error).toMatch(/couldn't be unlocked/)
    })
})
