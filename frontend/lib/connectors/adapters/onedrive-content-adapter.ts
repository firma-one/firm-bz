/**
 * Microsoft Graph implementation of IConnectorContentAdapter (OneDrive/SharePoint).
 *
 * Graph is simpler than Drive here: there's no shortcut/stub-file concept to resolve first,
 * and `?format=pdf` on the content endpoint handles Office-to-PDF conversion natively — see
 * .claude/plans/connector-microsoft-impl.md Phase 2.
 *
 * setCopyRestricted is INTENTIONALLY a no-op here — for OneDrive, download-blocking is NOT a
 * per-item file property the way Drive's copyRequiresWriterPermission is. It's enforced instead
 * at grant time via IConnectorPermissionAdapter.grantFilePermission's `opts.preventDownload`
 * (see onedrive-permission-adapter.ts's grantDownloadBlockedLink, item 12 in
 * .claude/plans/connector-microsoft-impl.md, 2026-08-06) — a `createLink` sharing link with
 * `type: 'blocksDownload'` scoped to the recipient, using Graph's BETA endpoint since v1.0 has
 * no per-user-scoped link creation. That mechanism replaces the normal `/invite` grant entirely
 * for OneDrive EC/EV/Viewer roles rather than layering on top of it (SharePoint takes the
 * least-restrictive of all grants a user holds on an item, so a restrictive link alongside an
 * existing invite grant would do nothing). This file-level setCopyRestricted call stays a no-op
 * because there's nothing to set here — the actual enforcement already happened on the grant.
 */

import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { resolveOneDriveDriveBase } from './onedrive-adapter'
import { ConnectorContentError, type IConnectorContentAdapter } from '../types'
import { logger } from '@/lib/logger'

const oneDrive = OneDriveConnector.getInstance()

async function auth(connectionId: string): Promise<string> {
  const token = await oneDrive.getAccessToken(connectionId)
  if (!token) throw new Error('Could not get OneDrive access token')
  return token
}

/** Content types the browser can render natively — same set the preview route treats as passthrough for Google. */
const INLINE_VIEWABLE_MIME_PREFIXES = ['application/pdf', 'image/']

export function createOneDriveContentAdapter(): IConnectorContentAdapter {
  return {
    async createFile(connectionId, folderId, fileName, content, mimeType) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(`${base}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
        body: new Uint8Array(content),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to create ${fileName}: ${res.status} - ${err}`)
      }
      const data = await res.json()
      return { id: data.id }
    },

    async overwriteFileContent(connectionId, fileId, content, mimeType) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const res = await fetch(`${base}/items/${fileId}/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
        body: new Uint8Array(content),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to overwrite file ${fileId}: ${res.status} - ${err}`)
      }
    },

    async createUploadSession(connectionId, folderId, fileName, _mimeType, opts) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const targetId = opts?.fileId ?? folderId
      const path = opts?.fileId
        ? `${base}/items/${targetId}/createUploadSession`
        : `${base}/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to create upload session for ${fileName}: ${res.status} - ${err}`)
      }
      const data = await res.json()
      return { uploadUrl: data.uploadUrl }
    },

    async getRenderableContent(connectionId, fileId, format) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const metaRes = await fetch(`${base}/items/${fileId}?$select=id,name,file`, { headers: { Authorization: `Bearer ${token}` } })
      if (metaRes.status === 404) throw new ConnectorContentError('not_found', `File ${fileId} not found`)
      if (metaRes.status === 403) throw new ConnectorContentError('forbidden', `No access to file ${fileId}`)
      if (!metaRes.ok) throw new Error(`Failed to fetch metadata for ${fileId}: ${metaRes.status}`)
      const meta = await metaRes.json()

      const contentUrl = format === 'pdf' ? `${base}/items/${fileId}/content?format=pdf` : `${base}/items/${fileId}/content`
      const contentRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (contentRes.status === 404) throw new ConnectorContentError('not_found', `File ${fileId} not found`)
      if (contentRes.status === 403) throw new ConnectorContentError('forbidden', `No access to file ${fileId}`)
      if (!contentRes.ok) {
        throw new ConnectorContentError('unsupported', `Could not render file ${fileId} as ${format}`, meta.file?.mimeType)
      }

      const buffer = Buffer.from(await contentRes.arrayBuffer())
      const fileName = format === 'pdf' ? `${meta.name}.pdf` : meta.name
      return {
        stream: buffer,
        mimeType: format === 'pdf' ? 'application/pdf' : (meta.file?.mimeType ?? 'application/octet-stream'),
        fileName,
        size: String(buffer.byteLength),
      }
    },

    async getPreviewableContent(connectionId, fileId) {
      const [token, base] = await Promise.all([auth(connectionId), resolveOneDriveDriveBase(connectionId)])
      const metaRes = await fetch(`${base}/items/${fileId}?$select=id,name,file`, { headers: { Authorization: `Bearer ${token}` } })
      if (metaRes.status === 404) throw new ConnectorContentError('not_found', `File ${fileId} not found`)
      if (metaRes.status === 403) throw new ConnectorContentError('forbidden', `No access to file ${fileId}`)
      if (!metaRes.ok) throw new Error(`Failed to fetch metadata for ${fileId}: ${metaRes.status}`)
      const meta = await metaRes.json()
      const mimeType: string | undefined = meta.file?.mimeType

      const isInlineViewable = !!mimeType && INLINE_VIEWABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
      const format = isInlineViewable ? 'native' : 'pdf'

      const contentUrl = format === 'pdf' ? `${base}/items/${fileId}/content?format=pdf` : `${base}/items/${fileId}/content`
      const contentRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (!contentRes.ok) {
        const errorBody = await contentRes.text().catch(() => '<unreadable>')
        logger.error(
          `[onedrive-content-adapter] format=pdf conversion failed: ${contentRes.status} ${contentRes.statusText}`,
          undefined,
          'onedrive-content-adapter',
          { fileId, mimeType, status: contentRes.status, body: errorBody },
        )
        throw new ConnectorContentError('unsupported', `No inline-viewable representation for file ${fileId}`, mimeType)
      }
      const buffer = Buffer.from(await contentRes.arrayBuffer())
      return {
        stream: buffer,
        mimeType: format === 'pdf' ? 'application/pdf' : (mimeType ?? 'application/octet-stream'),
        fileName: format === 'pdf' ? `${meta.name}.pdf` : meta.name,
      }
    },

    async setCopyRestricted(_connectionId, _fileId, _restricted) {
      // No-op by design — see file header. Actual download-blocking for OneDrive happens at
      // grant time (grantFilePermission's preventDownload), not as a file-level toggle.
    },
  }
}
