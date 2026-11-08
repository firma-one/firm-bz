import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import {
  getPlatformMaintenanceConfig,
  setPlatformMaintenanceConfig,
  notifyPlatformMaintenance,
  type PlatformMaintenanceConfig,
} from '@/lib/platform-maintenance'
import { safeInngestSend } from '@/lib/inngest/client'
import { adminFailure } from '@/app/api/system/admin-error'

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

/**
 * Turns platform maintenance on (a grace countdown first) or off. Answers how the people were told:
 * `emails` ("Sent to 40 of 42"), and a `warning` when part of it didn't happen. The emails are
 * awaited rather than sent after the answer, so the count is real and the work isn't dropped when
 * the request ends.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await isSysAdminUser(user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { action?: string; scheduledFrom?: string; scheduledTo?: string; message?: string }
  const { action, scheduledFrom, scheduledTo, message } = body

  try {
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

      // The Inngest job sleeps through the grace window, then activates. If it didn't start, the
      // status poll every open page makes switches maintenance on once the countdown ends
      // (platform-maintenance/status), so this is a warning, not a failure.
      const jobStarted = await safeInngestSend('platform/maintenance.grace-requested', {
        graceEndsAt,
        enabledBy: user.email ?? '',
      })

      // Warn users now (grace period warning email + in-app notification).
      const told = await notifyPlatformMaintenance('on', config)

      const warnings = [
        !jobStarted && "The background job didn't start, so maintenance switches on when an open page next checks the status, after the countdown.",
        told.problem,
      ].filter(Boolean)
      return NextResponse.json({
        ok: true,
        graceEndsAt,
        emails: told.emails,
        ...(warnings.length ? { warning: warnings.join(' ') } : {}),
      })
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
        const told = await notifyPlatformMaintenance('off', config)
        return NextResponse.json({ ok: true, emails: told.emails, ...(told.problem ? { warning: told.problem } : {}) })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    // Saving the config is the step that can fail; the emails report their own count above.
    return adminFailure(action === 'disable' ? 'turn maintenance off' : 'turn maintenance on', error)
  }
}
