/**
 * Permission Helper Functions
 * 
 * Provides utilities for checking permissions from the cached UserSettingsPlus
 * All functions use the in-memory cache - no DB queries
 */

import { userSettingsPlus, UserPermissions } from './user-settings-plus'
import { createClient } from '@/utils/supabase/server'

// Re-export for convenience
export { userSettingsPlus, type UserPermissions }

// ============================================================================
// Helper: Find entities in hierarchical permissions structure
// ============================================================================

export function findFirmInPermissions(
  permissions: UserPermissions,
  firmId: string
) {
  return permissions.firms.find(f => f.id === firmId) || null
}

export function findClientInPermissions(
  permissions: UserPermissions,
  firmId: string,
  clientId: string
) {
  const firm = findFirmInPermissions(permissions, firmId)
  return firm?.clients.find(c => c.id === clientId) || null
}

export function findProjectInPermissions(
  permissions: UserPermissions,
  firmId: string,
  clientId: string,
  projectId: string
) {
  const client = findClientInPermissions(permissions, firmId, clientId)
  return client?.projects.find(p => p.id === projectId) || null
}

// ============================================================================
// Hierarchy binding — callers pass (firmId, clientId, projectId), sometimes from the browser.
// The checks below grant firm admins and client managers broad rights inside *their* firm, so
// each id must really sit under the one above it.
// ============================================================================

async function clientBelongsToFirm(clientId: string, firmId: string): Promise<boolean> {
  if (!clientId || !firmId) return false
  const { prisma } = await import('./prisma')
  return !!(await prisma.client.findFirst({ where: { id: clientId, firmId }, select: { id: true } }))
}

async function engagementBelongsTo(projectId: string, clientId: string, firmId: string): Promise<boolean> {
  if (!projectId || !clientId || !firmId) return false
  const { prisma } = await import('./prisma')
  return !!(await prisma.engagement.findFirst({
    where: { id: projectId, clientId, client: { firmId } },
    select: { id: true },
  }))
}

// ============================================================================
// Permission Check Functions (Server-Side)
// ============================================================================

/**
 * Check if user has a specific privilege in a scope for an organization
 */
export async function checkFirmPermission(
  firmId: string,
  scope: string,
  privilege: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return false

  // Firm management is answered by the database, every time. The JWT persona fast path that used
  // to answer it trusted claims a removed admin keeps and that onboarding/ensure-org once wrote
  // for anyone; the 30-minute UserSettingsPlus cache has the same staleness. The only way to hold
  // firm:can_manage is FirmRole.firm_admin. (.claude/plans/access-gates.md, P0 #7)
  if (scope === 'firm' && privilege === 'can_manage') {
    const { prisma } = await import('./prisma')
    const membership = await prisma.firmMember.findFirst({ where: { userId: user.id, firmId }, select: { role: true } })
    return membership?.role === 'firm_admin'
  }

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
  const firm = findFirmInPermissions(settings.permissions, firmId)

  if (!firm) return false

  return firm.scopes[scope]?.includes(privilege) ?? false
}

/**
 * Check if user has a specific privilege in a scope for a client
 */
export async function checkClientPermission(
  firmId: string,
  clientId: string,
  scope: string,
  privilege: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return false

  // The client must belong to the firm passed in. Every fallback below says yes to a firm admin of
  // `firmId` — without this, a firm admin of any firm (anyone can create one) passed for a foreign
  // client. (.claude/plans/access-gates.md, P0 #8.) The JWT persona fast path is gone (P0 #7).
  if (!(await clientBelongsToFirm(clientId, firmId))) return false

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)

  const client = findClientInPermissions(settings.permissions, firmId, clientId)

  if (client) {
    const direct = client.scopes[scope]?.includes(privilege) ?? false
    if (direct) return true
  }

  // Fallback: firm_admin has broad access within their firm (matches checkProjectPermission).
  const firm = findFirmInPermissions(settings.permissions, firmId)
  if (firm && firm.personas.includes('firm_admin')) {
    if (scope === 'client' && privilege === 'can_manage') return true
  }

  if (client?.scopes?.client?.includes('can_manage')) {
    return true
  }

  // Final fallback: Direct DB check for freshly-created clients / firms where the cache
  // has not updated yet (common right after creating a client on a custom/satellite firm).
  try {
    const { prisma } = await import('./prisma')
    const dbMembership = await prisma.firmMember.findFirst({
      where: { userId: user.id, firmId },
      select: { role: true },
    })
    if (dbMembership?.role === 'firm_admin' && scope === 'client' && privilege === 'can_manage') {
      return true
    }
  } catch (dbError) {
    const { logger } = await import('./logger')
    logger.warn('DB fallback check in checkClientPermission failed', dbError as Error)
  }

  return false
}

