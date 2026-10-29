import 'server-only'
import { ConnectorType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { resolveOneDriveDriveBase } from '@/lib/connectors/adapters/onedrive-adapter'
import { logger } from '@/lib/logger'

/**
 * The storage's own description field (2026-10-29): a document's description, written in Firma,
 * is also written there where the storage has one, so it's visible in Drive and Drive's own search
 * finds it (Google's `fullText` covers `description`).
 *
 * - Google Drive: every file and folder.
 * - OneDrive: personal drives only. Graph's driveItem.description is "Only on OneDrive Personal";
 *   OneDrive for Business and SharePoint libraries have no such field, so there the description
 *   lives in Firma alone.
 *
 * Firma keeps its own copy everywhere (`settings.description`): search, vectors and Brio read that,
 * whatever the storage. A write that fails is logged, never a failed save in Firma.
 */

const oneDrive = OneDriveConnector.getInstance()

/**
 * Documents whose description Drive refused this run (a file Firma's limited Google permission
 * doesn't cover, say): not retried on every listing.
 */
const pushRefused = new Set<string>()

/** Whether a OneDrive connection's drive is a personal one, asked once per connection. */
const personalDrive = new Map<string, boolean>()

async function oneDriveTarget(connectorId: string): Promise<{ token: string; base: string } | null> {
    const token = await oneDrive.getAccessToken(connectorId)
    if (!token) return null
    const base = await resolveOneDriveDriveBase(connectorId)
    if (!personalDrive.has(connectorId)) {
        const res = await fetch(`${base}?$select=driveType`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return null
        personalDrive.set(connectorId, (await res.json()).driveType === 'personal')
    }
    return personalDrive.get(connectorId) ? { token, base } : null
}

/** Writes the description to the storage's own field. True when written; false where there's none, or it failed. */
export async function writeNativeDescription(connectorId: string, externalId: string, description: string): Promise<boolean> {
    try {
        const connector = await prisma.connector.findUnique({ where: { id: connectorId }, select: { type: true } })
        if (connector?.type === ConnectorType.GOOGLE_DRIVE) {
            const token = await googleDriveConnector.getAccessToken(connectorId)
            if (!token) return false
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(externalId)}?supportsAllDrives=true&fields=id`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ description }),
            })
            if (!res.ok) logger.error(`[description] Drive write failed: ${res.status}`, new Error(await res.text().catch(() => '')))
            return res.ok
        }
        if (connector?.type === ConnectorType.ONEDRIVE) {
            const target = await oneDriveTarget(connectorId)
            if (!target) return false
            const res = await fetch(`${target.base}/items/${encodeURIComponent(externalId)}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ description }),
            })
            if (!res.ok) logger.error(`[description] OneDrive write failed: ${res.status}`, new Error(await res.text().catch(() => '')))
            return res.ok
        }
        return false
    } catch (e) {
        logger.error('[description] native write failed', e as Error)
        return false
    }
}

/**
 * Brings Firma's copy in line with what the storage's own field says, after the listing read it.
 * A description written in Drive replaces Firma's; one Firma holds that Drive doesn't (written
 * before this, or when Drive refused it) is written to Drive. Clearing it in Drive isn't taken as
 * clearing it in Firma: an empty field can't tell "cleared" from "never written".
 */
export async function reconcileNativeDescriptions(
    connectorId: string,
    rows: { id: string; externalId: string; firma: string | null; native: string | null }[],
    onChanged: (documentId: string) => Promise<void>,
): Promise<void> {
    for (const row of rows) {
        const native = row.native?.trim() || null
        if (native && native !== row.firma) {
            await prisma.$executeRawUnsafe(
                `UPDATE platform.engagement_documents
                 SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{description}', to_jsonb($1::text)), "updatedAt" = now()
                 WHERE id = $2::uuid`,
                native,
                row.id,
            )
            await onChanged(row.id)
        } else if (!native && row.firma && !pushRefused.has(row.externalId)) {
            if (!(await writeNativeDescription(connectorId, row.externalId, row.firma))) pushRefused.add(row.externalId)
        }
    }
}
