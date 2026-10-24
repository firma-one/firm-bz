'use client'

import { useState, useCallback, useRef } from 'react'
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
  /** Set in 'blocked' mode so the modal can offer a real, user-clicked link. */
  documentUrl?: string
}

/**
 * 'loading' — generic, provider-neutral "Preparing secure access…" state, shown immediately on
 *   click before we know which provider this document belongs to.
 * 'opening' — OneDrive/SharePoint: grant succeeded, opening the document in a new tab now; the
 *   modal shows a brief confirmation then auto-closes (no email round-trip needed for this
 *   provider, see handleSecureOpen below).
 * 'opened' — Google Drive, opened directly (the permission stood, or it's a known Google account
 *   shared silently): stays open with "Email me a new access link", for a visitor whose 7 days
 *   are up or who landed on Google's "You need access" page.
 * 'email' — Google Drive: grant succeeded, Google's own OTP is delivered via email — the modal
 *   stays open with "check your inbox" copy until the user dismisses it.
 * 'blocked' — grant succeeded but the browser refused the new tab (see handleSecureOpen). The
 *   modal stays open with a link the user clicks themselves, which always succeeds because the
 *   click carries its own user activation.
 * 'error' — request failed.
 */
export type SecureOpenModalMode = 'loading' | 'opening' | 'opened' | 'email' | 'blocked' | 'error'

/**
 * Opens the new tab on the click itself, while the browser still allows it, and shows a holding
 * line in it until the grant comes back (sendTabTo then points it at the document). A grant can
 * take longer than Chrome's ~5s window for opening tabs, which used to leave the tab blocked.
 * Null when the browser refused anyway; the caller then falls back to opening it afterwards.
 */
function openHoldingTab(fileName: string): Window | null {
  if (typeof window === 'undefined') return null
  const tab = window.open('', '_blank')
  if (!tab) return null
  try {
    tab.document.title = 'Opening…'
    const line = tab.document.createElement('p')
    line.textContent = `Preparing secure access to ${fileName}…`
    line.setAttribute('style', 'margin:40vh auto 0;max-width:32rem;padding:0 16px;text-align:center;font:14px/1.5 system-ui,sans-serif;color:#6f6e69')
    tab.document.body.appendChild(line)
  } catch {
    // The blank tab still works as a target without the holding line.
  }
  return tab
}

/** Points the holding tab at the document, cutting its link back to this page first. */
function sendTabTo(tab: Window, url: string) {
  try {
    tab.opener = null
  } catch {
    // Some browsers don't allow it once the tab has moved on; navigating still works.
  }
  tab.location.replace(url)
}

function closeHoldingTab(tab: Window | null) {
  try {
    tab?.close()
  } catch {
    // Already closed by the user.
  }
}

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
  /** The last document opened, so "Email me a new access link" can ask again for it. */
  const lastOpenRef = useRef<{ doc: SecureOpenDocumentInput; itemId?: string } | null>(null)

  const handleSecureOpen = useCallback(
    async (doc: SecureOpenDocumentInput, itemId?: string, opts?: { newAccessLink?: boolean }) => {
      const effectiveProjectId = doc.projectId ?? projectId
      if (!effectiveProjectId) return
      const id = itemId ?? doc.documentId
      const newAccessLink = opts?.newAccessLink === true
      lastOpenRef.current = { doc, itemId }

      // Before any await, while the click still allows opening a tab. "Email me a new access link"
      // ends in an email, not a tab, so it opens none.
      const holdingTab = newAccessLink ? null : openHoldingTab(doc.fileName)

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
          closeHoldingTab(holdingTab)
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
        // Elapsed time matters diagnostically: the browser only honours window.open() while
        // transient user activation is alive (~5s in Chrome), so a slow regrant is the
        // difference between the document opening and the new tab being silently blocked.
        const startedAt = Date.now()
        const res = await Promise.race([
          fetch(
            `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(doc.documentId)}/sharing/regrant${newAccessLink ? '?fresh=1' : ''}`,
            { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }
          ),
          timeout,
        ])
        const elapsedMs = Date.now() - startedAt

        if (!res.ok) {
          closeHoldingTab(holdingTab)
          const status = res.status
          const errBody = await res.json().catch(() => ({} as { error?: string; code?: string }))
          // warn, not debug — logger.debug is a no-op outside development, which made this
          // branch invisible in production exactly when it mattered.
          logger.warn('Regrant failed', logContext, { documentId: doc.documentId, status, code: errBody.code, elapsedMs })
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
          // Browsers only allow window.open() while transient user activation is alive (~5s in
          // Chrome). The regrant above runs sequential Graph round-trips and has been measured
          // at 16.6s, by which point the activation from the user's click is long gone and the
          // new tab is blocked — silently, returning null. Previously the return value was
          // ignored, so the modal flipped to "opening", auto-closed 1.2s later, and the user saw
          // the document simply never open with no error anywhere. Detect that and hand them a
          // link to click instead: that click carries its own activation and always works.
          // The holding tab opened on the click avoids all of that; window.open here is only the
          // fallback for when the browser refused even that, or the user closed it meanwhile.
          let opened: Window | null = null
          if (holdingTab && !holdingTab.closed) {
            sendTabTo(holdingTab, body.documentUrl)
            opened = holdingTab
          } else if (typeof window !== 'undefined') {
            opened = window.open(body.documentUrl, '_blank')
          }
          const wasBlocked = !opened || opened.closed || typeof opened.closed === 'undefined'

          if (wasBlocked) {
            logger.warn('Secure access tab was blocked by the browser', logContext, {
              documentId: doc.documentId,
              elapsedMs,
            })
            setSecureModalData((prev) => ({ ...prev, documentUrl: body.documentUrl }))
            setSecureModalMode('blocked')
            return
          }

          if (body.provider === 'google') {
            // Stays up (the user is on the new tab meanwhile) so that, back here, a visitor whose
            // 7 days are up can ask for a new access link.
            setSecureModalMode('opened')
            return
          }
          setSecureModalMode('opening')
          setTimeout(() => setSecureModalOpen(false), 1200)
          return
        }

        // Google Drive, shared by email: Google's own OTP is delivered via this email, so "check
        // your inbox" is the actual verification mechanism, not just a notification. Modal stays
        // open until the user dismisses it.
        closeHoldingTab(holdingTab)
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
        closeHoldingTab(holdingTab)
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

  /** "Email me a new access link": grant the last-opened document again, with Google's sharing email. */
  const requestNewAccessLink = useCallback(() => {
    const last = lastOpenRef.current
    if (last) void handleSecureOpen(last.doc, last.itemId, { newAccessLink: true })
  }, [handleSecureOpen])

  const canSecureOpen = (doc: SecureOpenDocumentInput) => Boolean(doc.projectId ?? projectId)

  return {
    handleSecureOpen,
    requestNewAccessLink,
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
