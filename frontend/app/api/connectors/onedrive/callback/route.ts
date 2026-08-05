import { NextRequest, NextResponse } from 'next/server'
import { OneDriveConnector } from '@/lib/connectors/onedrive-connector'
import { prisma } from '@/lib/prisma'
import { config, getRedirectUrl, getMicrosoftOAuthServerCredentials, isMicrosoftConnectorEnabledForFirm } from '@/lib/config'
import { logger } from '@/lib/logger'
import { fetchWithTimeoutRetry, isTransientNetworkError } from '@/lib/fetch-with-timeout-retry'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const oneDriveConnector = OneDriveConnector.getInstance()

function parseStateFlow(state: string | null): { flow?: string; nonce?: string; openerOrigin?: string; organizationId?: string } {
  if (!state) return {}
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
    return { flow: decoded.flow, nonce: decoded.nonce, openerOrigin: decoded.openerOrigin, organizationId: decoded.organizationId }
  } catch {
    return {}
  }
}

function resolveOAuthFailureRedirectPath(state: string | null): string {
  if (!state) return '/d/onboarding'
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8')) as { next?: string | null }
    if (typeof decoded.next === 'string' && decoded.next.startsWith('/')) {
      return decoded.next.split('#')[0] || '/d/onboarding'
    }
  } catch {
    /* ignore */
  }
  return '/d/onboarding'
}

function appPathWithError(appPath: string, errorCode: string): string {
  const u = new URL(appPath, 'http://oauth-callback.local')
  u.searchParams.set('error', errorCode)
  return u.pathname + u.search
}

/**
 * OAuth popup completion page: postMessage to opener using this document's origin.
 * Mirrors google-drive/callback's popupHtml() — see that file for the origin-matching rationale.
 */
