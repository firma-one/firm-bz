import { prisma } from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/email'
import { BRAND_NAME } from '@/config/brand'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrationStatus = 'pending_grace' | 'in_progress' | 'completed' | 'failed' | 'failed_partial'

export type FirmWorkspaceMigrationRecord = {
  id: string
  firmId: string
  connectorId: string
  status: MigrationStatus
  oldRootFolderId: string | null
  newRootFolderId: string
  initiatedBy: string
  initiatedAt: string
  graceEndsAt: string | null
  maintenanceStartedAt: string | null
  maintenanceEndedAt: string | null
  estimatedMinutes: number | null
  inngestRunId: string | null
}

export type FirmWorkspaceMigrationFileRecord = {
  id: string
  migrationId: string
  fileId: string
  fileName: string | null
  status: 'pending' | 'moved' | 'failed' | 'skipped'
  error: string | null
  movedAt: string | null
}

// Kept for backward compatibility with callers
export type FirmMaintenanceMode = {
  active: boolean
  startedAt: string
  expiresAt: string
  estimatedMinutes: number
  initiatedBy: string
  reason: 'workspace_migration'
}

export type FirmMigrationPending = {
  initiatedAt: string
  estimatedStartMinutes: number
  initiatedBy: string
}

// Kept for backward compatibility — replaced by FirmWorkspaceMigrationRecord
export type FirmMigrationState = {
  status: 'in_progress' | 'completed' | 'failed_partial'
  oldRootFolderId: string
  newRootFolderId: string
  startedAt: string
  completedBatches: number
  totalBatches: number
  failures: { id: string; error: string }[]
}

// ---------------------------------------------------------------------------
// Helper: map Prisma row → FirmWorkspaceMigrationRecord
// ---------------------------------------------------------------------------

function toMigrationRecord(row: {
  id: string
  firmId: string
  connectorId: string
  status: string
  oldRootFolderId: string | null
  newRootFolderId: string
  initiatedBy: string
  initiatedAt: Date
  graceEndsAt: Date | null
  maintenanceStartedAt: Date | null
  maintenanceEndedAt: Date | null
  estimatedMinutes: number | null
  inngestRunId: string | null
}): FirmWorkspaceMigrationRecord {
  return {
    id: row.id,
    firmId: row.firmId,
    connectorId: row.connectorId,
    status: row.status as MigrationStatus,
    oldRootFolderId: row.oldRootFolderId,
    newRootFolderId: row.newRootFolderId,
    initiatedBy: row.initiatedBy,
    initiatedAt: row.initiatedAt.toISOString(),
    graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
    maintenanceStartedAt: row.maintenanceStartedAt?.toISOString() ?? null,
    maintenanceEndedAt: row.maintenanceEndedAt?.toISOString() ?? null,
    estimatedMinutes: row.estimatedMinutes,
    inngestRunId: row.inngestRunId,
  }
}

// ---------------------------------------------------------------------------
// New DB-backed migration functions
// ---------------------------------------------------------------------------

export async function createMigration(params: {
  firmId: string
  connectorId: string
  oldRootFolderId?: string | null
  newRootFolderId: string
  initiatedBy: string
  estimatedMinutes?: number | null
}): Promise<FirmWorkspaceMigrationRecord> {
  const graceEndsAt = new Date(Date.now() + 2 * 60 * 1000)
  const row = await prisma.firmWorkspaceMigration.create({
    data: {
      firmId: params.firmId,
      connectorId: params.connectorId,
      status: 'pending_grace',
      oldRootFolderId: params.oldRootFolderId ?? null,
      newRootFolderId: params.newRootFolderId,
      initiatedBy: params.initiatedBy,
      initiatedAt: new Date(),
      graceEndsAt,
      estimatedMinutes: params.estimatedMinutes ?? null,
    },
  })
  return toMigrationRecord(row)
}

export async function getActiveMigration(firmId: string): Promise<FirmWorkspaceMigrationRecord | null> {
  const row = await prisma.firmWorkspaceMigration.findFirst({
    where: { firmId, status: { in: ['pending_grace', 'in_progress'] } },
    orderBy: { createdAt: 'desc' },
  })
  return row ? toMigrationRecord(row) : null
}

