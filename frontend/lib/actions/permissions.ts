'use server'

import { createClient } from '@/utils/supabase/server'
import { findFirmInPermissions, findClientInPermissions } from '@/lib/permission-helpers'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { getViewAsPersonaFromCookie } from '@/lib/view-as-server'

export async function getFirmClientPermissions(
  firmId: string,
  clientId: string,
): Promise<{ canManageClient: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { canManageClient: false }

    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    if (!settings) return { canManageClient: false }

    const firm = findFirmInPermissions(settings.permissions, firmId)
    if (!firm) return { canManageClient: false }

    const canManageClients = firm.scopes?.client?.includes('can_manage') ?? false

    const viewAsSlug = await getViewAsPersonaFromCookie()
    const hasRbacAdmin = settings.permissions.firms.some(
      (f: { personas?: string[] }) => (f.personas?.includes('firm_admin') || f.personas?.includes('sys_admin')) ?? false,
    )
    const applyViewAs = viewAsSlug && hasRbacAdmin

    if (applyViewAs) {
      if (viewAsSlug === 'firm_admin') return { canManageClient: true }
      const client = findClientInPermissions(settings.permissions, firm.id, clientId)
      return { canManageClient: client?.scopes?.client?.includes('can_manage') ?? false }
    }

    const isFirmOwner =
      (firm.personas?.includes('firm_admin') ?? false) ||
      (firm.personas?.includes('org_admin') ?? false) ||
      (firm.scopes?.firm?.includes('can_manage') ?? false)
    if (isFirmOwner) return { canManageClient: true }

    const client = findClientInPermissions(settings.permissions, firm.id, clientId)
    const clientScopeManage = client?.scopes?.client?.includes('can_manage') ?? false
    return { canManageClient: canManageClients || clientScopeManage }
  } catch {
    return { canManageClient: false }
  }
}
