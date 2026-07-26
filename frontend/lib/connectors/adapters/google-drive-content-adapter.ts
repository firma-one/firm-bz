/**
 * Google Drive implementation of IConnectorContentAdapter.
 * Wraps GoogleDriveConnector methods behind the provider-agnostic interface so
 * route handlers never call GoogleDriveConnector or googleapis.com directly.
 *
 * Google-only quirks (Workspace mimetype export conversion, copy-convert-export for
 * PDF export of native Office files) stay entirely inside GoogleDriveConnector — callers
 * of this adapter only see the resolved outcome.
 */

import type { IConnectorContentAdapter } from '../types'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'

export function createGoogleDriveContentAdapter(): IConnectorContentAdapter {
  const g = GoogleDriveConnector.getInstance()
  return {
    createFile: async (connectionId, folderId, fileName, content, mimeType) => {
      const id = await g.uploadNewFile(connectionId, fileName, content, mimeType, folderId)
      return { id }
    },

    overwriteFileContent: (connectionId, fileId, content, mimeType) =>
      g.overwriteFileContent(connectionId, fileId, content, mimeType),

    createUploadSession: async (connectionId, folderId, fileName, mimeType, opts) => {
      const accessToken = await g.getAccessToken(connectionId)
      if (!accessToken) throw new Error('Could not get access token')
      const uploadUrl = await g.getResumableUploadUrl(
        accessToken,
        { name: fileName, mimeType, parents: [folderId] },
        opts?.fileId
      )
      return { uploadUrl }
    },

    getRenderableContent: async (connectionId, fileId, format) => {
      if (format === 'pdf') {
        const buffer = await g.exportFileToPdf(connectionId, fileId)
        const metadata = await g.getFileMetadata(connectionId, fileId)
        return {
          stream: buffer,
          mimeType: 'application/pdf',
          fileName: metadata?.name ? `${metadata.name}.pdf` : `${fileId}.pdf`,
          size: String(buffer.byteLength),
        }
      }
      const { stream, mimeType, size, name } = await g.downloadFile(connectionId, fileId)
      return { stream, mimeType, fileName: name, size }
    },

    setCopyRestricted: async (connectionId, fileId, restricted) => {
      await g.patchFileProperties(connectionId, fileId, { copyRequiresWriterPermission: restricted })
    },

    getPreviewableContent: (connectionId, fileId) =>
      g.getPreviewableContent(connectionId, fileId),
  }
}
