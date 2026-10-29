/**
 * The one status → color map for the New UI (.claude/plans/ui-ux-overhaul.md). Replaces the seven
 * hand-rolled maps (engagement-shares-tab, deliverable-detail-panel, calendar-event-detail-modal, …)
 * as screens move to v2, so "approved" is the same green everywhere.
 *
 * Colors are Notion's tag palette (app/ui-tokens.css). Class strings are written out in full so
 * Tailwind's scanner (which reads lib/) generates them.
 */

import type { ActivityStatus } from '@/lib/sharing-settings'

export type TagColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export const TAG_CLASSES: Record<TagColor, string> = {
    gray: 'bg-tag-gray-bg text-tag-gray-fg',
    brown: 'bg-tag-brown-bg text-tag-brown-fg',
    orange: 'bg-tag-orange-bg text-tag-orange-fg',
    yellow: 'bg-tag-yellow-bg text-tag-yellow-fg',
    green: 'bg-tag-green-bg text-tag-green-fg',
    blue: 'bg-tag-blue-bg text-tag-blue-fg',
    purple: 'bg-tag-purple-bg text-tag-purple-fg',
    pink: 'bg-tag-pink-bg text-tag-pink-fg',
    red: 'bg-tag-red-bg text-tag-red-fg',
}

/** Solid dot color for each tag (the tag's text color), for list rows and the board. */
export const TAG_DOT_CLASSES: Record<TagColor, string> = {
    gray: 'bg-tag-gray-fg',
    brown: 'bg-tag-brown-fg',
    orange: 'bg-tag-orange-fg',
    yellow: 'bg-tag-yellow-fg',
    green: 'bg-tag-green-fg',
    blue: 'bg-tag-blue-fg',
    purple: 'bg-tag-purple-fg',
    pink: 'bg-tag-pink-fg',
    red: 'bg-tag-red-fg',
}

type StatusStyle = { color: TagColor; label: string }

export const DELIVERABLE_STATUS: Record<ActivityStatus, StatusStyle> = {
    not_started: { color: 'gray', label: 'Not started' },
    to_do: { color: 'gray', label: 'To do' },
    in_progress: { color: 'blue', label: 'In progress' },
    in_review: { color: 'yellow', label: 'In review' },
    approved: { color: 'green', label: 'Approved' },
}

export type EngagementStatusValue = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'

export const ENGAGEMENT_STATUS: Record<EngagementStatusValue, StatusStyle> = {
    PLANNED: { color: 'gray', label: 'Planned' },
    ACTIVE: { color: 'blue', label: 'Active' },
    PAUSED: { color: 'yellow', label: 'Paused' },
    COMPLETED: { color: 'green', label: 'Completed' },
}

export type ClientStatusValue = 'PROSPECT' | 'ACTIVE' | 'ON_HOLD' | 'PAST'

export const CLIENT_STATUS: Record<ClientStatusValue, StatusStyle> = {
    PROSPECT: { color: 'purple', label: 'Prospect' },
    ACTIVE: { color: 'green', label: 'Active' },
    ON_HOLD: { color: 'yellow', label: 'On hold' },
    PAST: { color: 'gray', label: 'Past' },
}

/** Overdue wins over any status color. */
export const OVERDUE_STYLE: StatusStyle = { color: 'red', label: 'Overdue' }

export type StatusKind = 'deliverable' | 'engagement' | 'client'

export function statusStyle(kind: StatusKind, status: string): StatusStyle {
    const map: Record<string, StatusStyle> =
        kind === 'deliverable' ? DELIVERABLE_STATUS : kind === 'engagement' ? ENGAGEMENT_STATUS : CLIENT_STATUS
    return map[status] ?? { color: 'gray', label: status }
}
