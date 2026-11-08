/**
 * Shared OneDrive/SharePoint OAuth popup flow (postMessage + status poll + timeout).
 * Mirrors lib/google-drive-popup-oauth.ts exactly — callback HTML posts `onedrive_oauth`
 * to opener instead of `google_drive_oauth`. See that file for the underlying design
 * rationale (origin-matching, poll-as-fallback for missed postMessage, etc.).
 */

import { oauthPopupFailureMessage, startOAuthPopup } from '@/lib/google-drive-popup-oauth'

export const ONEDRIVE_OAUTH_POPUP_WINDOW_NAME = 'FirmOneDriveOAuth'


/**
 * User-facing message for `data.error` from OAuth callback postMessage: one sentence per code (see
 * `oauthPopupFailureMessage`). `detail` is Microsoft's own sentence, when it gave one.
 */
export function oneDriveOAuthPopupFailureMessage(errorCode?: string, detail?: string | null): string {
  return oauthPopupFailureMessage('Microsoft', 'OneDrive and SharePoint', errorCode, detail)
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
  /** A callback code, or the popup's own `popup_blocked` / `popup_closed`; `detail` is Microsoft's sentence. */
  onMessageFailure: (errorCode?: string, detail?: string) => void
  onTimeout: () => void
  onFlowEnd: () => void
}

export type StartOneDriveOAuthPopupOptions = {
  logLabel?: string
  priorConnectorIds?: string[] | null
}

/** Same flow as Google's (blocked and closed popups, a baseline for the status poll). */
export function startOneDriveOAuthPopup(
  authUrl: string,
  oauthNonce: string | null | undefined,
  handlers: OneDriveOAuthPopupHandlers,
  options?: StartOneDriveOAuthPopupOptions
): () => void {
  return startOAuthPopup(authUrl, oauthNonce, handlers, {
    label: options?.logLabel ?? 'onedrive_oauth_popup',
    messageType: 'onedrive_oauth',
    statusUrl: '/api/connectors/onedrive?action=status',
    windowName: ONEDRIVE_OAUTH_POPUP_WINDOW_NAME,
    priorConnectorIds: options?.priorConnectorIds ?? null,
  })
}
