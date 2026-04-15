import { NextRequest, NextResponse } from 'next/server'
import { createClient, type User } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { buildDefaultSandboxFirmName } from '@/lib/onboarding/sandbox-firm-name'
import { SANDBOX_FIRM_NAME_FALLBACK } from '@/lib/services/sample-file-service'
import { FirmService } from '@/lib/firm-service'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { safeInngestSend } from '@/lib/inngest/client'
import { ensurePolarFreePlanForSandboxFirm } from '@/lib/billing/polar-free-plan'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'

/**
 * POST /api/onboarding/create-sandbox
 *
 * ## What runs synchronously (this request) vs Inngest
 *
 * **Not** “only an INSERT into `platform.firms`”. The HTTP handler always does a small **sync bundle**:
 * - **Firm row** create/reuse (`platform.firms`) and, on first create, **membership** (`firm_member` via `createFirmWithMember`)
 * - **Anchor billing (Stage 1 sync)**: `ensurePolarFreePlanForSandboxFirm` — Polar **API** creates/resolves the customer, then on success writes **`platform.subscriptions`** (FREE) + firm billing fields (not webhook-driven). Uses billing anchor `firmId` only; **`connectionId` is not passed to Polar** (Drive routing only).
 * - **Firm.settings** merge (`onboarding` flags / stage)
 * - **Default firm** for the user, **Supabase** `user_metadata` / `app_metadata`, **invalidateUserSettingsPlus`
 * - **With `connectionId`**: also link `firm.connectorId` + `connector.firmId`
 *
 * **Inngest** (`sandbox.provision.requested` → `provisionSandboxHierarchyForFirm`, then chained jobs) does the **heavy async** work:
 * Google Drive folders, **clients / engagements / contacts** in DB, connector org map, sample files, indexing; final “completed” firm onboarding flags. **Does not** call `ensurePolarFreePlanForSandboxFirm` (free plan is sync Stage 1 only).
 *
 * **A) Shell only** (omit `connectionId`) — sync bundle above, **no** Inngest. Firm onboarding is set to
 * `stage: 'awaiting_subscribe'` (flow v3: subscribe before Drive).
 *
 * **B) With `connectionId`** (after Connect Cloud Storage) — sync bundle + **enqueue** `sandbox.provision.requested`.
 *
 * Body: `{ connectionId?: string, sandboxFirmName? }` (legacy: `sandboxOrgName`).
 */
type SandboxFirmRow = { id: string; slug: string; name: string; settings: unknown }

async function linkConnectorToFirm(firmId: string, connectionId: string, userId: string): Promise<void> {
  await prisma.firm.update({
    where: { id: firmId },
    data: { connectorId: connectionId, updatedBy: userId },
  })
  await (prisma as any).connector.update({
    where: { id: connectionId },
    data: { firmId, updatedBy: userId },
  })
}

/** Sandbox firm row for this user with no connector yet (Stage 1 before Drive). */
async function findOrCreateSandboxShellFirm(params: {
  userId: string
  user: User
  resolvedFirmName: string
}): Promise<SandboxFirmRow> {
  const { userId, user, resolvedFirmName } = params

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
    const created = await FirmService.createFirmWithMember({
      userId,
      email: user.email || '',
      firstName: (user.user_metadata?.first_name as string) || '',
      lastName: (user.user_metadata?.last_name as string) || '',
      firmName: resolvedFirmName,
      connectorId: null,
      allowDomainAccess: false,
      sandboxOnly: true,
    })
    firm = { id: created.id, slug: created.slug, name: created.name, settings: created.settings }
  }

  return firm
}

