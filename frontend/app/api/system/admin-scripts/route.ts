import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { adminScripts } from '@/lib/admin-scripts'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    )
    const { data: { user } } = await supabase.auth.getUser(token)

    if (!user?.id || !(await isSysAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden: System admin access required' }, { status: 403 })
    }

    return NextResponse.json({
      scripts: adminScripts.map(({ id, name, description }) => ({ id, name, description })),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list scripts' }, { status: 500 })
  }
}
