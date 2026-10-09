/**
 * What Brio is permitted to do, as a closed list.
 *
 * ## The rule
 *
 * The agent performs REVERSIBLE operations only. It never deletes, trashes, archives, revokes,
 * unshares or removes anything — not a file, not a folder, not a member, not a share. Asked to,
 * it says it cannot and points the user at where in the app they can do it themselves.
 *
 * ## Why this file exists rather than just "we didn't build delete"
 *
 * Today the agent has three tools and none of them destroys anything, which is correct by
 * omission — it holds because nobody has added a fourth. That is not a guarantee; it is a
 * coincidence that survives until someone implements `propose_cleanup` and reasons, locally and
 * reasonably, that deleting an empty folder is harmless.
 *
 * So the permitted set is written down and asserted. A new operation has to be added HERE, in a
 * file whose whole subject is the boundary, rather than slipped in beside the others. The test
 * suite fails if a tool appears that this list does not name.
 *
 * ## Why reversibility is the line
 *
 * Every mistake the agent can make should cost the user time, never data. A wrong rename is
 * annoying and fixable in ten seconds. A wrong delete may be unrecoverable, and the user approved
 * it in a list of twelve at a glance — the approval is real but the attention behind it is thin,
 * which is exactly the condition under which destructive operations should not be on offer.
 *
 * Pure and dependency-free: imported by the tool definitions, the apply route and their tests.
 */

/** Every operation the agent may perform. Adding one is a deliberate change to this list. */
export const PERMITTED_AGENT_OPERATIONS = ['rename', 'move', 'create-folder'] as const

export type PermittedAgentOperation = typeof PERMITTED_AGENT_OPERATIONS[number]

/**
 * Operations the agent must never perform, for the error message and the tests.
 *
 * Not exhaustive and not meant to be — the permitted list is the boundary. This names the ones a
 * user is most likely to ask for, so the refusal can be specific about what is being refused.
 */
export const FORBIDDEN_AGENT_OPERATIONS = [
    'delete', 'trash', 'remove', 'archive', 'purge',
    'unshare', 'revoke', 'remove-member', 'overwrite', 'replace',
] as const

/** True when the operation is on the permitted list. */
export function isPermittedAgentOperation(operation: string): operation is PermittedAgentOperation {
    return (PERMITTED_AGENT_OPERATIONS as readonly string[]).includes(operation)
}

/**
 * What to tell a user who asks for something the agent will not do.
 *
 * Names the limit and points at the way to do it — a refusal that leaves the user stuck is a worse
 * answer than one that hands the task back with directions.
 */
export const DESTRUCTIVE_REFUSAL =
    'Brio cannot delete, remove or permanently change anything — it only renames, moves and '
    + 'creates folders, so a mistake is always reversible. To delete a file or folder, use the '
    + 'row menu in the file list; to remove a member, use the Members tab.'
