/**
 * The route's engagement list used to keep only engagements with a due date, so Engagement types
 * and the pipeline disagreed with "Active engagements" (types said 1 where there were 2).
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ENGAGEMENTS = [
  { id: 'e1', name: 'Dated', slug: 'dated', dueDate: new Date('2026-12-01'), kickoffDate: null, createdAt: new Date('2026-09-01'), status: 'ACTIVE', rateOrValue: null, contractType: 'Fixed Price', clientId: 'c1', client: { id: 'c1', name: 'Acme', slug: 'acme' } },
  { id: 'e2', name: 'Undated', slug: 'undated', dueDate: null, kickoffDate: null, createdAt: new Date('2026-09-01'), status: 'ACTIVE', rateOrValue: null, contractType: null, clientId: 'c1', client: { id: 'c1', name: 'Acme', slug: 'acme' } },
]

const engagementFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => (
  // The active list is the query with a status filter; the other is the all-time values one.
  args.where.status ? ENGAGEMENTS.filter((e) => !(args.where.dueDate && !e.dueDate)) : []
))

const CLIENTS = [
  { id: 'c1', name: 'Acme', slug: 'acme', status: 'ACTIVE', followUpDate: null, expectedCloseDate: null },
  { id: 'c2', name: 'Idle Co', slug: 'idle-co', status: 'ACTIVE', followUpDate: null, expectedCloseDate: null },
  { id: 'c3', name: 'Prospect Co', slug: 'prospect-co', status: 'PROSPECT', followUpDate: null, expectedCloseDate: null },
]
const invitationFindMany = vi.fn(async (args: { where: { status?: unknown } }) => (
  // The resend query asks for expired ones as well; the pending list doesn't.
  typeof args.where.status === 'object'
    ? [{ id: 'i1', email: 'jo@client.com', expireAt: new Date(Date.now() - 2 * 86400000), engagement: { id: 'e1', name: 'Dated', slug: 'dated', client: { slug: 'acme' } } }]
    : []
))

vi.mock('@/lib/prisma', () => {
  const model = { findMany: async () => [], count: async () => 0, groupBy: async () => [], findUnique: async () => null }
  return {
    prisma: new Proxy({}, {
      get: (_t, key) => key === 'engagement'
        ? { ...model, findMany: engagementFindMany, count: async () => ENGAGEMENTS.length }
        : key === 'client' ? { ...model, findMany: async () => CLIENTS }
        : key === 'engagementInvitation' ? { ...model, findMany: invitationFindMany }
        : model,
    }),
  }
})
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
vi.mock('@/lib/user-settings-plus', () => ({
  userSettingsPlus: {
    getUserSettingsPlus: async () => ({ permissions: { firms: [{ id: 'firm-a', scopes: { firm: ['can_manage'] }, clients: [] }] } }),
  },
}))
vi.mock('@/lib/actions/user-reminders', () => ({ getUserReminders: async () => [] }))
vi.mock('@/lib/insights/firm-engagement-rows', () => ({
  buildFirmEngagementRows: async (engs: { id: string }[]) => engs.map((e) => ({ engagementId: e.id })),
}))

describe('GET /api/firms/[firmId]/insights — engagement counts', () => {
  it('counts every active engagement, with a due date or not', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/firms/firm-a/insights'), { params: Promise.resolve({ firmId: 'firm-a' }) })
    const body = await res.json()
    expect(body.activeEngagements).toBe(2)
    expect(body.contractTypeBreakdown).toEqual(expect.arrayContaining([{ type: 'Fixed Price', count: 1 }, { type: 'Unspecified', count: 1 }]))
    expect(body.engagementRows).toHaveLength(2)
    // Only the dated one can be due soon.
    expect(body.engagementsDueSoon.map((e: { engagementId: string }) => e.engagementId)).not.toContain('e2')
  })

  it('lists active clients with no active engagement, and invitations to resend', async () => {
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/firms/firm-a/insights'), { params: Promise.resolve({ firmId: 'firm-a' }) })
    const body = await res.json()
    // Acme has engagements; a prospect isn't an idle client.
    expect(body.clientsWithoutEngagement.map((c: { clientName: string }) => c.clientName)).toEqual(['Idle Co'])
    expect(body.invitationsToResend).toEqual([expect.objectContaining({ email: 'jo@client.com', daysUntilExpiry: -2 })])
    // A prospect with no expected close date is one to decide on.
    expect(body.prospectsToDecide).toEqual([expect.objectContaining({ clientName: 'Prospect Co', expectedCloseDate: null, daysPast: null })])
  })
})
