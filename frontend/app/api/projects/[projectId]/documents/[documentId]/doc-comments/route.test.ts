import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => ({ db: { messages: [] as any[], visible: null as Set<string> | null, findArgs: null as any } }))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/resolve-project-context', () => ({ resolveProjectContext: async () => ({ orgId: 'f', clientId: 'c', projectId: 'p' }) }))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true }))
vi.mock('@/lib/file-utils', () => ({ getProjectDocumentContext: async () => ({ id: 'd1', externalId: 'ext1' }) }))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => ({ role: 'eng_admin' }),
    visibleDocumentIdsFor: async () => db.visible,
    externalMemberCanAccessDocument: async () => true,
    isExternalEngagementRole: () => false,
}))
vi.mock('@/lib/comments/tagged-documents', () => ({ taggedDocumentsIn: async () => ({ 'QSR-14': { docId: 'QSR-14', fileName: 'Budget.xlsx', mimeType: null } }) }))
vi.mock('@/lib/ai/agent-email', () => ({ isAgentUserIdAsync: async () => false }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ loadAnchorForCaps: async () => null, effectiveCommentHistoryDays: () => null }))
vi.mock('@/lib/navigation/firm-paths', () => ({ engagementDocCommentPath: () => '/' }))
vi.mock('@/lib/firm-reminder-config', () => ({ getFirmReminderConfig: async () => ({}) }))
vi.mock('@/lib/notify-event', () => ({ createEventNotifications: vi.fn(), sendEventEmailToUser: vi.fn(), buildAbsoluteUrl: () => null }))
vi.mock('@/lib/email-templates/client-comment', () => ({ renderClientCommentEmail: () => ({}) }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        docCommentMessage: {
            findMany: async (args: any) => {
                db.findArgs = args
                const sorted = [...db.messages].sort((a, b) => (args.orderBy.createdAt === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
                return args.take ? sorted.slice(0, args.take) : sorted
            },
        },
    },
}))

import { GET } from './route'

const get = (qs = '') =>
    GET({ nextUrl: new URL(`http://x/api/projects/p/documents/d1/doc-comments${qs}`) } as any, { params: Promise.resolve({ projectId: 'p', documentId: 'd1' }) })

beforeEach(() => {
    db.visible = null
    db.messages = Array.from({ length: 7 }, (_, i) => ({
        id: `m${i + 1}`, createdAt: new Date(2026, 9, i + 1), authorUserId: null, content: `comment ${i + 1}`, reactions: {},
    }))
})

describe('GET /api/projects/[projectId]/documents/[documentId]/doc-comments', () => {
    it('returns the whole thread, oldest first, with the tagged documents the viewer may open', async () => {
        const data = await (await get()).json()
        expect(data.messages.map((m: any) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'])
        expect(data.taggedDocuments['QSR-14'].fileName).toBe('Budget.xlsx')
    })

    it('with ?limit=5, returns only the latest five, still oldest first', async () => {
        const data = await (await get('?limit=5')).json()
        expect(data.messages.map((m: any) => m.id)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7'])
        expect(db.findArgs.take).toBe(5)
    })

    it('keeps an external member out of a document not shared with them', async () => {
        db.visible = new Set(['other'])
        expect((await get()).status).toBe(404)
    })
})
