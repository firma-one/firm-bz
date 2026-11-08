import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Root cause 1 of the error-handling audit: a reason thrown from a server action reaches the browser
 * as "Minified React error #441", and an error's class never arrives. These actions answer with a
 * result instead, so the words below are what the person reads, and "done, but…" travels as a warning.
 */

const { db, auth, folders, report, gate } = vi.hoisted(() => {
    const fn = <T,>(v: T) => vi.fn(async (..._args: any[]) => v)
    const db = {
        client: { findUnique: fn<any>(null), findFirst: fn<any>(null), update: fn<any>({}), delete: fn<any>({}), create: fn<any>({}) },
        clientMember: { findFirst: fn<any>(null), create: fn<any>({}) },
        clientContact: { findFirst: fn<any>(null), update: fn<any>({}), delete: fn<any>({}) },
        connector: { findUnique: fn<any>(null) },
        firm: { findUnique: fn<any>(null), findFirst: fn<any>(null) },
        firmMember: { findFirst: fn<any>(null), findMany: fn<any[]>([]) },
        persona: { findUnique: fn<any>(null) },
        engagement: { findFirst: fn<any>(null), findMany: fn<any[]>([]), findUnique: fn<any>(null), update: fn<any>({}), delete: fn<any>({}), create: fn<any>({}) },
        engagementMember: { create: fn<any>({}), findFirst: fn<any>(null) },
        group: { findUnique: fn<any>(null) },
        $transaction: vi.fn(async (cb: any) => (typeof cb === 'function' ? cb(db) : cb)),
    }
    return {
        db,
        auth: { user: { id: 'u1', email: 'pat@acme.test', user_metadata: {} } as any },
        folders: { ensureAppFolderStructure: vi.fn(), setupFirmFolder: vi.fn() },
        report: { reportActionFailure: vi.fn(async () => ({ ticketNumber: 42 })) },
        gate: { manageClient: true, canViewSettings: true },
    }
})

const chain: unknown = new Proxy(() => chain, { get: () => () => chain })

vi.mock('@/lib/prisma', () => ({ prisma: db, basePrisma: db }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }), getSession: async () => ({ data: { session: auth.user ? { user: auth.user } : null } }) } }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: {} } }) }))
vi.mock('@/lib/permission-helpers', () => ({
    canManageClient: vi.fn(async () => gate.manageClient),
    canManageOrganization: vi.fn(async () => true),
    canViewProject: vi.fn(async () => true),
    canViewProjectSettings: vi.fn(async () => gate.canViewSettings),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }), unstable_rethrow: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ audit: () => chain, AUDIT_EVENT: new Proxy({}, { get: (_t, k) => k }), AUDIT_SCOPE: new Proxy({}, { get: (_t, k) => k }) }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn(async () => true) }))
vi.mock('@/lib/connectors/registry', () => ({ getStorageAdapter: vi.fn(async () => ({})), getPermissionAdapter: vi.fn() }))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({ resolveClientConnector: vi.fn(async () => ({ connectorId: 'conn-1' })) }))
vi.mock('@/lib/connectors/pockett-structure.service', () => folders)
vi.mock('@/lib/actions/report-action-failure', () => report)
vi.mock('@/lib/reminders/reminder-service', () => ({ upsertFollowUpReminder: vi.fn(async () => {}) }))
vi.mock('@/lib/billing/effective-billing-caps', () => ({ assertWithinClientCap: vi.fn(), assertWithinClientContactCap: vi.fn(), assertWithinActiveEngagementCap: vi.fn() }))
vi.mock('@/lib/billing/subscription-gate', () => ({ requireAccess: vi.fn() }))
vi.mock('@/lib/billing/firm-creation-gate', () => ({
    canCreateNonSandboxFirm: vi.fn(), requireNonSandboxFirmCreationAccess: vi.fn(),
    resolveGroupForNewFirm: vi.fn(async () => 'g1'), resolveGroupForNewFirmInGroup: vi.fn(),
}))
vi.mock('@/lib/firm-service', () => ({
    FirmService: {
        createFirmWithMember: vi.fn(async () => ({ id: 'f-new', name: 'Acme', slug: 'acme' })),
        setDefaultFirm: vi.fn(),
        updateFirm: vi.fn(),
        deleteFirm: vi.fn(),
    },
}))
vi.mock('@/lib/permissions/invalidate-user-settings', () => ({ invalidateUserSettingsPlus: vi.fn() }))
vi.mock('@/lib/landing/default-landing-path', () => ({ resolveDefaultFirmLandingPath: vi.fn() }))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ ensureFirmAgentUser: vi.fn(async () => null) }))
vi.mock('@/lib/files/due-date-check', () => ({ deliverableDueAfter: vi.fn(async () => null) }))
vi.mock('@/lib/engagement-access', () => ({ assertEngagementNotCompleted: vi.fn() }))

