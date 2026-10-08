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
import { trimWorkbookToUsedRange, isSpreadsheetMime } from '@/lib/spreadsheet-print-trim'
import { logger } from '@/lib/logger'

const oneDrive = OneDriveConnector.getInstance()

async function auth(connectionId: string): Promise<string> {
  const token = await oneDrive.getAccessToken(connectionId)
  if (!token) throw new Error('Could not get OneDrive access token')
  return token
}

/** Content types the browser can render natively — same set the preview route treats as passthrough for Google. */
const INLINE_VIEWABLE_MIME_PREFIXES = ['application/pdf', 'image/']

/**
 * Graph reports Office-service conversion failures as a 406 whose body carries an
 * `ErrorCode=` from the Office service itself. `XLSPageLimitExceeded` is the one we can
 * actually do something about: the workbook's print range is too many pages, which is
 * almost always an empty-but-styled grid left behind by a Google Sheets export.
 */
function isPageLimitError(body: string): boolean {
  return body.includes('XLSPageLimitExceeded')
}

/** Pull the Office service's own error code out of a Graph 406 body, for logging and messaging. */
function officeErrorCode(body: string): string | undefined {
  return body.match(/ErrorCode=(\w+)/)?.[1]
}

function conversionFailed(mimeType: string | undefined, officeCode: string | undefined): ConnectorContentError {
  const detail = officeCode === 'XLSPageLimitExceeded'
    ? 'This spreadsheet’s print layout spans too many pages for the preview service to render.'
    : undefined
  return new ConnectorContentError(
    'conversion_failed',
    `Office conversion failed${officeCode ? ` (${officeCode})` : ''}`,
    mimeType,
    detail,
  )
}

/**
 * Second attempt at a PDF for a spreadsheet Microsoft refused to convert: download the raw
 * workbook, trim every sheet to its populated range (see spreadsheet-print-trim.ts), upload
 * the trimmed copy to a temporary item, convert *that*, then delete it.
 *
 * The temp item goes in the drive root rather than the file's own folder so it never lands
 * inside an engagement folder the indexer watches. It is always deleted, including on failure.
 *
 * Returns null when the retry is not applicable or did not work — the caller then surfaces
 * the original conversion failure rather than retrying any further.
 */
async function convertViaTrimmedCopy(
  token: string,
  base: string,
  fileId: string,
  fileName: string,
): Promise<Buffer | null> {
  const rawRes = await fetch(`${base}/items/${fileId}/content`, { headers: { Authorization: `Bearer ${token}` } })
  if (!rawRes.ok) {
    logger.warn(`[onedrive-content-adapter] trim retry: could not download ${fileId}: ${rawRes.status}`, 'onedrive-content-adapter')
    return null
  }

  const trimmed = await trimWorkbookToUsedRange(Buffer.from(await rawRes.arrayBuffer()))
  if (!trimmed) {
    logger.warn(`[onedrive-content-adapter] trim retry: nothing to trim in ${fileId}`, 'onedrive-content-adapter')
    return null
  }

  const tempName = `~firma-preview-${fileId}-${Date.now()}.xlsx`
  const uploadRes = await fetch(`${base}/root:/${encodeURIComponent(tempName)}:/content`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: new Uint8Array(trimmed.buffer),
  })
  if (!uploadRes.ok) {
    logger.warn(`[onedrive-content-adapter] trim retry: temp upload failed: ${uploadRes.status}`, 'onedrive-content-adapter')
    return null
  }

  const tempId: string | undefined = (await uploadRes.json())?.id
  if (!tempId) return null

  try {
    const pdfRes = await fetch(`${base}/items/${tempId}/content?format=pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!pdfRes.ok) {
      const body = await pdfRes.text().catch(() => '<unreadable>')
      logger.warn(
        `[onedrive-content-adapter] trim retry: conversion still failed for ${fileId}: ${pdfRes.status} ${officeErrorCode(body) ?? ''}`,
        'onedrive-content-adapter',
      )
      return null
    }
    logger.info(
      `[onedrive-content-adapter] trim retry succeeded for ${fileName} (${trimmed.sheetsTrimmed} sheet(s) trimmed)`,
      'onedrive-content-adapter',
    )
    return Buffer.from(await pdfRes.arrayBuffer())
  } finally {
    // Fire-and-forget cleanup — a leftover temp item must never block the preview.
    fetch(`${base}/items/${tempId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      .catch((e) => logger.error('[onedrive-content-adapter] failed to delete temp preview item', e as Error, 'onedrive-content-adapter', { tempId }))
  }
}

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
      // Overwrite (opts.fileId) uploads new content onto the existing item, so it must say
      // 'replace' and must NOT send `name`: Graph reads `name` on an existing item as a rename
      // request, and with 'rename' it resolved that against the item's own name and created
      // "<name> 1.pdf" instead of overwriting. New uploads keep 'rename' as a safety net — the
      // caller has already renamed any file the user chose to keep both copies of.
      const path = opts?.fileId
        ? `${base}/items/${opts.fileId}/createUploadSession`
        : `${base}/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`
      const item = opts?.fileId
        ? { '@microsoft.graph.conflictBehavior': 'replace' }
        : { '@microsoft.graph.conflictBehavior': 'rename', name: fileName }
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item }),
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
        const officeCode = officeErrorCode(errorBody)
        logger.error(
          `[onedrive-content-adapter] format=pdf conversion failed: ${contentRes.status} ${contentRes.statusText}`,
          undefined,
          'onedrive-content-adapter',
          { fileId, mimeType, status: contentRes.status, officeCode, body: errorBody },
        )

        // A spreadsheet rejected for page count is retryable: trim it to its populated
        // range and convert the trimmed copy. See convertViaTrimmedCopy.
        if (format === 'pdf' && isSpreadsheetMime(mimeType) && isPageLimitError(errorBody)) {
          const retried = await convertViaTrimmedCopy(token, base, fileId, meta.name).catch((e) => {
            logger.error('[onedrive-content-adapter] trim retry threw', e as Error, 'onedrive-content-adapter', { fileId })
            return null
          })
          if (retried) {
            return { stream: retried, mimeType: 'application/pdf', fileName: `${meta.name}.pdf` }
          }
        }

        // Nothing more to try — report the conversion failure honestly rather than
        // claiming the file type cannot be previewed.
        throw conversionFailed(mimeType, officeCode)
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
