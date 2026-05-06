/**
 * @deprecated Import from '@/lib/audit' instead.
 * This shim preserves backward compatibility during migration.
 */
import { prisma } from '@/lib/prisma'
import type { PlatformAuditEventType } from '@prisma/client'

export type CreatePlatformAuditEventParams = {
  organizationId: string
  clientId: string | null
  projectId: string
  projectDocumentId?: string | null
  eventType: PlatformAuditEventType
  actorUserId?: string | null
  metadata?: Record<string, unknown>
  eventAt?: Date
}

/** @deprecated Use audit() builder from '@/lib/audit' */
export async function createPlatformAuditEvent(params: CreatePlatformAuditEventParams): Promise<void> {
  const {
    organizationId,
    clientId,
    projectId,
    projectDocumentId,
    eventType,
    actorUserId,
    metadata = {},
    eventAt = new Date(),
  } = params

  await prisma.platformAuditEvent.create({
    data: {
      firmId: organizationId,
      clientId: clientId ?? undefined,
      engagementId: projectId,
      projectDocumentId: projectDocumentId ?? undefined,
      scope: 'PROJECT',
      eventType,
      eventAt,
      actorUserId: actorUserId ?? undefined,
      metadata: metadata as object,
    },
  })
}
