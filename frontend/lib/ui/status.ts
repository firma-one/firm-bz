/**
 * The status language (.claude/plans/app-design-refinements.md, section 2). Every lifecycle in the
 * app maps onto seven stages; the stage decides the icon and colors, the lifecycle keeps its own
 * label. Rendered by StatusIcon (components/ui/status-icon.tsx) and StatusPill
 * (components/ui/status-pill.tsx). Colors are the --ui-status-* tokens in app/ui-tokens.css.
 *
 * Each record is typed against its enum, so a new enum value can't ship without a stage.
 * "Overdue" is not a stage: it's a red date on whatever stage the item is in.
 *
 * Supersedes lib/ui/status-colors.ts, whose callers move over in waves 2 and 3.
 * Class strings are written out in full so Tailwind's scanner (which reads lib/) generates them.
 */

import type { ClientStatus, ConnectorStatus, EngagementStatus, InvitationStatus, TicketStatus } from '@prisma/client'
import type { ActivityStatus } from '@/lib/sharing-settings'

export type StatusStage = 'not-started' | 'underway' | 'waiting' | 'done' | 'paused' | 'closed' | 'problem'

export const STAGES: readonly StatusStage[] = ['not-started', 'underway', 'waiting', 'done', 'paused', 'closed', 'problem']

/** The stage's own name, for group headers and visually hidden text. */
export const STAGE_LABEL: Record<StatusStage, string> = {
    'not-started': 'Not started',
    underway: 'Underway',
    waiting: 'Waiting on someone',
    done: 'Done',
    paused: 'Paused',
    closed: 'Closed',
    problem: 'Needs fixing',
}

/** Pill background and text (text clears 4.5:1 on its pill). */
export const STAGE_PILL_CLASSES: Record<StatusStage, string> = {
    'not-started': 'bg-status-not-started-bg text-status-not-started-fg',
    underway: 'bg-status-underway-bg text-status-underway-fg',
    waiting: 'bg-status-waiting-bg text-status-waiting-fg',
    done: 'bg-status-done-bg text-status-done-fg',
    paused: 'bg-status-paused-bg text-status-paused-fg',
    closed: 'bg-status-closed-bg text-status-closed-fg',
    problem: 'bg-status-problem-bg text-status-problem-fg',
}

/** Icon color. Below 3:1 on white, so an icon never carries the status alone. */
export const STAGE_ICON_CLASSES: Record<StatusStage, string> = {
    'not-started': 'text-status-not-started-icon',
    underway: 'text-status-underway-icon',
    waiting: 'text-status-waiting-icon',
    done: 'text-status-done-icon',
    paused: 'text-status-paused-icon',
    closed: 'text-status-closed-icon',
    problem: 'text-status-problem-icon',
}

/** Stages that appear as Board lanes, the only ones with lane and progress-bar tokens. */
export type LaneStage = 'not-started' | 'underway' | 'waiting' | 'done'

/**
 * A lane of grouped work (section 5 of the plan). `rest`: half the stage tint and a hairline in its
 * hue, sized to its cards. `target`: the lane under a dragged card, full tint and a dashed outline.
 * `slot`: the dashed landing slot where the card will go.
 */
export const STAGE_LANE_CLASSES: Record<LaneStage, { rest: string; target: string; slot: string }> = {
    'not-started': {
        rest: 'bg-status-not-started-lane shadow-[inset_0_0_0_1px_var(--ui-status-not-started-lane-line)]',
        target: 'bg-status-not-started-lane-target outline-status-not-started-lane-target-line',
        slot: 'border-status-not-started-lane-target-line text-status-not-started-fg',
    },
    underway: {
        rest: 'bg-status-underway-lane shadow-[inset_0_0_0_1px_var(--ui-status-underway-lane-line)]',
        target: 'bg-status-underway-lane-target outline-status-underway-lane-target-line',
        slot: 'border-status-underway-lane-target-line text-status-underway-fg',
    },
    waiting: {
        rest: 'bg-status-waiting-lane shadow-[inset_0_0_0_1px_var(--ui-status-waiting-lane-line)]',
        target: 'bg-status-waiting-lane-target outline-status-waiting-lane-target-line',
        slot: 'border-status-waiting-lane-target-line text-status-waiting-fg',
    },
    done: {
        rest: 'bg-status-done-lane shadow-[inset_0_0_0_1px_var(--ui-status-done-lane-line)]',
        target: 'bg-status-done-lane-target outline-status-done-lane-target-line',
        slot: 'border-status-done-lane-target-line text-status-done-fg',
    },
}

