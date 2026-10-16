import type { ActivityStatus } from '@/lib/sharing-settings'
import type { SharedOnlyPersonaSlug } from '@/lib/engagement-sharing-ids'
import { canViewDeliverable } from '@/lib/deliverable-stage-roles'

/**
 * Whether an external engagement member (EC/EV) may see a document's due date on the calendar.
 *
 * Both gates must pass — the same two that decide what they can open:
 *  - the document sits in the persona's shared subtree (shared directly, or under a shared folder);
 *  - the deliverable it belongs to has reached a stage the role may see (STAGE_ROLE_MAP).
 * A document outside any deliverable has no stage, so only the subtree gate applies.
 *
 * Lives outside lib/actions/calendar.ts because that file is 'use server' and may only export
 * async functions.
 */
export function externalCanSeeDocumentDueDate(
  role: SharedOnlyPersonaSlug,
  doc: { inSharedSubtree: boolean; deliverableStage: ActivityStatus | null },
): boolean {
  if (!doc.inSharedSubtree) return false
  return doc.deliverableStage === null || canViewDeliverable(role, doc.deliverableStage)
}
