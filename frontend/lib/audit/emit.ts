import { prisma } from '@/lib/prisma'
import type { AuditScope, AuditEvent } from './constants'
import { loadAnchorForCaps, effectiveAuditDays } from '@/lib/billing/effective-billing-caps'

export interface AuditEventParams {
  firmId: string
  scope: AuditScope
  eventType: AuditEvent
  clientId?: string | null
  engagementId?: string | null
  projectDocumentId?: string | null
  actorUserId?: string | null
  metadata?: Record<string, unknown>
  eventAt?: Date
}

export async function emitAuditEvent(params: AuditEventParams): Promise<void> {
  const {
    firmId,
    scope,
    eventType,
    clientId,
    engagementId,
    projectDocumentId,
    actorUserId,
    metadata = {},
    eventAt = new Date(),
  } = params

  await prisma.platformAuditEvent.create({
    data: {
      firmId,
      scope: scope as any,
      eventType: eventType as any,
      clientId: clientId ?? undefined,
      engagementId: engagementId ?? undefined,
      projectDocumentId: projectDocumentId ?? undefined,
      actorUserId: actorUserId ?? undefined,
      metadata: metadata as object,
      eventAt,
    },
  })

  // Fire-and-forget rolling purge — do not await, never block the caller
  void purgeStaleAuditEvents(firmId)
}

async function purgeStaleAuditEvents(firmId: string): Promise<void> {
  try {
    const anchor = await loadAnchorForCaps(firmId)
    if (!anchor) return
    const days = effectiveAuditDays(anchor)
    if (days === null) return  // unlimited — keep all history

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    await prisma.platformAuditEvent.deleteMany({
      where: { firmId, eventAt: { lt: cutoff } },
    })
  } catch {
    // Purge failures must never surface to callers
  }
}
