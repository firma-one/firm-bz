/**
 * Shared Google Drive OAuth popup flow (postMessage + status poll + timeout).
 * Used by onboarding and firm Connectors. Callback HTML posts `google_drive_oauth` to opener.
 */

import { logger } from '@/lib/logger'

export const GOOGLE_DRIVE_OAUTH_POPUP_WINDOW_NAME = 'FirmGoogleDriveOAuth'

const POPUP_WIDTH = 520
const POPUP_HEIGHT = 700
/** Allow slow consent / account picker; postMessage should fire sooner once opener fix ships. */
const TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 2000

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

/** User-facing message for `data.error` from OAuth callback postMessage. */
export function googleDriveOAuthPopupFailureMessage(errorCode?: string): string {
  if (errorCode === 'oauth_error') return 'Google sign-in was cancelled or denied.'
  if (errorCode === 'google_oauth_unreachable') {
    return 'Could not reach Google to finish sign-in (network timeout or outage). Check your connection and try again.'
  }
  if (errorCode === 'token_exchange_failed' || errorCode === 'user_info_failed') {
    return 'Google could not finish sign-in. Try again in a moment.'
  }
  if (errorCode === 'oauth_not_configured') {
    return 'Google Drive sign-in is not configured on this server.'
  }
  if (typeof errorCode === 'string' && errorCode.length > 0) return errorCode
  return 'Google Drive connection failed.'
}

export type InitiateGoogleDriveOAuthPopupParams = {
  userId: string
  organizationId?: string | null
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
  /** Raw error code from callback HTML (`data.error`). */
  onMessageFailure: (errorCode?: string) => void
  onTimeout: () => void
  /** Sync UI: stop spinners immediately after cleanup (before async success work). */
  onFlowEnd: () => void
}

export type StartGoogleDriveOAuthPopupOptions = {
  /** Log prefix for debugging */
  logLabel?: string
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
  const label = options?.logLabel ?? 'google_drive_oauth_popup'
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const expectedNonce = oauthNonce ?? null

  let timeoutId: number | null = null
  let pollIntervalId: number | null = null

  const cleanup = () => {
    window.removeEventListener('message', handleMessage)
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId)
      pollIntervalId = null
    }
  }

  const handleMessage = async (event: MessageEvent) => {
    if (!isGoogleDriveOAuthPopupOriginAllowed(event.origin, appOrigin)) return
    const data = event.data
    if (!data || data.type !== 'google_drive_oauth') return
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
      handlers.onMessageFailure(typeof data.error === 'string' ? data.error : undefined)
    }
  }

  window.addEventListener('message', handleMessage)

  /**
   * Server may already have stored tokens (OAuth redirect completed) while the parent
   * missed postMessage (opener/target issues) or a poll tick lost a race with the timer.
   */
  const fetchActiveConnectorIfAny = async (): Promise<{ id: string; name?: string | null } | null> => {
    try {
      const token = await handlers.getAccessToken()
      if (!token) return null
      const statusRes = await fetch('/api/connectors/google-drive?action=status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!statusRes.ok) return null
      const statusData = await statusRes.json()
      if (statusData.isConnected && statusData.connector?.id) {
        return {
          id: statusData.connector.id,
          name: statusData.connector.name ?? null,
        }
      }
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
    if (!connector) return
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
    GOOGLE_DRIVE_OAUTH_POPUP_WINDOW_NAME,
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no`
  )

  if (!popup) {
    logger.warn(`${label}: window.open returned null (popup may still open)`)
  } else {
    logger.debug(`${label}: popup opened`)
  }

  return cleanup
}
