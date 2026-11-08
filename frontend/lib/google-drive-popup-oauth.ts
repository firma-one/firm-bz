/**
 * Shared Google Drive OAuth popup flow (postMessage + status poll + timeout).
 * Used by onboarding and firm Connectors. Callback HTML posts `google_drive_oauth` to opener.
 */

import { logger } from '@/lib/logger'
import { BRAND_NAME } from '@/config/brand'

export const GOOGLE_DRIVE_OAUTH_POPUP_WINDOW_NAME = 'FirmGoogleDriveOAuth'

const POPUP_WIDTH = 520
const POPUP_HEIGHT = 700
/** Allow slow consent / account picker; postMessage should fire sooner once opener fix ships. */
const TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 2000
/** After the popup reads as closed, how long to wait for a late postMessage before saying so. */
const CLOSED_GRACE_MS = 2000

export function isGoogleDriveOAuthPopupOriginAllowed(origin: string, appOrigin: string): boolean {
  if (origin === appOrigin) return true
  try {
    const u = new URL(origin)
    const a = new URL(appOrigin)
    if (
      u.protocol === 'http:' &&
      a.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
      (a.hostname === 'localhost' || a.hostname === '127.0.0.1') &&
      u.port === a.port
    ) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * User-facing message for `data.error` from OAuth callback postMessage: one sentence per code the
 * callback sends, plus the popup's own (`popup_blocked`, `popup_closed`). A raw code is never shown.
 * `detail` is the provider's own sentence (its `error_description`), when it gave one.
 */
export function googleDriveOAuthPopupFailureMessage(errorCode?: string, detail?: string | null): string {
  return oauthPopupFailureMessage('Google', 'Google Drive', errorCode, detail)
}

/**
 * Shared by the Google and Microsoft popups. `who` names the sign-in ("Google", "Microsoft"),
 * `storage` the thing being connected ("Google Drive", "OneDrive").
 */
export function oauthPopupFailureMessage(
  who: 'Google' | 'Microsoft',
  storage: string,
  errorCode?: string,
  detail?: string | null
): string {
  const tail = detail ? ` · ${detail.replace(/\.?$/, '.')}` : ''
  switch (errorCode) {
    case 'popup_blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.'
    case 'popup_closed':
      return `The ${who} sign-in window closed before connecting finished. Try again.`
    case 'consent_declined':
      return `${who} sign-in was canceled, so nothing was connected.`
    case 'admin_consent_required':
      return `Your ${who} admin needs to approve ${BRAND_NAME} first. Ask them to grant consent, then try again.`
    case 'admin_policy_blocked':
      return `Your ${who} admin has blocked ${BRAND_NAME} for your organization. Ask them to allow it, then try again.`
    case 'oauth_error':
      return detail ? `${who} sign-in didn't finish${tail}` : `${who} sign-in was canceled or denied.`
    case 'no_code':
      return `${who} didn't send back a sign-in code. Try again.`
    case 'invalid_state':
      return 'The sign-in took too long or was started on another page. Start again from here.'
    case 'session_mismatch':
      return `The sign-in finished while someone else was signed in to ${BRAND_NAME} in this browser. Sign in as yourself, then try again.`
    case 'no_user_id':
      return `Your ${BRAND_NAME} session ended during sign-in. Sign in again, then try again.`
    case 'forbidden':
      return `You can't connect storage for this firm or client. Ask a firm admin to connect it.`
    case 'google_oauth_unreachable':
    case 'microsoft_oauth_unreachable':
      return `Couldn't reach ${who} to finish sign-in. Check your connection and try again.`
    case 'token_exchange_failed':
    case 'user_info_failed':
      return `${who} couldn't finish sign-in${tail || '. Try again in a moment.'}`
    case 'account_mismatch':
      return `Wrong ${who} account. Reconnect with the same account that was connected before.`
    case 'oauth_not_configured':
      return `${storage} sign-in isn't set up on this server yet.`
    case 'not_enabled':
    case 'onedrive_not_enabled':
      return `${storage} ${storage.includes(' and ') ? "aren't" : "isn't"} turned on for this firm yet.`
    case 'reconnect_failed':
      return `Reconnect failed · ${BRAND_NAME} couldn't save the new sign-in. Your connection is unchanged.`
    case 'database_error':
      return `${BRAND_NAME} couldn't save the connection. Try again in a minute.`
    case 'callback_error':
      return 'Something went wrong on our side while connecting. Try again.'
    default:
      return `Connecting ${storage} didn't finish${tail || '. Try again.'}`
  }
}

export type InitiateGoogleDriveOAuthPopupParams = {
  userId: string
  organizationId?: string | null
  /** Client to link after OAuth completes. Threads through state → callback → storeConnection. */
  clientId?: string | null
  /** Post-OAuth redirect when not using popup close (server still receives `next` in state). */
  next?: string | null
  rootFolderId?: string | null
  /** When true, the callback will skip auto-creating the default workspace folder (e.g. Shared Drive flow). */
  skipAutoFolder?: boolean
  headers?: HeadersInit
}

/**
 * POST initiate with `flow: 'popup'` and opener origin. Throws on error response or missing authUrl.
 */
export async function initiateGoogleDriveOAuthPopup(
  params: InitiateGoogleDriveOAuthPopupParams
): Promise<{ authUrl: string; nonce?: string }> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...params.headers,
  }

  const res = await fetch('/api/connectors/google-drive', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'initiate',
      userId: params.userId,
      organizationId: params.organizationId,
      ...(params.clientId && { clientId: params.clientId }),
      next: params.next ?? null,
      rootFolderId: params.rootFolderId ?? null,
      skipAutoFolder: params.skipAutoFolder ?? false,
      flow: 'popup',
      openerOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.error === 'string' ? err.error : 'Failed to initiate connection')
  }

  const data = await res.json()
  if (!data.authUrl || typeof data.authUrl !== 'string') {
    throw new Error('No auth URL returned')
  }

  return { authUrl: data.authUrl, nonce: data.nonce }
}

