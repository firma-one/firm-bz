import { describe, it, expect } from 'vitest'
import {
    documentName,
    previewKind,
    isClientRenderable,
    needsRangeSupport,
} from '@/lib/preview-kinds'

describe('documentName', () => {
    // The connector listings use `name`; the EngagementDocument row uses `fileName`. Both
    // reach the preview panes. Reading only one yielded undefined, which stripped the
    // extension from a .csv and sent it to the workbook parser.
    it('accepts either shape', () => {
        expect(documentName({ name: 'a.csv' })).toBe('a.csv')
        expect(documentName({ fileName: 'b.csv' })).toBe('b.csv')
        expect(documentName({ fileName: 'b.csv', name: 'ignored' })).toBe('b.csv')
    })

    it('is a string even when the document has neither', () => {
        expect(documentName({})).toBe('')
        expect(documentName(undefined)).toBe('')
    })

    it('keeps extension-based classification working through it', () => {
        expect(previewKind('application/octet-stream', documentName({ name: 'notes.md' }))).toBe('markdown')
        // OneDrive reports .csv as an Excel type. The extension has to win, or delimited
        // text is treated as a workbook and offered a printed view it cannot produce.
        expect(previewKind('application/vnd.ms-excel', documentName({ name: 'export.csv' }))).toBe('csv')
        expect(previewKind('application/vnd.ms-excel', documentName({ name: 'real.xls' }))).toBe('sheet')
    })
})

describe('previewKind', () => {
    it('keeps the converted-PDF path for everything that already used it', () => {
        // These must stay out of the native path, or the preview regresses to a renderer
        // that cannot show them.
        for (const mime of [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/msword',
            'application/vnd.ms-powerpoint',
            'application/vnd.oasis.opendocument.text',
            'application/rtf',
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.presentation',
        ]) {
            expect(previewKind(mime, 'file')).toBe('office')
            expect(isClientRenderable(mime, 'file')).toBe(false)
        }
    })

    it('leaves PDFs to the PDF renderer', () => {
        expect(previewKind('application/pdf', 'a.pdf')).toBe('pdf')
        expect(isClientRenderable('application/pdf', 'a.pdf')).toBe(false)
    })

    it('classifies spreadsheets, including Google Sheets', () => {
        expect(previewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx')).toBe('sheet')
        expect(previewKind('application/vnd.ms-excel', 'a.xls')).toBe('sheet')
        expect(previewKind('application/vnd.google-apps.spreadsheet', 'Sheet')).toBe('sheet')
    })

    it('separates delimited text from spreadsheets', () => {
        expect(previewKind('text/csv', 'a.csv')).toBe('csv')
        expect(previewKind('text/tab-separated-values', 'a.tsv')).toBe('csv')
    })

    it('falls back to the extension when the provider says octet-stream', () => {
        // OneDrive routinely reports uploaded text files this way, which is exactly how
        // they ended up at "preview not available".
        expect(previewKind('application/octet-stream', 'notes.md')).toBe('markdown')
        expect(previewKind('application/octet-stream', 'data.json')).toBe('text')
        expect(previewKind('application/octet-stream', 'query.sql')).toBe('text')
        expect(previewKind('application/octet-stream', 'export.csv')).toBe('csv')
        expect(previewKind('application/octet-stream', 'bundle.zip')).toBe('zip')
        expect(previewKind('application/octet-stream', 'page.html')).toBe('html')
    })

    it('does not guess for an unknown type with no useful extension', () => {
        expect(previewKind('application/octet-stream', 'archive.dwg')).toBe('unknown')
        expect(previewKind(undefined, undefined)).toBe('unknown')
    })

    it('treats SVG as an image so it is drawn, never executed as a document', () => {
        expect(previewKind('image/svg+xml', 'logo.svg')).toBe('image')
        expect(isClientRenderable('image/svg+xml', 'logo.svg')).toBe(true)
    })

    it('marks only media as needing range requests', () => {
        expect(needsRangeSupport(previewKind('video/mp4', 'a.mp4'))).toBe(true)
        expect(needsRangeSupport(previewKind('audio/mpeg', 'a.mp3'))).toBe(true)
        expect(needsRangeSupport(previewKind('text/plain', 'a.txt'))).toBe(false)
        expect(needsRangeSupport(previewKind('application/pdf', 'a.pdf'))).toBe(false)
    })

    it('is case-insensitive about mime types', () => {
        expect(previewKind('APPLICATION/PDF', 'a.pdf')).toBe('pdf')
        expect(previewKind('Text/CSV', 'a.csv')).toBe('csv')
    })
})

describe('the sample files used to test previews', () => {
    // Each entry is a real file from the test engagement, paired with a mime type a
    // provider actually reports for it — including the wrong ones. A provider lying about
    // the type is the normal case, not the edge case.
    const cases: Array<[name: string, mime: string, expected: string]> = [
        ['file_example_CSV_5000.csv', 'application/vnd.ms-excel', 'csv'],
        ['file_example_CSV_5000.csv', 'text/csv', 'csv'],
        ['file_example_CSV_5000.csv', 'application/octet-stream', 'csv'],
        ['file_example_JSON_1kb.json', 'application/json', 'text'],
        ['file_example_JSON_1kb.json', 'application/octet-stream', 'text'],
        ['file_example_XML_24kb.xml', 'application/xml', 'text'],
        ['file_example_XML_24kb.xml', 'text/xml', 'text'],
        ['file_example_XML_24kb.xml', 'application/octet-stream', 'text'],
        ['file_example_MP3_5MG.mp3', 'audio/mpeg', 'audio'],
        ['file_example_MP4_1920.mp4', 'video/mp4', 'video'],
        ['file_example_PNG_2100.png', 'image/png', 'image'],
        ['file_example_SVG_30kb.svg', 'image/svg+xml', 'image'],
        ['FIRMA_Social_Media.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet'],
        ['Interviewer_RunSheet.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'office'],
        ['01-Content-Archive.pdf', 'application/pdf', 'pdf'],
    ]

    it.each(cases)('%s reported as %s is a %s', (name, mime, expected) => {
        expect(previewKind(mime, name)).toBe(expected)
    })

    it('sends only the client-rendered kinds down the native path', () => {
        // Office and PDF must keep converting; everything else here is rendered from the
        // original bytes.
        expect(isClientRenderable('application/pdf', 'a.pdf')).toBe(false)
        expect(isClientRenderable('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx')).toBe(false)
        for (const [name, mime] of cases.filter(([, , k]) => k !== 'office' && k !== 'pdf')) {
            expect(isClientRenderable(mime, name)).toBe(true)
        }
    })
})
