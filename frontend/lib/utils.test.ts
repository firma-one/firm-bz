import { describe, it, expect } from 'vitest'
import { getFileTypeLabel, formatFileSize } from './utils'

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
