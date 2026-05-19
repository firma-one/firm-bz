/**
 * API Route: Get Firm Permissions
 *
 * Returns permissions for a firm from cached UserSettingsPlus.
 * Respects View As cookie when user is firm admin (permission-based UI framework).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { findFirmInPermissions, findClientInPermissions } from '@/lib/permission-helpers'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { getViewAsPersonaFromCookie } from '@/lib/view-as-server'
import { prisma } from '@/lib/prisma'

function firmPrivileges(scopes: Record<string, string[]> | undefined): string[] {
  if (!scopes) return []
  return scopes.firm ?? []
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user

    const { searchParams } = new URL(request.url)
    let firmId = searchParams.get('firmId')
    const firmSlug = searchParams.get('firmSlug')
    const clientId = searchParams.get('clientId') // optional: for client-level Settings visibility

    if (!firmId && !firmSlug) {
      return NextResponse.json({ error: 'Missing firmId or firmSlug parameter' }, { status: 400 })
    }

    // Resolve firmSlug -> firmId when only slug is provided (permissions cache is keyed by id)
    if (!firmId && firmSlug) {
      const firmRow = await prisma.firm.findFirst({
        where: { slug: firmSlug },
        select: { id: true },
      })
      firmId = firmRow?.id ?? null
    }

    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    let firm = firmId ? findFirmInPermissions(settings.permissions, firmId) : null

    // Cache can lag after creating a firm (in-memory TTL, multi-instance, etc.). Fall back to DB membership.
    if (!firm && firmId) {
      const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, firmId },
        select: { role: true, isDefault: true },
      })
      if (membership) {
        const { getCapabilitiesForPersona } = await import('@/lib/permissions/persona-map')
        const { capabilitySetToScopes } = await import('@/lib/permissions/capability-utils')
        const roleSlug = membership.role
        const scopes = capabilitySetToScopes(getCapabilitiesForPersona(roleSlug))
        firm = {
          id: firmId,
          role: roleSlug,
          personas: [roleSlug],
          scopes,
          isDefault: membership.isDefault,
          clients: [],
        }
      }
    }

    if (!firm) {
      return NextResponse.json({ error: 'Firm not found in permissions' }, { status: 404 })
    }

    const firmPrivs = firmPrivileges(firm.scopes)

    // Important: `can_manage` and `can_edit` imply `can_view` for UI gating.
    const canEdit = firmPrivs.includes('can_edit')
    const canManage = firmPrivs.includes('can_manage')
    const canView = firmPrivs.includes('can_view') || canEdit || canManage
    const canManageClients = firm.scopes?.client?.includes('can_manage') ?? false
    const canEditClients = firm.scopes?.client?.includes('can_edit') ?? false
    const canViewClients = firm.scopes?.client?.includes('can_view') ?? false

    // View As: when set and user is firm admin, return permissions for the viewed persona
    const viewAsSlug = await getViewAsPersonaFromCookie()
    const hasRbacAdmin = settings.permissions.firms.some(
      (f) => (f.personas?.includes('firm_admin') || f.personas?.includes('sys_admin')) ?? false
    )
    const applyViewAs = viewAsSlug && hasRbacAdmin

    let isFirmOwner: boolean
    let effectiveCanManageClients: boolean
    let canManageClient: boolean | undefined

    if (applyViewAs) {
      if (viewAsSlug === 'firm_admin') {
        isFirmOwner = true
        effectiveCanManageClients = true
        if (clientId) canManageClient = true
      } else {
        isFirmOwner = false
        effectiveCanManageClients = false
        if (clientId) {
          const client = findClientInPermissions(settings.permissions, firm.id, clientId)
          canManageClient = client?.scopes?.client?.includes('can_manage') ?? false
        }
      }
    } else {
      isFirmOwner =
        (firm.personas?.includes('firm_admin') ?? false) ||
        (firm.personas?.includes('org_admin') ?? false) ||
        canManage
      effectiveCanManageClients = canManageClients ?? false
      if (clientId) {
        const client = findClientInPermissions(settings.permissions, firm.id, clientId)
        const clientScopeManage = client?.scopes?.client?.includes('can_manage') ?? false
        canManageClient = canManageClients || clientScopeManage
      }
    }

    const orgSettings = firmId ? settings.organizationSettings[firmId] : undefined
    const enableBetaFeatures = orgSettings?.enableBetaFeatures === true

    const body: Record<string, unknown> = {
      canView,
      canEdit,
      canManage,
      canManageClients: effectiveCanManageClients ?? canManageClients,
      canEditClients,
      canViewClients,
      isFirmOwner,
      isOrgOwner: isFirmOwner, // alias for consumers still using org terminology
      scopes: firm.scopes,
      enableBetaFeatures,
    }
    if (clientId !== null && clientId !== undefined) {
      body.canManageClient = canManageClient
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Error fetching firm permissions', error)
    return NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    )
  }
}

