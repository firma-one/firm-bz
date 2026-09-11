import type { User } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { FirmService } from '@/lib/firm-service'
import { generateGroupSlug } from '@/lib/slug-utils'
import { createAdminClient } from '@/utils/supabase/admin'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { ensureGroupFreePlan } from '@/lib/billing/polar-free-plan'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * Silently provisions a real Group + Firm for a user with zero firm memberships, replacing
 * the old multi-step onboarding wizard (see .claude/plans/sandbox-firm-removal.md, Step 2).
 *
 * Mirrors `app/api/onboarding/create-sandbox/route.ts`'s shell-creation + billing-anchor +
 * JWT-sync pattern, but creates a real (non-sandbox) firm with onboarding pre-marked complete,
 * so `isWorkspaceOnboardingComplete` short-circuits true and the user is never routed through
 * `/d/onboarding`.
 */
export async function autoProvisionFirstFirm(
  user: User
): Promise<{ firmId: string; firmSlug: string; groupSlug: string }> {
  const firstName = (user.user_metadata?.first_name as string | undefined)?.trim() || ''
  const groupName = firstName ? `${firstName}'s Firm Group` : "New Firm Group"
  const firmName = firstName ? `${firstName}'s Firm` : 'New Firm'

  const group = await (prisma as any).group.create({
    data: {
      name: groupName,
      slug: generateGroupSlug(firstName || groupName),
      createdBy: user.id,
      updatedBy: user.id,
      members: {
        create: { userId: user.id, role: 'GROUP_ADMIN' },
      },
    },
  })

  const firm = await FirmService.createFirmWithMember({
    userId: user.id,
    email: user.email || '',
    firstName,
    lastName: (user.user_metadata?.last_name as string | undefined) || '',
    firmName,
    groupId: group.id,
    // This is the first firm in a group we just created in this same call — there is
    // intentionally no FirmMember row for this user in this group yet.
    skipGroupMembershipCheck: true,
    settings: {
      onboarding: {
        isComplete: true,
        stage: 'completed',
        onboardingFlowVersion: 3,
      },
    },
  })

  const customerName =
    [user.user_metadata?.first_name, user.user_metadata?.last_name]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim() || null

  await ensureGroupFreePlan({
    groupId: group.id,
    userEmail: user.email || '',
    customerName,
    userId: user.id,
  })

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

  audit(AUDIT_EVENT.ONBOARDING_WORKSPACE_INITIALIZED)
    .scope(AUDIT_SCOPE.FIRM)
    .firm(firm.id)
    .actor(user.id)
    .meta({ firmName: firm.name, autoProvisioned: true })
    .fireAndForget()

  const groupSlug = firm.groupSlug ?? group.slug
  logger.info('[autoProvisionFirstFirm] Provisioned first firm for user', {
    userId: user.id,
    firmId: firm.id,
    firmSlug: firm.slug,
    groupSlug,
  })

  return { firmId: firm.id, firmSlug: firm.slug, groupSlug }
}