/**
 * Check if user has a specific privilege in a scope for a project
 */
export async function checkProjectPermission(
  firmId: string,
  clientId: string,
  projectId: string,
  scope: string,
  privilege: string
): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return false

  // The engagement must belong to the client and firm passed in — the firm-admin and client-manager
  // fallbacks below otherwise pass for a foreign engagement. (.claude/plans/access-gates.md, P0 #8.)
  // The JWT persona fast path is gone (P0 #7).
  if (!(await engagementBelongsTo(projectId, clientId, firmId))) return false

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)

  const project = findProjectInPermissions(settings.permissions, firmId, clientId, projectId)

  // Every engagement role grants project:can_view, so a cached *denial* of it can only
  // come from a stale cache (the in-memory UserSettingsPlus lives 30 min per process).
  // Let that one case fall through to the DB check below instead of 404ing the
  // engagement page until the user signs out and back in.
  const isStaleViewDenialCandidate = scope === 'project' && privilege === 'can_view'

  if (project) {
    // project:can_edit is a distinct capability; check it directly
    if (scope === 'project' && privilege === 'can_edit') {
      return project.scopes['project']?.includes('can_edit') ?? false
    }
    const allowed = project.scopes[scope]?.includes(privilege) ?? false
    if (allowed || !isStaleViewDenialCandidate) return allowed
  }

  // Fallback: firm_admin has broad access within their firm (intentional).
  // System Management admins do NOT get customer firm access (privacy).
  const firm = findFirmInPermissions(settings.permissions, firmId)
  if (firm && firm.personas.includes('firm_admin')) {
    return true
  }

  const client = findClientInPermissions(settings.permissions, firmId, clientId)
  if (client?.scopes?.client?.includes('can_manage')) {
    return true
  }

  // Final fallback: Direct DB check for cases where the cache hasn't updated yet.
  // Covers: (1) freshly-created firm_admin, (2) newly-invited engagement member whose
  // userSettingsPlus cache was invalidated but not yet rebuilt in this process.
  try {
    const { prisma } = await import('./prisma')
    const [dbFirmMembership, dbEngagementMembership] = await Promise.all([
      prisma.firmMember.findFirst({
        where: { userId: user.id, firmId },
        select: { role: true },
      }),
      prisma.engagementMember.findFirst({
        where: { userId: user.id, engagementId: projectId },
        select: { role: true },
      }),
    ])
    if (dbFirmMembership?.role === 'firm_admin') {
      return true
    }
    // All engagement roles grant can_view. Include EC/EV here so the fallback is correct
    // even when the UserSettingsPlus cache is stale or cross-pod invalidation hasn't propagated.
    const viewableEngagementRoles = ['eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer']
    if (dbEngagementMembership && viewableEngagementRoles.includes(dbEngagementMembership.role)) {
      // Membership answers can_view. Where the persona map decides the privilege (can_manage,
      // can_edit, can_view_internal), ask the member's role — otherwise a Reviewer whose cache
      // hasn't caught up would pass a manage check. Privileges the map doesn't define keep the
      // membership answer.
      const { getCapabilitiesForPersona } = await import('./permissions/persona-map')
      const caps = getCapabilitiesForPersona(dbEngagementMembership.role) as Record<string, boolean | undefined>
      const key = `${scope}:${privilege}`
      return key in caps ? caps[key] === true : true
    }
  } catch (dbError) {
    // Non-fatal: If DB check fails, fall through to false
    const { logger } = await import('./logger')
    logger.warn('DB fallback check in checkProjectPermission failed', dbError as Error)
  }

  return false
}

