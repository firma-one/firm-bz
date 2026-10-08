/**
 * Spreadsheet mime types, in a module with no dependencies.
 *
 * These are needed on both sides: the connectors decide whether to hand back the workbook
 * instead of a PDF, and the preview pane decides whether to ask for it. Keeping them here
 * rather than in `spreadsheet-print-trim.ts` means a client component can import them
 * without dragging JSZip into the browser bundle.
 */
export const SPREADSHEET_MIMES: readonly string[] = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
]

/** Google Sheets live only in Drive and have no file bytes; they are exported to xlsx first. */
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'

export function isSpreadsheetMime(mimeType: string | undefined | null): boolean {
    return !!mimeType && SPREADSHEET_MIMES.includes(mimeType)
}

export function isAnySpreadsheetMime(mimeType: string | undefined | null): boolean {
    return isSpreadsheetMime(mimeType) || mimeType === GOOGLE_SHEET_MIME
}
