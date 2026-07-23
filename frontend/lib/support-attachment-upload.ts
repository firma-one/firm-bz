export type AttachmentMeta = {
  /** Stable identifier for this attachment — the canonical key for delete/lookup. */
  attachmentId: string
  originalName: string
  storedName: string
  mimeType: string
  size: number
  /** Base64 data URL — support ticket attachments are stored as DB blobs, mirroring
   *  Brand.logoData, not in Google Drive (see upload-attachment/route.ts for why). */
  blobData: string
}

export async function uploadSupportAttachment(
  bearerToken: string,
  ticketNumber: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ success: boolean; meta?: AttachmentMeta; error?: string }> {
  try {
    if (!bearerToken) {
      return { success: false, error: 'No authentication token available' }
    }

    // Upload file to backend endpoint which handles Google Drive upload server-side
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      // Track progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100
          onProgress(Math.round(percentComplete))
        }
      })

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            if (response.success && response.meta) {
              resolve({
                success: true,
                meta: response.meta,
              })
            } else {
              resolve({
                success: false,
                error: response.error || 'Upload failed',
              })
            }
          } catch (e) {
            resolve({
              success: false,
              error: `Failed to parse upload response: ${e instanceof Error ? e.message : 'Unknown error'}`,
            })
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            resolve({
              success: false,
              error: errorData.error || `Upload failed with status ${xhr.status}`,
            })
          } catch {
            resolve({
              success: false,
              error: `Upload failed with status ${xhr.status}`,
            })
          }
        }
      })

      // Handle errors
      xhr.addEventListener('error', () => {
        console.error(`XHR error: status=${xhr.status}, statusText=${xhr.statusText}`)
        let errorMsg = 'Network error during upload'
        if (xhr.status === 0) {
          errorMsg = 'Connection failed'
        } else if (xhr.status >= 400) {
          errorMsg = `Upload failed with status ${xhr.status}`
        }
        resolve({
          success: false,
          error: errorMsg,
        })
      })

      xhr.addEventListener('abort', () => {
        resolve({
          success: false,
          error: 'Upload was aborted',
        })
      })

      // Prepare form data
      const formData = new FormData()
      formData.append('file', file)

      // Send to backend endpoint
      xhr.open('POST', `/api/support/requests/${ticketNumber}/upload-attachment`)
      xhr.setRequestHeader('Authorization', `Bearer ${bearerToken}`)
      xhr.send(formData)
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
