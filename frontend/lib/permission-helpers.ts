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

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)

  // High-performance check: If this is the active firm in the JWT (RBAC V2)
  if (user.app_metadata?.active_firm_id === firmId) {
    const { getCapabilitiesForPersona } = await import('./permissions/persona-map')
    const persona = user.app_metadata.active_persona
    const caps = getCapabilitiesForPersona(persona)

    // Scopes mapping in V2
    if (scope === 'firm') {
      if (privilege === 'can_manage') return caps['firm:can_manage'] === true
    }
    // Add other scope mappings as needed for V2
  }

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

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)

  // High-performance check: If this is the active firm in the JWT (RBAC V2)
  if (user.app_metadata?.active_firm_id === firmId) {
    const { getCapabilitiesForPersona } = await import('./permissions/persona-map')
    const persona = user.app_metadata.active_persona
    const caps = getCapabilitiesForPersona(persona)

    // Scopes mapping in V2 for client — only short-circuit on success so we can fall back
    // when JWT persona is stale or missing client:can_manage while UserSettingsPlus says firm_admin.
    if (scope === 'client' && privilege === 'can_manage' && caps['client:can_manage'] === true) {
      return true
    }
  }

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

  const settings = await userSettingsPlus.getUserSettingsPlus(user.id)

  // Safety: JWT path only for firm/client scope when active_firm_id matches.
  // Project scope always uses UserSettingsPlus (project_members) — never trust JWT for project role.
  if (scope !== 'project' && user.app_metadata?.active_firm_id === firmId) {
    const { getCapabilitiesForPersona } = await import('./permissions/persona-map')
    const persona = user.app_metadata?.active_persona
    const caps = getCapabilitiesForPersona(persona ?? null)

    if (scope === 'firm') {
      if (privilege === 'can_manage') return caps['firm:can_manage'] === true
    }
    if (scope === 'client') {
      if (privilege === 'can_manage') return caps['client:can_manage'] === true
    }
  }

  const project = findProjectInPermissions(settings.permissions, firmId, clientId, projectId)

  if (project) {
    // project:can_edit is a distinct capability; check it directly
    if (scope === 'project' && privilege === 'can_edit') {
      return project.scopes['project']?.includes('can_edit') ?? false
    }
    return project.scopes[scope]?.includes(privilege) ?? false
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
      return true
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
 * Allowed: SYS_ADMIN (app_metadata) or org_admin in any organization.
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
