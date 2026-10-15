/**
 * The firm calendar lists every dated document in the caller's engagements. For an external
 * member (EC/EV) that must stop at what they could open: their persona's shared subtree, and — for
 * deliverables — the stages their role may see (STAGE_ROLE_MAP). Internal members are unaffected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { externalCanSeeDocumentDueDate } from '@/lib/calendar-visibility'

const engagementFindMany = vi.fn()
const getSharedAndAncestorIdsForPersona = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
  }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/actions/user-reminders', () => ({ getReminderKeysForUser: async () => new Set<string>() }))
vi.mock('@/lib/engagement-sharing-ids', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/engagement-sharing-ids')>()),
  getSharedAndAncestorIdsForPersona: (...a: unknown[]) => getSharedAndAncestorIdsForPersona(...a),
}))

const DUE = new Date('2026-11-01T00:00:00Z')

function deliverable(id: string, status: string) {
  return {
    id,
    externalId: `x-${id}`,
    fileName: id,
    dueDate: DUE,
    isFolder: true,
    parentId: 'x-root',
    docId: null,
    settings: { share: { createdAt: '2026-01-01T00:00:00Z' }, activity: { status } },
  }
}

function file(id: string, parentExternalId: string) {
  return { id, externalId: `x-${id}`, fileName: id, dueDate: DUE, isFolder: false, parentId: parentExternalId, docId: null, settings: {} }
}

// D-wip is mid-flight (in_progress), D-todo has not started, D-review is with the client.
// F-in-wip sits inside D-wip; F-loose is unshared and outside any deliverable; F-shared is a file
// shared on its own, outside any deliverable.
const DOCS = [
  deliverable('D-wip', 'in_progress'),
  deliverable('D-todo', 'to_do'),
  deliverable('D-review', 'in_review'),
  file('F-in-wip', 'x-D-wip'),
  file('F-loose', 'x-root'),
  file('F-shared', 'x-root'),
]

vi.mock('@/lib/prisma', () => ({
  prisma: {
    firm: { findUnique: async () => ({ id: 'firm-1', group: { slug: 'grp' } }) },
    firmMember: { findFirst: async () => ({ id: 'fm-1' }) },
    engagement: { findMany: (...a: unknown[]) => engagementFindMany(...a) },
    engagementDocument: {
      findMany: async () =>
        DOCS.filter((d) => d.isFolder).map((d) => ({
          id: d.id, engagementId: 'eng-1', externalId: d.externalId, parentId: d.parentId, settings: d.settings,
        })),
    },
  },
}))

function engagementWithRole(role: string) {
  return {
    id: 'eng-1',
    name: 'Audit',
    slug: 'audit',
    clientId: 'client-1',
    status: 'ACTIVE',
    kickoffDate: null,
    dueDate: null,
    followUpDate: null,
    client: { name: 'Acme', slug: 'acme' },
    members: [{ role }],
    documents: DOCS,
  }
}

async function documentEventsFor(role: string) {
  engagementFindMany.mockResolvedValue([engagementWithRole(role)])
  const { getFirmCalendarData } = await import('./calendar')
  const data = await getFirmCalendarData('acme')
  return data.events.filter((e) => e.documentId).map((e) => e.documentId).sort()
}

describe('getFirmCalendarData — external members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSharedAndAncestorIdsForPersona.mockResolvedValue({
      sharedIds: ['x-D-wip', 'x-D-todo', 'x-D-review', 'x-F-shared'],
      ancestorIds: [],
      descendantIds: [],
      parentMap: new Map([
        ['x-F-in-wip', 'x-D-wip'],
        ['x-F-loose', 'x-root'],
        ['x-F-shared', 'x-root'],
      ]),
    })
  })

  it('shows internal members every dated document, without computing shares', async () => {
    expect(await documentEventsFor('eng_member')).toEqual(
      ['D-review', 'D-todo', 'D-wip', 'F-in-wip', 'F-loose', 'F-shared'],
    )
    expect(getSharedAndAncestorIdsForPersona).not.toHaveBeenCalled()
  })

  it('shows an external collaborator only shared work at in_progress or later', async () => {
    expect(await documentEventsFor('eng_ext_collaborator')).toEqual(['D-review', 'D-wip', 'F-in-wip', 'F-shared'])
    expect(getSharedAndAncestorIdsForPersona).toHaveBeenCalledWith('eng-1', 'eng_ext_collaborator', { skipDescendants: true })
  })

  it('shows a viewer only shared work at in_review or later', async () => {
    expect(await documentEventsFor('eng_viewer')).toEqual(['D-review', 'F-shared'])
  })

  it('shows an external member nothing that is not shared with their persona', async () => {
    getSharedAndAncestorIdsForPersona.mockResolvedValue({
      sharedIds: [], ancestorIds: [], descendantIds: [], parentMap: new Map(),
    })
    expect(await documentEventsFor('eng_ext_collaborator')).toEqual([])
  })
})

describe('externalCanSeeDocumentDueDate', () => {
  it('requires the shared subtree whatever the stage', () => {
    expect(externalCanSeeDocumentDueDate('eng_ext_collaborator', { inSharedSubtree: false, deliverableStage: 'approved' })).toBe(false)
    expect(externalCanSeeDocumentDueDate('eng_viewer', { inSharedSubtree: false, deliverableStage: null })).toBe(false)
  })

  it('applies the stage map inside a deliverable', () => {
    const ec = (stage: 'to_do' | 'in_progress' | 'in_review' | 'approved') =>
      externalCanSeeDocumentDueDate('eng_ext_collaborator', { inSharedSubtree: true, deliverableStage: stage })
    const ev = (stage: 'to_do' | 'in_progress' | 'in_review' | 'approved') =>
      externalCanSeeDocumentDueDate('eng_viewer', { inSharedSubtree: true, deliverableStage: stage })
    expect([ec('to_do'), ec('in_progress'), ec('in_review'), ec('approved')]).toEqual([false, true, true, true])
    expect([ev('to_do'), ev('in_progress'), ev('in_review'), ev('approved')]).toEqual([false, false, true, true])
  })

  it('has no stage gate outside a deliverable', () => {
    expect(externalCanSeeDocumentDueDate('eng_viewer', { inSharedSubtree: true, deliverableStage: null })).toBe(true)
  })
})