import { createClient, shareConnectorWithClient, updateClientContact, updateClient } from './client'
import { createEngagement, provisionEngagementDriveFolder, approveEngagementAiSummary } from './project'
import { createFirm, getUserFirms, getUserGroups, switchFirm, updateFirm } from './firms'
import { storageFailure } from '@/lib/connectors/storage-failure'
import { FirmService } from '@/lib/firm-service'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1', email: 'pat@acme.test', user_metadata: {} }
    gate.manageClient = true
    gate.canViewSettings = true
})

describe('shareConnectorWithClient (CN-4, CN-5)', () => {
    beforeEach(() => {
        db.client.findUnique.mockResolvedValue({ firmId: 'f1', name: 'Contoso', slug: 'contoso' })
        db.connector.findUnique.mockResolvedValue({ firmId: 'f1', type: 'GOOGLE_DRIVE', settings: { organizations: { f1: { orgFolderId: 'org' } } } })
        db.firm.findUnique.mockResolvedValue({ slug: 'acme' })
    })

    it('answers ok with a warning and the ticket number when the link saved but the folder failed', async () => {
        folders.ensureAppFolderStructure.mockRejectedValueOnce(storageFailure('no_permission', 'Google Drive'))
        const result = await shareConnectorWithClient({ clientId: 'c1', connectorId: 'conn-1' })
        expect(db.client.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { connectorId: 'conn-1' } })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.data.folderFailed).toBe(true)
        expect(result.warning).toMatch(/^Attached, but its folder in Google Drive couldn't be set up · .+ Support ticket #42 filed\.$/)
    })

    it('names the engagements left without a folder, instead of "Client linked"', async () => {
        folders.ensureAppFolderStructure
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(new Error('Drive 500'))
            .mockResolvedValueOnce({ projectId: 'folder-b' })
        db.engagement.findMany.mockResolvedValueOnce([{ id: 'e1', name: 'Acme Audit', slug: 'a' }, { id: 'e2', name: 'Tax', slug: 't' }])
        const result = await shareConnectorWithClient({ clientId: 'c1', connectorId: 'conn-1' })
        expect(result).toEqual({
            ok: true,
            data: { folderFailed: false, engagementsWithoutFolder: ['Acme Audit'] },
            warning: 'Attached. 1 engagement has no folder in Google Drive yet: Acme Audit. Open it and use Set up storage folder.',
        })
    })

    it('answers plain ok when everything was set up', async () => {
        folders.ensureAppFolderStructure.mockResolvedValue({ projectId: 'x' })
        expect(await shareConnectorWithClient({ clientId: 'c1', connectorId: 'conn-1' })).toEqual({ ok: true, data: { folderFailed: false, engagementsWithoutFolder: [] } })
    })

    it('refuses a connector of another firm in words', async () => {
        db.connector.findUnique.mockResolvedValue({ firmId: 'f-other', type: 'GOOGLE_DRIVE', settings: {} })
        expect(await shareConnectorWithClient({ clientId: 'c1', connectorId: 'conn-1' })).toMatchObject({ ok: false, code: 'forbidden' })
        expect(db.client.update).not.toHaveBeenCalled()
    })
})

