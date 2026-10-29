import { DemoEngagement, DemoFile, DemoFolder, countFilesInFolder } from './static-demo-data'
import type { ActivityStatus } from '@/lib/sharing-settings'
import type { BlockedFlag } from '@/lib/files/blocked'

export type DeliverableStatus = 'to_do' | 'in_progress' | 'in_review' | 'approved'

export const STATUS_CYCLE: DeliverableStatus[] = ['approved', 'in_review', 'in_progress', 'to_do']
export const DELIVERABLE_ACTORS = ['Alex Jordan', 'Sam Rivera', 'Jordan Lee', 'Taylor Kim']

export interface DemoDeliverable {
    folder: DemoFolder
    status: DeliverableStatus
    fileCount: number
    actor: string
    /** ISO date (YYYY-MM-DD). Staggered backward from the engagement's own due date so earlier milestones fall due first. */
    dueDate: string | null
}

/** "Drafts" and "Internal Only" are plain working folders, never deliverables — every other top-level
 * engagement folder is a named milestone (e.g. "01__Market_&_Competitive_Intelligence_Report") and is
 * treated as a Deliverable, shown on the Board and badged in Files. Status/actor cycle deterministically
 * so file list, board, and the detail pane all agree. */
const NON_DELIVERABLE_FOLDER_NAMES = new Set(['Drafts', 'Internal Only'])
const MILESTONE_SPACING_DAYS = 12

export function getDemoDeliverables(engagement: DemoEngagement): DemoDeliverable[] {
    const milestoneFolders = engagement.folders.filter((folder) => !NON_DELIVERABLE_FOLDER_NAMES.has(folder.name))
    const engagementDue = engagement.dueDate ? new Date(engagement.dueDate) : null

    return milestoneFolders.map((folder, i) => {
        const stepsFromEnd = milestoneFolders.length - 1 - i
        let dueDate: string | null = null
        if (engagementDue) {
            const d = new Date(engagementDue)
            d.setDate(d.getDate() - stepsFromEnd * MILESTONE_SPACING_DAYS)
            dueDate = d.toISOString().slice(0, 10)
        }
        return {
            folder,
            status: STATUS_CYCLE[i % STATUS_CYCLE.length],
            fileCount: countFilesInFolder(folder),
            actor: DELIVERABLE_ACTORS[i % DELIVERABLE_ACTORS.length],
            dueDate,
        }
    })
}

export function getDeliverableStatusMap(engagement: DemoEngagement): Record<string, DeliverableStatus> {
    const map: Record<string, DeliverableStatus> = {}
    for (const d of getDemoDeliverables(engagement)) map[d.folder.id] = d.status
    return map
}

/** Each deliverable folder's due date (ISO yyyy-MM-dd), for the Files table's Due column. */
export function getDeliverableDueMap(engagement: DemoEngagement): Record<string, string | null> {
    const map: Record<string, string | null> = {}
    for (const d of getDemoDeliverables(engagement)) map[d.folder.id] = d.dueDate
    return map
}

/** A document's stage on the tour, and the firm's Blocked flag where it has one. */
export interface DemoDocumentStage {
    stage: ActivityStatus
    blocked?: BlockedFlag
}

/** Every document in a folder, nested folders' too, in the order the deliverable pane lists them. */
export function demoFilesIn(folder: DemoFolder): DemoFile[] {
    return [...folder.files, ...folder.subfolders.flatMap((sub) => demoFilesIn(sub))]
}

/**
 * The stages of a deliverable's documents, laid out so the deliverable's own stage is the one the
 * app would work out from them (lib/deliverable-derivation.ts): all Approved, all In review, all To
 * do, or, for In progress, one In progress beside an Approved one and the rest To do. A deliverable
 * of three or more documents that isn't approved keeps its last one Not started (off the Board),
 * and an In progress one has a document waiting on the client, so the tour shows both.
 */
export function demoDocumentStages(status: DeliverableStatus, files: DemoFile[]): Record<string, DemoDocumentStage> {
    const offBoard = status !== 'approved' && files.length >= 3 ? 1 : 0
    return Object.fromEntries(files.map((file, i): [string, DemoDocumentStage] => {
        if (i >= files.length - offBoard) return [file.id, { stage: 'not_started' }]
        if (status !== 'in_progress') return [file.id, { stage: status }]
        if (i === 0) return [file.id, { stage: 'in_progress' }]
        if (i === 1) return [file.id, { stage: 'approved' }]
        return [file.id, {
            stage: 'to_do',
            ...(i === 2 ? { blocked: { reason: 'client', note: 'Waiting on their Q3 sales export', at: '', by: '' } } : {}),
        }]
    }))
}

/** Every deliverable document's stage in the engagement, by file id (the Files list and the Board agree). */
export function getDemoDocumentStages(engagement: DemoEngagement): Record<string, DemoDocumentStage> {
    return Object.assign({}, ...getDemoDeliverables(engagement).map((d) => demoDocumentStages(d.status, demoFilesIn(d.folder))))
}