async function findAttachOrCreateSandboxFirmWithConnector(params: {
  userId: string
  user: User
  connectionId: string
  resolvedFirmName: string
}): Promise<SandboxFirmRow> {
  const { userId, user, connectionId, resolvedFirmName } = params

  let firm = await prisma.firm.findFirst({
    where: {
      connectorId: connectionId,
      sandboxOnly: true,
      deletedAt: null,
      members: { some: { userId } },
    },
    select: { id: true, slug: true, name: true, settings: true },
  })

  if (!firm) {
    const shell = await prisma.firm.findFirst({
      where: {
        sandboxOnly: true,
        deletedAt: null,
        connectorId: null,
        members: { some: { userId } },
      },
      select: { id: true, slug: true, name: true, settings: true },
    })
    if (shell) {
      await linkConnectorToFirm(shell.id, connectionId, userId)
      firm = await prisma.firm.findUnique({
        where: { id: shell.id },
        select: { id: true, slug: true, name: true, settings: true },
      })
    }
  }

  if (!firm) {
    const created = await FirmService.createFirmWithMember({
      userId,
      email: user.email || '',
      firstName: (user.user_metadata?.first_name as string) || '',
      lastName: (user.user_metadata?.last_name as string) || '',
      firmName: resolvedFirmName,
      connectorId: connectionId,
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

/** Sync only: persist onboarding flags once Drive is linked and async job is queued. */
async function markSandboxProvisioningQueuedOnFirm(firm: SandboxFirmRow): Promise<void> {
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

async function enqueueSandboxAsyncProvisioning(params: {
  firmId: string
  userId: string
  userEmail: string
  firstName?: string
  lastName?: string
  connectionId: string
}): Promise<void> {
  await safeInngestSend('sandbox.provision.requested', params)
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
    const { connectionId: rawConnectionId, sandboxFirmName: bodyFirmName, sandboxOrgName: legacyOrgName } = body
    const sandboxFirmNameRaw = (typeof bodyFirmName === 'string' ? bodyFirmName : legacyOrgName) as
      | string
      | undefined

    const connectionId =
      typeof rawConnectionId === 'string' && rawConnectionId.trim() !== '' ? rawConnectionId.trim() : null

    const trimmedFromClient = (sandboxFirmNameRaw || '').trim()
    const resolvedFirmName =
      trimmedFromClient ||
      buildDefaultSandboxFirmName(user.user_metadata?.first_name as string | undefined, SANDBOX_FIRM_NAME_FALLBACK)

    // ----- Shell only: DB record, no Inngest -----
    if (!connectionId) {
      logger.info('Sandbox Stage 1 sync: shell firm only (awaiting Drive)', {
        userId: user.id,
        sandboxFirmName: resolvedFirmName,
      })

      const firm = await findOrCreateSandboxShellFirm({
        userId: user.id,
        user,
        resolvedFirmName,
      })
      const customerName =
        [user.user_metadata?.first_name, user.user_metadata?.last_name]
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
          .join(' ')
          .trim() || null
      await ensurePolarFreePlanForSandboxFirm({
        firmId: firm.id,
        userEmail: user.email || '',
        customerName,
        userId: user.id,
      })
      await markSandboxShellAwaitingDrive(firm)
      await syncSandboxStage1UserFacingState(user, firm)

      return NextResponse.json({
        success: true,
        shellOnly: true,
        organizationId: firm.id,
        organizationSlug: firm.slug,
        organizationName: firm.name,
        firmId: firm.id,
        firmSlug: firm.slug,
        firmName: firm.name,
        provisioning: false,
      })
    }

    // ----- With connector: enqueue async Drive + hierarchy -----
    logger.info('Sandbox Stage 1 sync: firm + enqueue async provision', {
      userId: user.id,
      connectionId,
      sandboxFirmName: resolvedFirmName,
    })

    const firm = await findAttachOrCreateSandboxFirmWithConnector({
      userId: user.id,
      user,
      connectionId,
      resolvedFirmName,
    })

    const customerNameWithConnector =
      [user.user_metadata?.first_name, user.user_metadata?.last_name]
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim() || null
    await ensurePolarFreePlanForSandboxFirm({
      firmId: firm.id,
      userEmail: user.email || '',
      customerName: customerNameWithConnector,
      userId: user.id,
    })

    await markSandboxProvisioningQueuedOnFirm(firm)
    await syncSandboxStage1UserFacingState(user, firm)

    await enqueueSandboxAsyncProvisioning({
      firmId: firm.id,
      userId: user.id,
      userEmail: user.email || '',
      firstName: user.user_metadata?.first_name as string | undefined,
      lastName: user.user_metadata?.last_name as string | undefined,
      connectionId,
    })

    logger.info('Sandbox async provisioning queued (Inngest)', {
      userId: user.id,
      firmId: firm.id,
      firmSlug: firm.slug,
    })

    return NextResponse.json({
      success: true,
      organizationId: firm.id,
      organizationSlug: firm.slug,
      organizationName: firm.name,
      firmId: firm.id,
      firmSlug: firm.slug,
      firmName: firm.name,
      provisioning: true,
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
