import { describe, it, expect, vi } from 'vitest'
import { createGoogleDriveContentAdapter } from './google-drive-content-adapter'
import type { IConnectorContentAdapter } from '../types'

// Stub the GDrive connector singleton — tests must not hit the DB or Drive API
vi.mock('@/lib/google-drive-connector', () => ({
  GoogleDriveConnector: {
    getInstance: () => mockGDrive,
  },
  googleDriveConnector: {},
}))

const pdfBuffer = Buffer.from('pdf-bytes')
const nativeStream = {} as ReadableStream

const previewStream = {} as ReadableStream

const mockGDrive = {
  uploadNewFile: vi.fn().mockResolvedValue('new-file-id'),
  overwriteFileContent: vi.fn().mockResolvedValue(undefined),
  getAccessToken: vi.fn().mockResolvedValue('token-abc'),
  getResumableUploadUrl: vi.fn().mockResolvedValue('https://upload.example/session'),
  exportFileToPdf: vi.fn().mockResolvedValue(pdfBuffer),
  getFileMetadata: vi.fn().mockResolvedValue({ id: 'f1', name: 'Report' }),
  downloadFile: vi.fn().mockResolvedValue({ stream: nativeStream, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: '1024', name: 'Report.docx' }),
  patchFileProperties: vi.fn().mockResolvedValue(undefined),
  getPreviewableContent: vi.fn().mockResolvedValue({ stream: previewStream, mimeType: 'application/pdf', fileName: 'Report.pdf' }),
}

describe('createGoogleDriveContentAdapter', () => {
  it('returns an object satisfying IConnectorContentAdapter', () => {
    const adapter: IConnectorContentAdapter = createGoogleDriveContentAdapter()
    expect(typeof adapter.createFile).toBe('function')
    expect(typeof adapter.overwriteFileContent).toBe('function')
    expect(typeof adapter.createUploadSession).toBe('function')
    expect(typeof adapter.getRenderableContent).toBe('function')
    expect(typeof adapter.setCopyRestricted).toBe('function')
  })

  it('createFile delegates to uploadNewFile and returns the created id', async () => {
    const adapter = createGoogleDriveContentAdapter()
    const content = Buffer.from('hello')
    const result = await adapter.createFile('conn-1', 'folder-1', 'note.txt', content, 'text/plain')
    expect(result).toEqual({ id: 'new-file-id' })
    expect(mockGDrive.uploadNewFile).toHaveBeenCalledWith('conn-1', 'note.txt', content, 'text/plain', 'folder-1')
  })

  it('overwriteFileContent delegates to GDrive', async () => {
    const adapter = createGoogleDriveContentAdapter()
    const content = Buffer.from('updated')
    await adapter.overwriteFileContent('conn-1', 'file-1', content, 'text/plain')
    expect(mockGDrive.overwriteFileContent).toHaveBeenCalledWith('conn-1', 'file-1', content, 'text/plain')
  })

  it('createUploadSession resolves an access token then requests a resumable upload url', async () => {
    const adapter = createGoogleDriveContentAdapter()
    const result = await adapter.createUploadSession('conn-1', 'folder-1', 'big.zip', 'application/zip')
    expect(result).toEqual({ uploadUrl: 'https://upload.example/session' })
    expect(mockGDrive.getResumableUploadUrl).toHaveBeenCalledWith(
      'token-abc',
      { name: 'big.zip', mimeType: 'application/zip', parents: ['folder-1'] },
      undefined
    )
  })

  it('getRenderableContent("pdf") exports via exportFileToPdf and returns a Buffer', async () => {
    const adapter = createGoogleDriveContentAdapter()
    const result = await adapter.getRenderableContent('conn-1', 'file-1', 'pdf')
    expect(result.stream).toBe(pdfBuffer)
    expect(result.mimeType).toBe('application/pdf')
    expect(result.fileName).toBe('Report.pdf')
    expect(mockGDrive.exportFileToPdf).toHaveBeenCalledWith('conn-1', 'file-1')
  })

  it('getRenderableContent("native") delegates to downloadFile', async () => {
    const adapter = createGoogleDriveContentAdapter()
    const result = await adapter.getRenderableContent('conn-1', 'file-1', 'native')
    expect(result.stream).toBe(nativeStream)
    expect(result.fileName).toBe('Report.docx')
    expect(mockGDrive.downloadFile).toHaveBeenCalledWith('conn-1', 'file-1')
  })

  it('setCopyRestricted patches copyRequiresWriterPermission', async () => {
    const adapter = createGoogleDriveContentAdapter()
    await adapter.setCopyRestricted('conn-1', 'file-1', true)
    expect(mockGDrive.patchFileProperties).toHaveBeenCalledWith('conn-1', 'file-1', { copyRequiresWriterPermission: true })
  })

  it('getPreviewableContent delegates to GDrive', async () => {
    const adapter = createGoogleDriveContentAdapter()
    const result = await adapter.getPreviewableContent('conn-1', 'file-1')
    expect(result.stream).toBe(previewStream)
    expect(result.mimeType).toBe('application/pdf')
    expect(result.fileName).toBe('Report.pdf')
    expect(mockGDrive.getPreviewableContent).toHaveBeenCalledWith('conn-1', 'file-1')
  })
})
