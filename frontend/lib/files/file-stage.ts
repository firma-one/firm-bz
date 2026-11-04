import type { ActivityStatus } from '@/lib/sharing-settings'

/**
 * What the Files Status column shows for a row, shared with its Status filter so the two can't
 * disagree. Status tracks a deliverable and every document: with no stage yet, a document is Not
 * started and a deliverable at To do. A plain folder only organizes, so it has none. Outside a
 * deliverable a file's stage is the firm's own tracking, so a client sees none (the list API sends none).
 */
export function fileStage(
    file: { isDeliverable?: boolean; activityStatus?: ActivityStatus | null; deliverableStatus?: ActivityStatus | null },
    { isFolder, isInsideDeliverable, isExternalViewer }: { isFolder: boolean; isInsideDeliverable: boolean; isExternalViewer: boolean },
): { tracked: boolean; stage: ActivityStatus | null } {
    const tracked = !!file.isDeliverable || (!isFolder && (isInsideDeliverable || !isExternalViewer))
    if (!tracked) return { tracked, stage: null }
    const own = file.activityStatus ?? (file.isDeliverable ? file.deliverableStatus : null) ?? null
    return { tracked, stage: own ?? (isFolder ? 'to_do' : 'not_started') }
}
