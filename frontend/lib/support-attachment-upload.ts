export type AttachmentMeta = {
  originalName: string
  storedName: string
  driveFileId: string
  mimeType: string
  size: number
}

export async function uploadSupportAttachment(
  bearerToken: string,
  firmSlug: string,
  ticketNumber: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ success: boolean; meta?: AttachmentMeta; error?: string }> {
  try {
    if (!bearerToken) {
      return { success: false, error: 'No authentication token available' }
    }

    // Step 1: Get resumable upload URL from our API
    const prepareRes = await fetch('/api/support/attachments/prepare-upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firmSlug,
        ticketNumber,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      }),
    })

    if (!prepareRes.ok) {
      const errorData = await prepareRes.json()
      return { success: false, error: errorData.error || 'Failed to prepare upload' }
    }

    const { uploadUrl, storedName } = await prepareRes.json()

    // Step 2: Upload file directly to Google Drive resumable upload URL
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
            // Google Drive returns JSON with the file metadata including ID
            const responseText = xhr.responseText
            let driveFileId = ''

            // Try to parse as JSON (standard response)
            try {
              const response = JSON.parse(responseText)
              driveFileId = response.id
            } catch {
              // If not JSON, try to extract from response (Google sometimes returns different formats)
              const idMatch = responseText.match(/"id"\s*:\s*"([^"]+)"/)
              if (idMatch) {
                driveFileId = idMatch[1]
              }
            }

            if (!driveFileId) {
              return resolve({
                success: false,
                error: 'No file ID in upload response',
              })
            }

            resolve({
              success: true,
              meta: {
                originalName: file.name,
                storedName,
                driveFileId,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
              },
            })
          } catch (e) {
            resolve({
              success: false,
              error: `Failed to parse upload response: ${e instanceof Error ? e.message : 'Unknown error'}`,
            })
          }
        } else {
          resolve({
            success: false,
            error: `Upload failed with status ${xhr.status}`,
          })
        }
      })

      // Handle errors
      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Network error during upload',
        })
      })

      xhr.addEventListener('abort', () => {
        resolve({
          success: false,
          error: 'Upload was aborted',
        })
      })

      // Send the file
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.send(file)
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
