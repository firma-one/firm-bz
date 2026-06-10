/**
 * Tests for the storeConnection dedup behaviour in GoogleDriveConnector.
 *
 * Critical risk (plan step 4): the findFirst WHERE clause must change from
 * { type, userId } to { type, userId, externalAccountId } when the unique
 * constraint is relaxed. Getting this wrong silently overwrites a connector
 * row that belongs to a different Google account.
 *
 * These tests enforce the CORRECT post-refactor behaviour. They will fail
 * against the current implementation (which uses the old { type, userId } key)
 * and should be made to pass as part of step 4.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorStatus, ConnectorType } from '@prisma/client'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockConnectorFindFirst = vi.fn()
const mockConnectorCreate = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockClientUpdate = vi.fn()
const mockFirmUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connector: {
      findFirst: (...a: unknown[]) => mockConnectorFindFirst(...a),
      create: (...a: unknown[]) => mockConnectorCreate(...a),
      update: (...a: unknown[]) => mockConnectorUpdate(...a),
    },
    client: { update: (...a: unknown[]) => mockClientUpdate(...a) },
    firm: { update: (...a: unknown[]) => mockFirmUpdate(...a) },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2025-01-01T00:00:00Z')

function makeExistingConnector(overrides: Partial<{ id: string; externalAccountId: string; settings: unknown }> = {}) {
  return {
    id: 'existing-conn-1',
    type: ConnectorType.GOOGLE_DRIVE,
    userId: 'user-supabase-1',
    externalAccountId: 'google-account-A',
    status: ConnectorStatus.ACTIVE,
    settings: {},
    ...overrides,
  }
}

async function callStoreConnection(overrides: Partial<{
  organizationId: string
  userId: string
  externalAccountId: string
  clientId: string
}> = {}) {
  const { GoogleDriveConnector } = await import('@/lib/google-drive-connector')
  const instance = GoogleDriveConnector.getInstance()
  return instance.storeConnection(
    overrides.organizationId ?? 'firm-1',
    overrides.userId ?? 'user-supabase-1',
    overrides.externalAccountId ?? 'google-account-A',
    'Alice',
    'access-token',
    'refresh-token',
    BASE_DATE,
    undefined,
    undefined,
    'alice@example.com',
    overrides.clientId,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('storeConnection — dedup key (post-refactor: [type, userId, externalAccountId])', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })
    mockConnectorUpdate.mockResolvedValue({ id: 'existing-conn-1', settings: {} })
    mockClientUpdate.mockResolvedValue({})
    mockFirmUpdate.mockResolvedValue({})
  })

  it('finds existing connector by type + userId + externalAccountId (not just type + userId)', async () => {
    mockConnectorFindFirst.mockResolvedValue(makeExistingConnector())

    await callStoreConnection({ externalAccountId: 'google-account-A' })

    expect(mockConnectorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: ConnectorType.GOOGLE_DRIVE,
          userId: 'user-supabase-1',
          externalAccountId: 'google-account-A',
        }),
      })
    )
  })

  it('updates existing row when same account reconnects (no duplicate created)', async () => {
    mockConnectorFindFirst.mockResolvedValue(makeExistingConnector({ externalAccountId: 'google-account-A' }))

    await callStoreConnection({ externalAccountId: 'google-account-A' })

    expect(mockConnectorUpdate).toHaveBeenCalledOnce()
    expect(mockConnectorCreate).not.toHaveBeenCalled()
  })

  it('creates a NEW row when same userId connects a DIFFERENT account (core use-case)', async () => {
    // findFirst returns null because no row exists for this externalAccountId
    mockConnectorFindFirst.mockResolvedValue(null)

    await callStoreConnection({ externalAccountId: 'google-account-B' })

    expect(mockConnectorCreate).toHaveBeenCalledOnce()
    expect(mockConnectorUpdate).not.toHaveBeenCalled()
  })

  it('does NOT overwrite account-A connector when account-B connects for the same user', async () => {
    // findFirst scoped to account-B returns null — account-A row must be untouched
    mockConnectorFindFirst.mockResolvedValue(null)

    await callStoreConnection({ externalAccountId: 'google-account-B' })

    // update must not be called with account-A's connector id
    const updateCalls = mockConnectorUpdate.mock.calls
    const wrongUpdate = updateCalls.find(([arg]) => arg?.where?.id === 'existing-conn-1')
    expect(wrongUpdate).toBeUndefined()
  })

  it('links the client when clientId is provided (post-refactor: Client.connectorId set)', async () => {
    mockConnectorFindFirst.mockResolvedValue(null)
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection({ clientId: 'client-42' })

    expect(mockClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-42' },
        data: expect.objectContaining({ connectorId: 'new-conn' }),
      })
    )
  })

  it('links the client when clientId is provided and existing connector is reused', async () => {
    mockConnectorFindFirst.mockResolvedValue(makeExistingConnector())

    await callStoreConnection({ clientId: 'client-99' })

    expect(mockClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-99' },
        data: expect.objectContaining({ connectorId: 'existing-conn-1' }),
      })
    )
  })

  it('does NOT write firm.connectorId (firm-link writes removed in step 4)', async () => {
    mockConnectorFindFirst.mockResolvedValue(null)
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection()

    // firm.update should not be called to set connectorId on the firm
    expect(mockFirmUpdate).not.toHaveBeenCalled()
  })

  it('does NOT write firm.connectorId on update path either', async () => {
    mockConnectorFindFirst.mockResolvedValue(makeExistingConnector())

    await callStoreConnection()

    expect(mockFirmUpdate).not.toHaveBeenCalled()
  })

  it('skips client link when no clientId is provided', async () => {
    mockConnectorFindFirst.mockResolvedValue(null)
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection({ clientId: undefined })

    expect(mockClientUpdate).not.toHaveBeenCalled()
  })
})

// ── OAuth callback — clientId threading ───────────────────────────────────

describe('storeConnection — clientId threading through OAuth state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })
    mockConnectorUpdate.mockResolvedValue({ id: 'existing-conn-1', settings: {} })
    mockClientUpdate.mockResolvedValue({})
    mockFirmUpdate.mockResolvedValue({})
  })

  it('state object can carry clientId alongside organizationId', () => {
    const state = {
      userId: 'user-1',
      organizationId: 'firm-1',
      clientId: 'client-abc',
      flow: 'popup',
    }
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64')
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    expect(decoded.clientId).toBe('client-abc')
    expect(decoded.organizationId).toBe('firm-1')
  })

  it('clientId is undefined when absent from state (graceful omission)', () => {
    const state = { userId: 'user-1', organizationId: 'firm-1', flow: 'redirect' }
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64')
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    expect(decoded.clientId).toBeUndefined()
  })
})