export type GoogleDriveOAuthPopupHandlers = {
  getAccessToken: () => Promise<string | null>
  /** Called after postMessage reports success (includes ids from callback). */
  onMessageSuccess: (payload: { connectionId?: string; email?: string }) => void | Promise<void>
  /** Called when status poll sees an ACTIVE connector (e.g. opener missing). */
  onPollSuccess: (connector: { id: string; name?: string | null }) => void | Promise<void>
  /**
   * Raw error code from callback HTML (`data.error`), or the popup's own `popup_blocked` /
   * `popup_closed`; `detail` is the provider's sentence when it gave one. Word it with
   * {@link googleDriveOAuthPopupFailureMessage}.
   */
  onMessageFailure: (errorCode?: string, detail?: string) => void
  onTimeout: () => void
  /** Sync UI: stop spinners immediately after cleanup (before async success work). */
  onFlowEnd: () => void
}

export type StartGoogleDriveOAuthPopupOptions = {
  /** Log prefix for debugging */
  logLabel?: string
  /**
   * Connector IDs that were already active BEFORE this OAuth flow started.
   * The poll will ignore all of them and only fire onPollSuccess for a genuinely new connector.
   * Without this, a pre-existing active connector causes the poll to fire immediately.
   */
  priorConnectorIds?: string[] | null
}

/**
 * Opens the OAuth popup, listens for postMessage, polls `/api/connectors/google-drive?action=status`,
 * and invokes handlers. Does not set loading state — use `onFlowEnd` for that.
 *
 * @returns `cancel` to remove listeners and timers (e.g. unmount).
 */
export function startGoogleDriveOAuthPopup(
  authUrl: string,
  oauthNonce: string | null | undefined,
  handlers: GoogleDriveOAuthPopupHandlers,
  options?: StartGoogleDriveOAuthPopupOptions
): () => void {
  return startOAuthPopup(authUrl, oauthNonce, handlers, {
    label: options?.logLabel ?? 'google_drive_oauth_popup',
    messageType: 'google_drive_oauth',
    statusUrl: '/api/connectors/google-drive?action=status',
    windowName: GOOGLE_DRIVE_OAUTH_POPUP_WINDOW_NAME,
    priorConnectorIds: options?.priorConnectorIds ?? null,
  })
}

