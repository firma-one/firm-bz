import 'server-only'

/**
 * Audit metadata for anything the Brio Executive Assistant agent does on a person's authority.
 *
 * ## Why this is a shared helper and not three inline object literals
 *
 * The agent is the ACTOR but never the AUTHORITY. It acts because a named person read a proposal
 * and approved it. An audit row recording only the actor says a machine changed a client's files
 * unprompted — untrue, and the one reading an audit trail exists to prevent.
 *
 * Today one route performs agent operations. The agent is intended to grow into firm-level work,
 * and the failure mode of that growth is a new path that remembers `viaAgent` and forgets the
 * approver. Making the approver part of the only way to build this metadata means a future caller
 * cannot express "an agent did this" without also saying on whose authority.
 *
 * ## Why the label is denormalized
 *
 * Audit rows are read long after they are written, when the approver may have been renamed, had
 * their role changed, or been removed from the firm entirely. The record should say who approved it
 * AT THE TIME, which means storing the label rather than resolving it on read.
 */
export interface AgentApprovalMeta {
    /** Always true — what marks the event as agent-performed. */
    viaAgent: true
    /** The approving user's id, for joining back to a member record. */
    approvedBy: string
    /** Their display name as it stood when they approved. */
    approvedByLabel: string
}

/**
 * The approving user, as taken from a VERIFIED session.
 *
 * Never built from a request body: a client naming its own approver is precisely what an audit
 * trail must refuse. Callers pass the user that authentication returned.
 */
export interface ApprovingUser {
    id: string
    email?: string | null
    user_metadata?: Record<string, unknown> | null
}

/** The approver's display name, falling back through metadata to email and finally the id. */
export function approverLabel(user: ApprovingUser): string {
    const metadata = user.user_metadata ?? undefined
    const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name : undefined
    const name = typeof metadata?.name === 'string' ? metadata.name : undefined
    return fullName || name || user.email || user.id
}

/**
 * Builds the metadata every agent-performed audit event carries.
 *
 * Spread into `.meta({ ... })` alongside the event's own fields.
 */
export function agentApprovalMeta(user: ApprovingUser): AgentApprovalMeta {
    return {
        viaAgent: true,
        approvedBy: user.id,
        approvedByLabel: approverLabel(user),
    }
}
