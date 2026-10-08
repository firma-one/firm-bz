/**
 * Trim an .xlsx workbook down to its *populated* range so that an Office-to-PDF
 * conversion service will accept it.
 *
 * Why this exists
 * ---------------
 * Spreadsheets exported from Google Sheets write out the whole default grid —
 * typically 1000 rows x 26 columns per sheet — as `<row>`/`<c>` elements carrying
 * style attributes but no values, and declare `<dimension ref="A1:Z1000"/>` to match.
 * Excel's print engine treats every styled cell as "used", so with no print area and
 * no fit-to-page setting a 14-row calendar becomes thousands of landscape pages.
 * Microsoft Graph's `/content?format=pdf` then rejects the whole conversion with
 * `406 NotAcceptable … ErrorCode=XLSPageLimitExceeded`, and the user sees no preview.
 *
 * What this does
 * --------------
 * For each worksheet: find the last row and column that actually carry a value, drop
 * everything past them, rewrite `<dimension>`, prune `<cols>` entries that ran off the
 * end, and turn on fit-to-width. The result is a smaller, equivalent workbook whose
 * print range is the data the user can actually see.
 *
 * This is a *preview-only* transformation. The trimmed bytes are converted to PDF and
 * discarded — the user's stored file is never modified.
 *
 * Deliberately conservative: only cell values (`<v>`, `<is>`, `<f>`) mark a row or
 * column as populated, formatting alone does not. Anything this function cannot
 * confidently parse is left untouched, and `null` is returned when there was nothing
 * worth trimming so the caller can skip a pointless re-upload.
 */

import JSZip from 'jszip'
import { logger } from '@/lib/logger'

// Mime types live in a dependency-free module so client components can use them too.
export { SPREADSHEET_MIMES, isSpreadsheetMime } from '@/lib/spreadsheet-mimes'

/** `<row …/>` or `<row …> … </row>` */
const ROW_RE = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g
/** `<c …/>` or `<c …> … </c>` */
const CELL_RE = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g
/** `<col …/>` */
const COL_RE = /<col\b[^>]*\/>/g

/** A cell carries data if it has a value, an inline string, or a formula. */
function hasValue(cellXml: string): boolean {
    return /<v>/.test(cellXml) || /<is>/.test(cellXml) || /<f[\s>/]/.test(cellXml)
}

/** "A" -> 1, "Z" -> 26, "AA" -> 27 */
export function columnLetterToIndex(letters: string): number {
    let n = 0
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
    return n
}

/** 1 -> "A", 26 -> "Z", 27 -> "AA" */
export function columnIndexToLetter(index: number): string {
    let s = ''
    let n = index
    while (n > 0) {
        const rem = (n - 1) % 26
        s = String.fromCharCode(65 + rem) + s
        n = Math.floor((n - 1) / 26)
    }
    return s || 'A'
}

function attr(xml: string, name: string): string | undefined {
    const m = xml.match(new RegExp(`\\b${name}="([^"]*)"`))
    return m?.[1]
}

/**
 * Ensure `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` is present. `sheetPr` must be
 * the first child of `<worksheet>` per the OOXML sequence, so it is inserted there.
 */
function withFitToPage(xml: string): string {
    if (/fitToPage="1"/.test(xml)) return xml

    const existing = xml.match(/<sheetPr\b[^>]*\/>|<sheetPr\b[^>]*>[\s\S]*?<\/sheetPr>/)
    if (existing) {
        const block = existing[0]
        const patched = block.endsWith('/>')
            ? `${block.slice(0, -2)}><pageSetUpPr fitToPage="1"/></sheetPr>`
            : block.replace(/>/, '><pageSetUpPr fitToPage="1"/>')
        return xml.replace(block, patched)
    }

    return xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
}

/**
 * Ensure `<pageSetup>` scales to one page wide and unlimited pages tall. `pageSetup`
 * follows `pageMargins` in the OOXML sequence, so it is only inserted where that
 * ordering can be preserved.
 */
function withFitToWidth(xml: string): string {
    const existing = xml.match(/<pageSetup\b[^>]*\/>/)
    if (existing) {
        let block = existing[0]
        block = block.replace(/\s*\bfitToWidth="[^"]*"/, '').replace(/\s*\bfitToHeight="[^"]*"/, '')
        return xml.replace(existing[0], `${block.slice(0, -2)} fitToWidth="1" fitToHeight="0"/>`)
    }

    const margins = xml.match(/<pageMargins\b[^>]*\/>/)
    if (margins) {
        return xml.replace(margins[0], `${margins[0]}<pageSetup fitToWidth="1" fitToHeight="0"/>`)
    }

    // No pageMargins to anchor to — inserting pageSetup alone would break element order,
    // so leave it out. fitToPage on sheetPr still applies.
    return xml
}

