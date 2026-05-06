import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { FirmService } from '@/lib/firm-service'
import { logger } from '@/lib/logger'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy'
)

/**
 * POST /api/onboarding/ui-progress
 * Persists optional subscribe step outcome for flow v3 (resume after logout).
 * Body: `{ action: 'skip_subscribe' | 'continue_to_connect' }`
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
    } = await supabase.auth.getUser(token)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body.action as string
    if (action !== 'skip_subscribe' && action !== 'continue_to_connect') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const firm = await FirmService.getDefaultFirm(user.id)
    if (!firm) {
      return NextResponse.json({ error: 'No default firm' }, { status: 400 })
    }

    const prev = ((firm.settings as Record<string, unknown>) || {}) as Record<string, unknown>
    const prevOn = (prev.onboarding as Record<string, unknown>) || {}

    const nextOnboarding = {
      ...prevOn,
      onboardingFlowVersion: 3,
      stage: 'awaiting_drive',
      resumeAtStep: 3,
      subscribeSkipped: action === 'skip_subscribe',
      lastUpdated: new Date().toISOString(),
    }

    await prisma.firm.update({
      where: { id: firm.id },
      data: {
        settings: {
          ...prev,
          onboarding: nextOnboarding,
        },
        updatedBy: user.id,
      },
    })

    const event = action === 'skip_subscribe'
      ? AUDIT_EVENT.ONBOARDING_SUBSCRIBE_SKIPPED
      : AUDIT_EVENT.ONBOARDING_SUBSCRIBE_COMPLETED
    audit(event)
      .scope(AUDIT_SCOPE.FIRM)
      .firm(firm.id)
      .actor(user.id)
      .fireAndForget()

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('ui-progress onboarding', error as Error)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}
