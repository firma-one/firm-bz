/**
 * Shared OneDrive/SharePoint OAuth popup flow (postMessage + status poll + timeout).
 * Mirrors lib/google-drive-popup-oauth.ts exactly — callback HTML posts `onedrive_oauth`
 * to opener instead of `google_drive_oauth`. See that file for the underlying design
 * rationale (origin-matching, poll-as-fallback for missed postMessage, etc.).
 */

import { logger } from '@/lib/logger'
import { isGoogleDriveOAuthPopupOriginAllowed } from '@/lib/google-drive-popup-oauth'

export const ONEDRIVE_OAUTH_POPUP_WINDOW_NAME = 'FirmOneDriveOAuth'

const POPUP_WIDTH = 520
const POPUP_HEIGHT = 700
const TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 2000

/** User-facing message for `data.error` from OAuth callback postMessage. */
export function oneDriveOAuthPopupFailureMessage(errorCode?: string): string {
  if (errorCode === 'oauth_error') return 'Microsoft sign-in was cancelled or denied.'
  if (errorCode === 'microsoft_oauth_unreachable') {
    return 'Could not reach Microsoft to finish sign-in (network timeout or outage). Check your connection and try again.'
  }
  if (errorCode === 'token_exchange_failed' || errorCode === 'user_info_failed') {
    return 'Microsoft could not finish sign-in. Try again in a moment.'
  }
  if (errorCode === 'account_mismatch') {
    return 'Wrong Microsoft account. Reconnect must use the same account that was originally connected.'
  }
  if (errorCode === 'oauth_not_configured') {
    return 'OneDrive/SharePoint sign-in is not configured on this server.'
  }
  if (errorCode === 'not_enabled') {
    return 'OneDrive/SharePoint connector is not enabled.'
  }
  if (typeof errorCode === 'string' && errorCode.length > 0) return errorCode
  return 'OneDrive/SharePoint connection failed.'
}

export type InitiateOneDriveOAuthPopupParams = {
  userId: string
  organizationId?: string | null
  clientId?: string | null
  next?: string | null
  /** Skip auto-creating a default workspace folder after connect (e.g. client-level connectors, which require an explicit folder pick). */
  skipAutoFolder?: boolean
  replaceConnectorId?: string | null
  friendlyName?: string | null
  email?: string | null
  /** Personal accounts skip both Sites.Read.All and User.Invite.All entirely — no admin-consent
   *  scopes requested at all. See .claude/plans/connector-microsoft-impl.md, item 20. */
  declaredAccountType?: 'personal' | 'work_school'
  headers?: HeadersInit
}

export async function initiateOneDriveOAuthPopup(
  params: InitiateOneDriveOAuthPopupParams
): Promise<{ authUrl: string; nonce?: string }> {
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...params.headers }

  const res = await fetch('/api/connectors/onedrive', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'initiate',
      userId: params.userId,
      organizationId: params.organizationId,
      ...(params.clientId && { clientId: params.clientId }),
      next: params.next ?? null,
      skipAutoFolder: params.skipAutoFolder ?? false,
      flow: 'popup',
      ...(params.replaceConnectorId && { replaceConnectorId: params.replaceConnectorId }),
      ...(params.friendlyName && { friendlyName: params.friendlyName }),
      ...(params.email && { email: params.email }),
      ...(params.declaredAccountType && { declaredAccountType: params.declaredAccountType }),
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

export type OneDriveOAuthPopupHandlers = {
  getAccessToken: () => Promise<string | null>
  onMessageSuccess: (payload: { connectionId?: string; email?: string }) => void | Promise<void>
  onPollSuccess: (connector: { id: string; name?: string | null }) => void | Promise<void>
  onMessageFailure: (errorCode?: string) => void
  onTimeout: () => void
  onFlowEnd: () => void
}

export type StartOneDriveOAuthPopupOptions = {
  logLabel?: string
  priorConnectorIds?: string[] | null
}

export function startOneDriveOAuthPopup(
  authUrl: string,
  oauthNonce: string | null | undefined,
  handlers: OneDriveOAuthPopupHandlers,
  options?: StartOneDriveOAuthPopupOptions
): () => void {
  const label = options?.logLabel ?? 'onedrive_oauth_popup'
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const expectedNonce = oauthNonce ?? null
  const priorConnectorIds = new Set(options?.priorConnectorIds ?? [])

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
    if (!data || data.type !== 'onedrive_oauth') return
    if (expectedNonce != null && data.nonce !== expectedNonce) return

    cleanup()
    handlers.onFlowEnd()

    if (data.ok === true) {
      logger.debug(`${label}: popup postMessage success`, { hasEmail: !!data.email, hasConnectionId: !!data.connectionId })
      await handlers.onMessageSuccess({ connectionId: data.connectionId, email: data.email })
    } else {
      logger.warn(`${label}: popup postMessage error`, { error: data.error })
      handlers.onMessageFailure(typeof data.error === 'string' ? data.error : undefined)
    }
  }

  window.addEventListener('message', handleMessage)

  const fetchActiveConnectorIfAny = async (): Promise<{ id: string; name?: string | null } | null> => {
    try {
      const token = await handlers.getAccessToken()
      if (!token) return null
      const statusRes = await fetch('/api/connectors/onedrive?action=status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!statusRes.ok) return null
      const statusData = await statusRes.json()
      if (statusData.isConnected && statusData.connector?.id) {
        if (priorConnectorIds.size > 0 && priorConnectorIds.has(statusData.connector.id)) return null
        return { id: statusData.connector.id, name: statusData.connector.name ?? null }
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
    cleanup()
    handlers.onFlowEnd()
    await handlers.onPollSuccess(connector)
  }

  pollIntervalId = window.setInterval(() => void pollOnce(), POLL_INTERVAL_MS)

  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2
  const popup = window.open(
    authUrl,
    ONEDRIVE_OAUTH_POPUP_WINDOW_NAME,
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no`
  )

  if (!popup) {
    logger.warn(`${label}: window.open returned null (popup may still open)`)
  }

  return cleanup
}
