/**
 * UserSettingsPlus Cache Service
 * 
 * Unified cache for:
 * - Permissions (RBAC from V2 platform schema)
 * - User preferences & personalization
 * - Project-level settings
 * - Organization-level settings
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// ============================================================================
// Type Definitions
// ============================================================================

export interface FirmPermissions {
  id: string
  role: string
  personas: string[]
  scopes: Record<string, string[]>
  isDefault: boolean
  clients: ClientPermissions[]
}

export interface ClientPermissions {
  id: string
  scopes: Record<string, string[]>
  projects: ProjectPermissions[]
}

export interface ProjectPermissions {
  id: string
  persona: string
  scopes: Record<string, string[]>
}

export interface UserPermissions {
  firms: FirmPermissions[]
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system'
  viewMode?: 'grid' | 'list' | 'compact'
  sidebarCollapsed?: boolean
  emailNotifications?: {
    projectInvites: boolean
    documentUpdates: boolean
    mentions: boolean
  }
  features?: {
    showInsights: boolean
    showAnalytics: boolean
    enableKeyboardShortcuts: boolean
  }
}

export interface ProjectSettings {
  [projectId: string]: {
    notifications?: boolean
    defaultView?: string
    customFields?: Record<string, any>
  }
}

export interface OrganizationSettings {
  [orgId: string]: {
    branding?: {
      logoUrl?: string
      primaryColor?: string
      secondaryColor?: string
      subtext?: string
    }
    enableBetaFeatures?: boolean
  }
}

export interface UserSettingsPlus {
  userId: string
  computedAt: number
  version: string
  permissions: UserPermissions
  preferences: UserPreferences
  projectSettings: ProjectSettings
  organizationSettings: OrganizationSettings
  planEntitlementsByFirm: Record<string, Record<string, unknown>>
}

// ============================================================================
// Cache Implementation
// ============================================================================

class UserSettingsPlusCache {
  private cache = new Map<string, { data: UserSettingsPlus; expiresAt: number }>()
  private readonly TTL = 1000 * 60 * 30 // 30 minutes
  private readonly VERSION = '2.0.0' // Bump for V2 schema

  async getUserSettingsPlus(userId: string): Promise<UserSettingsPlus> {
    const cached = this.cache.get(userId)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data
    }

    logger.debug('Cache miss - computing UserSettingsPlus from DB (V2)', 'UserSettingsPlus', { userId })
    const settings = await this.computeUserSettingsPlus(userId)

    this.cache.set(userId, {
      data: settings,
      expiresAt: Date.now() + this.TTL
    })

    return settings
  }

  private async computeUserSettingsPlus(userId: string): Promise<UserSettingsPlus> {
    const [
      permissions,
      preferences,
      projectSettings,
      organizationSettings,
      planEntitlementsByFirm
    ] = await Promise.all([
      this.computePermissions(userId),
      this.computePreferences(userId),
      this.computeProjectSettings(userId),
      this.computeOrganizationSettings(userId),
      this.computePlanEntitlementsByFirm(userId),
    ])

    return {
      userId,
      computedAt: Date.now(),
      version: this.VERSION,
      permissions,
      preferences,
      projectSettings,
      organizationSettings,
      planEntitlementsByFirm,
    }
  }

  private async computePermissions(userId: string): Promise<UserPermissions> {
    const { getCapabilitiesForPersona } = await import('./permissions/persona-map')
    const { capabilitySetToScopes } = await import('./permissions/capability-utils')

    // Primary query: walk up from engagement_members → engagement → client → firm.
    // This is correct-by-definition — any user with an engagement membership gets their
    // firm in the output regardless of whether a firm_members row exists.
    const engagementMemberships = await prisma.engagementMember.findMany({
      where: { userId },
      select: {
        role: true,
        engagement: {
          select: {
            id: true,
            isDeleted: true,
            client: {
              select: {
                id: true,
                firmId: true,
                members: {
                  where: { userId },
                  select: { persona: { select: { slug: true } } }
                }
              }
            }
          }
        }
      }
    })

    // Additive query: firm_admin users may not be on individual engagements but still
    // need broad firm-level access (they see all clients/engagements in the firm).
    const firmMemberships = await prisma.firmMember.findMany({
      where: { userId, role: 'firm_admin' },
      select: {
        firmId: true,
        isDefault: true,
        firm: {
          select: {
            id: true,
            clients: {
              where: {
                OR: [
                  { members: { some: { userId } } },
                  { engagements: { some: { isDeleted: false, members: { some: { userId } } } } }
                ]
              },
              include: {
                members: {
                  where: { userId },
                  include: { persona: true }
                },
                engagements: {
                  where: { members: { some: { userId } }, isDeleted: false },
                  include: { members: { where: { userId } } }
                }
              }
            }
          }
        }
      }
    })

    // Also fetch isDefault for all firm_member rows (needed for the isDefault flag on non-admin firms)
    const allFirmMemberships = await prisma.firmMember.findMany({
      where: { userId },
      select: { firmId: true, isDefault: true, role: true }
    })
    const firmMemberByFirmId = new Map(allFirmMemberships.map((m) => [m.firmId, m]))

    // Build firms map from engagement memberships (bottom-up)
    type FirmBuild = {
      firmId: string
      clientMap: Map<string, { clientPersonaSlug: string | null; projectMap: Map<string, { role: string }> }>
    }
    const firmBuildMap = new Map<string, FirmBuild>()

    for (const em of engagementMemberships) {
      if (!em.engagement || em.engagement.isDeleted) continue
      const { client } = em.engagement
      if (!client) continue

      if (!firmBuildMap.has(client.firmId)) {
        firmBuildMap.set(client.firmId, { firmId: client.firmId, clientMap: new Map() })
      }
      const firmBuild = firmBuildMap.get(client.firmId)!

      if (!firmBuild.clientMap.has(client.id)) {
        const clientMember = client.members[0]
        firmBuild.clientMap.set(client.id, {
          clientPersonaSlug: clientMember?.persona?.slug ?? null,
          projectMap: new Map()
        })
      }
      firmBuild.clientMap.get(client.id)!.projectMap.set(em.engagement.id, { role: em.role })
    }

    const firms: FirmPermissions[] = []
    const coveredFirmIds = new Set<string>()

    // Emit firms from engagement-based build
    for (const [firmId, build] of Array.from(firmBuildMap)) {
      coveredFirmIds.add(firmId)
      const membership = firmMemberByFirmId.get(firmId)
      const firmRole = membership?.role ?? 'eng_viewer'

      const clients: ClientPermissions[] = []
      for (const [clientId, clientBuild] of Array.from(build.clientMap)) {
        const projects: ProjectPermissions[] = []
        for (const [projectId, projectBuild] of Array.from(clientBuild.projectMap)) {
          projects.push({
            id: projectId,
            persona: projectBuild.role,
            scopes: capabilitySetToScopes(getCapabilitiesForPersona(projectBuild.role))
          })
        }
        clients.push({
          id: clientId,
          scopes: capabilitySetToScopes(getCapabilitiesForPersona(clientBuild.clientPersonaSlug ?? undefined)),
          projects
        })
      }

      firms.push({
        id: firmId,
        role: firmRole,
        personas: [firmRole],
        scopes: capabilitySetToScopes(getCapabilitiesForPersona(firmRole)),
        isDefault: membership?.isDefault ?? false,
        clients
      })
    }

    // Additive pass: firm_admin users — add any firms not already covered by engagement memberships
    for (const fm of firmMemberships) {
      if (coveredFirmIds.has(fm.firm.id)) continue
      coveredFirmIds.add(fm.firm.id)

      const clients: ClientPermissions[] = []
      for (const client of fm.firm.clients) {
        const clientMember = client.members.find((m: any) => m.userId === userId)
        const clientScopes = capabilitySetToScopes(getCapabilitiesForPersona(clientMember?.persona?.slug))

        const projects: ProjectPermissions[] = []
        for (const project of client.engagements) {
          const projectMember = project.members.find((m: any) => m.userId === userId)
          if (!projectMember?.role) continue
          projects.push({
            id: project.id,
            persona: projectMember.role,
            scopes: capabilitySetToScopes(getCapabilitiesForPersona(projectMember.role))
          })
        }
        if (clientMember || projects.length > 0) {
          clients.push({ id: client.id, scopes: clientScopes, projects })
        }
      }

      firms.push({
        id: fm.firm.id,
        role: 'firm_admin',
        personas: ['firm_admin'],
        scopes: capabilitySetToScopes(getCapabilitiesForPersona('firm_admin')),
        isDefault: fm.isDefault,
        clients
      })
    }

    return { firms }
  }

  private async computePreferences(userId: string): Promise<UserPreferences> {
    return {
      theme: 'system',
      viewMode: 'grid',
      sidebarCollapsed: false,
      emailNotifications: {
        projectInvites: true,
        documentUpdates: true,
        mentions: true
      },
      features: {
        showInsights: true,
        showAnalytics: true,
        enableKeyboardShortcuts: true
      }
    }
  }

  private async computeProjectSettings(userId: string): Promise<ProjectSettings> {
    const engagementMembers = await prisma.engagementMember.findMany({
      where: { userId },
      select: {
        engagementId: true,
        settings: true,
        engagement: { select: { isDeleted: true } }
      }
    })

    const settings: ProjectSettings = {}
    for (const member of engagementMembers) {
      if (member.engagement.isDeleted) continue
      const memberSettings = member.settings as Record<string, any> || {}
      settings[member.engagementId] = {
        notifications: memberSettings.notifications ?? true,
        defaultView: memberSettings.defaultView,
        customFields: memberSettings.customFields
      }
    }
    return settings
  }

  private async computeOrganizationSettings(userId: string): Promise<OrganizationSettings> {
    const firmMemberships = await prisma.firmMember.findMany({
      where: { userId },
      select: {
        firmId: true,
        firm: { select: { settings: true } }
      }
    })

    const settings: OrganizationSettings = {}
    for (const membership of firmMemberships) {
      const firmSettings = membership.firm.settings as Record<string, any> || {}
      settings[membership.firmId] = {
        branding: {
          logoUrl: firmSettings.branding?.logoUrl,
          primaryColor: firmSettings.branding?.primaryColor,
          secondaryColor: firmSettings.branding?.secondaryColor,
          subtext: firmSettings.branding?.subtext
        },
        enableBetaFeatures: firmSettings.enableBetaFeatures === true,
      }
    }
    return settings
  }

  private async computePlanEntitlementsByFirm(userId: string): Promise<Record<string, Record<string, unknown>>> {
    const memberships = await prisma.firmMember.findMany({
      where: { userId },
      select: {
        firmId: true,
        firm: {
          select: {
            id: true,
            groupId: true,
            sandboxOnly: true,
          },
        },
      },
    })

    if (memberships.length === 0) return {}

    const groupIds = Array.from(new Set(memberships.map((m) => m.firm.groupId)))
    const activeSubs = await prisma.subscription.findMany({
      where: {
        groupId: { in: groupIds },
        active: true,
        deletedAt: null,
      },
      select: {
        groupId: true,
        settings: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const metadataByGroup = new Map<string, Record<string, unknown>>()
    for (const sub of activeSubs) {
      if (metadataByGroup.has(sub.groupId)) continue
      const settings = (sub.settings as Record<string, unknown> | null) ?? {}
      const metadata = settings && typeof settings === 'object'
        ? ((settings as Record<string, unknown>).metadata as Record<string, unknown> | undefined)
        : undefined
      metadataByGroup.set(sub.groupId, metadata && typeof metadata === 'object' ? metadata : {})
    }

    const out: Record<string, Record<string, unknown>> = {}
    for (const membership of memberships) {
      out[membership.firmId] = metadataByGroup.get(membership.firm.groupId) ?? {}
    }
    return out
  }

  invalidateUser(userId: string): void {
    this.cache.delete(userId)
    logger.debug('Invalidated UserSettingsPlus cache', 'UserSettingsPlus', { userId })
  }

  invalidateUsers(userIds: string[]): void {
    userIds.forEach(userId => this.cache.delete(userId))
  }

  clear(): void {
    this.cache.clear()
  }

  getStats() {
    const now = Date.now()
    let valid = 0
    let expired = 0
    for (const { expiresAt } of Array.from(this.cache.values())) {
      if (now < expiresAt) valid++
      else expired++
    }
    return { total: this.cache.size, valid, expired }
  }
}

export const userSettingsPlus = new UserSettingsPlusCache()

export async function checkProjectPermission(
  userId: string,
  projectId: string,
  scope: string,
  privilege: string
): Promise<boolean> {
  const settings = await userSettingsPlus.getUserSettingsPlus(userId)
  for (const firm of settings.permissions.firms) {
    for (const client of firm.clients) {
      const project = client.projects.find(p => p.id === projectId)
      if (project) {
        return project.scopes[scope]?.includes(privilege) ?? false
      }
    }
  }
  return false
}

export async function getProjectPermissions(
  userId: string,
  projectId: string
): Promise<Record<string, string[]>> {
  const settings = await userSettingsPlus.getUserSettingsPlus(userId)
  for (const firm of settings.permissions.firms) {
    for (const client of firm.clients) {
      const project = client.projects.find(p => p.id === projectId)
      if (project) return project.scopes
    }
  }
  return {}
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const settings = await userSettingsPlus.getUserSettingsPlus(userId)
  return settings.preferences
}

export async function getProjectSettings(userId: string, projectId: string): Promise<ProjectSettings[string] | undefined> {
  const settings = await userSettingsPlus.getUserSettingsPlus(userId)
  return settings.projectSettings[projectId]
}

export async function getOrganizationSettings(userId: string, orgId: string): Promise<OrganizationSettings[string] | undefined> {
  const settings = await userSettingsPlus.getUserSettingsPlus(userId)
  return settings.organizationSettings[orgId]
}