/** Progress-bar fill in the stage's soft hue. */
export const STAGE_BAR_CLASSES: Record<LaneStage, string> = {
    'not-started': 'bg-status-not-started-bar',
    underway: 'bg-status-underway-bar',
    waiting: 'bg-status-waiting-bar',
    done: 'bg-status-done-bar',
}

/** `muted`: drawn outlined and faint — a status that is not yet part of the work (Not started). */
export type StatusEntry = { stage: StatusStage; label: string; muted?: boolean }

/** Each lifecycle and the enum its values come from. */
export type StatusValues = {
    deliverable: ActivityStatus
    engagement: EngagementStatus
    client: ClientStatus
    invitation: InvitationStatus
    connector: ConnectorStatus
    ticket: TicketStatus
}

export type StatusKind = keyof StatusValues

export const STATUS: { [K in StatusKind]: Record<StatusValues[K], StatusEntry> } = {
    deliverable: {
        // Before the Board: the same not-started hue as To do, outlined, so the two don't read alike.
        not_started: { stage: 'not-started', label: 'Not started', muted: true },
        to_do: { stage: 'not-started', label: 'To do' },
        in_progress: { stage: 'underway', label: 'In progress' },
        in_review: { stage: 'waiting', label: 'In review' },
        approved: { stage: 'done', label: 'Approved' },
    },
    engagement: {
        PLANNED: { stage: 'not-started', label: 'Planned' },
        ACTIVE: { stage: 'underway', label: 'Active' },
        PAUSED: { stage: 'paused', label: 'Paused' },
        COMPLETED: { stage: 'done', label: 'Completed' },
    },
    client: {
        PROSPECT: { stage: 'not-started', label: 'Prospect' },
        ACTIVE: { stage: 'underway', label: 'Active' },
        ON_HOLD: { stage: 'paused', label: 'On hold' },
        PAST: { stage: 'closed', label: 'Past' },
    },
    invitation: {
        PENDING: { stage: 'waiting', label: 'Invited' },
        ACCEPTED: { stage: 'done', label: 'Accepted' },
        JOINED: { stage: 'done', label: 'Joined' },
        SUPERSEDED: { stage: 'closed', label: 'Replaced' },
        EXPIRED: { stage: 'problem', label: 'Expired' },
        // Set when the invitation email fails to send (lib/actions/invitations.ts).
        ERROR: { stage: 'problem', label: 'Email failed' },
    },
    connector: {
        ACTIVE: { stage: 'done', label: 'Connected' },
        EXPIRED: { stage: 'problem', label: 'Expired' },
        REVOKED: { stage: 'problem', label: 'Access revoked' },
        ERROR: { stage: 'problem', label: 'Connection error' },
    },
    ticket: {
        NEW: { stage: 'not-started', label: 'New' },
        IN_PROGRESS: { stage: 'underway', label: 'In progress' },
        RESOLVED: { stage: 'done', label: 'Resolved' },
        CLOSED: { stage: 'closed', label: 'Closed' },
    },
}

/**
 * The stage and label for a lifecycle value. Takes a plain string too, since most callers hold the
 * value as an API string; an unknown value shows as itself, not started.
 */
export function statusOf<K extends StatusKind>(kind: K, value: StatusValues[K] | string): StatusEntry {
    const entry = (STATUS[kind] as Record<string, StatusEntry>)[value]
    return entry ?? { stage: 'not-started', label: value }
}
