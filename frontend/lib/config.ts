/**
 * Application configuration utilities
 * Provides dynamic URL construction and environment detection
 */

export const isDevelopment = process.env.NODE_ENV === 'development'
export const isProduction = process.env.NODE_ENV !== 'development' // production OR preview

/**
 * Get the base application URL dynamically
 * Uses environment variables with fallbacks based on environment
 */
export const getAppUrl = (): string => {
  // Always check environment variable first (works on both client and server)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // If running in browser and no env var, use current origin
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  // Server-side fallback: use Vercel deployment URL when available, else NEXT_PUBLIC_APP_URL
  if (!isDevelopment) {
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`
    }
    return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  }

  return 'http://localhost:3000'
}

/**
 * Client: origin for Supabase OAuth `redirectTo`. On localhost always `http://` —
 * `next dev` has no TLS; `https://localhost` causes ERR_SSL_PROTOCOL_ERROR.
 */
export const getOAuthRedirectOrigin = (): string => {
  if (typeof window === 'undefined') {
    return getAppUrl()
  }
  const { hostname, port } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://${hostname}${port ? `:${port}` : ''}`
  }
  return window.location.origin
}

/**
 * Get the API base URL
 */
export const getApiUrl = (): string => {
  return `${getAppUrl()}/api`
}

/**
 * Construct a redirect URL for a given path
 */
export const getRedirectUrl = (path: string): string => {
  const baseUrl = getAppUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${cleanPath}`
}

/**
 * Get Supabase URL with proper fallbacks
 */
export const getSupabaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
  }

  if (process.env.SUPABASE_URL) {
    return process.env.SUPABASE_URL
  }

  return 'http://127.0.0.1:54321'
}

/**
 * Server-only: Google Drive OAuth client id + secret for token exchange and refresh.
 * Many deployments set GOOGLE_CLIENT_* for Supabase but only duplicate GOOGLE_DRIVE_CLIENT_ID.
 * When both env client IDs are the same Web client, reuse GOOGLE_CLIENT_SECRET so refresh
 * does not hit Google's token endpoint with a missing/wrong secret (401 unauthorized_client).
 */
export function getGoogleDriveOAuthServerCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()
  const driveSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()
  const supabaseClientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const supabaseSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()

  if (!clientId) {
    throw new Error('GOOGLE_DRIVE_CLIENT_ID is not configured')
  }

  let clientSecret = driveSecret
  if (!clientSecret && supabaseSecret && clientId === supabaseClientId) {
    clientSecret = supabaseSecret
  }

  if (!clientSecret) {
    throw new Error(
      'GOOGLE_DRIVE_CLIENT_SECRET is not set. Use the Web client secret from Google Cloud Console, or when GOOGLE_DRIVE_CLIENT_ID matches GOOGLE_CLIENT_ID, set GOOGLE_DRIVE_CLIENT_SECRET to the same value as GOOGLE_CLIENT_SECRET.'
    )
  }

  return { clientId, clientSecret }
}

/**
 * Server-only: Microsoft OAuth client id/secret for OneDrive/SharePoint connector token
 * exchange and refresh. Shares the app registration with MICROSOFT_SIGNIN_ENABLED sign-in
 * (see .claude/plans/connector-microsoft-impl.md Phase 1a step 5) but is gated by its own
 * MICROSOFT_CONNECTOR_ENABLED flag — independent readiness from sign-in.
 */
export function getMicrosoftOAuthServerCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim()

  if (!clientId) {
    throw new Error('MICROSOFT_CLIENT_ID is not configured')
  }
  if (!clientSecret) {
    throw new Error('MICROSOFT_CLIENT_SECRET is not configured')
  }

  return { clientId, clientSecret }
}

// Short-TTL in-process cache for the per-firm beta flag — avoids a DB round-trip on every
// call within the same server process (this route set can call the check several times per
// request across nested actions). Not a source of truth across processes/deployments; a stale
// read here only delays a flag flip being observed by up to the TTL, never security-relevant
// (the flag only gates UI/route visibility for an already-authenticated, already-firm-scoped
// user, not authorization itself).
const CONNECTOR_FLAG_CACHE_TTL_MS = 60_000
const connectorFlagCache = new Map<string, { value: boolean; expiresAt: number }>()
const connectorFirmIdCache = new Map<string, { firmId: string | null; expiresAt: number }>()

/**
 * Whether the OneDrive/SharePoint connector is enabled for a given firm — a per-firm beta
 * flag (`Firm.settings.betaFeatures.microsoftStorageConnector`), not a global env var. Replaces
 * the earlier MICROSOFT_CONNECTOR_ENABLED env-var gate (removed 2026-08-05) — the connector's
 * readiness is a per-firm rollout decision, not a deployment-wide one. Fails closed (false) if
 * the firm can't be resolved or the flag isn't explicitly true.
 */
export async function isMicrosoftConnectorEnabledForFirm(firmId: string | null | undefined): Promise<boolean> {
  if (!firmId) return false
  const cached = connectorFlagCache.get(firmId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const { prisma } = await import('./prisma')
  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
  const betaFeatures = (firm?.settings as Record<string, unknown> | null)?.betaFeatures as Record<string, boolean> | undefined
  const value = betaFeatures?.microsoftStorageConnector === true

  connectorFlagCache.set(firmId, { value, expiresAt: Date.now() + CONNECTOR_FLAG_CACHE_TTL_MS })
  return value
}

/**
 * Same check, resolved from a Connector id instead of a firmId directly — for routes that only
 * have connectionId in scope (e.g. status/ensure-folder/folder-breadcrumb actions).
 */
export async function isMicrosoftConnectorEnabledForConnection(connectionId: string | null | undefined): Promise<boolean> {
  if (!connectionId) return false

  let firmId: string | null | undefined
  const cachedFirmId = connectorFirmIdCache.get(connectionId)
  if (cachedFirmId && cachedFirmId.expiresAt > Date.now()) {
    firmId = cachedFirmId.firmId
  } else {
    const { prisma } = await import('./prisma')
    const connector = await prisma.connector.findUnique({ where: { id: connectionId }, select: { firmId: true } })
    firmId = connector?.firmId ?? null
    connectorFirmIdCache.set(connectionId, { firmId, expiresAt: Date.now() + CONNECTOR_FLAG_CACHE_TTL_MS })
  }
  return isMicrosoftConnectorEnabledForFirm(firmId)
}

/**
 * Application configuration object
 */
export const config = {
  appUrl: getAppUrl(),
  apiUrl: getApiUrl(),
  supabaseUrl: getSupabaseUrl(),
  isDevelopment,
  isProduction,

  // OAuth Configuration
  googleDrive: {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    developerKey: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_DEVELOPER_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    appId: process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER,
    redirectUri: getRedirectUrl('/api/connectors/google-drive/callback'),
  },

  onedrive: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: getRedirectUrl('/api/connectors/onedrive/callback'),
  },

  // Supabase Configuration
  supabase: {
    url: getSupabaseUrl(),
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      (isDevelopment ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' : ''),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
} as const
