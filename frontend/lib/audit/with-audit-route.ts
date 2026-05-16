import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { emitAuditEvent, type AuditEventParams } from './emit'
import type { AuditEvent } from './constants'

type RouteContext = { params: Record<string, string> }

interface WithAuditRouteConfig {
  event: AuditEvent | ((req: NextRequest, ctx: RouteContext) => AuditEvent)
  context: (
    req: NextRequest,
    ctx: RouteContext,
    response: NextResponse
  ) => Omit<AuditEventParams, 'eventType'> | null
}

/**
 * HOF for API route handlers. Wraps a handler and fires an audit event after
 * a successful (2xx) response. For routes with branching logic (e.g. create
 * vs update in a single PUT), prefer the fluent builder inside the handler.
 *
 * Usage:
 *   export const DELETE = withAuditRoute(
 *     async (req, ctx) => { ... return NextResponse.json({}) },
 *     {
 *       event: AUDIT_EVENT.DOCUMENT_SHARE_DELETED,
 *       context: (req, ctx) => ({ firmId, scope: AUDIT_SCOPE.DOCUMENT, engagementId, ... })
 *     }
 *   )
 */
export function withAuditRoute(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
  config: WithAuditRouteConfig
): (req: NextRequest, ctx: RouteContext) => Promise<NextResponse> {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    const response = await handler(req, ctx)

    if (response.ok) {
      try {
        const eventType =
          typeof config.event === 'function' ? config.event(req, ctx) : config.event
        const auditCtx = config.context(req, ctx, response)
        if (auditCtx) {
          emitAuditEvent({ ...auditCtx, eventType }).catch((err) =>
            logger.warn(`audit emit failed [${eventType}]`, 'Audit', { err })
          )
        }
      } catch (err) {
        logger.warn('audit context extraction failed', 'Audit', { err })
      }
    }

    return response
  }
}
