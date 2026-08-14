"use client"

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { X, Download } from "lucide-react"
import { DocumentIcon } from "@/components/ui/document-icon"
import { formatFileSize, formatSmartDateTime } from "@/lib/utils"
import { useRightPane } from "@/lib/right-pane-context"
import { useState } from "react"
import { useToast } from "@/components/ui/toast"
import { Loader2, MailCheck, ShieldCheck, Mail } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

import { DocumentHeader } from "./document-header"

export function ReGrantEditorAccessButton({ projectId, documentId, isGuest }: { projectId: string; documentId: string; isGuest?: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const { addToast } = useToast()

  if (isGuest) return null // Guests only have read access, they don't need editor OTPs

  const handleRegrant = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/projects/${projectId}/documents/${documentId}/sharing/regrant`, {
        method: 'POST'
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as { error?: string; code?: string }))
        if (errBody.code === 'external_sharing_blocked' && errBody.error) {
          // Tenant-level SharePoint external sharing policy blocked this recipient — confirmed
          // live 2026-08-14 (works for internal-domain recipients, fails for external on the same
          // tenant). Not retryable from the app; surface the specific message instead of the
          // generic failure toast. See onedrive-permission-adapter.ts / regrant/route.ts.
          addToast({ type: "error", title: "Sharing blocked", message: errBody.error })
          return
        }
        throw new Error(errBody.error || 'Failed to authenticate editor access')
      }

      const data = await res.json().catch(() => ({}))
      if (data.documentUrl) {
        // OneDrive/SharePoint: the recipient is already here, in-browser — open the document
        // directly rather than routing through an email. Microsoft's own invite email is
        // unreliable for non-Microsoft recipients, and since access here never expires (only the
        // OTP-authenticated session does, after ~24h), an emailed link would offer no durability
        // benefit worth the detour. See onedrive-permission-adapter.ts / regrant/route.ts.
        window.open(data.documentUrl, '_blank')
      } else {
        // Google Drive: unchanged — Google's own OTP is delivered via this email, so the
        // "check your inbox" step is the actual verification mechanism, not just a notification.
        setShowSuccessModal(true)
      }
    } catch (err) {
      addToast({
        type: "error",
        title: "Failed to authenticate",
        message: "There was a problem authenticating editor access. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRegrant}
        disabled={isLoading}
        className="gap-2 hidden sm:flex"
        title="Click if your storage provider is asking you to sign in"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4 text-green-600" />}
        Authenticate Editor Access
      </Button>

      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
              <ShieldCheck className="h-6 w-6 text-green-600" />
            </div>
            <DialogTitle className="text-center text-xl">Secure Edit Link Sent!</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <p className="text-sm text-gray-500">
              A new encrypted edit link has just been sent to your inbox.
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 w-full flex items-center justify-center space-x-3">
              <Mail className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Please click the link in that email to begin editing safely.</span>
            </div>
          </div>
          <div className="flex justify-center mt-2">
            <Button onClick={() => setShowSuccessModal(false)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white">
              Got it, checking my email
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Returns the Google Drive file ID for a document. In shares/portal context the
 * document has externalId (Drive ID) and id (Pockett UUID). In Drive API context
 * id is the Drive file ID. Use this when building Google Docs/Drive URLs.
 */
export function getDriveFileId(document: { id: string; externalId?: string | null }): string {
  return document.externalId ?? document.id
}

/**
 * Returns the in-app edit URL for a document.
 * Uses webViewLink when available; otherwise builds edit URL from Drive file ID + mimeType.
 * Client never sees "Google" in the UI — seamless Edit experience (Option 1).
 *
 * Note: Google does not provide an official query parameter to hide the "Upgrade" button
 * or other chrome inside the Docs edit iframe. The iframe content is cross-origin and
 * cannot be modified. Optional params like rm=minimal are undocumented and may reduce
 * some UI but do not reliably remove Upgrade. Distribution control stays via ActionMenu
 * (e.g. download gated by persona).
 */
export function getDocumentEditUrl(document: { id: string; externalId?: string | null; mimeType?: string; webViewLink?: string }): string {
  if (document.webViewLink) return document.webViewLink
  const driveFileId = getDriveFileId(document)
  const mime = document.mimeType ?? ""
  if (mime.includes("spreadsheet"))
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`
  if (mime.includes("presentation"))
    return `https://docs.google.com/presentation/d/${driveFileId}/edit`
  return `https://docs.google.com/document/d/${driveFileId}/edit`
}

/**
 * Returns the in-app preview (view-only) URL. Never returns /edit or webViewLink.
 * Uses /view for Docs/Sheets/Slides so the iframe is read-only; Drive file preview for other types.
 */
export function getDocumentPreviewUrl(document: { id: string; externalId?: string | null; mimeType?: string; name?: string; projectId?: string }): string {
  if (document.projectId) {
    return `/api/projects/${document.projectId}/documents/${document.id}/preview`
  }
  const driveFileId = getDriveFileId(document)
  const mime = (document.mimeType ?? "").toLowerCase()
  const name = (document.name ?? "").toLowerCase()
  // Native Google Apps mime: use /view (read-only)
  if (mime.includes("vnd.google-apps.document"))
    return `https://docs.google.com/document/d/${driveFileId}/view`
  if (mime.includes("vnd.google-apps.spreadsheet"))
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/view`
  if (mime.includes("vnd.google-apps.presentation"))
    return `https://docs.google.com/presentation/d/${driveFileId}/view`
  // By extension: use native /view so we get read-only (Drive preview can open editor for .docx etc.)
  if (/\.(docx?|doc)$/i.test(name))
    return `https://docs.google.com/document/d/${driveFileId}/view`
  if (/\.(xlsx?|xls)$/i.test(name))
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/view`
  if (/\.(pptx?|ppt)$/i.test(name))
    return `https://docs.google.com/presentation/d/${driveFileId}/view`
  // Office mime but no extension, or other types: prefer document view for "document" mime so Preview stays read-only
  if (mime.includes("document") || mime.includes("wordprocessing"))
    return `https://docs.google.com/document/d/${driveFileId}/view`
  if (mime.includes("spreadsheet") || mime.includes("sheet"))
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/view`
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return `https://docs.google.com/presentation/d/${driveFileId}/view`
  return `https://drive.google.com/file/d/${driveFileId}/preview`
}

interface DocumentEditSheetProps {
  isOpen: boolean
  onClose: () => void
  document: any
  onDownload?: (doc: any) => void
}

/**
 * Content only (iframe). Used inside layout right panel (20% push + expand).
 * Download is only in ActionMenu (and will be gated by persona permissions).
 */
export function DocumentEditPanelContent({ document }: { document: any }) {
  if (!document) return null
  const editUrl = getDocumentEditUrl(document)
  return (
    <div className="flex-1 min-h-0 relative bg-gray-100 flex flex-col" style={{ minHeight: 0 }}>
      <DocumentHeader
        document={document}
        onOpenInBrowser={() => window.open(editUrl, '_blank')}
        showEditAuth={true}
      />
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <iframe
          src={editUrl}
          className="absolute inset-0 w-full h-full border-0"
          title="Edit document"
          allowFullScreen
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur border-t border-gray-200 p-3 text-center text-sm text-gray-500 sm:hidden">
        <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => window.open(editUrl, '_blank')}>
          Open in new tab
        </Button>
      </div>
    </div>
  )
}

