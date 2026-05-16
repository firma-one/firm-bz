/**
 * GET /api/rbac/effective-permissions?persona=<slug>
 * Returns effective org-level permission flags for a persona (for "View As").
 * Protected: system admin (SYSTEM_ADMIN_EMAILS) or org_admin of current org (canAccessRbacAdmin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canAccessRbacAdmin } from '@/lib/permission-helpers'
import { isSystemAdminEmail } from '@/lib/system/admin-check'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isSystemAdmin = isSystemAdminEmail(user.email)
    const canRbac = isSystemAdmin || (await canAccessRbacAdmin(user.id))

    if (!canRbac) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const personaSlug = request.nextUrl.searchParams.get('persona')
    if (!personaSlug) {
      return NextResponse.json({ error: 'Missing persona' }, { status: 400 })
    }

    const { getCapabilitiesForPersona } = await import('@/lib/permissions/persona-map')
    const capabilities = getCapabilitiesForPersona(personaSlug)

    return NextResponse.json({
      canView: capabilities['project:can_view'] === true,
      canEdit: capabilities['project:can_manage'] === true, // Map manage to edit for UI
      canManage: capabilities['project:can_manage'] === true,
      canViewClients: capabilities['project:can_view'] === true,
      canEditClients: capabilities['project:can_manage'] === true,
      canManageClients: capabilities['project:can_manage'] === true,
      viewAsPersona: personaSlug,
    })
  } catch (error) {
    console.error('Effective permissions error', error)
    return NextResponse.json(
      { error: 'Failed to fetch effective permissions' },
      { status: 500 }
    )
  }
}
