import { logger } from '@/lib/logger'
import { emitAuditEvent, type AuditEventParams } from './emit'
import type { AuditEvent, AuditScope } from './constants'

export class AuditEventBuilder {
  private params: Partial<AuditEventParams> & { eventType: AuditEvent }

  constructor(event: AuditEvent) {
    this.params = { eventType: event }
  }

  firm(id: string): this {
    this.params.firmId = id
    return this
  }

  client(id: string | null | undefined): this {
    this.params.clientId = id ?? undefined
    return this
  }

  engagement(id: string | null | undefined): this {
    this.params.engagementId = id ?? undefined
    return this
  }

  document(id: string | null | undefined): this {
    this.params.projectDocumentId = id ?? undefined
    return this
  }

  actor(userId: string | null | undefined): this {
    this.params.actorUserId = userId ?? undefined
    return this
  }

  scope(s: AuditScope): this {
    this.params.scope = s
    return this
  }

  meta(data: Record<string, unknown>): this {
    this.params.metadata = { ...this.params.metadata, ...data }
    return this
  }

  build(): AuditEventParams {
    if (!this.params.firmId) throw new Error(`audit: firmId required for ${this.params.eventType}`)
    if (!this.params.scope) throw new Error(`audit: scope required for ${this.params.eventType}`)
    return this.params as AuditEventParams
  }

  async emit(): Promise<void> {
    await emitAuditEvent(this.build())
  }

  fireAndForget(): void {
    emitAuditEvent(this.build()).catch((err) =>
      logger.warn(`audit emit failed [${this.params.eventType}]`, 'Audit', { err })
    )
  }
}

export function audit(event: AuditEvent): AuditEventBuilder {
  return new AuditEventBuilder(event)
}
