'use client'

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export interface SecureOpenDocumentInput {
  /** Document id for regrant API (search index id or externalId). */
  documentId: string
  fileName: string
  mimeType?: string
  externalId: string
  firmId?: string
  /** When provided, used for regrant API (e.g. dashboard list with mixed projects). */
  projectId?: string
  /** Optional; used for fallback open when regrant fails (e.g. document not in Shares). */
  webViewLink?: string
}

export interface SecureOpenModalData {
  email: string
  fileName: string
  mimeType?: string
  externalId?: string
  firmId?: string
}

/**
 * 'loading' — generic, provider-neutral "Preparing secure access…" state, shown immediately on
 *   click before we know which provider this document belongs to.
 * 'opening' — OneDrive/SharePoint: grant succeeded, opening the document in a new tab now; the
 *   modal shows a brief confirmation then auto-closes (no email round-trip needed for this
 *   provider, see handleSecureOpen below).
 * 'email' — Google Drive: grant succeeded, Google's own OTP is delivered via email — the modal
 *   stays open with "check your inbox" copy until the user dismisses it.
 * 'error' — request failed.
 */
export type SecureOpenModalMode = 'loading' | 'opening' | 'email' | 'error'

export interface UseSecureOpenDocumentOptions {
  /** When omitted, each call must provide doc.projectId (e.g. dashboard with mixed projects). */
  projectId?: string
  /** Optional; used for modal thumbnail proxy when opening from project context. */
  firmId?: string
  /** Optional log context for errors (e.g. 'ProjectShares', 'EngagementFileList'). */
  logContext?: string
}

export function useSecureOpenDocument({
  projectId,
  firmId: hookFirmId,
  logContext = 'SecureOpen',
}: UseSecureOpenDocumentOptions) {
  const [secureModalOpen, setSecureModalOpen] = useState(false)
  const [secureModalMode, setSecureModalMode] = useState<SecureOpenModalMode>('loading')
  const [secureModalData, setSecureModalData] = useState<SecureOpenModalData>({
    email: '',
    fileName: '',
  })
  const [isRegrantLoading, setIsRegrantLoading] = useState(false)
  const [regrantError, setRegrantError] = useState<string | null>(null)
  const [isRegrantingId, setIsRegrantingId] = useState<string | null>(null)

  const handleSecureOpen = useCallback(
    async (doc: SecureOpenDocumentInput, itemId?: string) => {
      const effectiveProjectId = doc.projectId ?? projectId
      if (!effectiveProjectId) return
      const id = itemId ?? doc.documentId

      // Open immediately with a generic, provider-neutral "Preparing secure access…" loading
      // state — we don't know yet whether this is Google (genuinely needs "check your inbox",
      // since Google's OTP delivery IS the email) or OneDrive (opens directly in a new tab, no
      // email involved). Previously this always showed Google-specific "verification link sent"
      // copy during the loading phase, which was wrong for OneDrive — confirmed live 2026-08-14.
      setSecureModalMode('loading')
      setIsRegrantLoading(true)
      setRegrantError(null)
      setSecureModalData({
        email: '',
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        externalId: doc.externalId,
        firmId: doc.firmId ?? hookFirmId,
      })
      setSecureModalOpen(true)
      setIsRegrantingId(id)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setRegrantError('Session expired. Please refresh and try again.')
          setSecureModalMode('error')
          return
        }

        // 45s — regrant/route.ts runs 3 SEQUENTIAL Graph round-trips for OneDrive (webViewLink
        // lookup, guest pre-invite, permission grant) plus a DB write. These were briefly
        // parallelized to fit under a 15s timeout but that caused a worse regression — the guest
        // pre-invite and the permission grant can resolve to different guest objects for the same
        // email when run concurrently, landing the recipient on SharePoint's "You need access"
        // page after a successful sign-in. Reverted to sequential (see regrant/route.ts) and
        // widened the timeout instead — a single real sequential request hit 16.6s under the old
        // 15s timeout; 45s leaves comfortable headroom for slower Graph responses. See
        // .claude/plans/connector-microsoft-impl.md.
        const TIMEOUT_MS = 45_000
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
        )
        const res = await Promise.race([
          fetch(
            `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(doc.documentId)}/sharing/regrant`,
            { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }
          ),
          timeout,
        ])

        if (!res.ok) {
          const status = res.status
          const errBody = await res.json().catch(() => ({} as { error?: string; code?: string }))
          logger.debug('Regrant failed', logContext, { documentId: doc.documentId, status, code: errBody.code })
          if (errBody.code === 'external_sharing_blocked' && errBody.error) {
            // Tenant-level SharePoint external sharing policy blocked this specific recipient —
            // confirmed live 2026-08-14 (works for internal-domain recipients on the same tenant,
            // fails for external). Not something the app can retry around; surface the specific,
            // actionable message from regrant/route.ts instead of the generic 403 copy.
            setRegrantError(errBody.error)
          } else if (status === 403) {
            setRegrantError('Your access to this document has been revoked. Please contact your engagement lead.')
          } else {
            setRegrantError('Unable to open this document. Please try again or contact support.')
          }
          setSecureModalMode('error')
          return
        }

        const body = await res.json().catch(() => ({}))
        if (body.documentUrl) {
          // OneDrive/SharePoint: regrant/route.ts returns the granted item's own webUrl, opened
          // directly since the user is already here in-browser — no email round-trip needed.
          // Microsoft's own invite email is unreliable for non-Microsoft recipients, and access
          // here never expires (only the ~24h OTP session does), so an emailed link offers no
          // durability benefit over just clicking again. Modal switches to a brief "opening…"
          // confirmation and auto-closes rather than lingering. See
          // components/files/document-edit-sheet.tsx's ReGrantEditorAccessButton for the
          // matching fix in the other "regrant" entry point, and
          // .claude/plans/connector-microsoft-impl.md.
          setSecureModalMode('opening')
          if (typeof window !== 'undefined') window.open(body.documentUrl, '_blank')
          setTimeout(() => setSecureModalOpen(false), 1200)
          return
        }

        // Google Drive: unchanged — Google's own OTP is delivered via this email, so "check your
        // inbox" is the actual verification mechanism, not just a notification. Modal stays open
        // until the user dismisses it.
        const { data: { user } } = await supabase.auth.getUser()
        const email = user?.email || user?.user_metadata?.email || 'your email'

        setSecureModalData({
          email,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          externalId: doc.externalId,
          firmId: doc.firmId ?? hookFirmId,
        })
        setSecureModalMode('email')
      } catch (e) {
        const isTimeout = e instanceof Error && e.message === 'timeout'
        logger.error(
          isTimeout ? 'Secure access timed out' : 'Failed to trigger secure access',
          e instanceof Error ? e : new Error(String(e)),
          logContext,
          { documentId: doc.documentId }
        )
        setRegrantError(
          isTimeout
            ? 'The request timed out. Please check your connection and try again.'
            : 'Unable to open this document. Please try again or contact support.'
        )
        setSecureModalMode('error')
      } finally {
        setIsRegrantLoading(false)
        setIsRegrantingId(null)
      }
    },
    [projectId, hookFirmId, logContext]
  )

  const canSecureOpen = (doc: SecureOpenDocumentInput) => Boolean(doc.projectId ?? projectId)

  return {
    handleSecureOpen,
    canSecureOpen,
    secureModalOpen,
    secureModalMode,
    secureModalData,
    setSecureModalOpen,
    isRegrantingId,
    isRegrantLoading,
    regrantError,
  }
}
