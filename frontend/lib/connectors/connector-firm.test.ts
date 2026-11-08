import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Root cause 9: a connector's firm comes from Connector.firmId, then a client, legacy Firm.connectorId last. */

const { db } = vi.hoisted(() => ({
    db: { connectorFirmId: null as string | null, clientFirmId: null as string | null, legacyFirm: null as any },
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        connector: { findUnique: vi.fn(async () => ({ firmId: db.connectorFirmId })) },
        client: { findFirst: vi.fn(async () => (db.clientFirmId ? { firmId: db.clientFirmId } : null)) },
        firm: {
            findFirst: vi.fn(async ({ where }: any) => {
                if (where.id) return { id: where.id, slug: where.id }
                return db.legacyFirm
            }),
        },
    },
}))

import { findFirmForConnector } from './connector-firm'

beforeEach(() => Object.assign(db, { connectorFirmId: null, clientFirmId: null, legacyFirm: null }))

describe('findFirmForConnector', () => {
    it("uses the connector's own firm first", async () => {
        db.connectorFirmId = 'f-owner'
        db.clientFirmId = 'f-client'
        expect((await findFirmForConnector('c1'))?.id).toBe('f-owner')
    })

    it("falls back to a client's firm", async () => {
        db.clientFirmId = 'f-client'
        expect((await findFirmForConnector('c1'))?.id).toBe('f-client')
    })

    it('reads the legacy Firm.connectorId only last', async () => {
        db.legacyFirm = { id: 'f-legacy' }
        expect((await findFirmForConnector('c1'))?.id).toBe('f-legacy')
    })
})
