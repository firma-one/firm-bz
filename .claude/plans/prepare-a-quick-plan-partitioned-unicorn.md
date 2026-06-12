# Plan: Document ActionMenu → "Preview" item

## Context

Users want a quick way to preview a document in the right pane directly from the action menu. The preview must **not** use a Google Drive iframe — the file bytes must be fetched through the app's own secure server endpoint (same as download), converted to a blob URL, and rendered in a sandboxed iframe inside the right pane. No Google credentials or Drive URLs ever reach the browser.

---

## How the file is retrieved and shown securely

1. **Same fetch as download** — the client calls the existing secure endpoint:
   - Project-context docs: `GET /api/projects/{projectId}/documents/{documentId}/download-share`
   - Files-tab docs (no `projectId`): `GET /api/documents/download?fileId=...&connectorId=...&token=...`
   Both paths authenticate via Supabase session, verify org membership server-side, and stream back raw bytes. Google credentials never reach the browser.

2. **Blob URL** — the client receives the response as a `blob()`, creates `URL.createObjectURL(blob)`, and sets that as the iframe `src`. The iframe renders PDFs and images natively; other types fall back to a "preview not available" message.

3. **Cleanup** — the blob URL is revoked when the right pane is cleared (via a `useEffect` cleanup in the new preview panel component).

4. **Loading state** — while fetching, the panel shows a spinner. On error (403 permission denied, network failure), it shows an inline error message.

---

## What exists already (reused, not changed)

| Asset | Path |
|---|---|
| Download fetch logic (project path) | `document-action-menu.tsx:406–430` (`handleDownload`) |
| Download fetch logic (files-tab path) | same file, lines 431–441 |
| `useRightPane` hook + `setPaneSize` | `frontend/lib/right-pane-context.tsx` |
| Right pane panel pattern (existing panels for reference) | `document-activity-pane.tsx`, `document-history-pane.tsx` |
| `Eye` icon already imported | `document-action-menu.tsx:34` |
| Download progress context | `frontend/lib/download-progress-context.tsx` |

---

## Changes required

### 1. New component: `DocumentBlobPreviewPane`
**New file:** `frontend/components/files/document-blob-preview-pane.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getSession } from '@/lib/supabase'

export function DocumentBlobPreviewPane({ document }: { document: any }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null

    async function fetchBlob() {
      try {
        const session = await getSession()
        let res: Response

        if (document.projectId && document.id) {
          res = await fetch(
            `/api/projects/${document.projectId}/documents/${encodeURIComponent(document.id)}/download-share`
          )
        } else {
          const fileId = document.externalId || document.id
          res = await fetch(
            `/api/documents/download?fileId=${fileId}&connectorId=${document.connectorId}&filename=${encodeURIComponent(document.name ?? 'file')}&token=${session?.access_token}`
          )
        }

        if (!res.ok) {
          setError(res.status === 403 ? 'You do not have permission to preview this file.' : 'Failed to load preview.')
          return
        }

        const blob = await res.blob()
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      } catch {
        setError('Failed to load preview.')
      }
    }

    fetchBlob()
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [document.id, document.projectId])

  if (error) return (
    <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">{error}</div>
  )
  if (!blobUrl) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-100" style={{ minHeight: 0 }}>
      <iframe
        src={blobUrl}
        className="absolute inset-0 w-full h-full border-0"
        title="Preview"
        sandbox="allow-same-origin allow-scripts"
      />
    </div>
  )
}
```

### 2. Add "Preview" menu item
**File:** `frontend/components/ui/document-action-menu.tsx`

- Import `DocumentBlobPreviewPane` at the top alongside the existing sheet imports.
- In the non-folder menu section, insert **after** the "Open" item (~line 763) and **before** the Download permission guard (~line 765):

```tsx
<DropdownMenuItem
  onClick={() => {
    if (rightPane.hasRightPane) {
      rightPane.setTitle(document.name || 'Preview')
      rightPane.setPaneSize('medium')
      rightPane.setContent(<DocumentBlobPreviewPane document={document} />)
    }
  }}
  className="flex items-center space-x-3 px-3 py-2 cursor-pointer text-xs"
>
  <Eye className="h-4 w-4 text-gray-600" />
  <span>Preview</span>
</DropdownMenuItem>
```

No fallback to download — if there's no right pane the item is simply not that useful, and we can hide it with `{rightPane.hasRightPane && (...)}` if preferred.

---

## Verification

1. Open an engagement file list; click `…` on a PDF → **Preview** appears between "Open" and "Download".
2. Click **Preview** — right pane opens (medium width) with a spinner, then the PDF renders inline.
3. Check the Network tab: request goes to `/api/projects/.../download-share`, not a Google URL. No `drive.google.com` URL in the iframe `src`.
4. Repeat with a DOCX/Google Doc — same flow (server exports to PDF, streams bytes).
5. Click Preview on a file you don't have download permission for — pane shows the permission-denied message.
6. Close the pane and reopen — blob URL is revoked and a new fetch is triggered.
7. Confirm existing "Open" and "Download" items still work normally.
