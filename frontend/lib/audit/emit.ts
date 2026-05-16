import { prisma } from '@/lib/prisma'
import type { AuditScope, AuditEvent } from './constants'

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
}
