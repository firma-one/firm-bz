import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/projects/[projectId]/members
 * Returns internal engagement members (firm members only) with their emails.
 * Used by the comment composer reminder recipient dropdown.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canView = await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const members = await prisma.engagementMember.findMany({
      where: { engagementId: projectId },
      select: { userId: true, role: true },
    })

    const enriched = (
      await Promise.all(
        members.map(async (m) => {
          try {
            const { data } = await supabaseAdmin.auth.admin.getUserById(m.userId)
            const email = data?.user?.email
            if (!email) return null
            const meta = data?.user?.user_metadata ?? {}
            const name = (meta.full_name ?? meta.name ?? email.split('@')[0]) as string
            const avatarUrl = (meta.avatar_url ?? meta.picture ?? null) as string | null
            return { userId: m.userId, email, name, role: m.role, avatarUrl }
          } catch {
            return null
          }
        })
      )
    ).filter(Boolean) as { userId: string; email: string; name: string; role: string; avatarUrl: string | null }[]

    return NextResponse.json({ members: enriched })
  } catch (e) {
    console.error('GET members error', e)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }
}
