import { describe, it, expect, vi, beforeEach } from 'vitest'

// Making a document private (lib/files/private-documents.ts). The rule the ⋮ menu shows is enforced here,
// and the change takes effect: a client loses the file, and gets it back where its stage would have it.

const { st, calls } = vi.hoisted(() => ({
    st: { rows: [] as any[], role: 'eng_admin' as string, deliverable: null as null | { id: string } },
    calls: {
        saved: [] as { id: string; settings: any }[],
        revoked: [] as any[],
        restored: [] as any[],
        sent: [] as any[],
        synced: [] as string[],
        holding: [] as { projectDocumentId: string }[],
    },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: st.role }),
    isEngagementLeadRole: (role: string) => role === 'eng_admin',
}))
vi.mock('@/lib/file-utils', () => ({ getFileInfo: async (_p: string, id: string) => ({ externalId: `ext-${id}` }) }))
vi.mock('@/lib/files/deliverable-of', () => ({ deliverableOf: async () => st.deliverable }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: async (name: string, data: unknown) => { calls.sent.push({ name, data }) } }))
vi.mock('@/lib/sync-document-sharing', () => ({ syncDocumentSharingUsers: async (id: string) => { calls.synced.push(id) } }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagementDocument: {
            findFirst: async ({ where }: any) => {
                const row = st.rows.find((r) => r.externalId === where.externalId)
                return row ? { firmId: 'f', ...row } : null
            },
            findMany: async () => st.rows,
            update: async ({ where, data }: any) => {
                calls.saved.push({ id: where.id, settings: data.settings })
                st.rows = st.rows.map((r) => (r.id === where.id ? { ...r, settings: data.settings } : r))
            },
        },
        engagementDocumentSharingUser: {
            findMany: async () => calls.holding,
            updateMany: async (args: any) => {
                ;(args.data.sharingPermissionStatus === 'REVOKED' ? calls.revoked : calls.restored).push(args)
                return { count: 1 }
            },
        },
    },
}))

import { PATCH } from './route'

const row = (id: string, settings: object = {}, extra: object = {}) => ({ id, externalId: `ext-${id}`, parentId: 'ext-D', isFolder: false, settings, ...extra })
const deliverable = (share: object = {}) => row('D', { share: { createdAt: 'x', ...share } }, { parentId: null, isFolder: true })
const body = (json: object) => ({ text: async () => JSON.stringify(json) }) as any
const patch = (id: string, makePrivate: boolean) =>
    PATCH(body({ private: makePrivate }), { params: Promise.resolve({ projectId: 'p', documentId: id }) })

beforeEach(() => {
    st.rows = []
    st.role = 'eng_admin'
    st.deliverable = null
    for (const list of Object.values(calls)) list.length = 0
})

describe('making a document internal only', () => {
    beforeEach(() => { st.deliverable = { id: 'D' } })

    it('is for leads only', async () => {
        st.role = 'eng_member'
        st.rows = [row('a')]
        expect((await patch('a', true)).status).toBe(403)
        expect(calls.saved).toEqual([])
    })

    it('marks it private', async () => {
        st.rows = [row('a')]
        expect((await patch('a', true)).status).toBe(200)
        expect(calls.saved[0].settings.lock).toEqual({ type: 'private' })
    })

    it.each([
        ['externalCollaborator', { share: { externalCollaborator: { enabled: true } } }],
        ['guest', { share: { guest: { enabled: true } } }],
    ])('is refused once it is shared with clients (%s)', async (_label, settings) => {
        st.rows = [row('a', settings)]
        const res = await patch('a', true)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe("A shared document can't be made internal only. Turn off sharing first.")
        expect(calls.saved).toEqual([])
    })

    it('is refused for a folder holding a shared document', async () => {
        st.rows = [
            row('fo', {}, { parentId: null, isFolder: true }),
            row('sub', {}, { parentId: 'ext-fo', isFolder: true }),
            row('a', { share: { guest: { enabled: true } } }, { parentId: 'ext-sub' }),
        ]
        const res = await patch('fo', true)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('This folder holds shared documents. Turn off their sharing first.')
    })

    it.each([
        ['a file', row('a', {}, { parentId: null })],
        ['a folder', row('a', {}, { parentId: null, isFolder: true })],
    ])('is refused for %s outside a deliverable, where the mark would hide nothing', async (_kind, loose) => {
        st.deliverable = null
        st.rows = [loose]
        const res = await patch('a', true)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('Only files and folders inside a deliverable can be made internal only.')
        expect(calls.saved).toEqual([])
    })

    it('is refused for a deliverable itself, whose card is meant to be seen', async () => {
        st.deliverable = null
        st.rows = [deliverable()]
        const res = await patch('D', true)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('Only files and folders inside a deliverable can be made internal only.')
    })

    it('is refused inside an approved deliverable', async () => {
        st.deliverable = { id: 'D' }
        st.rows = [deliverable({ finalizedAt: '2026-11-01' }), row('a')]
        const res = await patch('a', true)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe('Approved deliverables cannot be reorganized.')
    })

    it.each([
        ['finalize', "A finalized document can't be made internal only. Return it to draft first."],
        ['intake', "A document pending review can't be made internal only."],
    ])('never replaces a %s lock', async (type, message) => {
        st.rows = [row('a', { lock: { type } })]
        const res = await patch('a', true)
        expect(res.status).toBe(409)
        expect((await res.json()).error).toBe(message)
        expect(calls.saved).toEqual([])
    })

    it("revokes clients' rows on it and all it holds, and takes back the Drive permissions they hold", async () => {
        st.rows = [row('fo', {}, { parentId: null, isFolder: true }), row('a', {}, { parentId: 'ext-fo' }), row('z', {}, { parentId: null })]
        calls.holding = [{ projectDocumentId: 'a' }]
        await patch('fo', true)

        const where = calls.revoked[0].where
        expect(where.projectDocumentId.in.sort()).toEqual(['a', 'fo'])
        expect(where.member.role.in).toEqual(['eng_ext_collaborator', 'eng_viewer'])
        expect(where.sharingPermissionStatus.in).toEqual(['GRANTED', 'INHERITED'])
        // The revoke job needs the permission ids, so this leaves them for it.
        expect(calls.revoked[0].data).not.toHaveProperty('connectorPermissionId')
        expect(calls.sent).toEqual([{
            name: 'sharing.settings.updated',
            data: expect.objectContaining({ documentId: 'ext-a', sharingId: 'a', organizationId: 'f', disabledPersonas: ['guest', 'externalCollaborator'] }),
        }])
    })

    it('sends no revoke job when no client holds a permission', async () => {
        st.rows = [row('a')]
        await patch('a', true)
        expect(calls.sent).toEqual([])
    })
})

