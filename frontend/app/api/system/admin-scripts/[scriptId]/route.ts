import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { findScript } from '@/lib/admin-scripts'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> },
) {
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

    const { scriptId } = await params
    const script = findScript(scriptId)
    if (!script) {
      return NextResponse.json({ error: `Script '${scriptId}' not found` }, { status: 404 })
    }

    const result = await script.run()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Script execution failed' },
      { status: 500 },
    )
  }
}
