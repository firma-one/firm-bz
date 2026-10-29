/**
 * A document's approvals (.claude/plans/document-approval-record.md): the decision record of what
 * was signed off. Kept in `settings.approvals`, append-only, newest last. Approving locks the
 * document and puts an exact copy of the approved version in the engagement's Archive folder;
 * unlocking for the next phase marks the record reopened and keeps it.
 */

export interface ApprovedVersion {
    /** The provider's id: Google's revision id, Graph's version id. */
    id: string
    /** The provider's own name for it, where it has one: OneDrive's "3.0". Google names none. */
    label?: string
    /** When that version was saved (the provider's modified time). */
    savedAt: string
    savedBy?: string
    size?: string
}

export interface ApprovalRecord {
    id: string
    version: ApprovedVersion
    /** The copy in the engagement's Archive folder. Hidden in Firma; reached by a download option later. */
    archived: { fileId: string; name: string }
    approvedAt: string
    /** User id. */
    approvedBy: string
    /** Set when this approval is reopened for further edits. */
    unlockedAt?: string
    unlockedBy?: string
}

/** The document's approvals, oldest first. Unreadable entries are skipped. */
export function approvalsOf(settings: unknown): ApprovalRecord[] {
    if (!settings || typeof settings !== 'object') return []
    const raw = (settings as Record<string, unknown>).approvals
    if (!Array.isArray(raw)) return []
    return raw.filter((r): r is ApprovalRecord =>
        !!r && typeof r === 'object'
        && typeof (r as ApprovalRecord).id === 'string'
        && typeof (r as ApprovalRecord).version?.id === 'string'
        && typeof (r as ApprovalRecord).approvedAt === 'string')
}

/** The approval that stands: the latest one, unless it has been reopened. */
export function currentApproval(settings: unknown): ApprovalRecord | null {
    const last = approvalsOf(settings).at(-1)
    return last && !last.unlockedAt ? last : null
}

/**
 * What a version is called, as its storage shows it: "Version 3.0" on OneDrive; on Google Drive,
 * which names none, the time it was saved. Never a number of ours (2026-10-29).
 */
export function versionName(version: { label?: string | null; at: string }): string {
    if (version.label) return `Version ${version.label}`
    const at = new Date(version.at)
    return Number.isNaN(at.getTime())
        ? 'Version'
        : at.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** An approval's version, named as its storage names it. */
export function approvalVersionName(record: Pick<ApprovalRecord, 'version'>): string {
    return versionName({ label: record.version.label, at: record.version.savedAt })
}

/**
 * The Archive copy's file name: the document's name with what was approved, before the extension,
 * e.g. "Plan · approved Version 3.0.xlsx" or "Plan · approved 2026-10-28 15.30.xlsx". A file name
 * can't hold ":" on OneDrive, so a Google version's time is written with a dot.
 */
export function archiveNameFor(fileName: string, version: Pick<ApprovedVersion, 'label' | 'savedAt'>): string {
    const dot = fileName.lastIndexOf('.')
    const hasExtension = dot > 0 && dot >= fileName.length - 6
    const base = hasExtension ? fileName.slice(0, dot) : fileName
    const extension = hasExtension ? fileName.slice(dot) : ''
    const at = new Date(version.savedAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    const when = Number.isNaN(at.getTime())
        ? ''
        : `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ${pad(at.getUTCHours())}.${pad(at.getUTCMinutes())}`
    const what = version.label ? `Version ${version.label}` : when
    return `${base} · approved ${what}${extension}`.trim()
}
