/**
 * Tests for the shared-connector semantics introduced by the client-level refactor.
 *
 * Covers:
 *  - Share: linking an existing connector to a second client (no new row)
 *  - Disconnect: affects all clients sharing the connector (intended behaviour)
 *  - Cross-firm share guard: connector must belong to the same firm as the client
 *
 * These test the logic that will live in lib/actions/client.ts server actions
 * (plan step 5). Written against the expected function signatures so they can
 * be satisfied during implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorType, ConnectorStatus } from '@prisma/client'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockConnectorFindUnique = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockClientFindUnique = vi.fn()
const mockClientUpdate = vi.fn()
const mockClientUpdateMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connector: {
      findUnique: (...a: unknown[]) => mockConnectorFindUnique(...a),
      update: (...a: unknown[]) => mockConnectorUpdate(...a),
    },
    client: {
      findUnique: (...a: unknown[]) => mockClientFindUnique(...a),
      update: (...a: unknown[]) => mockClientUpdate(...a),
      updateMany: (...a: unknown[]) => mockClientUpdateMany(...a),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  })),
}))

const mockCanManageClient = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/permission-helpers', () => ({
  canManageClient: (...args: unknown[]) => mockCanManageClient(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeConnector(overrides: Partial<{
  id: string; firmId: string; type: ConnectorType; status: ConnectorStatus
}> = {}) {
  return {
    id: 'conn-1',
    firmId: 'firm-1',
    type: ConnectorType.GOOGLE_DRIVE,
    status: ConnectorStatus.ACTIVE,
    externalAccountId: 'google-uid-A',
    name: 'Alice Drive',
    ...overrides,
  }
}

function makeClient(overrides: Partial<{ id: string; firmId: string; connectorId: string | null }> = {}) {
  return {
    id: 'client-1',
    firmId: 'firm-1',
    connectorId: null,
    ...overrides,
  }
}

// ── Share existing connector ───────────────────────────────────────────────

describe('shareConnectorWithClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockConnectorUpdate.mockResolvedValue({})
    mockClientUpdate.mockResolvedValue({})
    mockCanManageClient.mockResolvedValue(true)
  })

  it('sets Client.connectorId to the shared connector id (no new row)', async () => {
    mockClientFindUnique.mockResolvedValue(makeClient({ firmId: 'firm-1' }))
    mockConnectorFindUnique.mockResolvedValue(makeConnector({ firmId: 'firm-1' }))

    const { shareConnectorWithClient } = await import('@/lib/actions/client')
    await shareConnectorWithClient({ clientId: 'client-1', connectorId: 'conn-1' })

    expect(mockClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-1' },
        data: { connectorId: 'conn-1' },
      })
    )
    // Must not create a new connector row
    expect(mockConnectorUpdate).not.toHaveBeenCalled()
  })

  it('rejects cross-firm share: connector.firmId must match client.firmId', async () => {
    mockClientFindUnique.mockResolvedValue(makeClient({ firmId: 'firm-1' }))
    mockConnectorFindUnique.mockResolvedValue(makeConnector({ firmId: 'firm-OTHER' }))

    const { shareConnectorWithClient } = await import('@/lib/actions/client')
    await expect(
      shareConnectorWithClient({ clientId: 'client-1', connectorId: 'conn-1' })
    ).rejects.toThrow()
  })

  it('throws when connector is not found', async () => {
    mockClientFindUnique.mockResolvedValue(makeClient())
    mockConnectorFindUnique.mockResolvedValue(null)

    const { shareConnectorWithClient } = await import('@/lib/actions/client')
    await expect(
      shareConnectorWithClient({ clientId: 'client-1', connectorId: 'missing' })
    ).rejects.toThrow()
  })

  it('throws when client is not found', async () => {
    mockClientFindUnique.mockResolvedValue(null)
    mockConnectorFindUnique.mockResolvedValue(makeConnector())

    const { shareConnectorWithClient } = await import('@/lib/actions/client')
    await expect(
      shareConnectorWithClient({ clientId: 'missing', connectorId: 'conn-1' })
    ).rejects.toThrow()
  })
})

// ── Disconnect ────────────────────────────────────────────────────────────

describe('disconnectClientConnector', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockConnectorUpdate.mockResolvedValue({})
    mockClientUpdateMany.mockResolvedValue({ count: 1 })
    mockCanManageClient.mockResolvedValue(true)
  })

  it('marks the Connector row REVOKED and clears its tokens', async () => {
    mockClientFindUnique.mockResolvedValue(makeClient({ connectorId: 'conn-1' }))
    mockConnectorFindUnique.mockResolvedValue(makeConnector())

    const { disconnectClientConnector } = await import('@/lib/actions/client')
    await disconnectClientConnector({ clientId: 'client-1' })

    expect(mockConnectorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          status: ConnectorStatus.REVOKED,
          accessToken: '',
          refreshToken: null,
        }),
      })
    )
  })

  it('keeps client.connectorId linked so the REVOKED card is visible for reconnect', async () => {
    // Design intent: the REVOKED state shows a Reconnect button — we keep the FK
    // so the card stays visible without an extra "remove" step.
    mockClientFindUnique.mockResolvedValue(makeClient({ connectorId: 'conn-1' }))
    mockConnectorFindUnique.mockResolvedValue(makeConnector())

    const { disconnectClientConnector } = await import('@/lib/actions/client')
    await disconnectClientConnector({ clientId: 'client-1' })

    // client.updateMany must NOT be called — we keep the FK intentionally
    expect(mockClientUpdateMany).not.toHaveBeenCalled()
  })

  it('throws when client has no connector (nothing to disconnect)', async () => {
    mockClientFindUnique.mockResolvedValue(makeClient({ connectorId: null }))

    const { disconnectClientConnector } = await import('@/lib/actions/client')
    await expect(disconnectClientConnector({ clientId: 'client-1' })).rejects.toThrow()
  })

  it('throws when client is not found', async () => {
    mockClientFindUnique.mockResolvedValue(null)

    const { disconnectClientConnector } = await import('@/lib/actions/client')
    await expect(disconnectClientConnector({ clientId: 'missing' })).rejects.toThrow()
  })
})