describe('createClient (P1-01, P2-24)', () => {
    beforeEach(() => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{ role: 'firm_admin' }], group: { slug: 'g' } })
        db.client.findUnique.mockResolvedValue(null)
        db.client.create.mockResolvedValue({ id: 'c-new', name: 'Contoso', slug: 'contoso' })
    })

    it('answers "name taken" in words', async () => {
        db.client.findFirst.mockResolvedValueOnce({ id: 'c-old' })
        expect(await createClient('acme', { name: 'Contoso' })).toEqual({ ok: false, code: 'name_taken', error: 'A client with this name already exists' })
    })

    it('says the storage folder is not there yet, rather than a plain success', async () => {
        folders.ensureAppFolderStructure.mockRejectedValueOnce(storageFailure('storage_full', 'Google Drive'))
        const result = await createClient('acme', { name: 'Contoso' })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.data).toEqual({ id: 'c-new', name: 'Contoso', slug: 'contoso' })
        expect(result.warning).toMatch(/^Client added, but its folder in Google Drive couldn't be created yet · .+ It's made again with its first engagement\.$/)
    })
})

describe('client edits', () => {
    it('refuses a contact of another client (contacts are addressed by id)', async () => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{}], clients: [{ id: 'c1' }], group: { slug: 'g' } })
        db.clientContact.findFirst.mockResolvedValueOnce(null)
        expect(await updateClientContact('acme', 'contoso', 'contact-of-c2', { name: 'X' })).toMatchObject({ ok: false, code: 'not_found' })
        expect(db.clientContact.update).not.toHaveBeenCalled()
    })

    it('answers the owner rule in words', async () => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{}], clients: [{ id: 'c1', name: 'C' }], group: { slug: 'g' } })
        db.firmMember.findFirst.mockResolvedValueOnce(null)
        expect(await updateClient('acme', 'contoso', { ownerId: 'stranger' })).toEqual({ ok: false, code: 'invalid_owner', error: 'The owner must be a member of this firm.' })
    })
})

describe('engagement actions (P1-06, P1-10, P1-11)', () => {
    it('rolls back and answers why when the folder can\'t be set up', async () => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{}], group: { slug: 'g' } })
        db.client.findFirst.mockResolvedValue({ id: 'c1', name: 'Contoso', slug: 'contoso' })
        db.engagement.findFirst.mockResolvedValue(null)
        db.engagement.findUnique.mockResolvedValue(null)
        db.engagement.create.mockResolvedValue({ id: 'e-new', name: 'Audit', slug: 'audit' })
        db.connector.findUnique.mockResolvedValue({ type: 'ONEDRIVE' })
        folders.ensureAppFolderStructure.mockRejectedValueOnce(storageFailure('no_permission', 'OneDrive'))
        const result = await createEngagement('acme', 'contoso', { name: 'Audit' })
        expect(result).toMatchObject({ ok: false, code: 'storage_setup_failed' })
        if (result.ok) return
        expect(result.error).toMatch(/^Couldn't create this engagement: its folder in OneDrive couldn't be set up · /)
        expect(db.engagement.delete).toHaveBeenCalledWith({ where: { id: 'e-new' } })
    })

    it('says the engagement exists when even the rollback failed, so it isn\'t made twice', async () => {
        db.firm.findUnique.mockResolvedValue({ id: 'f1', members: [{}], group: { slug: 'g' } })
        db.client.findFirst.mockResolvedValue({ id: 'c1', name: 'Contoso', slug: 'contoso' })
        db.engagement.findFirst.mockResolvedValue(null)
        db.engagement.create.mockResolvedValue({ id: 'e-new', name: 'Audit', slug: 'audit' })
        db.connector.findUnique.mockResolvedValue({ type: 'GOOGLE_DRIVE' })
        folders.ensureAppFolderStructure.mockRejectedValueOnce(new Error('Drive 500'))
        db.engagement.delete.mockRejectedValueOnce(new Error('db down'))
        const result = await createEngagement('acme', 'contoso', { name: 'Audit' })
        expect(result).toEqual({
            ok: true,
            data: { id: 'e-new', slug: 'audit', name: 'Audit' },
            warning: "Engagement created, but its folder in Google Drive couldn't be set up. Open it and use Set up storage folder in Files.",
        })
    })

    it('Set up storage folder says why when the client has no storage', async () => {
        db.engagement.findFirst.mockResolvedValue({ id: 'e1', name: 'A', slug: 'a', firmId: 'f1', clientId: 'c1', connectorRootFolderId: null })
        db.client.findUnique.mockResolvedValue({ id: 'c1', name: 'C', slug: 'c' })
        const { resolveClientConnector } = await import('@/lib/connectors/resolve-client-connector')
        vi.mocked(resolveClientConnector).mockResolvedValueOnce({ connectorId: null } as never)
        expect(await provisionEngagementDriveFolder('e1')).toMatchObject({ ok: false, code: 'no_connector' })
    })

    it('the publish gate reaches the person: "Complete these sections before publishing"', async () => {
        const text = '## Summary\nOn track.\n\n## Next Steps\n_Awaiting the Lead\u2019s input._'
        db.engagement.findFirst.mockResolvedValue({ settings: { insightsSummary: { draft: { text, status: 'pending_review' } } } })
        expect(await approveEngagementAiSummary('e1')).toEqual({ ok: false, code: 'unfilled_sections', error: 'Complete these sections before publishing: Next Steps' })
        expect(db.engagement.update).not.toHaveBeenCalled()
    })

    it('refuses publishing for someone who can\'t manage the engagement, in words', async () => {
        gate.canViewSettings = false
        expect(await approveEngagementAiSummary('e1')).toEqual({ ok: false, code: 'forbidden', error: "You don't have permission to publish this engagement's summary." })
    })
})