/**
 * Get all permissions for a project (returns scopes object)
 */
export async function getProjectPermissions(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<Record<string, string[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return {}

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
  const project = findProjectInPermissions(settings.permissions, firmId, clientId, projectId)

  return project?.scopes ?? {}
}

/**
 * Get project persona slug
 */
export async function getProjectPersona(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
  const project = findProjectInPermissions(settings.permissions, firmId, clientId, projectId)

  return project?.persona ?? null
}

/**
 * Check if user can access RBAC admin (Permission/Privilege/Grants UI).
 * Allowed: `firm_admin` on any firm the user belongs to.
 *
 * Note: an earlier version of this doc claimed an `app_metadata.role === 'SYS_ADMIN'` override.
 * No such check exists here or anywhere else in the codebase — `app_metadata.role` is never read.
 */
export async function canAccessRbacAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  const settings = await userSettingsPlus.getUserSettingsPlus(userId)
  const hasFirmAdmin = settings.permissions.firms.some(
    (firm) => firm.personas?.includes('firm_admin')
  )
  return hasFirmAdmin
}

/**
 * Convenience functions for common permission checks
 */
export async function canViewProject(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'project', 'can_view')
}

export async function canEditProject(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'project', 'can_edit')
}

export async function canManageProject(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'project', 'can_manage')
}

export async function canCommentOnProject(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'project', 'can_comment')
}

export async function canViewDocument(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'document', 'can_view')
}

export async function canEditDocument(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'document', 'can_edit')
}

export async function canManageDocument(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'document', 'can_manage')
}

/**
 * Project settings (gear) and project-level edits: only Org Owner, Client Owner, or Project Lead.
 * True if user has project can_manage (eng_admin, org_admin) or client can_manage (eng_admin).
 */
export async function canViewProjectSettings(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  // Only check project-level management (Project Lead)
  return checkProjectPermission(firmId, clientId, projectId, 'project', 'can_manage')
}

/**
 * Members, Shares, Insights tabs: Team Member, Project Lead, Client Owners, Org Owners only.
 * Not visible to Guest or External Collaborator.
 */
export async function canViewProjectInternalTabs(
  firmId: string,
  clientId: string,
  projectId: string
): Promise<boolean> {
  return checkProjectPermission(firmId, clientId, projectId, 'project', 'can_view_internal')
}

/**
 * Check if user can manage organization
 */
export async function canManageOrganization(orgId: string): Promise<boolean> {
  return checkFirmPermission(orgId, 'firm', 'can_manage')
}

/**
 * Check if user can manage client
 */
export async function canManageClient(
  orgId: string,
  clientId: string
): Promise<boolean> {
  return checkClientPermission(orgId, clientId, 'client', 'can_manage')
}

/** Slug of the System Management org (org_admin = internal platform admin). */
export const SYSTEM_MANAGEMENT_ORG_SLUG = 'pockett-internal'

/**
 * Check if user is org_admin of the System Management org.
 * Use for /internal access. Does NOT grant access to customer orgs (privacy).
 */
export async function isSystemManagementAdmin(userId: string): Promise<boolean> {
  if (!userId) return false
  try {
    const { prisma } = await import('./prisma')
    const { FirmRole } = await import('@prisma/client')
    const firm = await prisma.firm.findUnique({
      where: { slug: SYSTEM_MANAGEMENT_ORG_SLUG },
      select: { id: true },
    })
    if (!firm) return false
    const member = await prisma.firmMember.findFirst({
      where: { firmId: firm.id, userId, role: FirmRole.firm_admin },
    })
    return !!member
  } catch {
    return false
  }
}

/**
 * @deprecated Use isSystemManagementAdmin. system_admins table is deprecated.
 * Kept for backward compatibility during migration.
 */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const fromOrg = await isSystemManagementAdmin(userId)
  if (fromOrg) return true
  try {
    const { prisma } = await import('./prisma')
    const admin = await prisma.systemAdmin.findFirst({
      where: { userId },
    })
    return !!admin
  } catch {
    return false
  }
}
