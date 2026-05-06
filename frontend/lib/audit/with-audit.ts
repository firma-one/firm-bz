import type { AuditEventBuilder } from './builder'

interface WithAuditConfig<TArgs extends unknown[], TResult> {
  context: (args: TArgs, result: TResult) => AuditEventBuilder
  onError?: (args: TArgs, error: unknown) => AuditEventBuilder | null
}

/**
 * HOF interceptor for server actions. Wraps a function and fires an audit
 * event after successful execution. The audit is fire-and-forget and never
 * blocks or throws to the caller.
 *
 * Usage:
 *   export const createClient = withAudit(createClientImpl, {
 *     context: (args, result) =>
 *       audit(AUDIT_EVENT.CLIENT_CREATED).firm(result.firmId).client(result.id).actor(args[1])
 *   })
 */
export function withAudit<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: WithAuditConfig<TArgs, TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    let result: TResult
    try {
      result = await fn(...args)
    } catch (err) {
      if (config.onError) {
        config.onError(args, err)?.fireAndForget()
      }
      throw err
    }
    config.context(args, result).fireAndForget()
    return result
  }
}