export async function getLatestMigration(firmId: string): Promise<FirmWorkspaceMigrationRecord | null> {
  const row = await prisma.firmWorkspaceMigration.findFirst({
    where: { firmId },
    orderBy: { createdAt: 'desc' },
  })
  return row ? toMigrationRecord(row) : null
}

export async function updateMigrationStatus(
  migrationId: string,
  status: MigrationStatus,
  extra?: {
    maintenanceStartedAt?: Date | null
    maintenanceEndedAt?: Date | null
    inngestRunId?: string | null
  }
): Promise<void> {
  await prisma.firmWorkspaceMigration.update({
    where: { id: migrationId },
    data: {
      status,
      ...(extra?.maintenanceStartedAt !== undefined && { maintenanceStartedAt: extra.maintenanceStartedAt }),
      ...(extra?.maintenanceEndedAt !== undefined && { maintenanceEndedAt: extra.maintenanceEndedAt }),
      ...(extra?.inngestRunId !== undefined && { inngestRunId: extra.inngestRunId }),
    },
  })
}

export async function addMigrationFiles(
  migrationId: string,
  files: { fileId: string; fileName?: string }[]
): Promise<void> {
  await prisma.firmWorkspaceMigrationFile.createMany({
    data: files.map((f) => ({
      migrationId,
      fileId: f.fileId,
      fileName: f.fileName ?? null,
      status: 'pending' as const,
    })),
    skipDuplicates: true,
  })
}

export async function updateMigrationFile(
  migrationId: string,
  fileId: string,
  status: 'pending' | 'moved' | 'failed' | 'skipped',
  error?: string | null
): Promise<void> {
  const now = new Date()
  await prisma.firmWorkspaceMigrationFile.updateMany({
    where: { migrationId, fileId },
    data: {
      status,
      error: error ?? null,
      attemptedAt: now,
      ...(status === 'moved' && { movedAt: now }),
    },
  })
}

export async function getFailedMigrationFiles(migrationId: string): Promise<FirmWorkspaceMigrationFileRecord[]> {
  const rows = await prisma.firmWorkspaceMigrationFile.findMany({
    where: { migrationId, status: 'failed' },
  })
  return rows.map((r) => ({
    id: r.id,
    migrationId: r.migrationId,
    fileId: r.fileId,
    fileName: r.fileName ?? null,
    status: r.status as FirmWorkspaceMigrationFileRecord['status'],
    error: r.error ?? null,
    movedAt: r.movedAt?.toISOString() ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Backward-compat: maintenance mode (JSONB fast-path + DB sync)
// ---------------------------------------------------------------------------

export async function setMaintenanceMode(firmId: string, payload: FirmMaintenanceMode | null): Promise<void> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } })
  if (!firm) return
  const prev = (firm.settings as Record<string, unknown>) || {}

  if (payload !== null) {
    // Setting maintenance active: write JSONB for middleware cookie fast-path
    // and sync to DB migration record
    await prisma.firm.update({
      where: { id: firmId },
      data: { settings: { ...prev, maintenanceMode: payload } },
    })
    const migration = await getActiveMigration(firmId)
    if (migration) {
      await updateMigrationStatus(migration.id, 'in_progress', {
        maintenanceStartedAt: new Date(payload.startedAt),
      })
    }
  } else {
    // Clearing maintenance: write JSONB and close out DB migration record
    await prisma.firm.update({
      where: { id: firmId },
      data: { settings: { ...prev, maintenanceMode: null } },
    })
    const migration = await getActiveMigration(firmId)
    if (migration) {
      const nextStatus: MigrationStatus = migration.status === 'failed_partial' ? 'failed_partial' : 'completed'
      await updateMigrationStatus(migration.id, nextStatus, {
        maintenanceEndedAt: new Date(),
      })
    }
  }
}

export async function getMaintenanceMode(firmId: string): Promise<FirmMaintenanceMode | null> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } })
  if (!firm) return null
  const settings = (firm.settings as Record<string, unknown>) || {}
  const mode = settings.maintenanceMode as FirmMaintenanceMode | null | undefined
  if (!mode || mode.active !== true) return null
  if (new Date() > new Date(mode.expiresAt)) return null
  return mode
}

