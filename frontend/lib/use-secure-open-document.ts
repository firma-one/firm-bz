'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { failureReason } from '@/lib/files/action-failure'
import { regrantRefusalReason } from '@/lib/files/regrant-refusal'
import {
  holdingTabChannelName,
  holdingTabUrl,
  newHoldingTabKey,
  type HoldingTabMessage,
  type HoldingTabState,
  type SecureOpenProvider,
} from '@/lib/secure-open/holding-tab'

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
  /** Where the file lives, for the holding tab's words; the hook's own `provider` when omitted. */
  provider?: SecureOpenProvider
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
 * 'email' — Google Drive: grant succeeded, and the route says Google's sharing email went out
 *   (`emailed: true`) — the modal stays open with "check your inbox" copy until the user dismisses
 *   it. Never shown on anything else: a grant with no email and no link is an error (AC-10).
 * 'blocked' — grant succeeded but the browser refused the new tab (see handleSecureOpen). The
 *   modal stays open with a link the user clicks themselves, which always succeeds because the
 *   click carries its own user activation.
 * 'error' — request failed.
 */
export type SecureOpenModalMode = 'loading' | 'opening' | 'opened' | 'email' | 'blocked' | 'error'

/**
 * The tab opened on the click itself, while the browser still allows it: Firma's `/open` page
 * (components/secure-open/holding-page.tsx), which shows the file and what's happening until the
 * grant comes back and sendTabTo points it at the document. A grant can take longer than Chrome's
 * ~5s window for opening tabs, which used to leave the tab blocked.
 *
 * The page only displays; it hears the state over `channel` and can ask for it ('ready') or for
 * another try ('retry'). Access is decided here, by the regrant route, and nowhere else.
 */
interface HoldingTab {
  tab: Window
  /** Null where BroadcastChannel is missing: the page then can't show a failure, so it's closed instead. */
  channel: BroadcastChannel | null
  /** The last state told, for a page that loads (or reloads) after it was sent. */
  last: HoldingTabState
}

/** Null when the browser refused the tab; the caller then falls back to opening it afterwards. */
function openHoldingTab(doc: SecureOpenDocumentInput, provider: SecureOpenProvider | undefined): HoldingTab | null {
  if (typeof window === 'undefined') return null
  const key = newHoldingTabKey()
  const tab = window.open(
    holdingTabUrl({ key, fileName: doc.fileName, mimeType: doc.mimeType, provider }),
    '_blank'
  )
  if (!tab) return null
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(holdingTabChannelName(key))
  return { tab, channel, last: { state: 'waiting' } }
}

