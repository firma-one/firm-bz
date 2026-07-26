import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GoogleDriveConnector } from './google-drive-connector'
import { ConnectorContentError } from '@/lib/connectors/types'

// getPreviewableContent only needs getAccessToken + exportFileToPdf from the instance,
// and Drive REST calls via global.fetch — mock at that boundary so Prisma/DB are never touched.
const g = GoogleDriveConnector.getInstance()
const connectorId = 'conn-1'
const fileId = 'file-1'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

beforeEach(() => {
  vi.spyOn(g, 'getAccessToken').mockResolvedValue('token-abc')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GoogleDriveConnector.getPreviewableContent', () => {
  it('throws ConnectorContentError("not_found") when metadata fetch 404s', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, false, 404))

    await expect(g.getPreviewableContent(connectorId, fileId)).rejects.toBeInstanceOf(ConnectorContentError)
    await expect(g.getPreviewableContent(connectorId, fileId)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('throws ConnectorContentError("forbidden") when metadata fetch 403s', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({}, false, 403))

    await expect(g.getPreviewableContent(connectorId, fileId)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('throws a generic Error (not ConnectorContentError) for other metadata fetch failures', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse({}, false, 500))

    await expect(g.getPreviewableContent(connectorId, fileId)).rejects.not.toBeInstanceOf(ConnectorContentError)
  })

  it('resolves a Drive shortcut to its target and previews using the target metadata', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    // 1. metadata fetch — a shortcut
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        mimeType: 'application/vnd.google-apps.shortcut',
        shortcutDetails: { targetId: 'target-1' },
      })
    )
    // 2. shortcut target metadata — an image, resolvable without further export
    fetchSpy.mockResolvedValueOnce(jsonResponse({ mimeType: 'image/png', name: 'photo.png' }))
    // 3. raw content download of the resolved target
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      body: {} as ReadableStream,
    } as Response)

    const result = await g.getPreviewableContent(connectorId, fileId)

    expect(result.mimeType).toBe('image/png')
    expect(result.fileName).toBe('photo.png')
    // Third fetch must hit the resolved target id, not the original shortcut id
    expect(fetchSpy.mock.calls[2][0]).toContain('target-1')
  })

  it('throws ConnectorContentError("unsupported") when the shortcut target cannot be resolved', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        mimeType: 'application/vnd.google-apps.shortcut',
        shortcutDetails: { targetId: 'target-1' },
      })
    )
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, false, 404))

    await expect(g.getPreviewableContent(connectorId, fileId)).rejects.toMatchObject({
      code: 'unsupported',
      mimeType: 'application/vnd.google-apps.shortcut',
    })
  })

  it('resolves a .gdoc stub (small octet-stream file) to the real Google Doc and PDF-exports it', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    // 1. metadata — octet-stream, small size ⇒ treated as a stub
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ mimeType: 'application/octet-stream', name: 'Doc.gdoc', size: '120' })
    )
    // 2. stub content fetch — JSON payload containing the real doc id
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ doc_id: 'real-doc-1' }),
    } as Response)
    // 3. real doc metadata — a native Google Doc
    fetchSpy.mockResolvedValueOnce(jsonResponse({ mimeType: 'application/vnd.google-apps.document' }))

    vi.spyOn(g, 'exportFileToPdf').mockResolvedValue(Buffer.from('pdf-bytes'))

    const result = await g.getPreviewableContent(connectorId, fileId)

    expect(result.mimeType).toBe('application/pdf')
    expect(g.exportFileToPdf).toHaveBeenCalledWith(connectorId, 'real-doc-1')
  })

  it('streams raw bytes for an already-PDF file without calling exportFileToPdf', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(jsonResponse({ mimeType: 'application/pdf', name: 'Report.pdf' }))
    fetchSpy.mockResolvedValueOnce({ ok: true, body: {} as ReadableStream } as Response)
    const exportSpy = vi.spyOn(g, 'exportFileToPdf')

    const result = await g.getPreviewableContent(connectorId, fileId)

    expect(result.mimeType).toBe('application/pdf')
    expect(result.fileName).toBe('Report.pdf')
    expect(exportSpy).not.toHaveBeenCalled()
  })

  it('PDF-exports a native Google Workspace file via exportFileToPdf', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ mimeType: 'application/vnd.google-apps.spreadsheet', name: 'Sheet1' })
    )
    vi.spyOn(g, 'exportFileToPdf').mockResolvedValue(Buffer.from('pdf-bytes'))

    const result = await g.getPreviewableContent(connectorId, fileId)

    expect(result.mimeType).toBe('application/pdf')
    expect(result.fileName).toBe('Sheet1')
    expect(g.exportFileToPdf).toHaveBeenCalledWith(connectorId, fileId)
  })

  it('uses exportLinks["application/pdf"] directly for a processed uploaded Office file', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        name: 'Contract.docx',
        exportLinks: { 'application/pdf': 'https://export.example/pdf' },
      })
    )
    fetchSpy.mockResolvedValueOnce({ ok: true, body: {} as ReadableStream } as Response)
    const exportSpy = vi.spyOn(g, 'exportFileToPdf')

    const result = await g.getPreviewableContent(connectorId, fileId)

    expect(result.mimeType).toBe('application/pdf')
    expect(fetchSpy.mock.calls[1][0]).toBe('https://export.example/pdf')
    // exportLinks path is preferred over exportFileToPdf when both are available
    expect(exportSpy).not.toHaveBeenCalled()
  })

  it('falls back to exportFileToPdf for an Office mimetype with no exportLinks yet', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        mimeType: 'application/msword',
        name: 'Old.doc',
      })
    )
    vi.spyOn(g, 'exportFileToPdf').mockResolvedValue(Buffer.from('pdf-bytes'))

    const result = await g.getPreviewableContent(connectorId, fileId)

    expect(result.mimeType).toBe('application/pdf')
    expect(g.exportFileToPdf).toHaveBeenCalledWith(connectorId, fileId)
  })

  it('throws ConnectorContentError("unsupported") for a mimetype with no preview path', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ mimeType: 'application/x-zip-compressed', name: 'Archive.zip' })
    )

    await expect(g.getPreviewableContent(connectorId, fileId)).rejects.toMatchObject({
      code: 'unsupported',
      mimeType: 'application/x-zip-compressed',
    })
  })
})