describe('firm actions (P1-05, P1-09, P1-23, ST-2)', () => {
    it('getUserFirms throws on a failed load instead of answering "no workspaces"', async () => {
        db.firmMember.findMany.mockRejectedValueOnce(new Error('db down'))
        // A plain [] used to come back here, which read as "No workspaces yet · Create your own".
        await expect(getUserFirms()).rejects.toThrow('db down')
    })

    it('getUserGroups answers a failed load as a failure, for the group picker', async () => {
        db.firmMember.findMany.mockRejectedValueOnce(new Error('db down'))
        expect(await getUserGroups()).toEqual({ ok: false, code: 'internal', error: 'Something went wrong on our side. Try again.' })
    })

    it('switchFirm answers "You do not have access to this firm" in words', async () => {
        db.firm.findUnique.mockResolvedValueOnce({ id: 'f2', members: [] })
        expect(await switchFirm('other')).toEqual({ ok: false, code: 'forbidden', error: 'You do not have access to this firm' })
    })

    it('updateFirm says only firm admins may, before FirmService says it in words that can\'t arrive', async () => {
        db.firm.findUnique.mockResolvedValueOnce({ id: 'f1', settings: {}, group: { slug: 'g' } })
        db.firmMember.findFirst.mockResolvedValueOnce({ role: 'firm_member' })
        expect(await updateFirm('acme', { name: 'X' })).toEqual({ ok: false, code: 'forbidden', error: 'Only firm admins can change firm settings.' })
        expect(FirmService.updateFirm).not.toHaveBeenCalled()
    })

    it('createFirm says the firm exists when its details failed to save (ST-2)', async () => {
        db.firm.findFirst.mockResolvedValueOnce(null)
        db.group.findUnique.mockResolvedValue({ name: 'G', slug: 'g' })
        db.firm.findUnique.mockResolvedValueOnce({ id: 'f-new', settings: {}, group: { slug: 'g' } })
        db.firmMember.findFirst.mockResolvedValueOnce({ role: 'firm_admin' })
        vi.mocked(FirmService.updateFirm).mockRejectedValueOnce(new Error('db hiccup'))
        const result = await createFirm({ name: 'Acme' }, { notes: 'n' })
        expect(result).toMatchObject({ ok: true, data: { slug: 'acme' }, warning: "Firm created, but its details weren't saved. Open its settings to finish." })
    })

    it('createFirm answers "name taken" in words', async () => {
        db.firm.findFirst.mockResolvedValueOnce({ id: 'f-old' })
        expect(await createFirm({ name: 'Acme' })).toEqual({ ok: false, code: 'name_taken', error: 'A firm with this name already exists' })
    })
})
