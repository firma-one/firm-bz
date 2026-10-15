import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FirmService } from '@/lib/firm-service'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/utils/supabase/admin'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "dummy")
)

/**
 * POST /api/onboarding/ensure-org
 *
 * Legacy endpoint: idempotently ensures the authenticated user has a default firm.
 * Called during onboarding init when no org is found (e.g. users with an
 * existing session that bypassed the auth/callback org-creation step).
 *
 * Returns { id, slug, name } of the firm (legacy shape).
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Check if user has a default firm
    const firm = await FirmService.getDefaultFirm(user.id)

    if (!firm) {
      return NextResponse.json({ organization: null })
    }

    // The persona claim mirrors the user's real role in that firm. This used to write
    // 'firm_admin' for anyone with a default firm — a guest included — and the permission helpers
    // trusted the claim. (.claude/plans/access-gates.md, P0 #7)
    const { prisma } = await import('@/lib/prisma')
    const membership = await prisma.firmMember.findFirst({ where: { userId: user.id, firmId: firm.id }, select: { role: true } })

    // Inject JWT Metadata (RBAC V2)
    try {
      const adminClient = createAdminClient()
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
        },
        app_metadata: mergeLeanAppMetadata(user.app_metadata as Record<string, unknown>, {
          active_firm_id: firm.id,
          active_firm_slug: firm.slug,
          active_persona: membership?.role ?? undefined,
        }),
      })
      logger.info('JWT metadata injected during onboarding (ensure-org)', { userId: user.id, firmId: firm.id })
    } catch (jwtError) {
      logger.error('Failed to inject JWT metadata during onboarding (ensure-org)', jwtError as Error)
    }

    return NextResponse.json({
      id: firm.id,
      slug: firm.slug,
      name: firm.name
    })
  } catch (error) {
    console.error('[ensure-org] Error:', error)
    return NextResponse.json(
      { error: 'Failed to ensure firm' },
      { status: 500 }
    )
  }
}
