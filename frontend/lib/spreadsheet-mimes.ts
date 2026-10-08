/**
 * Kept as a re-export so existing imports keep working; the list now lives with the rest
 * of the preview type classification in preview-kinds.ts.
 */
export {
    SPREADSHEET_MIMES,
    GOOGLE_SHEET_MIME,
    XLSX_MIME,
    isSpreadsheetMime,
    isAnySpreadsheetMime,
} from '@/lib/preview-kinds'
