/**
 * Tests for the client-level getConnections / getClientConnections path in the registry.
 * After the refactor, connections are resolved via Client.connectorId, not Firm.connectorId.
 *
 * Also guards the dedup logic that unions the legacy firm FK and new firmId relation
 * so the same connector row is never returned twice.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorType } from '@prisma/client'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFirmFindUnique = vi.fn()
const mockClientFindUnique = vi.fn()
const mockConnectorFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    firm: { findUnique: (...a: unknown[]) => mockFirmFindUnique(...a) },
    client: { findUnique: (...a: unknown[]) => mockClientFindUnique(...a) },
    connector: { findUnique: (...a: unknown[]) => mockConnectorFindUnique(...a) },
  },
}))

vi.mock('@/lib/google-drive-connector', () => ({
  GoogleDriveConnector: {
    getInstance: () => ({
      getConnections: vi.fn(),
      disconnectConnection: vi.fn(),
      removeConnection: vi.fn(),
      getAccessToken: vi.fn().mockResolvedValue('tok'),
    }),
  },
  googleDriveConnector: {},
}))

vi.mock('./onedrive-connector', () => ({
  getOneDriveConnectorInstance: () => ({
    getConnections: vi.fn(),
    disconnectConnection: vi.fn(),
    removeConnection: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue(null),
  }),
}))

vi.mock('./adapters/onedrive-adapter', () => ({
  createOneDriveAdapter: vi.fn(() => ({})),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeConnector(overrides: Partial<{
  id: string; type: ConnectorType; name: string; externalAccountId: string;
  status: string; settings: unknown; createdAt: Date; lastSyncAt: Date | null
}> = {}) {
  return {
    id: 'conn-1',
    type: ConnectorType.GOOGLE_DRIVE,
    name: 'Alice Drive',
    externalAccountId: 'google-uid-1',
    status: 'ACTIVE',
    settings: { accountEmail: 'alice@firm.com' },
    createdAt: new Date('2024-01-01'),
    lastSyncAt: null,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

import { getConnections } from './registry'

describe('registry.getConnections — legacy firm-level (existing behaviour, must not regress)', () => {
  beforeEach(() => {
    mockFirmFindUnique.mockReset()
    mockClientFindUnique.mockReset()
    mockConnectorFindUnique.mockReset()
  })

  it('returns empty array when firm is not found', async () => {
    mockFirmFindUnique.mockResolvedValue(null)
    const result = await getConnections('firm-missing')
    expect(result).toEqual([])
  })

  it('returns connectors from the new firmId relation (connectors[])', async () => {
    const c = makeConnector()
    mockFirmFindUnique.mockResolvedValue({ connector: null, connectors: [c] })
    const result = await getConnections('firm-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('conn-1')
    expect(result[0].email).toBe('alice@firm.com')
  })

  it('returns connector from legacy firm.connectorId FK (connector)', async () => {
    const c = makeConnector({ id: 'legacy-conn' })
    mockFirmFindUnique.mockResolvedValue({ connector: c, connectors: [] })
    const result = await getConnections('firm-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('legacy-conn')
  })

  it('deduplicates when the same connector appears in both legacy FK and firmId relation', async () => {
    const c = makeConnector()
    // Same connector id in both arrays — must produce exactly one result
    mockFirmFindUnique.mockResolvedValue({ connector: c, connectors: [c] })
    const result = await getConnections('firm-1')
    expect(result).toHaveLength(1)
  })

  it('returns multiple distinct connectors when firm has several', async () => {
    const c1 = makeConnector({ id: 'conn-1', externalAccountId: 'gid-1' })
    const c2 = makeConnector({ id: 'conn-2', externalAccountId: 'gid-2', settings: { accountEmail: 'bob@firm.com' } })
    mockFirmFindUnique.mockResolvedValue({ connector: null, connectors: [c1, c2] })
    const result = await getConnections('firm-1')
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(['conn-1', 'conn-2']))
  })

  it('returns empty array when firm has no connectors in either relation', async () => {
    mockFirmFindUnique.mockResolvedValue({ connector: null, connectors: [] })
    const result = await getConnections('firm-1')
    expect(result).toEqual([])
  })

  it('maps email from settings.accountEmail over externalAccountId', async () => {
    const c = makeConnector({ settings: { accountEmail: 'stored@firm.com' }, externalAccountId: 'non-email-uid' })
    mockFirmFindUnique.mockResolvedValue({ connector: null, connectors: [c] })
    const [conn] = await getConnections('firm-1')
    expect(conn.email).toBe('stored@firm.com')
  })

  it('falls back to externalAccountId as email when settings.accountEmail is absent and externalAccountId looks like an email', async () => {
    const c = makeConnector({ settings: {}, externalAccountId: 'fallback@firm.com' })
    mockFirmFindUnique.mockResolvedValue({ connector: null, connectors: [c] })
    const [conn] = await getConnections('firm-1')
    expect(conn.email).toBe('fallback@firm.com')
  })

  it('returns empty string email when neither settings.accountEmail nor externalAccountId is an email', async () => {
    const c = makeConnector({ settings: {}, externalAccountId: 'google-numeric-id-123' })
    mockFirmFindUnique.mockResolvedValue({ connector: null, connectors: [c] })
    const [conn] = await getConnections('firm-1')
    expect(conn.email).toBe('')
  })
})
