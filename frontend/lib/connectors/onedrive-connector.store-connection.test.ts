/**
 * Tests for storeConnection's create-vs-update behaviour in OneDriveConnector.
 *
 * Mirrors app/api/connectors/google-drive/store-connection.test.ts — see that file's header
 * comment for the full rationale. Post-2026-08-06 refactor: storeConnection no longer dedupes
 * by (type, userId, externalAccountId) via findFirst — an explicit `targetConnectorId`
 * (threaded from the OAuth state's replaceConnectorId) now decides create vs update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectorStatus, ConnectorType } from '@prisma/client'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockConnectorFindUnique = vi.fn()
const mockConnectorCreate = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockClientUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connector: {
      findUnique: (...a: unknown[]) => mockConnectorFindUnique(...a),
      create: (...a: unknown[]) => mockConnectorCreate(...a),
      update: (...a: unknown[]) => mockConnectorUpdate(...a),
    },
    client: { update: (...a: unknown[]) => mockClientUpdate(...a) },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/config', () => ({
  getMicrosoftOAuthServerCredentials: vi.fn(() => ({ clientId: 'x', clientSecret: 'y' })),
}))

vi.mock('@/lib/slug-utils', () => ({
  generateConnectorSlug: vi.fn(() => 'conn-abcdefgh'),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2025-01-01T00:00:00Z')

function makeExistingConnector(overrides: Partial<{ id: string; externalAccountId: string; settings: unknown }> = {}) {
  return {
    id: 'existing-conn-1',
    type: ConnectorType.ONEDRIVE,
    userId: 'user-supabase-1',
    externalAccountId: 'ms-account-A',
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
  const { OneDriveConnector } = await import('./onedrive-connector')
  const instance = OneDriveConnector.getInstance()
  return instance.storeConnection(
    overrides.organizationId ?? 'firm-1',
    overrides.userId ?? 'user-supabase-1',
    overrides.externalAccountId ?? 'ms-account-A',
    'Alice',
    'access-token',
    'refresh-token',
    BASE_DATE,
    'alice@example.com',
    overrides.clientId,
    'personal',
    undefined,
    undefined,
    undefined,
    overrides.targetConnectorId,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('OneDriveConnector.storeConnection — create vs update (targetConnectorId)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })
    mockConnectorUpdate.mockResolvedValue({ id: 'existing-conn-1', settings: {} })
    mockClientUpdate.mockResolvedValue({})
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
    await callStoreConnection({ externalAccountId: 'ms-account-A' })

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
    await callStoreConnection({ externalAccountId: 'ms-account-A' })

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

  it('skips client link when no clientId is provided', async () => {
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection({ clientId: undefined })

    expect(mockClientUpdate).not.toHaveBeenCalled()
  })

  it('does NOT overwrite workspaceRootLocation/workspaceRootSharedStorageId/Name on reconnect (regression, 2026-08-07)', async () => {
    // The OAuth callback always calls storeConnection with mode defaulted to 'personal' — it has
    // no way to know a connector's real Shared/SharePoint state at reconnect time. Before this
    // fix, the update path blindly wrote workspaceRootLocation from `mode`, silently resetting an
    // already-SharePoint-configured connector back to PERSONAL on every reconnect and orphaning
    // its stored rootFolderId (which still pointed at the SharePoint drive) — confirmed via a
    // live 404 "itemNotFound" resolving against /me/drive instead of /sites/{id}/drive.
    mockConnectorFindUnique.mockResolvedValue(makeExistingConnector({
      settings: { rootFolderId: 'sharepoint-folder-id' },
    }))

    await callStoreConnection({ targetConnectorId: 'existing-conn-1' })

    expect(mockConnectorUpdate).toHaveBeenCalledOnce()
    const updateCall = mockConnectorUpdate.mock.calls[0][0]
    expect(updateCall.data).not.toHaveProperty('workspaceRootLocation')
    expect(updateCall.data).not.toHaveProperty('workspaceRootSharedStorageId')
    expect(updateCall.data).not.toHaveProperty('workspaceRootSharedStorageName')
  })

  it('DOES set workspaceRootLocation/workspaceRootSharedStorageId/Name on create (brand-new connector has no prior state to preserve)', async () => {
    mockConnectorCreate.mockResolvedValue({ id: 'new-conn', settings: {} })

    await callStoreConnection()

    const createCall = mockConnectorCreate.mock.calls[0][0]
    expect(createCall.data).toHaveProperty('workspaceRootLocation')
    expect(createCall.data).toHaveProperty('workspaceRootSharedStorageId')
    expect(createCall.data).toHaveProperty('workspaceRootSharedStorageName')
  })
})
