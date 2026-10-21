import { describe, expect, it } from 'vitest'
import { formatDue, isPastDue, parseDueInput, quickPicks, readDue, relativeDay, writeDue } from './due-date'

// Thu Oct 22, 2026, 10:00 local
const NOW = new Date(2026, 9, 22, 10, 0)
const day = (m: number, d: number, y = 2026) => new Date(y, m - 1, d)

describe('readDue / writeDue', () => {
    it('reads a bare day as that day with no time', () => {
        expect(readDue('2026-10-30')).toEqual({ day: day(10, 30), time: null })
    })

    it('reads UTC midnight (how a bare day is stored) as its UTC day with no time', () => {
        expect(readDue('2026-10-30T00:00:00.000Z')).toEqual({ day: day(10, 30), time: null })
        expect(readDue('2026-10-30T00:00:00+00:00')).toEqual({ day: day(10, 30), time: null })
    })

    it('reads any other instant as a local day and time', () => {
        const instant = new Date(2026, 9, 30, 17, 0).toISOString()
        expect(readDue(instant)).toEqual({ day: day(10, 30), time: '17:00' })
    })

    it('is null for nothing or nonsense', () => {
        expect(readDue(null)).toBeNull()
        expect(readDue('')).toBeNull()
        expect(readDue('not a date')).toBeNull()
    })

    it('writes a day alone as yyyy-MM-dd, and a day with a time as an instant that reads back', () => {
        expect(writeDue(day(10, 30), null)).toBe('2026-10-30')
        expect(readDue(writeDue(day(10, 30), '17:00'))).toEqual({ day: day(10, 30), time: '17:00' })
    })
})

describe('formatDue, isPastDue, relativeDay', () => {
    it('formats with and without a time', () => {
        expect(formatDue({ day: day(10, 30), time: null })).toBe('Oct 30, 2026')
        expect(formatDue({ day: day(10, 30), time: '17:00' })).toBe('Oct 30, 2026 · 5:00 PM')
        expect(formatDue({ day: day(10, 30), time: '17:00' }, { compact: true, now: NOW })).toBe('Oct 30 · 5:00 PM')
        expect(formatDue({ day: day(1, 5, 2027), time: null }, { compact: true, now: NOW })).toBe('Jan 5, 2027')
    })

    it('is past due before today, or once a time has gone', () => {
        expect(isPastDue({ day: day(10, 21), time: null }, NOW)).toBe(true)
        expect(isPastDue({ day: day(10, 22), time: null }, NOW)).toBe(false)
        expect(isPastDue({ day: day(10, 22), time: '09:00' }, NOW)).toBe(true)
        expect(isPastDue({ day: day(10, 22), time: '11:00' }, NOW)).toBe(false)
    })

    it('says how far away a day is', () => {
        expect(relativeDay(day(10, 22), NOW)).toBe('today')
        expect(relativeDay(day(10, 23), NOW)).toBe('tomorrow')
        expect(relativeDay(day(10, 30), NOW)).toBe('in 8 days')
        expect(relativeDay(day(10, 19), NOW)).toBe('3 days ago')
    })
})

describe('quickPicks', () => {
    it('resolves Today, Tomorrow, Next week (Monday) and In 2 weeks', () => {
        expect(quickPicks(NOW).map((p) => [p.label, p.day])).toEqual([
            ['Today', day(10, 22)],
            ['Tomorrow', day(10, 23)],
            ['Next week', day(10, 26)],
            ['In 2 weeks', day(11, 5)],
        ])
    })
})

describe('parseDueInput', () => {
    it.each([
        ['today', day(10, 22)],
        ['tom', day(10, 23)],
        ['tomorrow', day(10, 23)],
        ['next week', day(10, 26)],
        ['in 3 days', day(10, 25)],
        ['in 2 weeks', day(11, 5)],
        ['end of month', day(10, 31)],
        ['fri', day(10, 23)],
        ['friday', day(10, 23)],
        ['next fri', day(10, 23)],
        ['thu', day(10, 29)],
        ['mon', day(10, 26)],
        ['oct 30', day(10, 30)],
        ['October 30, 2026', day(10, 30)],
        ['30 oct', day(10, 30)],
        ['10/30', day(10, 30)],
        ['2026-10-30', day(10, 30)],
        ['jan 5', day(1, 5, 2027)],
        ['oct 1', day(10, 1, 2027)],
    ])('reads %s', (input, expected) => {
        expect(parseDueInput(input, NOW)).toEqual(expected)
    })

    it.each(['', 'soon', 'feb 30', 'march', '13/40', 'x'])('rejects %s', (input) => {
        expect(parseDueInput(input, NOW)).toBeNull()
    })
})