/**
 * Preview-only panel content (iframe). Used in the same right sidebar as Edit.
 * Includes "Edit" to switch the sidebar to edit mode without closing.
 */
export function DocumentPreviewPanelContent({ document }: { document: any }) {
  const rightPane = useRightPane()
  if (!document) return null
  const previewUrl = getDocumentPreviewUrl(document)
  const editUrl = getDocumentEditUrl(document)

  const switchToEdit = () => {
    if (rightPane.hasRightPane) {
      rightPane.setTitle(document.name ?? 'Document')
      rightPane.setContent(<DocumentEditPanelContent document={document} />)
    } else {
      window.open(editUrl, '_blank')
    }
  }

  const handleDownload = () => {
    if (!document.projectId) return
    window.open(`/api/projects/${document.projectId}/documents/${document.id}/preview?download=true`, '_blank')
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gray-100 overflow-hidden" style={{ minHeight: 0 }}>
      <DocumentHeader
        document={document}
        onDownload={document.projectId ? handleDownload : undefined}
        onOpenInBrowser={() => window.open(previewUrl, '_blank')}
        showEditAuth={false}
      />
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <iframe
          src={previewUrl}
          className="absolute inset-0 w-full h-full border-0"
          title="Preview document"
          allowFullScreen
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur border-t border-gray-200 p-3 text-center text-sm text-gray-500 sm:hidden">
        <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={switchToEdit}>
          Edit
        </Button>
      </div>
    </div>
  )
}

/**
 * Embedded document editor sheet. Opens the document edit experience inside Pockett
 * (iframe). Client stays in-app; we do not expose "Google" or open external tabs.
 * Future: iframe src can be switched to a backend proxy URL for full service-account flow.
 */
export function DocumentEditSheet({
  isOpen,
  onClose,
  document,
  onDownload,
}: DocumentEditSheetProps) {
  if (!document) return null

  const editUrl = getDocumentEditUrl(document)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-4xl md:max-w-5xl p-0 flex flex-col h-full bg-slate-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <DocumentIcon mimeType={document.mimeType} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold text-gray-900 truncate" title={document.name}>
                {document.name}
              </SheetTitle>
              <SheetDescription className="flex items-center text-xs text-gray-500 space-x-2">
                <span>{formatFileSize(document.size)}</span>
                <span>•</span>
                <span>Edited {formatSmartDateTime(document.modifiedTime)}</span>
              </SheetDescription>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {document?.projectId && (
              <ReGrantEditorAccessButton
                projectId={document.projectId}
                documentId={document.id}
              />
            )}
            {onDownload && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDownload(document)}
                title="Download"
                className="text-gray-500 hover:text-gray-900"
              >
                <Download className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              title="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative bg-gray-100 flex flex-col min-h-0">
          <iframe
            src={editUrl}
            className="w-full h-full border-0 flex-1 min-h-[400px]"
            title="Edit document"
            allowFullScreen
          />
          {/* Fallback for small screens or if iframe is blocked */}
          <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur border-t border-gray-200 p-4 text-center text-sm text-gray-500 sm:hidden">
            <Button
              className="w-full bg-green-600 text-white hover:bg-green-700"
              onClick={() => window.open(editUrl, '_blank')}
            >
              Open in new tab
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
