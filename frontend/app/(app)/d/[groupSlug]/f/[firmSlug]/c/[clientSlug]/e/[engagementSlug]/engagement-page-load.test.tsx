import { describe, it, expect, vi, beforeEach } from 'vitest'

// P1-69: the engagement page and its Board page, when looking the engagement up fails on our side.
// A database blip is not "404 · Page not found · you no longer have access": it says so, with Try
// again. A redirect from the lookup (signed out, firm gone) still happens, and a real miss is still a 404.

const { st } = vi.hoisted(() => ({
    st: { hierarchy: (async () => []) as () => Promise<unknown>, caps: {} as Record<string, boolean> },
}))

vi.mock('@/components/projects/engagement-workspace', () => ({ EngagementWorkspace: () => null }))
vi.mock('@/components/error-boundary', () => ({ ErrorBoundary: ({ children }: { children: unknown }) => children }))
vi.mock('@/lib/actions/hierarchy', () => ({ getFirmHierarchy: () => st.hierarchy(), getFirmName: async () => 'Acme' }))
vi.mock('@/lib/actions/personas', () => ({ getProjectPersonas: async () => [] }))
vi.mock('@/lib/actions/project', () => ({ getEngagementFolderIds: async () => null }))
vi.mock('@/lib/permission-helpers', () => ({ canAccessRbacAdmin: async () => false, canManageOrganization: async () => false, getProjectPersona: async () => 'eng_admin' }))
vi.mock('@/lib/view-as-server', () => ({ getViewAsPersonaFromCookie: async () => null }))
vi.mock('@/lib/permissions/resolve', () => ({ resolveProjectCapabilitiesForUser: async () => st.caps, resolveProjectCapabilitiesForPersona: async () => ({}) }))
vi.mock('@/lib/auth/session-user', () => ({ getSessionUser: async () => ({ id: 'me' }) }))
vi.mock('@/lib/prisma', () => ({ prisma: { firm: { findUnique: async () => ({ id: 'f', sandboxOnly: false, settings: {} }) } }, basePrisma: {} }))
vi.mock('@/lib/engagement-sharing-ids', () => ({ getAccessibleFileCountForPersona: async () => 0 }))
vi.mock('@/lib/comments/discussions', () => ({ countOpenDiscussions: async () => 0 }))
vi.mock('@/lib/recents', () => ({ getLastEngagementTab: async () => null }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { redirect } from 'next/navigation'
import EngagementPage from './[[...rest]]/page'
import EngagementBoardPage from './board/page'
import { EngagementLoadFailed } from '@/components/projects/engagement-load-failed'

const params = Promise.resolve({ groupSlug: 'g', firmSlug: 'acme', clientSlug: 'cl', engagementSlug: 'audit' })
const isNotFound = (e: unknown) => String((e as { digest?: string })?.digest ?? '').includes('404') || String((e as Error)?.message).includes('NEXT_HTTP_ERROR_FALLBACK')
const isRedirect = (e: unknown) => String((e as { digest?: string })?.digest ?? '').startsWith('NEXT_REDIRECT')

beforeEach(() => { st.hierarchy = async () => []; st.caps = {} })

describe.each([
    ['the engagement page', () => EngagementPage({ params })],
    ['the Board page', () => EngagementBoardPage({ params })],
])('%s', (_label, open) => {
    it("says it couldn't load this engagement when the lookup fails, not 404", async () => {
        st.hierarchy = async () => { throw new Error("Can't reach database server") }
        const page = await open()
        expect((page as { type?: unknown }).type).toBe(EngagementLoadFailed)
    })

    it('still follows a redirect from the lookup', async () => {
        st.hierarchy = async () => redirect('/signin')
        const thrown = await open().then(() => null, (e: unknown) => e)
        expect(isRedirect(thrown)).toBe(true)
    })

    it('is still a 404 when the engagement truly is not there', async () => {
        st.hierarchy = async () => [{ slug: 'cl', id: 'c', engagements: [] }]
        const thrown = await open().then(() => null, (e: unknown) => e)
        expect(isNotFound(thrown)).toBe(true)
    })
})

// The RAID log got a tab of its own (2026-11-14): …/raid, for Leads and Full Access contributors.
describe('the RAID tab', () => {
    const at = (rest: string[], view?: string) => EngagementPage({
        params: Promise.resolve({ groupSlug: 'g', firmSlug: 'acme', clientSlug: 'cl', engagementSlug: 'audit', rest }),
        searchParams: Promise.resolve(view ? { view } : {}),
    }).then(() => null, (e: unknown) => e)
    const redirectedTo = (e: unknown) => isRedirect(e) ? String((e as { digest: string }).digest).split(';')[2] : null

    it('an old link to the Discussions sub-tab lands on it', async () => {
        expect(redirectedTo(await at(['comments'], 'raid'))).toMatch(/\/e\/audit\/raid$/)
    })

    it.each([
        ['a Reviewer', { 'project:can_view': true }],
        ['a Contributor · Limited Access', { 'project:can_view': true, 'project:can_edit': true }],
    ])('%s is sent to Files', async (_who, caps) => {
        st.hierarchy = async () => [{ slug: 'cl', id: 'c', engagements: [{ slug: 'audit', id: 'p' }] }]
        st.caps = caps
        expect(redirectedTo(await at(['raid']))).toMatch(/\/e\/audit\/files$/)
    })
})
