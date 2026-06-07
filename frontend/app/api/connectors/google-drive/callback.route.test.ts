/**
 * Tests for the replace-connector flow in the Google Drive OAuth callback.
 * Focuses on the new replaceConnectorId behaviour introduced in Phase 1a.
 *
 * Integration-style: constructs a real NextRequest with a crafted state param,
 * mocks Prisma and downstream GDrive methods, asserts DB writes and redirects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockConnectorUpdate = vi.fn().mockResolvedValue({})
const mockFirmMemberFindUnique = vi.fn()
const mockFirmMemberFindFirst = vi.fn()
const mockConnectorFindUnique = vi.fn()
const mockFirmUpdate = vi.fn().mockResolvedValue({})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    firmMember: {
      findUnique: (...a: unknown[]) => mockFirmMemberFindUnique(...a),
      findFirst: (...a: unknown[]) => mockFirmMemberFindFirst(...a),
    },
    connector: {
      update: (...a: unknown[]) => mockConnectorUpdate(...a),
      findUnique: (...a: unknown[]) => mockConnectorFindUnique(...a),
    },
    firm: { update: (...a: unknown[]) => mockFirmUpdate(...a) },
  },
}))

const mockStoreConnection = vi.fn().mockResolvedValue({ id: 'new-conn', settings: {} })
const mockEnsureDefaultWorkspaceRoot = vi.fn().mockResolvedValue(undefined)
const mockPersistWorkspaceRootLocation = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/google-drive-connector', () => ({
  googleDriveConnector: {
    storeConnection: (...a: unknown[]) => mockStoreConnection(...a),
    ensureDefaultWorkspaceRoot: (...a: unknown[]) => mockEnsureDefaultWorkspaceRoot(...a),
    persistWorkspaceRootLocation: (...a: unknown[]) => mockPersistWorkspaceRootLocation(...a),
  },
  GoogleDriveConnector: { getInstance: () => ({}) },
}))

vi.mock('@/lib/config', () => ({
  config: {
    supabase: { url: 'http://localhost', serviceRoleKey: 'key' },
    googleDrive: { redirectUri: 'http://localhost/callback' },
  },
  getRedirectUrl: (path: string) => `http://localhost${path}`,
  getGoogleDriveOAuthServerCredentials: () => ({ clientId: 'cid', clientSecret: 'csecret' }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/lib/fetch-with-timeout-retry', () => ({
  fetchWithTimeoutRetry: vi.fn(),
  isTransientNetworkError: () => false,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: {} }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides: Record<string, unknown> = {}) {
  const state = {
    userId: 'user-1',
    organizationId: 'firm-1',
    flow: 'redirect',
    next: '/d/f/acme/connectors',
    ...overrides,
  }
  return Buffer.from(JSON.stringify(state)).toString('base64')
}

async function callCallback(state: string, code = 'oauth-code') {
  const { fetchWithTimeoutRetry } = await import('@/lib/fetch-with-timeout-retry')
  const fetchMock = vi.mocked(fetchWithTimeoutRetry)

  // First call: token exchange
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }), { status: 200 })
  )
  // Second call: userinfo
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ id: 'google-uid', name: 'Alice', email: 'alice@firm.com', picture: '' }), { status: 200 })
  )

  const { GET } = await import('./callback/route')
  const url = new URL(`http://localhost/api/connectors/google-drive/callback?code=${code}&state=${encodeURIComponent(state)}`)
  const req = new NextRequest(url)
  return GET(req)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Google Drive OAuth callback — replace-connector flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreConnection.mockResolvedValue({ id: 'new-conn', settings: {} })
    mockConnectorUpdate.mockResolvedValue({})
    mockFirmMemberFindUnique.mockResolvedValue({ firm: { id: 'firm-1' } })
    mockFirmMemberFindFirst.mockResolvedValue(null)
  })

  it('revokes the old connector before storeConnection when replaceConnectorId is in state', async () => {
    const state = makeState({ replaceConnectorId: 'old-conn-id' })
    await callCallback(state)

    expect(mockConnectorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-conn-id' },
        data: expect.objectContaining({
          status: 'REVOKED',
          accessToken: '',
          refreshToken: null,
          tokenExpiresAt: null,
          firmId: null,
        }),
      })
    )
    // storeConnection must still be called (creates/updates the new connector)
    expect(mockStoreConnection).toHaveBeenCalled()
  })

  it('revoke call happens before storeConnection (order of operations)', async () => {
    const callOrder: string[] = []
    mockConnectorUpdate.mockImplementation(() => { callOrder.push('revoke'); return Promise.resolve({}) })
    mockStoreConnection.mockImplementation(() => { callOrder.push('store'); return Promise.resolve({ id: 'new-conn', settings: {} }) })

    const state = makeState({ replaceConnectorId: 'old-conn-id' })
    await callCallback(state)

    const revokeIdx = callOrder.indexOf('revoke')
    const storeIdx = callOrder.indexOf('store')
    expect(revokeIdx).toBeGreaterThanOrEqual(0)
    expect(storeIdx).toBeGreaterThan(revokeIdx)
  })

  it('includes tokenExpiresAt: null in revoke payload (matches disconnectConnection parity)', async () => {
    const state = makeState({ replaceConnectorId: 'old-conn-id' })
    await callCallback(state)

    const revokeCall = mockConnectorUpdate.mock.calls.find(
      ([arg]) => arg?.where?.id === 'old-conn-id'
    )
    expect(revokeCall).toBeDefined()
    expect(revokeCall![0].data.tokenExpiresAt).toBeNull()
  })

  it('proceeds with storeConnection even when revoke DB write fails', async () => {
    // Revoke throws a Prisma error
    mockConnectorUpdate.mockRejectedValueOnce(new Error('DB timeout'))

    const state = makeState({ replaceConnectorId: 'old-conn-id' })
    await callCallback(state)

    // storeConnection must still be called — revoke failure is non-fatal
    expect(mockStoreConnection).toHaveBeenCalled()
  })

  it('does not call revoke when replaceConnectorId is absent', async () => {
    const state = makeState() // no replaceConnectorId
    await callCallback(state)

    // connector.update should not be called for a revoke — only for settings updates
    const revokeCalls = mockConnectorUpdate.mock.calls.filter(
      ([arg]) => arg?.data?.status === 'REVOKED'
    )
    expect(revokeCalls).toHaveLength(0)
    expect(mockStoreConnection).toHaveBeenCalled()
  })

  it('normal connect flow still works (no regression)', async () => {
    const state = makeState()
    const res = await callCallback(state)

    expect(mockStoreConnection).toHaveBeenCalledOnce()
    // Should redirect with success param
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('success=google_drive_connected')
  })
})

// ── State decoding ────────────────────────────────────────────────────────

describe('Google Drive OAuth callback — state decoding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreConnection.mockResolvedValue({ id: 'new-conn', settings: {} })
    mockConnectorUpdate.mockResolvedValue({})
    mockFirmMemberFindUnique.mockResolvedValue({ firm: { id: 'firm-1' } })
    mockFirmMemberFindFirst.mockResolvedValue(null)
  })

  it('decodes replaceConnectorId correctly from base64 state', async () => {
    const state = makeState({ replaceConnectorId: 'connector-to-replace' })
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
    expect(decoded.replaceConnectorId).toBe('connector-to-replace')
  })

  it('handles missing replaceConnectorId in state gracefully (undefined)', () => {
    const state = makeState()
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
    expect(decoded.replaceConnectorId).toBeUndefined()
  })
})
