import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMaintenanceMode, getMigrationPending, setMaintenanceMode, setMigrationState, setMigrationPending, getLatestMigration, getActiveMigration, updateMigrationStatus } from '@/lib/firm-maintenance'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/** A migration that has been pending this long with no record of its own never reached the job. */
const STALE_PENDING_MS = 2 * 60 * 1000

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

  const getMember = await prisma.firmMember.findFirst({
    where: { firmId, userId: user.id },
    select: { id: true },
  })
  if (!getMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const files = await prisma.firmWorkspaceMigrationFile.findMany({
      where: { migrationId: latestMigration.id },
      select: { fileId: true, fileName: true, status: true },
      // The model has no createdAt: ordering by it threw on every status poll once a migration
      // existed (hidden while prisma came in through an untyped require).
      orderBy: { fileName: 'asc' },
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

  const member = await prisma.firmMember.findFirst({
    where: { firmId, userId: user.id },
    select: { role: true },
  })
  if (!member || member.role !== 'firm_admin') {
    return NextResponse.json({ error: 'Only a firm admin can change a migration.' }, { status: 403 })
  }

  if (action === 'force-unlock') {
    try {
      await setMaintenanceMode(firmId, null)
      await setMigrationState(firmId, null)
    } catch (e) {
      logger.error('force-unlock failed', e instanceof Error ? e : new Error(String(e)), `firmId:${firmId}`)
      return NextResponse.json({ error: "The workspace couldn't be unlocked just now. Try again in a minute." }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'cancel-migration') {
    // Never answer ok for a migration that will run anyway (CN-7): the panel moves on, and the
    // workspace locks minutes later.
    const alreadyStarted = () =>
      NextResponse.json({ error: 'The migration has already started.', code: 'already_started' }, { status: 409 })
    try {
      const migration = await getActiveMigration(firmId)
      if (!migration) {
        const pending = await getMigrationPending(firmId)
        const pendingAge = pending?.initiatedAt ? Date.now() - new Date(pending.initiatedAt).getTime() : Infinity
        if (pending && pendingAge < STALE_PENDING_MS) {
          // Requested, but the job hasn't recorded it yet: clearing the banner now wouldn't stop it.
          return NextResponse.json(
            { error: 'The migration is still being set up. Try again in a few seconds.', code: 'not_ready' },
            { status: 409 }
          )
        }
        // Nothing running: clear what's left over.
        await setMigrationPending(firmId, null)
        await setMigrationState(firmId, null)
        return NextResponse.json({ ok: true })
      }
      if (migration.status !== 'pending_grace') return alreadyStarted()
      // Atomic guard: only transition pending_grace → failed. Using updateMany with a status
      // condition avoids a TOCTOU race where Inngest advances the migration to in_progress
      // between our read and write.
      const { count } = await prisma.firmWorkspaceMigration.updateMany({
        where: { id: migration.id, status: 'pending_grace' },
        data: { status: 'failed' },
      })
      if (count === 0) return alreadyStarted()
      // Migrate repointed the workspace root before the job was queued: put the old one back, or
      // Location names an empty folder while every file is still in the old one.
      if (migration.oldRootFolderId && migration.connectorId) {
        const connector = await prisma.connector.findUnique({ where: { id: migration.connectorId }, select: { settings: true } })
        const settings = (connector?.settings as Record<string, unknown> | null) ?? null
        if (settings && settings.rootFolderId === migration.newRootFolderId) {
          await prisma.connector.update({
            where: { id: migration.connectorId },
            data: { settings: { ...settings, rootFolderId: migration.oldRootFolderId, parentFolderId: migration.oldRootFolderId } },
          })
        }
      }
      await setMigrationPending(firmId, null)
      await setMigrationState(firmId, null)
      return NextResponse.json({ ok: true })
    } catch (e) {
      logger.error('cancel-migration failed', e instanceof Error ? e : new Error(String(e)), `firmId:${firmId}`)
      return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