/** The popup flow both providers share. */
export function startOAuthPopup(
  authUrl: string,
  oauthNonce: string | null | undefined,
  handlers: GoogleDriveOAuthPopupHandlers,
  config: {
    label: string
    /** `data.type` the callback page posts. */
    messageType: string
    statusUrl: string
    windowName: string
    priorConnectorIds: string[] | null
  }
): () => void {
  const label = config.label
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const expectedNonce = oauthNonce ?? null
  const priorConnectorIds = new Set(config.priorConnectorIds ?? [])

  let timeoutId: number | null = null
  let pollIntervalId: number | null = null
  let closedCheckId: number | null = null
  let done = false

  const cleanup = () => {
    done = true
    window.removeEventListener('message', handleMessage)
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId)
      pollIntervalId = null
    }
    if (closedCheckId !== null) {
      window.clearInterval(closedCheckId)
      closedCheckId = null
    }
  }

  const handleMessage = async (event: MessageEvent) => {
    if (!isGoogleDriveOAuthPopupOriginAllowed(event.origin, appOrigin)) return
    const data = event.data
    if (!data || data.type !== config.messageType) return
    if (expectedNonce != null && data.nonce !== expectedNonce) return

    cleanup()
    handlers.onFlowEnd()

    if (data.ok === true) {
      logger.debug(`${label}: popup postMessage success`, {
        hasEmail: !!data.email,
        hasConnectionId: !!data.connectionId,
      })
      await handlers.onMessageSuccess({
        connectionId: data.connectionId,
        email: data.email,
      })
    } else {
      logger.warn(`${label}: popup postMessage error`, { error: data.error })
      handlers.onMessageFailure(
        typeof data.error === 'string' ? data.error : undefined,
        typeof data.errorDescription === 'string' && data.errorDescription ? data.errorDescription : undefined
      )
    }
  }

  window.addEventListener('message', handleMessage)

  const readStatusConnector = async (): Promise<{ id: string; name?: string | null } | null> => {
    const token = await handlers.getAccessToken()
    if (!token) return null
    const statusRes = await fetch(config.statusUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!statusRes.ok) return null
    const statusData = await statusRes.json()
    if (statusData.isConnected && statusData.connector?.id) {
      return { id: statusData.connector.id, name: statusData.connector.name ?? null }
    }
    return null
  }

  /**
   * The status endpoint answers the person's first active connector, in any firm. Take what it says
   * before the popup opens as the baseline, so a connector that already existed elsewhere can't end
   * the wait with nothing added and lose the popup's real answer (P1-30). When the baseline can't be
   * read, only the firm's own prior connectors are ignored, as before.
   */
  const baseline: Promise<string | null> = readStatusConnector()
    .then((c) => c?.id ?? null)
    .catch(() => null)

  /**
   * Server may already have stored tokens (OAuth redirect completed) while the parent
   * missed postMessage (opener/target issues) or a poll tick lost a race with the timer.
   */
  const fetchActiveConnectorIfAny = async (): Promise<{ id: string; name?: string | null } | null> => {
    try {
      const baselineId = await baseline
      const connector = await readStatusConnector()
      if (!connector) return null
      // Ignore connectors that were already active before this flow started
      if (priorConnectorIds.has(connector.id)) return null
      if (baselineId && connector.id === baselineId) return null
      return connector
    } catch {
      /* ignore */
    }
    return null
  }

  timeoutId = window.setTimeout(() => {
    void (async () => {
      cleanup()
      handlers.onFlowEnd()
      try {
        const connector = await fetchActiveConnectorIfAny()
        if (connector) {
          logger.debug(
            `${label}: OAuth already completed server-side; recovered on timer (missed postMessage/poll)`
          )
          await handlers.onPollSuccess(connector)
          return
        }
      } catch (e) {
        logger.warn(`${label}: last-chance status after timer failed`, e as Error)
      }
      logger.warn(`${label}: popup timed out`)
      handlers.onTimeout()
    })()
  }, TIMEOUT_MS)

  const pollOnce = async () => {
    const connector = await fetchActiveConnectorIfAny()
    if (!connector || done) return
    logger.debug(`${label}: success via status poll`)
    cleanup()
    handlers.onFlowEnd()
    await handlers.onPollSuccess(connector)
  }

  pollIntervalId = window.setInterval(() => void pollOnce(), POLL_INTERVAL_MS)

  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2
  // Never use noopener/noreferrer: OAuth callback must keep window.opener for postMessage.
  const popup = window.open(
    authUrl,
    config.windowName,
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no`
  )

  if (!popup) {
    // Without noopener, `open` answers null only when the browser refused to open the window.
    logger.warn(`${label}: window.open returned null (popup blocked)`)
    cleanup()
    // After this returns, so a caller that sets state around the call sees the failure last.
    window.setTimeout(() => {
      handlers.onFlowEnd()
      handlers.onMessageFailure('popup_blocked')
    }, 0)
    return cleanup
  }
  logger.debug(`${label}: popup opened`)

  // Closed without answering: wait briefly for a late message, then ask the server once (the
  // callback may have stored the connection), then say it closed (P1-29).
  closedCheckId = window.setInterval(() => {
    let closed = false
    try {
      closed = popup.closed
    } catch {
      closed = false
    }
    if (!closed || done) return
    if (closedCheckId !== null) {
      window.clearInterval(closedCheckId)
      closedCheckId = null
    }
    window.setTimeout(() => {
      if (done) return
      void (async () => {
        const connector = await fetchActiveConnectorIfAny()
        if (done) return
        cleanup()
        handlers.onFlowEnd()
        if (connector) {
          await handlers.onPollSuccess(connector)
          return
        }
        logger.warn(`${label}: popup closed without an answer`)
        handlers.onMessageFailure('popup_closed')
      })()
    }, CLOSED_GRACE_MS)
  }, 500)

  return cleanup
}
