// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isValidEmail, parseEmailList } from './email-recipients'

describe('parseEmailList', () => {
    it('splits on commas, and on what a pasted list arrives with', () => {
        expect(parseEmailList('a@x.com, b@x.com;c@x.com\nd@x.com  e@x.com').valid).toEqual([
            'a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com',
        ])
    })

    it('lowercases and drops duplicates', () => {
        expect(parseEmailList('Pat@Example.com, pat@example.com').valid).toEqual(['pat@example.com'])
    })

    it('reports what is not an address rather than dropping it', () => {
        expect(parseEmailList('good@x.com, nope, also@bad')).toEqual({ valid: ['good@x.com'], invalid: ['nope', 'also@bad'] })
    })

    it('ignores empty input and stray separators', () => {
        expect(parseEmailList('')).toEqual({ valid: [], invalid: [] })
        expect(parseEmailList(' , ,\n; ')).toEqual({ valid: [], invalid: [] })
    })
})

describe('isValidEmail', () => {
    it('accepts ordinary addresses', () => {
        for (const ok of ['pat@example.com', 'pat.lee+news@mail.example.co.uk']) expect(isValidEmail(ok)).toBe(true)
    })

    it('refuses anything that could smuggle in another recipient or header', () => {
        for (const bad of ['a@x.com,b@x.com', 'a b@x.com', 'a@x.com\nBcc: b@x.com', 'Pat <pat@x.com>', '@x.com', 'pat@', 'pat@x']) {
            expect(isValidEmail(bad)).toBe(false)
        }
    })
})
