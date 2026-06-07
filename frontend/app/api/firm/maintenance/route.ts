import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMaintenanceMode, getMigrationPending, setMaintenanceMode, setMigrationState, setMigrationPending, getLatestMigration, updateMigrationStatus } from '@/lib/firm-maintenance'

function makeSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = makeSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const firmId = searchParams.get('firmId')
  if (!firmId) {
    return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  }

  const [mode, pending, latestMigration] = await Promise.all([
    getMaintenanceMode(firmId),
    getMigrationPending(firmId),
    getLatestMigration(firmId),
  ])

  let failedFileCount = 0
  let totalFileCount = 0
  let movedFileCount = 0
  let migrationFiles: { fileId: string; fileName: string | null; status: string }[] = []

  if (latestMigration) {
    const { prisma } = require('@/lib/prisma')
    const files = await prisma.firmWorkspaceMigrationFile.findMany({
      where: { migrationId: latestMigration.id },
      select: { fileId: true, fileName: true, status: true },
      orderBy: { createdAt: 'asc' },
    })
    migrationFiles = files
    totalFileCount = files.length
    movedFileCount = files.filter((f: { status: string }) => f.status === 'moved').length
    failedFileCount = files.filter((f: { status: string }) => f.status === 'failed').length
  }

  return NextResponse.json({
    active: mode?.active ?? false,
    estimatedMinutes: mode?.estimatedMinutes ?? null,
    startedAt: mode?.startedAt ?? null,
    expiresAt: mode?.expiresAt ?? null,
    migrationPending: pending ?? null,
    latestMigrationStatus: latestMigration?.status ?? null,
    totalFileCount,
    movedFileCount,
    failedFileCount,
    migrationFiles,
  })
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = makeSupabaseAdmin()
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, firmId } = body as { action?: string; firmId?: string }

  if (!firmId) {
    return NextResponse.json({ error: 'firmId required' }, { status: 400 })
  }

  const { prisma } = require('@/lib/prisma')
  const member = await prisma.firmMember.findFirst({
    where: { firmId, userId: user.id },
    select: { role: true },
  })
  if (!member || member.role !== 'firm_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (action === 'force-unlock') {
    await setMaintenanceMode(firmId, null)
    await setMigrationState(firmId, null)
    return NextResponse.json({ ok: true })
  }

  if (action === 'cancel-migration') {
    // Only cancellable during grace period (pending_grace) — not once in_progress
    const migration = await getLatestMigration(firmId)
    if (migration && migration.status === 'pending_grace') {
      await updateMigrationStatus(migration.id, 'failed')
    }
    await setMigrationPending(firmId, null)
    await setMigrationState(firmId, null)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