export async function isInMaintenance(firmId: string): Promise<boolean> {
  const mode = await getMaintenanceMode(firmId)
  return mode !== null && mode.active === true
}

// ---------------------------------------------------------------------------
// Backward-compat: migration pending (JSONB only — banner signal)
// ---------------------------------------------------------------------------

export async function setMigrationPending(firmId: string, payload: FirmMigrationPending | null): Promise<void> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } })
  if (!firm) return
  const prev = (firm.settings as Record<string, unknown>) || {}
  await prisma.firm.update({
    where: { id: firmId },
    data: { settings: { ...prev, migrationPending: payload } },
  })
}

export async function getMigrationPending(firmId: string): Promise<FirmMigrationPending | null> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } })
  if (!firm) return null
  const settings = (firm.settings as Record<string, unknown>) || {}
  return (settings.migrationPending as FirmMigrationPending | null) ?? null
}

// ---------------------------------------------------------------------------
// Backward-compat: migration state (JSONB — kept for callers; prefer DB table)
// ---------------------------------------------------------------------------

export async function setMigrationState(firmId: string, state: FirmMigrationState | null): Promise<void> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } })
  if (!firm) return
  const prev = (firm.settings as Record<string, unknown>) || {}
  await prisma.firm.update({
    where: { id: firmId },
    data: { settings: { ...prev, migrationState: state } },
  })
}

export async function getMigrationState(firmId: string): Promise<FirmMigrationState | null> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } })
  if (!firm) return null
  const settings = (firm.settings as Record<string, unknown>) || {}
  return (settings.migrationState as FirmMigrationState | null) ?? null
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export async function getAllFirmMemberUserIds(firmId: string): Promise<string[]> {
  const [firmMembers, clientMembers, engagementMembers] = await Promise.all([
    prisma.firmMember.findMany({ where: { firmId }, select: { userId: true } }),
    prisma.clientMember.findMany({ where: { client: { firmId } }, select: { userId: true } }),
    prisma.engagementMember.findMany({ where: { engagement: { firmId } }, select: { userId: true } }),
  ])
  const allIds = [
    ...firmMembers.map((m) => m.userId),
    ...clientMembers.map((m) => m.userId),
    ...engagementMembers.map((m) => m.userId),
  ]
  return Array.from(new Set(allIds))
}

export async function sendMaintenanceWarningToFirmMembers(firmId: string, estimatedMinutes: number): Promise<void> {
  const userIds = await getAllFirmMemberUserIds(firmId)
  for (const uid of userIds) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(uid)
      const email = data.user?.email
      if (!email) {
        logger.warn(`[firm-maintenance] No email for user ${uid} — skipping warning`)
        continue
      }
      await sendEmail(
        email,
        `[${BRAND_NAME}] Your workspace will enter maintenance in ~2 minutes`,
        `<p>Hi,</p>
<p>Your ${BRAND_NAME} workspace is about to enter a brief maintenance window while files are migrated to a new folder.</p>
<ul>
  <li><strong>Starts in:</strong> ~2 minutes</li>
  <li><strong>Estimated duration:</strong> ~${estimatedMinutes} minute${estimatedMinutes === 1 ? '' : 's'}</li>
</ul>
<p>Please save any in-progress work. You will be signed out automatically when maintenance begins and can sign back in once it's complete.</p>
<p>— The ${BRAND_NAME} team</p>`
      )
      logger.info(`[firm-maintenance] Maintenance warning sent to ${email}`)
    } catch (err) {
      logger.error(`[firm-maintenance] Failed to send warning to user ${uid}`, err as Error)
    }
  }
}

export async function forceSignOutFirmMembers(firmId: string, exceptUserId: string): Promise<void> {
  const userIds = await getAllFirmMemberUserIds(firmId)
  const targets = userIds.filter((uid) => uid !== exceptUserId)
  for (const uid of targets) {
    try {
      await supabaseAdmin.auth.admin.signOut(uid)
      logger.info(`[firm-maintenance] Signed out user ${uid}`)
    } catch (err) {
      logger.error(`[firm-maintenance] Failed to sign out user ${uid}`, err as Error)
    }
  }
}
