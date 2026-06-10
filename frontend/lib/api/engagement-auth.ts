/**
 * Project-scoped API auth helpers.
 * Use for routes under /api/projects/[projectId]/* that need project membership checks.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { canViewProject, canManageProject } from '@/lib/permission-helpers'
import { config } from '@/lib/config'
import type { User } from '@supabase/supabase-js'

export type ProjectContext = {
  orgId: string
  clientId: string
  projectId: string
}

export type ProjectAuthResult = {
  user: User
  project: { id: string; firmId: string; clientId: string; client: { firmId: string } }
  ctx: ProjectContext
}

/**
 * Get authenticated user from Authorization header (Bearer token).
 * Returns null if missing or invalid.
 */
export async function getAuthUser(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '').trim()
  if (!token || token === 'undefined') return null

  const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey!
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}

/**
 * Get project with client/org for context. Uses prisma (no RLS) since we check membership explicitly.
 */
async function getProjectWithContext(projectId: string) {
  const project = await prisma.engagement.findFirst({
    where: { id: projectId, isDeleted: false },
    select: {
      id: true,
      firmId: true,
      clientId: true,
      client: { select: { firmId: true } },
    },
  })
  if (!project) return null
  return {
    project,
    ctx: {
      orgId: project.firmId,
      clientId: project.clientId,
      projectId: project.id,
    } as ProjectContext,
  }
}

/**
 * Require auth + project view permission.
 * Returns { user, project, ctx } or a NextResponse (401/403/404) to return from the route.
 */
export async function requireProjectView(
  request: NextRequest,
  projectId: string
): Promise<ProjectAuthResult | NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getProjectWithContext(projectId)
  if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const canView = await canViewProject(data.ctx.orgId, data.ctx.clientId, data.ctx.projectId)
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return {
    user,
    project: data.project,
    ctx: data.ctx,
  }
}

/**
 * Require auth + project manage permission.
 * Returns { user, project, ctx } or a NextResponse (401/403/404) to return from the route.
 */
export async function requireProjectManage(
  request: NextRequest,
  projectId: string
): Promise<ProjectAuthResult | NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getProjectWithContext(projectId)
  if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const canManage = await canManageProject(data.ctx.orgId, data.ctx.clientId, data.ctx.projectId)
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return {
    user,
    project: data.project,
    ctx: data.ctx,
  }
}
