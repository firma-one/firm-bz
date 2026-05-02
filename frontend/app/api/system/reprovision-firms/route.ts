import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { safeInngestSend } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

interface ReprovisionRequest {
  firmIds: string[]
}

interface ReprovisionResponse {
  queued: number
  skipped: number
  errors: Array<{ firmId: string; error: string }>
}

export async function POST(request: NextRequest) {
  try {
    // Verify SYS_ADMIN access
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
      return NextResponse.json({ error: 'Forbidden: SYS_ADMIN role required' }, { status: 403 })
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

        // Re-enqueue Inngest
        const firstName = (authUser.user_metadata?.first_name as string) || undefined
        const lastName = (authUser.user_metadata?.last_name as string) || undefined

        await safeInngestSend('sandbox.provision.requested', {
          firmId,
          userId: adminUserId,
          userEmail: authUser.email,
          firstName,
          lastName,
          connectionId: firm.connectorId,
        })

        result.queued++
        logger.info('Re-enqueued Inngest provisioning', { firmId, userId: adminUserId })
      } catch (error) {
        result.errors.push({
          firmId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        logger.error('Error re-provisioning firm', { firmId, error })
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Error in reprovision route', error as Error)
    return NextResponse.json(
      { error: 'Failed to reprovision firms' },
      { status: 500 }
    )
  }
}
