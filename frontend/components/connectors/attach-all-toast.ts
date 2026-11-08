/**
 * Attach all's one toast (FirmDriveSection), counting what really attached rather than what was asked.
 */

/** What attaching one client did: attached (perhaps with a problem), or not, and why. */
export type AttachOutcome = { attached: true; warning?: string } | { attached: false; reason: string }

/**
 * Attach all's one toast, counting what really attached.
 * "Attached 4 of 5. Not attached: Beta · {why}." Nothing attached is an error, never "Attached".
 */
export function attachAllToast(outcomes: { name: string; outcome: AttachOutcome }[]): { type: 'success' | 'warning' | 'error'; title: string; message: string } {
  const total = outcomes.length
  const attached = outcomes.filter(o => o.outcome.attached)
  const failed = outcomes.filter((o): o is { name: string; outcome: { attached: false; reason: string } } => !o.outcome.attached)
  const withProblem = attached.filter(o => o.outcome.attached && o.outcome.warning)
  const clients = (n: number) => `${n} client${n === 1 ? '' : 's'}`
  const notAttached = failed.map(o => `${o.name} · ${o.outcome.reason}`).join('; ')
  if (attached.length === 0) {
    return {
      type: 'error',
      title: total === 1 ? "Couldn't attach the client" : "Couldn't attach the clients",
      message: total === 1 ? notAttached : `None of the ${total} clients attached. ${notAttached}`,
    }
  }
  if (failed.length > 0) {
    return { type: 'warning', title: 'Attached with problems', message: `Attached ${attached.length} of ${total}. Not attached: ${notAttached}` }
  }
  if (withProblem.length > 0) {
    const first = withProblem[0].outcome as { attached: true; warning?: string }
    return {
      type: 'warning',
      title: 'Attached with a problem',
      message: `Attached ${clients(total)}. ${withProblem.map(o => o.name).join(', ')}: ${first.warning}`,
    }
  }
  return { type: 'success', title: 'Attached', message: `Attached ${clients(total)} to this connector.` }
}

