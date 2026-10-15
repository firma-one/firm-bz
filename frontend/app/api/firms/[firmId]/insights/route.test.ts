/**
 * The Action Center's reminder buckets come from getUserReminders(), which is the caller's whole
 * cross-firm list. These tests pin the firm scoping: firm A's insights never carry a reminder
 * whose entity belongs to firm B (or to no firm at all).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ReminderWithContext } from '@/lib/actions/user-reminders'

const getUserRemindersMock = vi.fn()

vi.mock('@/lib/prisma', () => {
  // Every firm-wide query comes back empty — only the reminder buckets matter here.
  const model = {
    findMany: async () => [],
    count: async () => 0,
    groupBy: async () => [],
    findUnique: async () => null,
  }
  return { prisma: new Proxy({}, { get: () => model }) }
})

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

vi.mock('@/lib/user-settings-plus', () => ({
  userSettingsPlus: {
    getUserSettingsPlus: async () => ({
      permissions: {
        firms: [
          { id: 'firm-a', scopes: { firm: ['can_manage'] }, clients: [] },
          { id: 'firm-b', scopes: { firm: ['can_manage'] }, clients: [] },
        ],
      },
    }),
  },
}))

vi.mock('@/lib/actions/user-reminders', () => ({
  getUserReminders: (...a: unknown[]) => getUserRemindersMock(...a),
}))

function reminder(over: Partial<ReminderWithContext>): ReminderWithContext {
  return {
    id: 'r',
    entityKey: 'platform.clients.id',
    entityValue: 'client-1',
    action: 'Follow-up',
    dateKey: null,
    dateValue: null,
    hiddenAt: null,
    note: null,
    entityName: 'Acme',
    entitySlug: null,
    firmSlug: null,
    firmId: 'firm-a',
    ctaUrl: null,
    delta: -3,
    label: '3 days overdue',
    labelStyle: 'red',
    ...over,
  }
}

async function getInsights(firmId: string) {
  const { GET } = await import('./route')
  const res = await GET(new NextRequest(`http://localhost/api/firms/${firmId}/insights`), {
    params: Promise.resolve({ firmId }),
  })
  expect(res.status).toBe(200)
  return res.json()
}

describe('GET /api/firms/[firmId]/insights — reminder scoping', () => {
  beforeEach(() => {
    getUserRemindersMock.mockReset()
    getUserRemindersMock.mockResolvedValue([
      reminder({ id: 'a-urgent', firmId: 'firm-a', labelStyle: 'red' }),
      reminder({ id: 'b-urgent', firmId: 'firm-b', labelStyle: 'orange' }),
      reminder({ id: 'a-upcoming', firmId: 'firm-a', labelStyle: 'amber', delta: 0 }),
      reminder({ id: 'b-upcoming', firmId: 'firm-b', labelStyle: 'slate', delta: 2 }),
      // Entity deleted: no firm can claim it, so no firm's Action Center shows it.
      reminder({ id: 'orphan', firmId: null, labelStyle: 'red' }),
      reminder({ id: 'a-hidden', firmId: 'firm-a', labelStyle: 'red', hiddenAt: '2026-10-01T00:00:00Z' }),
    ])
  })

  it("keeps only the requested firm's reminders", async () => {
    const body = await getInsights('firm-a')
    expect(body.urgentReminders.map((r: ReminderWithContext) => r.id)).toEqual(['a-urgent'])
    expect(body.upcomingReminders.map((r: ReminderWithContext) => r.id)).toEqual(['a-upcoming'])
  })

  it('scopes the other way round too', async () => {
    const body = await getInsights('firm-b')
    expect(body.urgentReminders.map((r: ReminderWithContext) => r.id)).toEqual(['b-urgent'])
    expect(body.upcomingReminders.map((r: ReminderWithContext) => r.id)).toEqual(['b-upcoming'])
  })
})
