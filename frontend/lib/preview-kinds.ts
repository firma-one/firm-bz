/**
 * What kind of preview a file gets, decided from its mime type and name.
 *
 * Dependency-free on purpose: the connectors use it to decide whether to hand back the
 * original bytes, and the preview panes use it to decide what to ask for and how to render
 * it. Both sides must agree, so there is one list.
 */

export type PreviewKind =
    | 'pdf'
    | 'image'
    | 'sheet'
    | 'csv'
    | 'text'
    | 'markdown'
    | 'html'
    | 'zip'
    | 'video'
    | 'audio'
    /** Convertible to PDF by the provider: Word, PowerPoint, OpenDocument, RTF, Google Docs. */
    | 'office'
    | 'unknown'

export const SPREADSHEET_MIMES: readonly string[] = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
]

export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function isSpreadsheetMime(mimeType: string | undefined | null): boolean {
    return !!mimeType && SPREADSHEET_MIMES.includes(mimeType)
}

export function isAnySpreadsheetMime(mimeType: string | undefined | null): boolean {
    return isSpreadsheetMime(mimeType) || mimeType === GOOGLE_SHEET_MIME
}

/**
 * The display name of a preview document.
 *
 * The connector listings call it `name`; the EngagementDocument row calls it `fileName`.
 * Both shapes reach the preview panes depending on the call site, and reading only one of
 * them silently yields undefined — which is how a .csv lost its extension and was handed
 * to the workbook parser.
 */
export function documentName(doc: any): string {
    return doc?.fileName ?? doc?.name ?? ''
}

/**
 * Extensions are consulted because providers are unreliable about mime types — a .md or
 * .json uploaded to OneDrive routinely arrives as application/octet-stream, and a file
 * whose type we cannot name ends up at "preview not available" despite being plain text.
 */
const EXTENSION_KINDS: Record<string, PreviewKind> = {
    pdf: 'pdf',
    csv: 'csv', tsv: 'csv',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    txt: 'text', log: 'text', json: 'text', xml: 'text', yml: 'text', yaml: 'text',
    ts: 'text', tsx: 'text', js: 'text', jsx: 'text', py: 'text', rb: 'text', go: 'text',
    rs: 'text', java: 'text', c: 'text', h: 'text', cpp: 'text', cs: 'text', sh: 'text',
    sql: 'text', css: 'text', ini: 'text', toml: 'text', env: 'text',
    html: 'html', htm: 'html',
    zip: 'zip',
    xlsx: 'sheet', xls: 'sheet',
}

function extensionOf(fileName: string | undefined | null): string {
    if (!fileName) return ''
    const dot = fileName.lastIndexOf('.')
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

export function previewKind(mimeType: string | undefined | null, fileName?: string | null): PreviewKind {
    const mime = (mimeType ?? '').toLowerCase()
    const extension = extensionOf(fileName)

    // Delimited text is checked by extension first, before any mime type is consulted.
    // OneDrive reports a .csv as application/vnd.ms-excel, which would otherwise classify
    // it as a workbook — and a workbook is offered a printed view, which for delimited
    // text is the unreadable single page this grid exists to replace.
    if (extension === 'csv' || extension === 'tsv') return 'csv'

    if (mime === 'application/pdf') return 'pdf'
    if (isAnySpreadsheetMime(mime)) return 'sheet'
    if (mime === 'text/csv' || mime === 'text/tab-separated-values') return 'csv'
    if (mime === 'text/markdown') return 'markdown'
    if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
    if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'zip'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return 'text'

    if (
        mime.startsWith('application/vnd.openxmlformats-officedocument.') ||
        mime.startsWith('application/vnd.oasis.opendocument.') ||
        mime.startsWith('application/vnd.google-apps.') ||
        mime === 'application/msword' ||
        mime === 'application/vnd.ms-powerpoint' ||
        mime === 'application/rtf' ||
        mime === 'text/rtf'
    ) {
        return 'office'
    }

    // Providers hand back octet-stream for plenty of things they simply did not sniff.
    const byExtension = EXTENSION_KINDS[extension]
    if (byExtension) return byExtension

    return 'unknown'
}

/**
 * Kinds the browser renders from the original bytes, so the connectors should not convert
 * them. Everything else keeps the existing PDF-conversion path untouched.
 *
 * Images are included deliberately: serving them raw lets the pane draw them in an <img>,
 * which — unlike an iframe pointed at our own origin — will not execute script embedded in
 * an SVG.
 */
const NATIVE_KINDS: ReadonlySet<PreviewKind> = new Set<PreviewKind>([
    'sheet', 'csv', 'text', 'markdown', 'html', 'zip', 'video', 'audio', 'image',
])

export function isClientRenderableKind(kind: PreviewKind): boolean {
    return NATIVE_KINDS.has(kind)
}

export function isClientRenderable(mimeType: string | undefined | null, fileName?: string | null): boolean {
    return isClientRenderableKind(previewKind(mimeType, fileName))
}

/** Streaming kinds need byte-range requests so the player can seek. */
export function needsRangeSupport(kind: PreviewKind): boolean {
    return kind === 'video' || kind === 'audio'
}
