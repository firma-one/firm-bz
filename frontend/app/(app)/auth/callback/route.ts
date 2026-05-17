import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getDeploymentVersion, DEPLOYMENT_VERSION_COOKIE } from '@/lib/deployment-version'
import { resolveDefaultFirmLandingPath } from '@/lib/actions/firms'
import { BRAND_NAME, PLATFORM_BRAND_COOKIE } from '@/config/brand'
import { createAdminClient } from '@/utils/supabase/admin'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { FirmService } from '@/lib/firm-service'
import { userSettingsPlus } from '@/lib/user-settings-plus'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const requestedNext = searchParams.get('next')
  let next = requestedNext ?? '/d'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.session) {
      const user = data.session.user
      const userId = user.id

      if (!requestedNext) {
        const resolved = await resolveDefaultFirmLandingPath(userId)
        // No slug / malformed firm data: same as legacy "no default firm" — send to onboarding.
        next = resolved ?? '/d/onboarding'
      }

      // Warm JWT claims and userSettingsPlus cache on signin.
      // This adds ~200-400ms to the signin redirect but makes all subsequent page
      // loads faster: permission checks read from JWT/in-memory instead of hitting DB.
      await warmUserSessionOnSignin(userId, user.app_metadata ?? {}, supabase)

      // Set deployment version cookie on successful login
      // This ensures session is invalidated if server restarts
      const deploymentVersion = getDeploymentVersion()

      // Determine redirect URL — force http when running locally (e.g. dev_as_prod) to avoid ERR_SSL_PROTOCOL_ERROR
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isDevelopment = process.env.NODE_ENV === 'development'
      const url = new URL(origin)
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      const runningLocally = process.env.RUNNING_LOCALLY === 'true'

      let redirectUrl: string
      if ((isDevelopment || runningLocally) && isLocalhost) {
        redirectUrl = `http://${url.host}${next}`
      } else if (!isDevelopment && forwardedHost) {
        redirectUrl = `https://${forwardedHost}${next}`
      } else {
        redirectUrl = `${origin}${next}`
      }

      const response = NextResponse.redirect(redirectUrl)

      // Set deployment version cookie on the redirect response
      // This ensures it's available when middleware runs on the redirected request
      response.cookies.set(DEPLOYMENT_VERSION_COOKIE, deploymentVersion, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development', // secure in production/preview
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      })

      // Cache platform brand name for SSR/CSR consistency
      response.cookies.set(PLATFORM_BRAND_COOKIE, BRAND_NAME, {
        httpOnly: false,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      })

      return response
    } else {
      console.error('Exchange Code Error', error)
    }
  }

  // return the user to an error page — force http when running locally
  const url = new URL(origin)
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  const runningLocally = process.env.RUNNING_LOCALLY === 'true'
  const base = (process.env.NODE_ENV === 'development' || runningLocally) && isLocalhost ? `http://${url.host}` : origin
  return NextResponse.redirect(`${base}/signin?error=auth_code_error`)
}

/**
 * On signin: embed the user's default firm + persona into JWT app_metadata (only when
 * active_firm_id is absent — i.e. first signin or after a JWT reset), then refresh the
 * session so the updated claims are in the cookie before the first page load.
 * Also warms the in-memory userSettingsPlus cache (fire-and-forget).
 *
 * The added ~200-400ms is acceptable at signin; it eliminates DB round-trips on every
 * subsequent page load that would otherwise rebuild permissions from scratch.
 */
async function warmUserSessionOnSignin(
  userId: string,
  currentAppMetadata: Record<string, unknown>,
  supabase: ReturnType<typeof createServerClient>
): Promise<void> {
  // 1. Update JWT claims only when active_firm_id is missing (first signin or reset).
  //    Returning users with a valid active_firm_id skip the admin API call entirely.
  if (!currentAppMetadata.active_firm_id) {
    try {
      const defaultFirm = await FirmService.getDefaultFirm(userId)
      if (defaultFirm) {
        const membership = defaultFirm.members.find((m: any) => m.userId === userId)
        if (membership) {
          const adminClient = createAdminClient()
          await adminClient.auth.admin.updateUserById(userId, {
            app_metadata: mergeLeanAppMetadata(currentAppMetadata, {
              active_firm_id: defaultFirm.id,
              active_firm_slug: defaultFirm.slug ?? undefined,
              active_persona: (membership.role as string) ?? undefined,
            }),
          })
          // Refresh the session so the new JWT claims land in the cookie before redirect.
          await supabase.auth.refreshSession()
        }
      }
    } catch (e) {
      // Non-critical — page loads work without warm JWT, just slower.
      console.error('[signin] Failed to warm JWT app_metadata', e)
    }
  }

  // 2. Pre-populate userSettingsPlus cache (fire-and-forget — don't block the redirect).
  userSettingsPlus.getUserSettingsPlus(userId).catch(() => {})
}