describe('removing internal only', () => {
    const PRIVATE = { lock: { type: 'private' } }

    it('clears the mark', async () => {
        st.rows = [row('a', { ...PRIVATE, description: 'kept' })]
        expect((await patch('a', false)).status).toBe(200)
        expect(calls.saved[0].settings).toEqual({ description: 'kept' })
    })

    it.each(['finalize', 'intake'])('never lifts a %s lock', async (type) => {
        st.rows = [row('a', { lock: { type } })]
        expect((await patch('a', false)).status).toBe(200)
        expect(calls.saved).toEqual([])
    })

    it('shares nothing for a file outside a deliverable, whatever its stage', async () => {
        st.rows = [row('a', { ...PRIVATE, activity: { status: 'in_review' } })]
        await patch('a', false)
        expect(calls.saved).toHaveLength(1)
        expect(calls.synced).toEqual([])
        expect(calls.restored).toEqual([])
    })

    it('opens it to the roles its stage opens, inside a deliverable', async () => {
        st.deliverable = { id: 'D' }
        st.rows = [deliverable({ externalCollaborator: { enabled: true }, guest: { enabled: true } }), row('a', { ...PRIVATE, activity: { status: 'in_progress' } })]
        await patch('a', false)
        const { share } = calls.saved.at(-1)!.settings
        expect(share.externalCollaborator.enabled).toBe(true)
        expect(share.guest?.enabled).not.toBe(true)
        expect(calls.synced).toEqual(['a'])
    })

    it('keeps it from clients while its stage opens to none', async () => {
        st.deliverable = { id: 'D' }
        st.rows = [deliverable({ externalCollaborator: { enabled: true } }), row('a', { ...PRIVATE, activity: { status: 'to_do' } })]
        await patch('a', false)
        expect(calls.saved).toHaveLength(1)
        expect(calls.synced).toEqual([])
    })

    it('returns the rows it took back, for the roles the deliverable still shares with', async () => {
        st.deliverable = { id: 'D' }
        st.rows = [deliverable({ guest: { enabled: true } }), row('a', PRIVATE)]
        await patch('a', false)
        expect(calls.restored[0].where).toMatchObject({
            projectDocumentId: { in: ['a'] },
            sharingPermissionStatus: 'REVOKED',
            member: { role: { in: ['eng_viewer'] } },
        })
        expect(calls.restored[0].data).toMatchObject({ sharingPermissionStatus: 'INHERITED', connectorPermissionId: null })
    })

    it('leaves private what stays private inside it', async () => {
        st.deliverable = { id: 'D' }
        st.rows = [
            deliverable({ guest: { enabled: true } }),
            row('fo', PRIVATE, { isFolder: true }),
            row('open', { activity: { status: 'in_review' } }, { parentId: 'ext-fo' }),
            row('kept', { ...PRIVATE, activity: { status: 'in_review' } }, { parentId: 'ext-fo' }),
        ]
        await patch('fo', false)
        expect(calls.restored[0].where.projectDocumentId.in.sort()).toEqual(['fo', 'open'])
        expect(calls.synced).toEqual(['open'])
    })
})
