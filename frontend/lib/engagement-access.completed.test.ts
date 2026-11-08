import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

// Completed is read only for every role: the member's role doesn't change what they may do to its files.
// Taking access away altogether is what removing the member is for.

const { st } = vi.hoisted(() => ({ st: { status: 'COMPLETED', member: { role: 'eng_ext_collaborator' } as null | { role: string } } }))

vi.mock('@/lib/engagement-sharing-ids', () => ({ getSharedAndAncestorIdsForPersona: vi.fn(), privateExternalIds: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findFirst: async () => ({ status: st.status }) },
        engagementMember: { findFirst: async () => st.member },
    },
}))

import { assertEngagementNotCompleted, blockIfEngagementCompleted, blockIfEngagementFileMutationForbidden, isEngagementMemberReadOnlyWhenCompleted } from './engagement-access'

const ROLES = ['eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer'] as const

beforeEach(() => {
    st.status = 'COMPLETED'
    st.member = { role: 'eng_ext_collaborator' }
})

describe('a completed engagement', () => {
    it.each(ROLES)('is read only for %s', (role) => {
        expect(isEngagementMemberReadOnlyWhenCompleted('COMPLETED', role)).toBe(true)
    })

    it.each(['ACTIVE', 'PLANNED', 'PAUSED'] as const)('leaves %s as it is', (status) => {
        for (const role of ROLES) expect(isEngagementMemberReadOnlyWhenCompleted(status, role)).toBe(false)
    })

    it('refuses a Limited Access contributor a file change, and says why', async () => {
        const res = await blockIfEngagementFileMutationForbidden('u', 'p')
        expect(res?.status).toBe(403)
        expect((await res!.json()).error).toBe("This engagement is completed, so it's read only.")
    })

    it('allows the change once it is reopened', async () => {
        st.status = 'ACTIVE'
        expect(await blockIfEngagementFileMutationForbidden('u', 'p')).toBeNull()
    })

    it('still refuses someone who is not a member, as not a member', async () => {
        st.member = null
        const res = await blockIfEngagementFileMutationForbidden('u', 'p')
        expect((await res!.json()).error).toBe('Forbidden')
    })

    it('refuses by status alone on routes open to non-members', async () => {
        expect((await blockIfEngagementCompleted('p'))?.status).toBe(403)
        await expect(assertEngagementNotCompleted('p')).rejects.toThrow("so it's read only")
        st.status = 'PAUSED'
        expect(await blockIfEngagementCompleted('p')).toBeNull()
        await expect(assertEngagementNotCompleted('p')).resolves.toBeUndefined()
    })
})

const ROOT = resolve(__dirname, '../app/api/projects/[projectId]')
const countOf = (source: string) => (source.match(/blockIfEngagement(FileMutationForbidden|Completed)\(/g) ?? []).length

// A route that forgets the check still works, so nothing else would say so. A new write route fails here
// until it takes a side.
const REFUSES: Record<string, number> = {
    'ai-summary': 1,
    'documents/create-link': 1,
    'documents/[documentId]': 1,
    'documents/[documentId]/assignee': 1,
    'documents/[documentId]/blocked': 1,
    'documents/[documentId]/doc-comments': 3,
    'documents/[documentId]/doc-comments/reactions': 1,
    'documents/[documentId]/doc-comments/resolve': 1,
    'documents/[documentId]/due-date': 1,
    'documents/[documentId]/intake': 1,
    'documents/[documentId]/privacy': 1,
    'documents/[documentId]/reminder': 1, // Setting one. Clearing one leaves the engagement as it was.
    'documents/[documentId]/sharing': 2,
    'documents/[documentId]/sharing/accept': 1,
    'documents/[documentId]/sharing/activity': 1,
    'documents/[documentId]/sharing/finalize': 1,
    'documents/[documentId]/sharing/unlock': 1,
    'files-agent/apply': 1,
    'files-agent/scaffold': 1,
    'shares/order': 1,
}
const STAYS_OPEN = [
    'ai-chat', // Asking changes nothing in the engagement.
    'ai-feedback',
    'documents/bulk-download',
    'documents/[documentId]/doc-comments/read', // One person's own state.
    'documents/[documentId]/index-file-intake', // The search index, not the content.
    'documents/[documentId]/sharing/regrant', // Opening a file: it grants view only once completed.
    'files-agent', // A proposal only; applying it is refused.
    'index-file',
    'index-project',
    'insights/share-report', // Sends a copy of a report.
]

const writeRoutes = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) return writeRoutes(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        if (entry.name !== 'route.ts') return []
        return /export (async function|const) (POST|PATCH|PUT|DELETE)\b/.test(readFileSync(join(dir, entry.name), 'utf8')) ? [prefix] : []
    })

describe('the routes that write to an engagement', () => {
    it('all take a side', () => {
        expect(writeRoutes(ROOT).sort()).toEqual([...Object.keys(REFUSES), ...STAYS_OPEN].sort())
    })

    it.each(Object.entries(REFUSES))('%s refuses once completed', (route, handlers) => {
        expect(countOf(readFileSync(join(ROOT, route, 'route.ts'), 'utf8'))).toBeGreaterThanOrEqual(handlers)
    })

    it.each([
        'app/api/drive-action/route.ts',
        'app/api/connectors/google-drive/linked-files/route.ts',
        'app/api/connectors/google-drive/upload/route.ts',
        'app/api/connectors/google-drive/import/route.ts',
    ])('%s refuses file changes once completed', (path) => {
        expect(countOf(readFileSync(resolve(__dirname, '..', path), 'utf8'))).toBeGreaterThan(0)
    })

    it.each([
        ['lib/actions/engagement-wiki.ts', 1],
        ['lib/actions/project.ts', 3],
    ])('%s refuses its writes once completed', (path, calls) => {
        expect(readFileSync(resolve(__dirname, '..', path), 'utf8').split('assertEngagementNotCompleted(').length - 1).toBe(calls)
    })
})
