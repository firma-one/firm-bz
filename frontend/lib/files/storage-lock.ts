import 'server-only'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import type { ConnectorRole } from '@/lib/connectors/types'

/**
 * Locking a file in its storage, and undoing it: what Finalize and Unlock do to the file itself.
 * Moved out of `sharing/finalize` and `sharing/unlock` so approving a document can lock it the
 * same way (.claude/plans/document-approval-record.md). The lock's record in `settings.lock` is
 * each caller's to write.
 */

export interface DowngradedPermission {
    permissionId: string
    previousRole: string
}

export class StorageNotSupportedError extends Error {
    constructor() {
        super('Connector type not supported')
    }
}

/** Every editor and commenter becomes a viewer, and the content is made read-only. Returns who was downgraded. */
export async function lockFileInStorage(connectorId: string, externalId: string): Promise<DowngradedPermission[]> {
    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (!permissionAdapter) throw new StorageNotSupportedError()

    const downgraded: DowngradedPermission[] = []
    const perms = await permissionAdapter.listFilePermissions(connectorId, externalId)
    const elevRoles = new Set(['editor', 'commenter'])

    for (const p of perms) {
        if (!p.id || !p.email) continue
        if (!elevRoles.has(p.role)) continue

        const prev = p.role
        const ok = await permissionAdapter.patchFilePermissionRole(connectorId, externalId, p.id, 'viewer')
        if (ok) downgraded.push({ permissionId: p.id, previousRole: prev })
    }

    await permissionAdapter.setFileContentReadOnly(connectorId, externalId, true)
    return downgraded
}

/** Restores the roles recorded at lock time, and lifts the read-only content. */
export async function unlockFileInStorage(connectorId: string, externalId: string, downgraded: DowngradedPermission[]): Promise<void> {
    const permissionAdapter = await getPermissionAdapter(connectorId)
    if (!permissionAdapter) return

    // previousRole may be stored as either Google-native strings (writer/reader/...) from
    // older locks, or the provider-agnostic ConnectorRole vocabulary (editor/viewer/commenter)
    // from locks created after the registry migration — normalize both.
    const toConnectorRole = (r: string): ConnectorRole | null => {
        if (r === 'writer' || r === 'fileOrganizer' || r === 'organizer' || r === 'editor') return 'editor'
        if (r === 'commenter') return 'commenter'
        if (r === 'reader' || r === 'viewer') return 'viewer'
        return null
    }
    for (const row of downgraded) {
        const role = toConnectorRole(row.previousRole)
        if (role) await permissionAdapter.patchFilePermissionRole(connectorId, externalId, row.permissionId, role)
    }

    await permissionAdapter.setFileContentReadOnly(connectorId, externalId, false)
}
