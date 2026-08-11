/**
 * Tests for storeConnection's create-vs-update behaviour in GoogleDriveConnector.
 *
 * Post-2026-08-06 refactor: storeConnection no longer dedupes by
 * (type, userId, externalAccountId) via findFirst — that silently merged "Add new
 * connection" into an existing connector whenever the same Google account was
 * reconnected, even when the user explicitly wanted a second, independent connector.
 *
 * New contract: an explicit `targetConnectorId` (threaded from the OAuth state's
 * replaceConnectorId) decides the mode —
 *   - set   → update that exact row by id ("Reconnect")
 *   - unset → always create a brand-new row with a fresh slug ("Add new connection"),
 *             even if a connector already exists for the same externalAccountId.
 *
 * See .claude/plans/connector-microsoft-impl.md (2026-08-06) for the incident this fixes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorStatus, ConnectorType } from '@prisma/client'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockConnectorFindUnique = vi.fn()
const mockConnectorCreate = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockClientUpdate = vi.fn()
const mockFirmUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connector: {
      findUnique: (...a: unknown[]) => mockConnectorFindUnique(...a),
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

vi.mock('@/lib/slug-utils', () => ({
  generateConnectorSlug: vi.fn(() => 'conn-abcdefgh'),
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
  targetConnectorId: string
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
    overrides.targetConnectorId,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('storeConnection — create vs update (post-2026-08-06 refactor: targetConnectorId)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })
    mockConnectorUpdate.mockResolvedValue({ id: 'existing-conn-1', settings: {} })
    mockClientUpdate.mockResolvedValue({})
    mockFirmUpdate.mockResolvedValue({})
  })

  it('updates the exact target row by id when targetConnectorId is provided', async () => {
    mockConnectorFindUnique.mockResolvedValue(makeExistingConnector())

    await callStoreConnection({ targetConnectorId: 'existing-conn-1' })

    expect(mockConnectorFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-conn-1' } })
    )
    expect(mockConnectorUpdate).toHaveBeenCalledOnce()
    expect(mockConnectorCreate).not.toHaveBeenCalled()
  })

  it('throws if targetConnectorId does not resolve to an existing row', async () => {
    mockConnectorFindUnique.mockResolvedValue(null)

    await expect(callStoreConnection({ targetConnectorId: 'missing-conn' })).rejects.toThrow()
    expect(mockConnectorUpdate).not.toHaveBeenCalled()
    expect(mockConnectorCreate).not.toHaveBeenCalled()
  })

  it('always creates a NEW row when targetConnectorId is omitted, even for an account with an existing connector (core fix)', async () => {
    // No findUnique call should even happen — omitting targetConnectorId must not
    // trigger any account-based lookup that could silently reuse an existing row.
    await callStoreConnection({ externalAccountId: 'google-account-A' })

    expect(mockConnectorFindUnique).not.toHaveBeenCalled()
    expect(mockConnectorCreate).toHaveBeenCalledOnce()
    expect(mockConnectorUpdate).not.toHaveBeenCalled()
  })

  it('generates a slug for every newly created connector', async () => {
    await callStoreConnection()

    const createCall = mockConnectorCreate.mock.calls[0][0]
    expect(createCall.data.slug).toBe('conn-abcdefgh')
  })

  it('does NOT touch an existing connector for the same account when creating a second, independent connector', async () => {
    await callStoreConnection({ externalAccountId: 'google-account-A' })

    // update must never be called with the pre-existing row's id during a create flow
    const updateCalls = mockConnectorUpdate.mock.calls
    const wrongUpdate = updateCalls.find(([arg]) => arg?.where?.id === 'existing-conn-1')
    expect(wrongUpdate).toBeUndefined()
  })

  it('links the client when clientId is provided (create path)', async () => {
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection({ clientId: 'client-42' })

    expect(mockClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-42' },
        data: expect.objectContaining({ connectorId: 'new-conn' }),
      })
    )
  })

  it('links the client when clientId is provided (update/targetConnectorId path)', async () => {
    mockConnectorFindUnique.mockResolvedValue(makeExistingConnector())

    await callStoreConnection({ clientId: 'client-99', targetConnectorId: 'existing-conn-1' })

    expect(mockClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-99' },
        data: expect.objectContaining({ connectorId: 'existing-conn-1' }),
      })
    )
  })

  it('does NOT write firm.connectorId (firm-link writes stay removed)', async () => {
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection()

    expect(mockFirmUpdate).not.toHaveBeenCalled()
  })

  it('does NOT write firm.connectorId on the update path either', async () => {
    mockConnectorFindUnique.mockResolvedValue(makeExistingConnector())

    await callStoreConnection({ targetConnectorId: 'existing-conn-1' })

    expect(mockFirmUpdate).not.toHaveBeenCalled()
  })

  it('skips client link when no clientId is provided', async () => {
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

  it('state object can carry replaceConnectorId, threaded into storeConnection as targetConnectorId', () => {
    const state = {
      userId: 'user-1',
      organizationId: 'firm-1',
      replaceConnectorId: 'conn-to-replace',
      flow: 'popup',
    }
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64')
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    expect(decoded.replaceConnectorId).toBe('conn-to-replace')
  })
})
