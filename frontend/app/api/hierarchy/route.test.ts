/**
 * /api/hierarchy hands out a firm's first client/engagement slugs (for demo-tour deep links).
 * These tests pin its access rule: firm members only, and only what they are a member of —
 * it used to answer for any firm slug to any signed-in user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const firmFindUnique = vi.fn()
const firmMemberFindFirst = vi.fn()
const clientFindMany = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    firm: { findUnique: (...a: unknown[]) => firmFindUnique(...a) },
    firmMember: { findFirst: (...a: unknown[]) => firmMemberFindFirst(...a) },
    client: { findMany: (...a: unknown[]) => clientFindMany(...a) },
  },
}))

async function call(firmSlug = 'acme') {
  const { GET } = await import('./route')
  return GET(new NextRequest(`http://localhost/api/hierarchy?firmSlug=${firmSlug}`))
}

describe('GET /api/hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    firmFindUnique.mockResolvedValue({ id: 'firm-1' })
    firmMemberFindFirst.mockResolvedValue({ id: 'fm-1' })
    clientFindMany.mockResolvedValue([{ slug: 'client-1', engagements: [{ slug: 'eng-1' }] }])
  })

  it('rejects anonymous callers', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await call()
    expect(res.status).toBe(401)
    expect(firmFindUnique).not.toHaveBeenCalled()
  })

  it('tells a non-member nothing, exactly as for an unknown slug', async () => {
    firmMemberFindFirst.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clients: [] })
    expect(clientFindMany).not.toHaveBeenCalled()
    expect(firmMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', firmId: 'firm-1' } }),
    )

    firmFindUnique.mockResolvedValue(null)
    const unknown = await call('nope')
    expect(await unknown.json()).toEqual({ clients: [] })
  })

  it("only considers the member's own clients and engagements", async () => {
    const res = await call()
    expect(await res.json()).toEqual({ clients: [{ slug: 'client-1', engagements: [{ slug: 'eng-1' }] }] })

    const args = clientFindMany.mock.calls[0][0]
    expect(args.where).toMatchObject({
      firmId: 'firm-1',
      deletedAt: null,
      OR: [
        { members: { some: { userId: 'user-1' } } },
        { engagements: { some: { isDeleted: false, members: { some: { userId: 'user-1' } } } } },
      ],
    })
    expect(args.select.engagements.where).toEqual({
      isDeleted: false,
      members: { some: { userId: 'user-1' } },
    })
  })
})
