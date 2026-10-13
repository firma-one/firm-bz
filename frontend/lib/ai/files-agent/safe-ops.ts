import 'server-only'
import { METADATA_FOLDER_NAME } from '@/lib/connectors/types'
import type { IConnectorStorageAdapter } from '@/lib/connectors/types'
import { prisma } from '@/lib/prisma'
import { assignDocId } from '@/lib/doc-id'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import type { AgentApprovalMeta } from './agent-audit'

/**
 * The only way agent code creates a folder.
 *
 * ## Why a wrapper and not just `adapter.findOrCreateFolder`
 *
 * That method deletes duplicate siblings when the folder name is the connector's metadata folder
 * (`.meta`), to keep a single canonical one. For the platform's own provisioning that is correct.
 * For the agent it is a hole: "create a folder called .meta" is a request the agent could make and
 * a person could approve, and it would delete folders neither of them named.
 *
 * The agent never calls a delete. It must also never cause one, which is a different and stricter
 * property — the boundary has to cover what an operation DOES, not only what it is called.
 *
 * Validation already refuses dot-prefixed names, so this should never fire. It exists because that
 * is one regex in one file, and the guarantee is worth more than one layer: if a future change
 * widens the name rules, this still refuses, and it refuses LOUDLY rather than silently producing
 * a destructive call.
 */
export async function agentCreateFolder(
    adapter: IConnectorStorageAdapter,
    connectionId: string,
    parentFolderId: string,
    name: string,
): Promise<string> {
    if (name === METADATA_FOLDER_NAME || name.startsWith('.')) {
        throw new Error(
            `Refused to create a reserved folder ("${name}"): the agent must never perform or `
            + 'cause a destructive operation.',
        )
    }
    return adapter.findOrCreateFolder(connectionId, parentFolderId, name)
}

/**
 * The agent's complete `create-folder` capability: create it, index it, record it.
 *
 * ## Why all three belong together
 *
 * `agentCreateFolder` above makes the folder in the provider and nothing else. That is only half
 * the operation, and both callers found out the hard way: the file list renders from
 * `EngagementDocument`, not from the Drive, so a folder created without a row is invisible in the
 * app. A scaffold reported "created 9 folders" over a page that still said the folder was empty,
 * and a review's `propose_folders` had the same gap.
 *
 * Splitting create from index let each caller forget one half independently. Here they cannot:
 * the capability is the whole operation, so an agent flow invokes this the way it would any other
 * tool and gets a folder that actually exists as far as the product is concerned.
 *
 * The audit row is part of it for the same reason — an agent-performed change that is not in the
 * Audit tab is a change nobody can review, which is the one thing the approval flow exists to
 * guarantee.
 */
export async function agentCreateFolderIndexed(params: {
    adapter: IConnectorStorageAdapter
    connectionId: string
    parentFolderId: string
    name: string
    engagementId: string
    engagementName: string
    firmId: string
    clientId: string | null
    /** The agent user, so the audit trail attributes this to Brio rather than the approver. */
    actorId: string
    /** `agentApprovalMeta(user)` — who approved it. */
    agentMeta: AgentApprovalMeta
    /** Extra audit metadata, such as `scaffold: true`. */
    auditMeta?: Record<string, unknown>
}): Promise<string> {
    const externalId = await agentCreateFolder(
        params.adapter, params.connectionId, params.parentFolderId, params.name,
    )

    // Upsert, keyed the same way the rest of the app keys this row, so a re-applied batch or a
    // concurrent sync cannot produce a duplicate.
    const doc = await prisma.engagementDocument.upsert({
        where: {
            engagementId_firmId_externalId: {
                engagementId: params.engagementId,
                firmId: params.firmId,
                externalId,
            },
        },
        update: {},
        create: {
            engagementId: params.engagementId,
            firmId: params.firmId,
            clientId: params.clientId,
            externalId,
            connectorId: params.connectionId,
            parentId: params.parentFolderId,
            fileName: params.name,
            // Google's folder mime type, which the file list keys folder rendering off for BOTH
            // providers — the same literal every other creation path writes.
            mimeType: 'application/vnd.google-apps.folder',
            isFolder: true,
            createdBy: params.actorId,
            updatedBy: params.actorId,
            metadata: { modifiedTime: new Date().toISOString() } as object,
        },
        select: { id: true, docId: true },
    })

    // The short human id ("QSR-12"), assigned off the request as everywhere else: a folder
    // without one still works, and waiting on it would slow every creation in a batch.
    if (!doc.docId) {
        void assignDocId(doc.id, params.engagementId, params.engagementName).catch(() => {})
    }

    audit(AUDIT_EVENT.DOCUMENT_CREATED)
        .firm(params.firmId).client(params.clientId ?? undefined).engagement(params.engagementId)
        .actor(params.actorId).scope(AUDIT_SCOPE.DOCUMENT)
        .meta({
            fileName: params.name,
            parentId: params.parentFolderId,
            folderId: externalId,
            ...params.auditMeta,
            ...params.agentMeta,
        })
        .fireAndForget()

    return externalId
}
