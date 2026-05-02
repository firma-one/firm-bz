import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { logger } from '@/lib/logger'
import { decrypt } from '@/lib/encryption'

interface StuckFirm {
  id: string
  name: string
  slug: string
  connectorId: string
  createdAt: string
  stuckSince: string | null
  userId: string
  userEmail: string
}

interface StuckFirmsResponse {
  firms: StuckFirm[]
}

export async function GET(request: NextRequest) {
  try {
    // Verify SYS_ADMIN access
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )
    const { data: { user } } = await supabase.auth.getUser(token)

    if (!user?.id || !(await isSysAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden: SYS_ADMIN role required' }, { status: 403 })
    }

    // Query stuck firms with their admin user IDs
    const stuckRows = await prisma.$queryRaw<Array<{
      id: string
      name: string
      slug: string
      connectorId: string
      createdAt: Date
      stuck_since: string | null
      admin_user_id: string
    }>>`
      SELECT
        f.id,
        f.name,
        f.slug,
        f."connectorId",
        f."createdAt",
        f.settings->'onboarding'->>'lastUpdated' AS stuck_since,
        fm."userId" AS admin_user_id
      FROM platform.firms f
      JOIN platform.firm_members fm ON fm."firmId" = f.id AND fm.role = 'firm_admin'
      WHERE
        f."deletedAt" IS NULL
        AND f."connectorId" IS NOT NULL
        AND f.settings->'onboarding'->>'stage' = 'provisioning'
        AND (f.settings->'onboarding'->'isComplete')::boolean IS NOT TRUE
      ORDER BY f."createdAt" ASC
    `

    if (stuckRows.length === 0) {
      return NextResponse.json({ firms: [] })
    }

    // Get user details from Supabase auth
    const userIds = stuckRows.map(r => `'${r.admin_user_id}'`).join(',')
    const authUsers = await prisma.$queryRawUnsafe<Array<{
      id: string
      email: string
    }>>(
      `SELECT id::text, email FROM auth.users WHERE id IN (${userIds})`
    )

    const userMap = new Map(authUsers.map(u => [u.id, u.email]))

    // Merge data and decrypt firm names
    const firms: StuckFirm[] = stuckRows.map(row => {
      let decryptedName = row.name
      try {
        // Attempt to decrypt name if it looks encrypted (starts with v1$, v2$, etc.)
        if (row.name && /^v\d+\$/.test(row.name)) {
          decryptedName = decrypt(row.name)
        }
      } catch (error) {
        logger.error('Failed to decrypt firm name', { firmId: row.id, error })
        // Fall back to encrypted name if decryption fails
      }

      return {
        id: row.id,
        name: decryptedName,
        slug: row.slug,
        connectorId: row.connectorId,
        createdAt: row.createdAt.toISOString(),
        stuckSince: row.stuck_since,
        userId: row.admin_user_id,
        userEmail: userMap.get(row.admin_user_id) || 'unknown',
      }
    })

    const response: StuckFirmsResponse = { firms }
    return NextResponse.json(response)
  } catch (error) {
    logger.error('Error querying stuck firms', error as Error)
    return NextResponse.json(
      { error: 'Failed to query stuck firms' },
      { status: 500 }
    )
  }
}
