import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
    trimWorksheetXml,
    trimWorkbookToUsedRange,
    columnLetterToIndex,
    columnIndexToLetter,
} from './spreadsheet-print-trim'

/**
 * Build a worksheet shaped like a Google Sheets .xlsx export: the full default grid is
 * written out with style attributes, but only the first `populatedRows` rows carry values.
 */
function googleSheetsExport({
    totalRows = 1000,
    totalCols = 26,
    populatedRows = 14,
    populatedCols = 5,
}: { totalRows?: number; totalCols?: number; populatedRows?: number; populatedCols?: number } = {}) {
    const rows: string[] = []
    for (let r = 1; r <= totalRows; r++) {
        const cells: string[] = []
        for (let c = 1; c <= totalCols; c++) {
            const ref = `${columnIndexToLetter(c)}${r}`
            const populated = r <= populatedRows && c <= populatedCols
            cells.push(populated ? `<c r="${ref}" s="2"><v>${r * c}</v></c>` : `<c r="${ref}" s="2"/>`)
        }
        rows.push(`<row r="${r}" spans="1:${totalCols}">${cells.join('')}</row>`)
    }
    const cols = `<cols><col min="1" max="1" width="13.28" customWidth="1"/><col min="6" max="26" width="8.71" customWidth="1"/></cols>`
    return (
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<dimension ref="A1:${columnIndexToLetter(totalCols)}${totalRows}"/>` +
        `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        cols +
        `<sheetData>${rows.join('')}</sheetData>` +
        `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
        `<pageSetup orientation="landscape"/>` +
        `</worksheet>`
    )
}

describe('column letter helpers', () => {
    it.each([['A', 1], ['E', 5], ['Z', 26], ['AA', 27], ['AB', 28]] as const)(
        'round-trips %s <-> %i',
        (letter, index) => {
            expect(columnLetterToIndex(letter)).toBe(index)
            expect(columnIndexToLetter(index)).toBe(letter)
        }
    )
})

describe('trimWorksheetXml', () => {
    it('drops the empty styled grid a Google Sheets export leaves behind', () => {
        const out = trimWorksheetXml(googleSheetsExport())!
        expect(out).toBeTruthy()

        const rows = out.match(/<row\b/g) ?? []
        expect(rows).toHaveLength(14)
        expect(out).toContain('<dimension ref="A1:E14"/>')
    })

    it('removes value-less cells past the last populated column', () => {
        const out = trimWorksheetXml(googleSheetsExport())!
        // 14 rows x 5 populated columns, nothing beyond E.
        expect(out.match(/<c\b/g) ?? []).toHaveLength(14 * 5)
        expect(out).not.toMatch(/<c r="[F-Z]\d+"/)
    })

    it('turns on fit-to-page and fit-to-width so the print range stays bounded', () => {
        const out = trimWorksheetXml(googleSheetsExport())!
        expect(out).toContain('<pageSetUpPr fitToPage="1"/>')
        expect(out).toMatch(/<pageSetup[^>]*fitToWidth="1"/)
        expect(out).toMatch(/<pageSetup[^>]*fitToHeight="0"/)
        // sheetPr must be the first child of <worksheet> per the OOXML sequence.
        expect(out).toMatch(/<worksheet\b[^>]*><sheetPr>/)
        // pageSetup must still follow pageMargins.
        expect(out.indexOf('<pageMargins')).toBeLessThan(out.indexOf('<pageSetup'))
    })

    it('prunes <cols> entries that ran past the data', () => {
        const out = trimWorksheetXml(googleSheetsExport())!
        expect(out).toContain('<col min="1" max="1"')
        expect(out).not.toContain('min="6"')
    })

    it('collapses a sheet with no values at all to a single cell', () => {
        const out = trimWorksheetXml(googleSheetsExport({ populatedRows: 0, populatedCols: 0 }))!
        expect(out).toContain('<dimension ref="A1:A1"/>')
        // Row 1 survives (an empty sheet still prints one page) but nothing past column A does.
        expect(out.match(/<row\b/g) ?? []).toHaveLength(1)
        expect(out.match(/<c\b/g) ?? []).toHaveLength(1)
    })

    it('returns null for a workbook that is already tight', () => {
        const tight = googleSheetsExport({ totalRows: 14, totalCols: 5, populatedRows: 14, populatedCols: 5 })
        expect(trimWorksheetXml(tight)).toBeNull()
    })

    it('leaves formulas and inline strings treated as real data', () => {
        const xml =
            `<worksheet><dimension ref="A1:C10"/><sheetData>` +
            `<row r="1"><c r="A1" t="inlineStr"><is><t>hi</t></is></c></row>` +
            `<row r="2"><c r="C2"><f>SUM(A1:A1)</f><v>1</v></c></row>` +
            `<row r="9"><c r="A9" s="1"/></row>` +
            `</sheetData></worksheet>`
        const out = trimWorksheetXml(xml)!
        expect(out).toContain('<dimension ref="A1:C2"/>')
        expect(out.match(/<row\b/g) ?? []).toHaveLength(2)
    })

    it('returns null when there is no sheetData to work with', () => {
        expect(trimWorksheetXml('<worksheet><dimension ref="A1:A1"/></worksheet>')).toBeNull()
    })
})

describe('trimWorkbookToUsedRange', () => {
    async function buildWorkbook(sheets: string[]): Promise<Buffer> {
        const zip = new JSZip()
        zip.file('[Content_Types].xml', '<Types/>')
        zip.file('xl/workbook.xml', '<workbook/>')
        sheets.forEach((xml, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xml))
        return zip.generateAsync({ type: 'nodebuffer' })
    }

    it('trims every worksheet and repacks a smaller workbook', async () => {
        const input = await buildWorkbook([googleSheetsExport(), googleSheetsExport({ populatedCols: 9 })])
        const result = await trimWorkbookToUsedRange(input)

        expect(result).not.toBeNull()
        expect(result!.sheetsTrimmed).toBe(2)
        expect(result!.buffer.byteLength).toBeLessThan(input.byteLength)

        const out = await JSZip.loadAsync(result!.buffer)
        expect(await out.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('<dimension ref="A1:E14"/>')
        expect(await out.file('xl/worksheets/sheet2.xml')!.async('string')).toContain('<dimension ref="A1:I14"/>')
    })

    it('leaves untouched parts of the package alone', async () => {
        const input = await buildWorkbook([googleSheetsExport()])
        const result = await trimWorkbookToUsedRange(input)
        const out = await JSZip.loadAsync(result!.buffer)
        expect(await out.file('xl/workbook.xml')!.async('string')).toBe('<workbook/>')
    })

    it('returns null when nothing needed trimming', async () => {
        const tight = googleSheetsExport({ totalRows: 14, totalCols: 5, populatedRows: 14, populatedCols: 5 })
        expect(await trimWorkbookToUsedRange(await buildWorkbook([tight]))).toBeNull()
    })

    it('returns null for bytes that are not a readable xlsx', async () => {
        expect(await trimWorkbookToUsedRange(Buffer.from('not a zip'))).toBeNull()
    })

    it('returns null when the package has no worksheets', async () => {
        const zip = new JSZip()
        zip.file('xl/workbook.xml', '<workbook/>')
        expect(await trimWorkbookToUsedRange(await zip.generateAsync({ type: 'nodebuffer' }))).toBeNull()
    })
})

/**
 * Opt-in check against a real workbook that Microsoft's Office service rejected with
 * XLSPageLimitExceeded. Customer files aren't committed as fixtures, so point this at one:
 *
 *   TRIM_FIXTURE_XLSX=/path/to/workbook.xlsx npx vitest run lib/spreadsheet-print-trim.test.ts
 */
describe.skipIf(!process.env.TRIM_FIXTURE_XLSX)('against a real workbook', () => {
    it('trims every oversized sheet down to its populated range', async () => {
        const { readFile } = await import('node:fs/promises')
        const input = await readFile(process.env.TRIM_FIXTURE_XLSX!)

        const result = await trimWorkbookToUsedRange(input)
        expect(result).not.toBeNull()

        const out = await JSZip.loadAsync(result!.buffer)
        for (const path of Object.keys(out.files).filter((p) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(p))) {
            const xml = await out.file(path)!.async('string')
            const ref = xml.match(/<dimension ref="A1:([A-Z]+)(\d+)"\/>/)
            expect(ref, `${path} should declare a trimmed dimension`).toBeTruthy()
            // The Google Sheets default grid is 1000 rows; anything near it is still unbounded.
            expect(Number(ref![2]), `${path} row count`).toBeLessThan(100)
            expect(xml).toContain('<pageSetUpPr fitToPage="1"/>')
        }
    })
})
