'use client'

import { useEffect, useMemo, useState } from 'react'
import { FilesHealthView, FilesRecentView, type FilesHealthInput } from '@/components/projects/files-views'
import { MIME_BY_TYPE } from '@/components/demo/demo-file-list'
import { countFilesInFolder, type DemoEngagement, type DemoFolder } from '@/lib/demo/static-demo-data'
import type { RecentDocumentItem } from '@/app/api/projects/[projectId]/insights/route'

/** The sample team's editors, in turn: the people the Members tab lists. */
const EDITORS = ['sam.rivera@beacongrowth.com', 'alex.jordan@beacongrowth.com', 'jordan.lee@beacongrowth.com']

/** "02__GTM_Strategy_&_Messaging_Playbook" → "02 GTM Strategy & Messaging Playbook", as the Files list shows it. */
const shownName = (name: string) => name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()

/** Every file in the sample, with the folder it sits in. */
function filesOf(folders: DemoFolder[], parent: string | null = null): { file: DemoFolder['files'][number]; folder: string | null }[] {
    return folders.flatMap((f) => [
        ...f.files.map((file) => ({ file, folder: parent ?? shownName(f.name) })),
        ...filesOf(f.subfolders, parent ?? shownName(f.name)),
    ])
}

/** The sample's recent changes, from each file's modified time. */
export function demoRecentDocuments(engagement: DemoEngagement): RecentDocumentItem[] {
    return filesOf(engagement.folders).map(({ file, folder }, i) => ({
        id: file.id,
        fileName: file.name,
        mimeType: MIME_BY_TYPE[file.type] ?? 'application/octet-stream',
        fileSize: file.size,
        updatedAt: file.modifiedTime,
        folderPath: folder,
        updatedByEmail: EDITORS[i % EDITORS.length],
    }))
}

/** The sample's file health: the app's rules, over a tidy sample whose only deduction is its Drafts. */
export function demoFilesHealth(engagement: DemoEngagement): FilesHealthInput {
    const files = filesOf(engagement.folders)
    const folderCount = engagement.folders.length
    const artifacts = files.length + folderCount
    const drafts = engagement.folders.find((f) => f.name === 'Drafts')
    const draftCount = drafts ? countFilesInFolder(drafts) : 0
    const penalties = draftCount > 0 ? [{ label: `${draftCount} files still in Drafts`, points: 4 }] : []
    return {
        score: 100 - penalties.reduce((s, p) => s + p.points, 0),
        penalties,
        checks: [
            { id: 'folder.poorly_named', label: 'Poorly named', info: 'Default or meaningless names like "Untitled", "New File" or "Copy of".', count: 0, of: artifacts },
            { id: 'folder.duplicates', label: 'Duplicates', info: 'Files with the same or nearly the same name (90% or more) and the same extension.', count: 0, of: artifacts },
            { id: 'folder.stale_files', label: 'Stale files', info: 'Not modified in the last 6 months.', count: 0, of: files.length },
            { id: 'folder.large_files', label: 'Large files', info: 'Larger than 50 MB.', count: 0, of: files.length },
            { id: 'folder.orphaned_files', label: 'Outside any folder', info: 'Files at the root with no parent folder.', count: 0, of: files.length },
            { id: 'folder.empty_folders', label: 'Empty folders', info: 'Folders with no files or subfolders.', count: 0, of: folderCount },
            { id: 'folder.deep_folders', label: 'More than 3 levels deep', info: 'Folders nested more than 3 levels down.', count: 0, of: folderCount },
        ],
        sensitive: [],
        totalFiles: files.length,
    }
}

/** The Files tab's Recent and Health views on /tour, over the sample engagement. */
export function DemoFilesViews({ engagement, view }: { engagement: DemoEngagement; view: 'recent' | 'health' }) {
    // The sample's modified times are relative to now, so the views wait for the visitor's clock.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const recent = useMemo(() => demoRecentDocuments(engagement), [engagement])
    const health = useMemo(() => demoFilesHealth(engagement), [engagement])
    if (!mounted) return <div className="h-64" aria-hidden />
    return view === 'recent'
        ? <FilesRecentView recent={recent} engagementBase="" />
        : <FilesHealthView input={health} engagementBase="" />
}