/** Drop `<col>` definitions that start past the last populated column, and clamp those that straddle it. */
function trimCols(xml: string, lastCol: number): string {
    const colsBlock = xml.match(/<cols>[\s\S]*?<\/cols>/)
    if (!colsBlock) return xml

    const kept: string[] = []
    for (const col of colsBlock[0].match(COL_RE) ?? []) {
        const min = parseInt(attr(col, 'min') ?? '0', 10)
        const max = parseInt(attr(col, 'max') ?? '0', 10)
        if (!min || min > lastCol) continue
        kept.push(max > lastCol ? col.replace(/\bmax="\d+"/, `max="${lastCol}"`) : col)
    }

    return xml.replace(colsBlock[0], kept.length ? `<cols>${kept.join('')}</cols>` : '')
}

/**
 * Trim one worksheet to its populated range.
 * Returns the rewritten XML, or null when the sheet was already tight.
 */
export function trimWorksheetXml(xml: string): string | null {
    const sheetData = xml.match(/<sheetData\b[^>]*\/>|<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/)
    if (!sheetData) return null

    const rows = sheetData[0].match(ROW_RE) ?? []
    if (!rows.length) return null

    let lastRow = 0
    let lastCol = 0

    for (const row of rows) {
        const rowNum = parseInt(attr(row, 'r') ?? '0', 10)
        if (!rowNum) continue
        for (const cell of row.match(CELL_RE) ?? []) {
            if (!hasValue(cell)) continue
            const ref = attr(cell, 'r')
            const refCol = ref?.match(/^([A-Z]+)/)?.[1]
            if (refCol) lastCol = Math.max(lastCol, columnLetterToIndex(refCol))
            lastRow = Math.max(lastRow, rowNum)
        }
    }

    // A sheet with no values at all still prints one page; collapse it to A1.
    if (lastRow === 0) { lastRow = 1; lastCol = 1 }
    if (lastCol === 0) lastCol = 1

    const keptRows: string[] = []
    for (const row of rows) {
        const rowNum = parseInt(attr(row, 'r') ?? '0', 10)
        if (!rowNum || rowNum > lastRow) continue

        // Drop value-less cells past the last populated column — styled empty cells
        // still count toward Excel's used range, which is what inflates the page count.
        const trimmedRow = row.replace(CELL_RE, (cell) => {
            if (hasValue(cell)) return cell
            const refCol = attr(cell, 'r')?.match(/^([A-Z]+)/)?.[1]
            if (refCol && columnLetterToIndex(refCol) > lastCol) return ''
            return cell
        })
        keptRows.push(trimmedRow)
    }

    const droppedRows = rows.length - keptRows.length
    const dimension = xml.match(/<dimension\b[^>]*\/>/)
    const currentRef = dimension ? attr(dimension[0], 'ref') : undefined
    const newRef = `A1:${columnIndexToLetter(lastCol)}${lastRow}`
    const dimensionChanged = currentRef !== undefined && currentRef !== newRef

    // Nothing to gain — let the caller skip the round trip.
    if (droppedRows === 0 && !dimensionChanged) return null

    let out = xml.replace(
        sheetData[0],
        keptRows.length ? `<sheetData>${keptRows.join('')}</sheetData>` : '<sheetData/>'
    )
    if (dimension) out = out.replace(dimension[0], `<dimension ref="${newRef}"/>`)
    out = trimCols(out, lastCol)
    out = withFitToPage(out)
    out = withFitToWidth(out)

    return out
}

export interface TrimResult {
    /** Rewritten workbook bytes, ready to upload for conversion. */
    buffer: Buffer
    /** Per-sheet summary, for logging. */
    sheetsTrimmed: number
}

/**
 * Trim every worksheet in an .xlsx to its populated range.
 *
 * Returns null when no sheet needed trimming, when the file is not a readable .xlsx,
 * or when rewriting failed — in every one of those cases the caller should treat the
 * original conversion failure as final rather than retrying.
 */
export async function trimWorkbookToUsedRange(input: Buffer): Promise<TrimResult | null> {
    let zip: JSZip
    try {
        zip = await JSZip.loadAsync(input)
    } catch (e) {
        logger.warn(`[spreadsheet-print-trim] not a readable xlsx: ${e}`, 'SpreadsheetTrim')
        return null
    }

    const sheetPaths = Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(p))
    if (!sheetPaths.length) return null

    let sheetsTrimmed = 0
    for (const path of sheetPaths) {
        try {
            const xml = await zip.file(path)!.async('string')
            const trimmed = trimWorksheetXml(xml)
            if (!trimmed) continue
            zip.file(path, trimmed)
            sheetsTrimmed++
        } catch (e) {
            logger.warn(`[spreadsheet-print-trim] failed to trim ${path}: ${e}`, 'SpreadsheetTrim')
            return null
        }
    }

    if (!sheetsTrimmed) return null

    try {
        const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
        return { buffer, sheetsTrimmed }
    } catch (e) {
        logger.warn(`[spreadsheet-print-trim] failed to repack workbook: ${e}`, 'SpreadsheetTrim')
        return null
    }
}
