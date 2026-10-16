/**
 * Drive alerts name engagements and flag risky or sensitive files firm-wide, and only firm admins
 * see the Action Center that renders them. External engagement users (EC/EV) also hold a
 * FirmMember row, so membership alone must not be enough to read alerts or trigger a scan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const getUserSettingsPlus = vi.fn()
const connectorFindFirst = vi.fn()
const firmUpdate = vi.fn()
const firmMemberFindFirst = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: (token: string) => getUser(token) } }),
}))

vi.mock('@/lib/google-drive-connector', () => ({
  googleDriveConnector: { listFiles: vi.fn() },
}))

vi.mock('@/lib/user-settings-plus', () => ({
  userSettingsPlus: { getUserSettingsPlus: (...a: unknown[]) => getUserSettingsPlus(...a) },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    connector: { findFirst: (...a: unknown[]) => connectorFindFirst(...a) },
    firm: { findUnique: vi.fn(async () => null), update: (...a: unknown[]) => firmUpdate(...a) },
    engagement: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    firmMember: { findFirst: (...a: unknown[]) => firmMemberFindFirst(...a) },
  },
}))

function withFirmScopes(firmScopes: string[] | null) {
  getUserSettingsPlus.mockResolvedValue({
    permissions: {
      firms: firmScopes ? [{ id: 'firm-1', scopes: { firm: firmScopes }, clients: [] }] : [],
    },
  })
}

function request(method: 'GET' | 'POST') {
  return new NextRequest('http://localhost/api/firms/firm-1/drive-alerts', {
    method,
    headers: { authorization: 'Bearer token-1' },
  })
}

const params = { params: Promise.resolve({ firmId: 'firm-1' }) }

describe('/api/firms/[firmId]/drive-alerts — access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    connectorFindFirst.mockResolvedValue(null)
    // An EC/EV user has a firm_member row — the old gate let them straight through.
    firmMemberFindFirst.mockResolvedValue({ id: 'fm-1', role: 'firm_member' })
  })

  it.each(['GET', 'POST'] as const)('%s refuses a firm member without can_manage', async (method) => {
    withFirmScopes(['can_view'])
    const { GET, POST } = await import('./route')
    const res = await (method === 'GET' ? GET : POST)(request(method), params)
    expect(res.status).toBe(403)
    expect(connectorFindFirst).not.toHaveBeenCalled()
    expect(firmUpdate).not.toHaveBeenCalled()
  })

  it('refuses a user outside the firm', async () => {
    withFirmScopes(null)
    const { GET } = await import('./route')
    const res = await GET(request('GET'), params)
    expect(res.status).toBe(403)
  })

  it('serves a firm admin', async () => {
    withFirmScopes(['can_view', 'can_edit', 'can_manage'])
    const { GET } = await import('./route')
    const res = await GET(request('GET'), params)
    expect(res.status).toBe(200)
    expect(connectorFindFirst).toHaveBeenCalled()
  })

  it('still requires a bearer token', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/firms/firm-1/drive-alerts'), params)
    expect(res.status).toBe(401)
  })
})
