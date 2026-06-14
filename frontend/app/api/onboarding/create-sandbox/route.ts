import { NextRequest, NextResponse } from 'next/server'
import { createClient, type User } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { SANDBOX_FIRM_NAME_FALLBACK } from '@/lib/services/sample-file-service'
import { FirmService } from '@/lib/firm-service'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { ensurePolarFreePlanForSandboxFirm } from '@/lib/billing/polar-free-plan'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { seedSandboxClientsInDb } from '@/lib/onboarding/onboarding-helper'

/**
 * POST /api/onboarding/create-sandbox
 *
 * Creates the sandbox firm shell, anchors billing (Polar free plan), seeds sample
 * clients/engagements/contacts in DB, and sets user JWT metadata. No Drive connector
 * required — Drive is connected later per-client in Client Settings.
 *
 * Body: `{ sandboxFirmName? }` (legacy: `sandboxOrgName`).
 */
type SandboxFirmRow = { id: string; slug: string; name: string; settings: unknown }

/** Sandbox firm row for this user. */
async function findOrCreateSandboxShellFirm(params: {
  userId: string
  user: User
  resolvedFirmName: string
  groupName: string
}): Promise<SandboxFirmRow> {
  const { userId, user, resolvedFirmName, groupName } = params

  let firm = await prisma.firm.findFirst({
    where: {
      sandboxOnly: true,
      deletedAt: null,
      connectorId: null,
      members: { some: { userId } },
    },
    select: { id: true, slug: true, name: true, settings: true },
  })

  if (!firm) {
    const group = await (prisma as any).group.create({
      data: {
        name: groupName,
        createdBy: userId,
        updatedBy: userId,
        members: {
          create: { userId, role: 'GROUP_ADMIN' },
        },
      },
    })
    const created = await FirmService.createFirmWithMember({
      userId,
      email: user.email || '',
      firstName: (user.user_metadata?.first_name as string) || '',
      lastName: (user.user_metadata?.last_name as string) || '',
      firmName: resolvedFirmName,
      groupId: group.id,
      connectorId: null,
      allowDomainAccess: false,
      sandboxOnly: true,
    })
    firm = { id: created.id, slug: created.slug, name: created.name, settings: created.settings }
  }

  return firm
}


async function markSandboxShellAwaitingDrive(firm: SandboxFirmRow): Promise<void> {
  const prev = ((firm.settings as Record<string, unknown>) || {}) as Record<string, unknown>
  const prevOn = (prev.onboarding as Record<string, unknown>) || {}
  await prisma.firm.update({
    where: { id: firm.id },
    data: {
      settings: {
        ...prev,
        onboarding: {
          ...prevOn,
          onboardingFlowVersion: 3,
          resumeAtStep: 2,
          stage: 'awaiting_subscribe',
          subscribeSkipped: false,
          isComplete: false,
          driveConnected: false,
          lastUpdated: new Date().toISOString(),
        },
      },
    },
  })
}


async function syncSandboxStage1UserFacingState(user: User, firm: SandboxFirmRow): Promise<void> {
  const admin = createAdminClient()
  const { data: freshUser } = await admin.auth.admin.getUserById(user.id)
  const existingApp = (freshUser?.user?.app_metadata ?? {}) as Record<string, unknown>

  await Promise.all([
    FirmService.setDefaultFirm(user.id, firm.id),
    admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
      },
      app_metadata: mergeLeanAppMetadata(existingApp, {
        active_firm_id: firm.id,
        active_firm_slug: firm.slug,
        active_persona: 'firm_admin',
      }),
    }),
    invalidateUserSettingsPlus(user.id),
  ])
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'dummy'
    )
    const {
      data: { user },
    } = await supabase.auth.getUser(token)
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { sandboxFirmName: bodyFirmName, sandboxOrgName: legacyOrgName } = body
    const sandboxFirmNameRaw = (typeof bodyFirmName === 'string' ? bodyFirmName : legacyOrgName) as string | undefined

    const firstName = (user.user_metadata?.first_name as string | undefined)?.trim() || ''
    const firmGroupName = firstName ? `${firstName}'s Firm Group` : SANDBOX_FIRM_NAME_FALLBACK
    const resolvedFirmName = (sandboxFirmNameRaw || '').trim() || firmGroupName

    logger.info('Sandbox create: shell firm + DB seed', { userId: user.id, sandboxFirmName: resolvedFirmName })

    const firm = await findOrCreateSandboxShellFirm({ userId: user.id, user, resolvedFirmName, groupName: firmGroupName })

    const customerName =
      [user.user_metadata?.first_name, user.user_metadata?.last_name]
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim() || null
    await ensurePolarFreePlanForSandboxFirm({ firmId: firm.id, userEmail: user.email || '', customerName, userId: user.id })
    await markSandboxShellAwaitingDrive(firm)
    await syncSandboxStage1UserFacingState(user, firm)
    await seedSandboxClientsInDb(firm.id, user.id)

    audit(AUDIT_EVENT.ONBOARDING_WORKSPACE_INITIALIZED)
      .scope(AUDIT_SCOPE.FIRM)
      .firm(firm.id)
      .actor(user.id)
      .meta({ firmName: firm.name })
      .fireAndForget()

    return NextResponse.json({
      success: true,
      organizationId: firm.id,
      organizationSlug: firm.slug,
      organizationName: firm.name,
      firmId: firm.id,
      firmSlug: firm.slug,
      firmName: firm.name,
    })
  } catch (error) {
    logger.error('Error in sandbox Stage 1 sync (create-sandbox)', error as Error)
    const msg = error instanceof Error ? error.message : 'Failed to create sandbox'
    const isDbUnreachable = /can't reach database|P1001|connection refused|could not get access token/i.test(msg)
    return NextResponse.json(
      {
        error: isDbUnreachable
          ? 'Database is unreachable. For local dev, run supabase start and ensure DATABASE_URL is set.'
          : msg,
      },
      { status: 500 }
    )
  }
}
