import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Brio's folder setup reports each folder it couldn't create, and why, as the apply report does,
 * instead of "3 could not be created". Nothing here touches a real Drive: the folder create is mocked.
 */

const { createFolder } = vi.hoisted(() => ({ createFolder: vi.fn() }))

vi.mock('@/lib/api/engagement-auth', () => ({
    requireProjectManage: async () => ({ user: { id: 'u1', email: 'lead@acme.test' }, ctx: { orgId: 'f1', clientId: 'c1' } }),
}))
vi.mock('@/lib/engagement-access', () => ({ blockIfEngagementCompleted: async () => null }))
vi.mock('@/lib/prisma', () => ({
    prisma: { engagement: { findUnique: async () => ({ connectorRootFolderId: 'root', name: 'Audit' }) } },
}))
vi.mock('@/lib/connectors/resolve-client-connector', () => ({
    resolveEngagementConnector: async () => ({ id: 'conn1', type: 'GOOGLE_DRIVE' }),
}))
vi.mock('@/lib/connectors/registry', () => ({ getStorageAdapter: async () => ({}) }))
vi.mock('@/lib/connectors/pockett-structure.service', () => ({
    readScaffoldFingerprint: async () => null,
    writeScaffoldFingerprint: vi.fn(async () => {}),
}))
vi.mock('@/lib/ai/files-agent/agent-identity', () => ({ ensureFirmAgentUser: async () => 'agent' }))
vi.mock('@/lib/ai/files-agent/agent-audit', () => ({ agentApprovalMeta: () => ({}) }))
vi.mock('@/lib/ai/files-agent/approval', () => ({
    verifyApprovalToken: () => ({ ok: true }),
    issueApprovalToken: () => 'token',
}))
vi.mock('@/lib/ai/files-agent/scaffold', () => ({
    buildScaffold: () => [],
    flattenScaffold: () => [
        { name: '01_Planning', path: '01_Planning', parentPath: null, purpose: '' },
        { name: 'Notes', path: '01_Planning/Notes', parentPath: '01_Planning', purpose: '' },
        { name: '02_Fieldwork', path: '02_Fieldwork', parentPath: null, purpose: '' },
    ],
    scaffoldProposals: () => [],
}))
vi.mock('@/lib/ai/files-agent/safe-ops', () => ({ agentCreateFolderIndexed: createFolder }))
vi.mock('@/lib/audit', () => ({ audit: vi.fn(), AUDIT_EVENT: {}, AUDIT_SCOPE: {} }))
vi.mock('@/lib/doc-id', () => ({ assignDocId: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { POST } from './route'

const post = () =>
    POST(
        new NextRequest('http://localhost/api/projects/p1/files-agent/scaffold', {
            method: 'POST',
            body: JSON.stringify({ answers: {}, edits: {}, token: 'token' }),
        }),
        { params: Promise.resolve({ projectId: 'p1' }) },
    )

beforeEach(() => { createFolder.mockReset() })

describe('POST /api/projects/[projectId]/files-agent/scaffold', () => {
    it('names each folder it couldn’t create, with the storage’s reason, and skips its children', async () => {
        createFolder.mockImplementation(async ({ name }: { name: string }) => {
            if (name === '01_Planning') {
                throw new Error('Failed to create folder 01_Planning: 403 - {"error":{"errors":[{"reason":"insufficientFilePermissions"}],"message":"The user does not have sufficient permissions"}}')
            }
            return `id-${name}`
        })
        const res = await post()
        expect(res.status).toBe(200)
        const { data } = await res.json()
        expect(data).toMatchObject({ created: 1, failed: 2, total: 3 })
        expect(data.failures).toEqual([
            { path: '01_Planning', name: '01_Planning', reason: "The Google Drive account connected to this client doesn't have permission to change this." },
            { path: '01_Planning/Notes', name: 'Notes', reason: "Not created, because the folder it goes in couldn't be created." },
        ])
    })

    it('keeps internals out of a reason it can’t read', async () => {
        createFolder.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:5432'))
        const { data } = await (await post()).json()
        expect(data.created).toBe(0)
        expect(data.failures[0].reason).toBe("Couldn't create this folder.")
        expect(JSON.stringify(data)).not.toContain('ECONNREFUSED')
    })

    it('a refusal before any folder says nothing was created', async () => {
        const auth = await import('@/lib/api/engagement-auth')
        vi.spyOn(auth, 'requireProjectManage').mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as never)
        const res = await post()
        expect(res.status).toBe(403)
        expect(createFolder).not.toHaveBeenCalled()
    })
})
