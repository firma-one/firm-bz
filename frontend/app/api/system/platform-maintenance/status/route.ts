import { NextResponse } from 'next/server'
import {
  getPlatformMaintenanceConfig,
  setPlatformMaintenanceConfig,
  getAllNonAdminUserEmails,
  signOutAllNonAdminUsers,
  sendPlatformMaintenanceEmail,
  sendPlatformMaintenanceNotification,
} from '@/lib/platform-maintenance'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    // Fire sign-out + notifications in background (non-blocking)
    void (async () => {
      try {
        const users = await getAllNonAdminUserEmails()
        await Promise.allSettled([
          signOutAllNonAdminUsers(),
          sendPlatformMaintenanceEmail('on', activated, users),
          sendPlatformMaintenanceNotification('on', activated),
        ])
      } catch { /* non-fatal */ }
    })()
  }

  return NextResponse.json({
    active: config?.active ?? false,
    pendingGrace: (config?.gracePeriod ?? false) && !(config?.active ?? false),
    graceEndsAt: config?.graceEndsAt ?? null,
    scheduledFrom: config?.scheduledFrom ?? null,
    scheduledTo: config?.scheduledTo ?? null,
    message: config?.message ?? null,
  })
}
