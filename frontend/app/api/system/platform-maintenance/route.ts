import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import {
  getPlatformMaintenanceConfig,
  setPlatformMaintenanceConfig,
  getAllNonAdminUserEmails,
  sendPlatformMaintenanceEmail,
  sendPlatformMaintenanceNotification,
  type PlatformMaintenanceConfig,
} from '@/lib/platform-maintenance'
import { inngest } from '@/lib/inngest/client'

export const dynamic = 'force-dynamic'

const GRACE_PERIOD_MS = 2 * 60 * 1000 // 2 minutes

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await isSysAdminUser(user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await getPlatformMaintenanceConfig()
  return NextResponse.json({ config: config ?? null })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await isSysAdminUser(user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json() as { action?: string; scheduledFrom?: string; scheduledTo?: string; message?: string }
  const { action, scheduledFrom, scheduledTo, message } = body

  if (action === 'enable') {
    const graceEndsAt = new Date(Date.now() + GRACE_PERIOD_MS).toISOString()
    const config: PlatformMaintenanceConfig = {
      active: false,
      gracePeriod: true,
      graceEndsAt,
      scheduledFrom: scheduledFrom ?? null,
      scheduledTo: scheduledTo ?? null,
      message: message ?? null,
      enabledAt: new Date().toISOString(),
      disabledAt: null,
      enabledBy: user.email ?? null,
    }
    await setPlatformMaintenanceConfig(config)

    // Fire Inngest job — it will sleep through the grace window then activate
    await inngest.send({
      name: 'platform/maintenance.grace-requested',
      data: { graceEndsAt, enabledBy: user.email ?? '' },
    })

    // Warn users now (grace period warning email + in-app notification)
    void (async () => {
      try {
        const users = await getAllNonAdminUserEmails()
        await Promise.allSettled([
          sendPlatformMaintenanceEmail('on', config, users),
          sendPlatformMaintenanceNotification('on', config),
        ])
      } catch { /* non-fatal */ }
    })()

    return NextResponse.json({ ok: true, graceEndsAt })
  }

  if (action === 'disable') {
    const existing = await getPlatformMaintenanceConfig()
    const wasActive = existing?.active ?? false
    const config: PlatformMaintenanceConfig = {
      active: false,
      gracePeriod: false,
      graceEndsAt: null,
      scheduledFrom: existing?.scheduledFrom ?? null,
      scheduledTo: existing?.scheduledTo ?? null,
      message: existing?.message ?? null,
      enabledAt: existing?.enabledAt ?? null,
      disabledAt: new Date().toISOString(),
      enabledBy: existing?.enabledBy ?? null,
    }
    await setPlatformMaintenanceConfig(config)

    // Only send "maintenance complete" emails if maintenance was actually active (not just cancelled during grace)
    if (wasActive) {
      void (async () => {
        try {
          const users = await getAllNonAdminUserEmails()
          await Promise.allSettled([
            sendPlatformMaintenanceEmail('off', config, users),
            sendPlatformMaintenanceNotification('off', config),
          ])
        } catch { /* non-fatal */ }
      })()
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