function popupHtml(payload: {
  ok: boolean
  error?: string
  connectionId?: string
  organizationId?: string
  email?: string
  nonce?: string
}) {
  const payloadStr = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function() {
  var payload = ${payloadStr};
  var targetOrigin = window.location.origin;
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: 'onedrive_oauth', ok: payload.ok, error: payload.error, connectionId: payload.connectionId, organizationId: payload.organizationId, email: payload.email, nonce: payload.nonce }, targetOrigin);
  }
  window.close();
})();
</script><p>Closing window…</p></body></html>`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const { flow: stateFlow, nonce: stateNonce, organizationId: stateOrgId } = parseStateFlow(state)
    const isPopup = stateFlow === 'popup'

    if (!(await isMicrosoftConnectorEnabledForFirm(stateOrgId))) {
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'not_enabled', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl('/d?error=onedrive_not_enabled'))
    }

    if (error) {
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'oauth_error', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(resolveOAuthFailureRedirectPath(state), 'oauth_error')))
    }

    if (!code) {
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'no_code', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(resolveOAuthFailureRedirectPath(state), 'no_code')))
    }

    const oauthFailureBase = resolveOAuthFailureRedirectPath(state)

    let oauthClientId: string
    let clientSecret: string
    try {
      const creds = getMicrosoftOAuthServerCredentials()
      oauthClientId = creds.clientId
      clientSecret = creds.clientSecret
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Microsoft OAuth credentials missing for OneDrive callback', new Error(msg))
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'oauth_not_configured', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl('/d?error=oauth_not_configured'))
    }

    const tokenBody = new URLSearchParams({
      client_id: oauthClientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.onedrive.redirectUri,
    })

    let tokenResponse: Response
    try {
      tokenResponse = await fetchWithTimeoutRetry(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
        { label: 'Microsoft OAuth token exchange (OneDrive)', timeoutMs: 45_000, maxAttempts: 3 }
      )
    } catch (tokenErr) {
      logger.error('Microsoft OAuth token exchange failed (network/timeout)', tokenErr instanceof Error ? tokenErr : new Error(String(tokenErr)))
      const unreachable = isTransientNetworkError(tokenErr)
      const errCode = unreachable ? 'microsoft_oauth_unreachable' : 'token_exchange_failed'
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: errCode, nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, errCode)))
    }

    if (!tokenResponse.ok) {
      const txt = await tokenResponse.text()
      logger.error('OneDrive token exchange failed', new Error(txt))
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'token_exchange_failed', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'token_exchange_failed')))
    }

    const tokens = await tokenResponse.json()

    let userResponse: Response
    try {
      userResponse = await fetchWithTimeoutRetry(
        'https://graph.microsoft.com/v1.0/me',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        { label: 'Microsoft Graph /me (OneDrive)', timeoutMs: 30_000, maxAttempts: 3 }
      )
    } catch (userFetchErr) {
      logger.error('Graph /me fetch failed (network/timeout)', userFetchErr instanceof Error ? userFetchErr : new Error(String(userFetchErr)))
      const unreachable = isTransientNetworkError(userFetchErr)
      const errCode = unreachable ? 'microsoft_oauth_unreachable' : 'user_info_failed'
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: errCode, nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, errCode)))
    }

    if (!userResponse.ok) {
      const txt = await userResponse.text()
      logger.error('Graph /me fetch failed', new Error(txt))
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'user_info_failed', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'user_info_failed')))
    }

    const userInfo = await userResponse.json()
    const userEmail: string = userInfo.mail || userInfo.userPrincipalName || ''

    let userId: string
    let nextPath: string | null = null
    let organizationId = ''
    let replaceConnectorId: string | undefined
    let clientId: string | undefined
    let friendlyName: string | undefined

    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
        userId = decodedState.userId
        organizationId = decodedState.organizationId
        nextPath = decodedState.next || null
        replaceConnectorId = decodedState.replaceConnectorId || undefined
        clientId = decodedState.clientId || undefined
        friendlyName = decodedState.friendlyName || undefined
      } else {
        throw new Error('No state provided')
      }
    } catch (e) {
      logger.error('Failed to parse OneDrive OAuth state', e instanceof Error ? e : new Error(String(e)))
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'no_user_id', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'no_user_id')))
    }

    if (!userId) {
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'no_user_id', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'no_user_id')))
    }

    let organization: { id: string } | null = null
    const firmId = organizationId
    if (firmId) {
      const membership = await prisma.firmMember.findUnique({
        where: { userId_firmId: { userId, firmId } },
        include: { firm: true },
      })
      if (membership) organization = membership.firm
    }
    if (!organization) {
      const membership = await prisma.firmMember.findFirst({ where: { userId, isDefault: true }, include: { firm: true } })
      if (membership) organization = membership.firm
    }

    let redirectPath: string
    if (nextPath && nextPath.startsWith('/')) {
      redirectPath = nextPath
    } else {
      redirectPath = '/d/onboarding'
    }

    try {
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      // Reconnect-same-account guard — same pattern as Google's callback.
      if (replaceConnectorId) {
        const existing = await prisma.connector.findUnique({
          where: { id: replaceConnectorId },
          select: { externalAccountId: true, settings: true },
        })
        if (existing) {
          const existingEmail = (existing.settings as Record<string, unknown> | null)?.accountEmail as string | undefined
          const emailMismatch = existingEmail && userEmail.toLowerCase() !== existingEmail.toLowerCase()
          const idMismatch = existing.externalAccountId && userInfo.id !== existing.externalAccountId
          if (emailMismatch || idMismatch) {
            if (isPopup) {
              return new NextResponse(popupHtml({ ok: false, error: 'account_mismatch', nonce: stateNonce }), {
                headers: { 'Content-Type': 'text/html' },
              })
            }
            return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'account_mismatch')))
          }
        }
      }

      if (replaceConnectorId) {
        try {
          await prisma.connector.update({
            where: { id: replaceConnectorId },
            data: { status: 'REVOKED', accessToken: '', refreshToken: null, tokenExpiresAt: null, firmId: null },
          })
        } catch (revokeErr) {
          logger.warn('Could not revoke replaced OneDrive connector', {
            replaceConnectorId,
            error: revokeErr instanceof Error ? revokeErr.message : String(revokeErr),
          })
        }
      }

      const connector = await oneDriveConnector.storeConnection(
        organization?.id,
        userId,
        userInfo.id,
        friendlyName ?? userInfo.displayName,
        tokens.access_token,
        tokens.refresh_token,
        tokenExpiresAt,
        userEmail,
        clientId,
        'personal'
      )

      // No auto-folder-creation here — unlike Google, OAuth alone never creates a workspace
      // folder for OneDrive. The user must explicitly click "Choose folder" > Personal (which
      // then auto-creates immediately, no further prompt) or Shared (site picker). See
      // OneDriveWorkspaceRoot.createPersonalFolder for where that now lives.
      const auditBuilder = audit(AUDIT_EVENT.STORAGE_CONNECTOR_ATTACHED)
        .scope(clientId ? AUDIT_SCOPE.CLIENT : AUDIT_SCOPE.FIRM)
        .firm(organization?.id ?? '')
        .actor(userId)
        .meta({ provider: 'onedrive', connectorId: connector.id, email: userEmail })
      if (clientId) auditBuilder.client(clientId)
      auditBuilder.fireAndForget()

      if (isPopup) {
        return new NextResponse(
          popupHtml({
            ok: true,
            connectionId: connector.id,
            organizationId: organization?.id,
            email: userEmail,
            nonce: stateNonce,
          }),
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }

      let redirectUrl = `${redirectPath}?success=onedrive_connected&email=${encodeURIComponent(userEmail)}&connectionId=${connector.id}`
      if (organization) redirectUrl += `&organizationId=${organization.id}`
      return NextResponse.redirect(getRedirectUrl(redirectUrl))
    } catch (dbError) {
      logger.error('OneDrive database error during connection', dbError instanceof Error ? dbError : new Error(String(dbError)))
      if (isPopup) {
        return new NextResponse(popupHtml({ ok: false, error: 'database_error', nonce: stateNonce }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return NextResponse.redirect(getRedirectUrl(`${redirectPath}?error=database_error`))
    }
  } catch (error) {
    logger.error('OneDrive callback error', error instanceof Error ? error : new Error(String(error)))
    const { flow: errFlow, nonce: errNonce } = parseStateFlow(new URL(request.url).searchParams.get('state'))
    if (errFlow === 'popup') {
      return new NextResponse(popupHtml({ ok: false, error: 'callback_error', nonce: errNonce }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
    return NextResponse.redirect(getRedirectUrl('/d?error=callback_error'))
  }
}