function tellHoldingTab(holding: HoldingTab, state: HoldingTabState) {
  holding.last = state
  holding.channel?.postMessage({ type: 'state', ...state } satisfies HoldingTabMessage)
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

function closeHoldingTab(tab: Window | null | undefined) {
  try {
    tab?.close()
  } catch {
    // Already closed by the user.
  }
}

interface SecureOpenOptions {
  /** "Email me a new access link": ends in an email, so no tab opens. */
  newAccessLink?: boolean
  /** Try again from the holding tab: the grant runs again into that same tab. */
  reuse?: HoldingTab
}

export interface UseSecureOpenDocumentOptions {
  /** When omitted, each call must provide doc.projectId (e.g. dashboard with mixed projects). */
  projectId?: string
  /** Optional; used for modal thumbnail proxy when opening from project context. */
  firmId?: string
  /** Optional log context for errors (e.g. 'ProjectShares', 'EngagementFileList'). */
  logContext?: string
  /** Where these documents live, for the holding tab's words ("opening it in OneDrive"). */
  provider?: SecureOpenProvider
}

export function useSecureOpenDocument({
  projectId,
  firmId: hookFirmId,
  logContext = 'SecureOpen',
  provider: hookProvider,
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
  /** The holding tab still listening: one at a time, so an older failed tab stops when a new open starts. */
  const holdingRef = useRef<HoldingTab | null>(null)
  /** The latest handleSecureOpen, for a holding tab's Try again. */
  const handleSecureOpenRef = useRef<((doc: SecureOpenDocumentInput, itemId?: string, opts?: SecureOpenOptions) => Promise<void>) | null>(null)

  const releaseHolding = useCallback((holding: HoldingTab | null) => {
    if (!holding) return
    holding.channel?.close()
    holding.channel = null
    if (holdingRef.current === holding) holdingRef.current = null
  }, [])

  useEffect(() => () => releaseHolding(holdingRef.current), [releaseHolding])

  const handleSecureOpen = useCallback(
    async (doc: SecureOpenDocumentInput, itemId?: string, opts?: SecureOpenOptions) => {
      const effectiveProjectId = doc.projectId ?? projectId
      if (!effectiveProjectId) return
      const id = itemId ?? doc.documentId
      const newAccessLink = opts?.newAccessLink === true
      lastOpenRef.current = { doc, itemId }

      // Before any await, while the click still allows opening a tab. "Email me a new access link"
      // ends in an email, not a tab, so it opens none. Try again in the holding tab reuses that tab.
      let holding: HoldingTab | null = null
      if (!newAccessLink) {
        const reuse = opts?.reuse
        if (reuse && !reuse.tab.closed) {
          holding = reuse
          tellHoldingTab(holding, { state: 'waiting' })
        } else {
          releaseHolding(holdingRef.current)
          holding = openHoldingTab(doc, doc.provider ?? hookProvider)
          const channel = holding?.channel
          if (holding && channel) {
            const h = holding
            channel.onmessage = (e: MessageEvent<HoldingTabMessage>) => {
              if (e.data?.type === 'ready') tellHoldingTab(h, h.last)
              else if (e.data?.type === 'retry') void handleSecureOpenRef.current?.(doc, itemId, { reuse: h })
            }
          }
        }
        holdingRef.current = holding
      }
      const holdingTab = holding?.tab ?? null
      /**
       * A failure is said in the holding tab, where the person is looking, as well as in the dialog
       * here; "Back to Firma" there closes it. Only a tab that can't hear it is closed instead.
       */
      const failInTab = (reason: string, retry: boolean) => {
        if (!holding) return
        if (holding.channel && !holding.tab.closed) {
          tellHoldingTab(holding, { state: 'error', reason, retry })
        } else {
          closeHoldingTab(holding.tab)
          releaseHolding(holding)
        }
      }

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
          failInTab('Your session has ended. Refresh the page and sign in again.', false)
          setRegrantError('Your session has ended. Refresh the page and sign in again.')
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
          const status = res.status
          const errBody = await res.json().catch(() => ({} as { error?: string; code?: string }))
          // warn, not debug — logger.debug is a no-op outside development, which made this
          // branch invisible in production exactly when it mattered.
          logger.warn('Regrant failed', logContext, { documentId: doc.documentId, status, code: errBody.code, elapsedMs })
          // The route's own words: a refused grant, a PDF copy that couldn't be made, SharePoint's
          // external sharing policy, a revoke. Each says what happened and what to do.
          const reason = regrantRefusalReason(status, errBody)
          failInTab(reason, status >= 500)
          setRegrantError(reason)
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
          if (holding && holdingTab && !holdingTab.closed) {
            // The Done check shows while the provider's page loads, then the tab is the document's.
            tellHoldingTab(holding, { state: 'done', provider: body.provider === 'google' || body.provider === 'onedrive' ? body.provider : undefined })
            releaseHolding(holding)
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

        // No link, and no email either: there's nothing to open, so it's said rather than "check
        // your email" (AC-10). Only the route knows whether Google's sharing email went out.
        if (body.emailed !== true) {
          logger.warn('Regrant answered with no link and no email', logContext, { documentId: doc.documentId, provider: body.provider })
          const reason = "Couldn't open this document · storage didn't send a link to open it. Try again in a moment."
          failInTab(reason, true)
          setRegrantError(reason)
          setSecureModalMode('error')
          return
        }

        // Google emailed instead: nothing opens in the tab, and the dialog here says to check email.
        closeHoldingTab(holdingTab)
        releaseHolding(holding)

        // Google Drive, shared by email: Google's own OTP is delivered via this email, so "check
        // your inbox" is the actual verification mechanism, not just a notification. Modal stays
        // open until the user dismisses it.
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
        const reason = isTimeout
          ? 'Opening this document is taking too long. Check your connection and try again.'
          : failureReason(e)
        failInTab(reason, true)
        setRegrantError(reason)
        setSecureModalMode('error')
      } finally {
        setIsRegrantLoading(false)
        setIsRegrantingId(null)
      }
    },
    [projectId, hookFirmId, logContext, hookProvider, releaseHolding]
  )
  handleSecureOpenRef.current = handleSecureOpen

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
