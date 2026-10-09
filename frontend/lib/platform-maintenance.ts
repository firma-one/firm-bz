import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { BRAND_NAME } from '@/config/brand'
import { isSystemAdminEmail } from '@/lib/system/admin-check'

export type PlatformMaintenanceConfig = {
  active: boolean
  /** true while the 2-minute grace period is counting down before full activation */
  gracePeriod: boolean
  /** ISO timestamp when the grace period ends and maintenance becomes fully active */
  graceEndsAt: string | null
  scheduledFrom: string | null
  scheduledTo: string | null
  message: string | null
  enabledAt: string | null
  disabledAt: string | null
  enabledBy: string | null
}

const CONFIG_KEY = 'platform_maintenance'

export async function getPlatformMaintenanceConfig(): Promise<PlatformMaintenanceConfig | null> {
  const row = await prisma.platformConfig.findUnique({ where: { key: CONFIG_KEY } })
  if (!row) return null
  const raw = row.value as unknown as Partial<PlatformMaintenanceConfig>
  return {
    active: raw.active ?? false,
    gracePeriod: raw.gracePeriod ?? false,
    graceEndsAt: raw.graceEndsAt ?? null,
    scheduledFrom: raw.scheduledFrom ?? null,
    scheduledTo: raw.scheduledTo ?? null,
    message: raw.message ?? null,
    enabledAt: raw.enabledAt ?? null,
    disabledAt: raw.disabledAt ?? null,
    enabledBy: raw.enabledBy ?? null,
  }
}

export async function setPlatformMaintenanceConfig(config: PlatformMaintenanceConfig): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: config as never },
    update: { value: config as never },
  })
}

export async function isPlatformMaintenanceActive(): Promise<boolean> {
  const config = await getPlatformMaintenanceConfig()
  return config?.active ?? false
}

export async function isPlatformMaintenanceGracePeriod(): Promise<boolean> {
  const config = await getPlatformMaintenanceConfig()
  return (config?.gracePeriod ?? false) && !config?.active
}

export async function getAllNonAdminUserEmails(): Promise<{ id: string; email: string }[]> {
  const admin = createAdminClient()
  const users: { id: string; email: string }[] = []
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break
    for (const u of data.users) {
      if (u.email && !isSystemAdminEmail(u.email)) {
        users.push({ id: u.id, email: u.email })
      }
    }
    if (data.users.length < perPage) break
    page++
  }
  return users
}

export async function signOutAllNonAdminUsers(): Promise<void> {
  const admin = createAdminClient()
  const users = await getAllNonAdminUserEmails()
  await Promise.allSettled(users.map(u => admin.auth.admin.signOut(u.id)))
  logger.info(`Signed out ${users.length} non-admin users for platform maintenance`, 'PlatformMaintenance')
}

export async function sendPlatformMaintenanceNotification(
  type: 'on' | 'off',
  config: PlatformMaintenanceConfig
): Promise<void> {
  // One notification per unique user (PLATFORM scope — no firmId required)
  const members = await prisma.firmMember.findMany({
    select: { userId: true },
    distinct: ['userId'],
  })
  if (members.length === 0) return

  const title = type === 'on'
    ? `${BRAND_NAME} entering maintenance mode`
    : `${BRAND_NAME} maintenance complete`
  const body = type === 'on'
    ? (config.message ?? 'The platform will be temporarily unavailable. You will be redirected shortly.')
    : 'Maintenance is complete — you can now access the platform normally.'

  await prisma.notification.createMany({
    data: members.map(m => ({
      userId: m.userId,
      firmId: null as never, // PLATFORM scope — no firm context; remove after prisma generate
      scope: 'PLATFORM',
      type: type === 'on' ? 'PLATFORM_MAINTENANCE_ON' : 'PLATFORM_MAINTENANCE_OFF',
      priority: type === 'on' ? 'CRITICAL' : 'INFO',
      title,
      body,
      metadata: { platform: true, scheduledFrom: config.scheduledFrom, scheduledTo: config.scheduledTo } as never,
      channels: { inApp: true } as never,
      deliveredAt: new Date(),
    })),
    skipDuplicates: false,
  })

  logger.info(`Created platform maintenance ${type} notification for ${members.length} users`, 'PlatformMaintenance')
}

export async function sendPlatformMaintenanceEmail(
  type: 'on' | 'off',
  config: PlatformMaintenanceConfig,
  users: { email: string }[]
): Promise<void> {
  const subject = type === 'on'
    ? `${BRAND_NAME} — Scheduled Maintenance`
    : `${BRAND_NAME} — Maintenance Complete`

  const from = config.scheduledFrom ? new Date(config.scheduledFrom).toUTCString() : null
  const to = config.scheduledTo ? new Date(config.scheduledTo).toUTCString() : null
  const scheduledLine = from
    ? `<p>Maintenance window: <strong>${from}</strong>${to ? ` — <strong>${to}</strong>` : ''}</p>`
    : ''

  const messageLine = config.message
    ? `<p>${config.message}</p>`
    : ''

  const html = type === 'on'
    ? `<p>We wanted to let you know that <strong>${BRAND_NAME}</strong> is entering scheduled maintenance mode.</p>
       ${scheduledLine}${messageLine}
       <p>During maintenance, the platform will be temporarily unavailable. We'll notify you once maintenance is complete.</p>
       <p>Thank you for your patience.</p>`
    : `<p>The scheduled maintenance for <strong>${BRAND_NAME}</strong> is now complete.</p>
       <p>You can now access the platform normally.</p>
       <p>Thank you for your patience.</p>`

  const results = await Promise.allSettled(users.map(u => sendEmail(u.email, subject, html)))
  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    logger.warn(`${failed}/${users.length} platform maintenance emails failed to send`, 'PlatformMaintenance')
  }
}
