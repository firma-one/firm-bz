import { DemoEngagement, DemoFolder, countFilesInFolder } from './static-demo-data'

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
