import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { prisma } from '@/lib/prisma'
import { config, getRedirectUrl, getGoogleDriveOAuthServerCredentials } from '@/lib/config'
import { logger } from '@/lib/logger'
import { fetchWithTimeoutRetry, isTransientNetworkError } from '@/lib/fetch-with-timeout-retry'

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey!
)

function parseStateFlow(state: string | null): { flow?: string; nonce?: string; openerOrigin?: string } {
  if (!state) return {}
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
    return { flow: decoded.flow, nonce: decoded.nonce, openerOrigin: decoded.openerOrigin }
  } catch {
    return {}
  }
}

/** Redirect (non-popup) OAuth errors back to the initiating app path when encoded in state. */
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
 * Matches the parent window when both run on the same deployment (avoids NEXT_PUBLIC_APP_URL drift).
 * Requires window.opener — do not open the auth popup with noopener/noreferrer.
 */
function popupHtml(payload: { ok: boolean; error?: string; connectionId?: string; organizationId?: string; email?: string; nonce?: string }) {
  const payloadStr = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function() {
  var payload = ${payloadStr};
  var targetOrigin = window.location.origin;
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: 'google_drive_oauth', ok: payload.ok, error: payload.error, connectionId: payload.connectionId, organizationId: payload.organizationId, email: payload.email, nonce: payload.nonce }, targetOrigin);
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
    const { flow: stateFlow, nonce: stateNonce } = parseStateFlow(state)
    const isPopup = stateFlow === 'popup'

    if (error) {
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'oauth_error', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl('/d?error=oauth_error'))
    }

    if (!code) {
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'no_code', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(resolveOAuthFailureRedirectPath(state), 'no_code')))
    }

    const oauthFailureBase = resolveOAuthFailureRedirectPath(state)

    // Exchange code for tokens (use same credential resolution as refreshAccessToken)
    let clientId: string
    let clientSecret: string
    try {
      const creds = getGoogleDriveOAuthServerCredentials()
      clientId = creds.clientId
      clientSecret = creds.clientSecret
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Google Drive OAuth credentials missing for callback', new Error(msg))
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'oauth_not_configured', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl('/d?error=oauth_not_configured'))
    }
    const redirectUri = config.googleDrive.redirectUri

    const tokenBody = new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })

    let tokenResponse: Response
    try {
      tokenResponse = await fetchWithTimeoutRetry(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: tokenBody,
        },
        {
          label: 'Google OAuth token exchange',
          timeoutMs: 45_000,
          maxAttempts: 3,
        }
      )
    } catch (tokenErr) {
      logger.error(
        'Google OAuth token exchange failed (network/timeout after retries)',
        tokenErr instanceof Error ? tokenErr : new Error(String(tokenErr))
      )
      const unreachable = isTransientNetworkError(tokenErr)
      if (isPopup) {
        const html = popupHtml({
          ok: false,
          error: unreachable ? 'google_oauth_unreachable' : 'token_exchange_failed',
          nonce: stateNonce,
        })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(
        getRedirectUrl(
          appPathWithError(oauthFailureBase, unreachable ? 'google_oauth_unreachable' : 'token_exchange_failed')
        )
      )
    }

    if (!tokenResponse.ok) {
      const txt = await tokenResponse.text()
      logger.error('Token exchange failed', new Error(txt))
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'token_exchange_failed', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'token_exchange_failed')))
    }

    const tokens = await tokenResponse.json()

    // Get user info
    let userResponse: Response
    try {
      userResponse = await fetchWithTimeoutRetry(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        },
        {
          label: 'Google OAuth userinfo',
          timeoutMs: 30_000,
          maxAttempts: 3,
        }
      )
    } catch (userFetchErr) {
      logger.error(
        'Google userinfo fetch failed (network/timeout after retries)',
        userFetchErr instanceof Error ? userFetchErr : new Error(String(userFetchErr))
      )
      const unreachable = isTransientNetworkError(userFetchErr)
      if (isPopup) {
        const html = popupHtml({
          ok: false,
          error: unreachable ? 'google_oauth_unreachable' : 'user_info_failed',
          nonce: stateNonce,
        })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(
        getRedirectUrl(
          appPathWithError(oauthFailureBase, unreachable ? 'google_oauth_unreachable' : 'user_info_failed')
        )
      )
    }

    if (!userResponse.ok) {
      const txt = await userResponse.text()
      logger.error('User info fetch failed', new Error(txt))
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'user_info_failed', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'user_info_failed')))
    }

    const userInfo = await userResponse.json()

    // Decode state parameter
    let userId: string
    let nextPath: string | null = null
    let organizationId = ''
    let rootFolderId: string | undefined = undefined
    let skipAutoFolder = false

    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
        userId = decodedState.userId
        organizationId = decodedState.organizationId
        nextPath = decodedState.next || null
        rootFolderId = decodedState.rootFolderId || undefined
        skipAutoFolder = decodedState.skipAutoFolder === true
      } else {
        throw new Error('No state provided')
      }
    } catch (e) {
      logger.error('Failed to parse state, falling back to raw state as userId', e instanceof Error ? e : new Error(String(e)))
      userId = state || ''
      // Fallback for backward compatibility if state was just userId
    }

    logger.info('Google Drive OAuth user info fetched', {
      isPopup,
      email: userInfo?.email,
      hasOrganizationId: !!organizationId
    })

    if (!userId) {
      logger.error('No user ID in state parameter')
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'no_user_id', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl(appPathWithError(oauthFailureBase, 'no_user_id')))
    }

    let organization: { id: string } | null = null
    // State may send organizationId or firmId; both refer to the firm
    const firmId = organizationId

    if (firmId) {
      // 1. Try to find membership for this specific firm
      const membership = await prisma.firmMember.findUnique({
        where: {
          userId_firmId: {
            userId,
            firmId
          }
        },
        include: { firm: true }
      })
      if (membership) {
        organization = membership.firm
      }
    }

    // 2. Fallback to default firm
    if (!organization) {
      const membership = await prisma.firmMember.findFirst({
        where: {
          userId,
          isDefault: true
        },
        include: { firm: true }
      })
      if (membership) {
        organization = membership.firm
      }
    }

    // Determine redirect path
    let redirectPath: string
    if (nextPath && nextPath.startsWith('/')) {
      // Use custom next path if provided (e.g. firm connectors page after reconnect)
      redirectPath = nextPath
    } else {
      // During onboarding, redirect back to onboarding page (not to dashboard)
      redirectPath = '/d/onboarding'
    }

    // Only advance connector onboarding step when returning to the onboarding flow — not when
    // connecting from Settings → Connectors (avoids resetting onboarding state on reconnect).
    const shouldSyncOnboardingProgress =
      redirectPath === '/d/onboarding' || redirectPath.startsWith('/d/onboarding')

    // User should always have a default organization after auth callback
    try {
      // Store the Google Drive connection
      // Note: If no organization exists yet (DB reset or fresh onboarding),
      // we still store the connection. The organization will be linked later.
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      const connector = await googleDriveConnector.storeConnection(
        organization?.id, // Might be undefined
        userId,          // Supabase user ID (owner of the connector)
        userInfo.id,     // Google's unique account ID (externalAccountId)
        userInfo.name,
        tokens.access_token,
        tokens.refresh_token,
        tokenExpiresAt,
        userInfo.picture,
        rootFolderId ?? undefined, // Use existing if reconnecting with picker; otherwise set below
        userInfo.email
      )

      // Simplified onboarding: if no root folder was provided (e.g. from picker), create default
      // Skip for Shared Drive flow — the user will manually create and pick the folder.
      if (!rootFolderId && !skipAutoFolder) {
        try {
          await googleDriveConnector.ensureDefaultWorkspaceRoot(connector.id, tokens.access_token)
        } catch (workspaceErr) {
          logger.error('Failed to create default workspace folder', workspaceErr instanceof Error ? workspaceErr : new Error(String(workspaceErr)))
          // Onboarding will still show Configure Workspace Home as fallback
        }
      } else if (rootFolderId) {
        try {
          await googleDriveConnector.persistWorkspaceRootLocation(connector.id, rootFolderId)
        } catch (locErr) {
          logger.warn(
            'Could not persist workspace root location after OAuth',
            locErr instanceof Error ? locErr : new Error(String(locErr))
          )
        }
      }

      if (organization) {
        logger.info('Google Drive connected for organization', {
          organizationId: organization.id,
          connectorId: connector.id
        })

        if (shouldSyncOnboardingProgress) {
          // Update Onboarding Progress (Step 1 -> 2) — onboarding redirect only
          const currentConnectorSettings = (connector.settings as any) || {}
          await prisma.connector.update({
            where: { id: connector.id },
            data: {
              settings: {
                ...currentConnectorSettings,
                onboarding: {
                  ...currentConnectorSettings.onboarding,
                  currentStep: 2, // Move to Test Data Setup (Sandbox)
                  driveConnected: true,
                  isComplete: false,
                  lastUpdated: new Date().toISOString()
                }
              }
            }
          })
        }
      } else {
        logger.info('Google Drive connected for user (no organization yet)', {
          userId,
          connectorId: connector.id
        })
      }

      // Popup flow: return HTML that posts to opener and closes
      if (isPopup) {
        const html = popupHtml({
          ok: true,
          connectionId: connector.id,
          organizationId: organization?.id,
          email: userInfo.email,
          nonce: stateNonce
        })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }

      // Redirect flow
      let redirectUrl = `${redirectPath}?success=google_drive_connected&email=${encodeURIComponent(userInfo.email)}&connectionId=${connector.id}`
      if (organization) {
        redirectUrl += `&organizationId=${organization.id}`
      }
      return NextResponse.redirect(getRedirectUrl(redirectUrl))

    } catch (dbError) {
      logger.error('Google Drive Database error during connection', dbError instanceof Error ? dbError : new Error(String(dbError)))
      if (isPopup) {
        const html = popupHtml({ ok: false, error: 'database_error', nonce: stateNonce })
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      return NextResponse.redirect(getRedirectUrl(`${redirectPath}?error=database_error`))
    }

  } catch (error) {
    logger.error('Google Drive callback error', error instanceof Error ? error : new Error(String(error)))
    const { flow: errFlow, nonce: errNonce } = parseStateFlow(new URL(request.url).searchParams.get('state'))
    if (errFlow === 'popup') {
      const html = popupHtml({ ok: false, error: 'callback_error', nonce: errNonce })
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    return NextResponse.redirect(getRedirectUrl('/d?error=callback_error'))
  }
}
