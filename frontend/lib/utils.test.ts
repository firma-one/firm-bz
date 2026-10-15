import { describe, it, expect } from 'vitest'
import { getFileTypeLabel, formatFileSize, cn, cnV2 } from './utils'

describe('getFileTypeLabel', () => {
    it.each([
        ['application/pdf', 'PDF'],
        ['image/png', 'Image'],
        ['video/mp4', 'Video'],
        ['audio/mpeg', 'Audio'],
        ['application/zip', 'Archive'],
        ['text/plain', 'Text'],
        ['application/vnd.google-apps.folder', 'Folder'],
    ])('labels %s as %s', (mime, label) => {
        expect(getFileTypeLabel(mime)).toBe(label)
    })

    // Every OOXML mime type contains "officedocument", so a naive includes('document')
    // check swallows spreadsheets and must be ordered after the sheet check.
    it.each([
        ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sheet'],
        ['application/vnd.ms-excel', 'Sheet'],
        ['text/csv', 'Sheet'],
        ['application/vnd.google-apps.spreadsheet', 'Sheet'],
    ])('labels spreadsheet %s as %s', (mime, label) => {
        expect(getFileTypeLabel(mime)).toBe(label)
    })

    it.each([
        ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Doc'],
        ['application/msword', 'Doc'],
        ['application/vnd.google-apps.document', 'Doc'],
    ])('labels document %s as %s', (mime, label) => {
        expect(getFileTypeLabel(mime)).toBe(label)
    })

    it.each([
        ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Presentation'],
        ['application/vnd.ms-powerpoint', 'Presentation'],
        ['application/vnd.google-apps.presentation', 'Presentation'],
    ])('labels presentation %s as %s', (mime, label) => {
        expect(getFileTypeLabel(mime)).toBe(label)
    })

    it('falls back to File for unknown or empty mime types', () => {
        expect(getFileTypeLabel('application/octet-stream')).toBe('File')
        expect(getFileTypeLabel('')).toBe('File')
    })
})

describe('formatFileSize', () => {
    it.each([
        [0, '0 Bytes'],
        [512, '512 Bytes'],
        [1024, '1 KB'],
        [103374, '100.95 KB'],
        [1048576, '1 MB'],
    ])('formats %i bytes as %s', (bytes, expected) => {
        expect(formatFileSize(bytes)).toBe(expected)
    })

    it('accepts byte counts given as strings', () => {
        expect(formatFileSize('103374')).toBe('100.95 KB')
    })

    it.each([undefined, null, '', 'not-a-number'])('returns Unknown size for %s', (input) => {
        expect(formatFileSize(input as never)).toBe('Unknown size')
    })
})

describe('cn — UI token scales', () => {
    it('treats text-ui / text-caption as font sizes, not colors', () => {
        expect(cn('text-ui', 'text-white')).toBe('text-ui text-white')
        expect(cn('text-sm', 'text-caption')).toBe('text-caption')
    })

    it('merges custom radii and shadows with the stock scale', () => {
        expect(cn('rounded-md', 'rounded-control')).toBe('rounded-control')
        expect(cn('shadow-md', 'shadow-popover')).toBe('shadow-popover')
        expect(cn('shadow-popover', 'shadow-red-500')).toBe('shadow-popover shadow-red-500')
    })
})

describe('cnV2', () => {
    const base = 'h-9 px-4 bg-blue-600 v2:h-8 v2:px-3 v2:bg-action v2:hover:bg-action-hover'

    it('keeps every class when the caller passes nothing', () => {
        expect(cnV2(base)).toBe(base)
    })

    it('never drops v1 classes on account of v2 ones', () => {
        expect(cnV2(base, 'mt-2')).toBe(`${base} mt-2`)
    })

    it('drops the v2 class for a property the caller overrides, so the caller wins in v2 too', () => {
        expect(cnV2(base, 'h-10')).toBe('px-4 bg-blue-600 v2:px-3 v2:bg-action v2:hover:bg-action-hover h-10')
    })

    it('matches overrides modifier-for-modifier', () => {
        // A plain bg override leaves the v2 hover color alone; a hover override drops it.
        expect(cnV2(base, 'bg-primary')).toBe('h-9 px-4 v2:h-8 v2:px-3 v2:hover:bg-action-hover bg-primary')
        expect(cnV2(base, 'hover:bg-primary/90')).toBe('h-9 px-4 bg-blue-600 v2:h-8 v2:px-3 v2:bg-action hover:bg-primary/90')
    })

    it('treats shorthand overrides as overriding the v2 longhand', () => {
        expect(cnV2(base, 'p-0')).toBe('h-9 bg-blue-600 v2:h-8 v2:bg-action v2:hover:bg-action-hover p-0')
    })

    it('lets a caller v2 class replace the primitive v2 class', () => {
        expect(cnV2(base, 'v2:h-10')).toBe('h-9 px-4 bg-blue-600 v2:px-3 v2:bg-action v2:hover:bg-action-hover v2:h-10')
    })
})
