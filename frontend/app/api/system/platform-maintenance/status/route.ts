import { NextResponse } from 'next/server'
import {
  getPlatformMaintenanceConfig,
  setPlatformMaintenanceConfig,
  getAllNonAdminUserEmails,
  sendPlatformMaintenanceEmail,
  sendPlatformMaintenanceNotification,
} from '@/lib/platform-maintenance'

export const dynamic = 'force-dynamic'

/**
 * Every signed-in tab polls this once a minute for one global boolean, so without a cache the
 * read count scales with open tabs. Answers are reused for CACHE_TTL_MS per running instance:
 * turning maintenance on or off can therefore take up to that long to reach a client, which is
 * well inside the grace period the feature already gives people.
 */
const CACHE_TTL_MS = 30_000
let cached: { at: number; body: PlatformMaintenanceStatusBody } | null = null

type PlatformMaintenanceStatusBody = {
  active: boolean
  pendingGrace: boolean
  graceEndsAt: string | null
  scheduledFrom: string | null
  scheduledTo: string | null
  message: string | null
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body)
  }

  let config = await getPlatformMaintenanceConfig()

  // Lazy activation fallback: if the Inngest job didn't fire (e.g. dev env without
  // Inngest running), activate maintenance on the first poll after grace period expires.
  if (
    config &&
    config.gracePeriod &&
    !config.active &&
    config.graceEndsAt &&
    Date.now() >= new Date(config.graceEndsAt).getTime()
  ) {
    const activated = { ...config, active: true, gracePeriod: false }
    await setPlatformMaintenanceConfig(activated)
    config = activated

    // Notifications in background (non-blocking). No sign-out: proxy.ts redirects everyone but
    // system admins to /platform-maintenance while it is on.
    void (async () => {
      try {
        const users = await getAllNonAdminUserEmails()
        await Promise.allSettled([
          sendPlatformMaintenanceEmail('on', activated, users),
          sendPlatformMaintenanceNotification('on', activated),
        ])
      } catch { /* non-fatal */ }
    })()
  }

  const body: PlatformMaintenanceStatusBody = {
    active: config?.active ?? false,
    pendingGrace: (config?.gracePeriod ?? false) && !(config?.active ?? false),
    graceEndsAt: config?.graceEndsAt ?? null,
    scheduledFrom: config?.scheduledFrom ?? null,
    scheduledTo: config?.scheduledTo ?? null,
    message: config?.message ?? null,
  }
  cached = { at: Date.now(), body }
  return NextResponse.json(body)
}
