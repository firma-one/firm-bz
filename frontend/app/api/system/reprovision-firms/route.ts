import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { adminFailure } from '@/app/api/system/admin-error'

interface ReprovisionRequest {
  firmIds: string[]
}

interface ReprovisionResponse {
  /** Firms whose provisioning job really started: the event reached Inngest. */
  queued: number
  skipped: number
  errors: Array<{ firmId: string; error: string }>
}

/**
 * The event this route sends, and whether any Inngest function listens for it.
 *
 * None does: no function in `lib/inngest/` or `app/api/inngest/route.ts` is triggered by
 * `sandbox.provision.requested` (read from code, 2026-11-08). Sending it starts nothing, so the route
 * used to rewrite each firm's onboarding state and count it "queued" for work that never ran. Until a
 * function handles the event, the route refuses before touching anything. Register one, then set
 * this true; the loop below then counts only the sends that reached Inngest.
 */
const PROVISION_EVENT = 'sandbox.provision.requested'
const PROVISION_JOB_REGISTERED = false

export async function POST(request: NextRequest) {
  try {
    // Verify system admin access
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )
    const { data: { user } } = await supabase.auth.getUser(token)

    if (!user?.id || !(await isSysAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden: System admin access required' }, { status: 403 })
    }

    const body = await request.json() as ReprovisionRequest
    const { firmIds } = body

    if (!Array.isArray(firmIds) || firmIds.length === 0 || firmIds.length > 50) {
      return NextResponse.json(
        { error: 'firmIds must be a non-empty array of 1-50 items' },
        { status: 400 }
      )
    }

    // Validate all firmIds are UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!firmIds.every(id => uuidRegex.test(id))) {
      return NextResponse.json({ error: 'Invalid firm IDs' }, { status: 400 })
    }

    if (!PROVISION_JOB_REGISTERED) {
      return NextResponse.json(
        {
          error: 'Nothing was started: no background job handles provisioning any more '
            + `(nothing listens for "${PROVISION_EVENT}"). These firms are unchanged. Finish their setup `
            + 'from onboarding, or register a job for the event first.',
          code: 'no_provision_job',
        },
        { status: 409 },
      )
    }

    const result: ReprovisionResponse = {
      queued: 0,
      skipped: 0,
      errors: [],
    }

    // Process each firm
    for (const firmId of firmIds) {
      try {
        // Re-validate firm is still stuck
        const firm = await prisma.firm.findUnique({
          where: { id: firmId },
          select: {
            id: true,
            settings: true,
            connectorId: true,
            members: {
              where: { role: 'firm_admin' },
              select: { userId: true },
            },
          },
        })

        if (!firm) {
          result.errors.push({ firmId, error: 'Firm not found' })
          continue
        }

        // Check if still provisioning
        const onboarding = (firm.settings as Record<string, any>)?.onboarding || {}
        if (onboarding.stage !== 'provisioning' || onboarding.isComplete === true) {
          result.skipped++
          continue
        }

        if (!firm.connectorId || firm.members.length === 0) {
          result.errors.push({ firmId, error: 'Missing connector or admin member' })
          continue
        }

        const adminUserId = firm.members[0].userId

        // Get user details from Supabase auth
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(adminUserId)
        if (!authUser?.email) {
          result.errors.push({ firmId, error: 'Could not resolve user email' })
          continue
        }

        // Reset firm stage to provisioning (refresh timestamp)
        const currentSettings = (firm.settings as Record<string, any>) || {}
        const currentOnboarding = currentSettings.onboarding || {}
        await prisma.firm.update({
          where: { id: firmId },
          data: {
            settings: {
              ...currentSettings,
              onboarding: {
                ...currentOnboarding,
                onboardingFlowVersion: 3,
                resumeAtStep: 4,
                currentStep: 4,
                stage: 'provisioning',
                isComplete: false,
                driveConnected: true,
                lastUpdated: new Date().toISOString(),
              },
            },
          },
        })

        // Re-enqueue Inngest. Counted only when the event reached it: safeInngestSend answers false
        // (and logs) when it couldn't, and a firm reported "queued" then would never move.
        const firstName = (authUser.user_metadata?.first_name as string) || undefined
        const lastName = (authUser.user_metadata?.last_name as string) || undefined

        const sent = await safeInngestSend(PROVISION_EVENT, {
          firmId,
          userId: adminUserId,
          userEmail: authUser.email,
          firstName,
          lastName,
          connectionId: firm.connectorId,
        })
        if (!sent) {
          result.errors.push({ firmId, error: "Couldn't reach Inngest, so provisioning didn't start. Try again." })
          continue
        }

        result.queued++
        logger.info('Re-enqueued Inngest provisioning', { firmId, userId: adminUserId })
      } catch (error) {
        result.errors.push({
          firmId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        logger.error(`Error re-provisioning firm ${firmId}`, error as Error)
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    return adminFailure('resume provisioning', error)
  }
}
