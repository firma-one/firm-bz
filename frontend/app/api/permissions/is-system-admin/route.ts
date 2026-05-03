/**
 * GET /api/permissions/is-system-admin
 * Returns whether the current user can access /system.
 * Checks if user email is in SYSTEM_ADMIN_EMAILS env var (comma-separated).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSystemAdminEmail } from '@/lib/system/admin-check'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isSystemAdmin = isSystemAdminEmail(user.email)
  return NextResponse.json({ isSystemAdmin })
}
