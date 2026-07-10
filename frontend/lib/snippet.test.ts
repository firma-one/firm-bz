import { describe, it, expect } from 'vitest'
import { extractSnippet } from './snippet'

describe('extractSnippet', () => {
    it('returns null for empty or too-short text (same guard as generateSummary)', () => {
        expect(extractSnippet('')).toBeNull()
        expect(extractSnippet('Short intro paragraph.')).toBeNull()
        expect(extractSnippet('x'.repeat(99))).toBeNull()
    })

    it('returns null when text is only whitespace-padded below the minimum', () => {
        expect(extractSnippet('   ' + 'word '.repeat(15) + ' '.repeat(50))).toBeNull()
    })

    it('collapses newlines and repeated whitespace', () => {
        const text = 'Sales   Playbook\n\nQ2 Go-To-Market:\tbattlecards, pricing tiers, and competitor objections. '.repeat(2)
        const snippet = extractSnippet(text)
        expect(snippet).not.toBeNull()
        expect(snippet!).not.toMatch(/\s{2,}|\n|\t/)
    })

    it('returns the whole collapsed text when under maxLen', () => {
        const text = 'A '.repeat(30) + 'sales playbook covering battlecards and pricing for the Q2 launch.'
        expect(extractSnippet(text, 500)).toBe(text.replace(/\s+/g, ' ').trim())
    })

    it('cuts at a word boundary within maxLen', () => {
        const text = 'wordish '.repeat(200)
        const snippet = extractSnippet(text, 500)!
        expect(snippet.length).toBeLessThanOrEqual(500)
        expect(snippet.endsWith('wordish')).toBe(true)
    })

    it('does not shrink drastically on one pathological unbroken token', () => {
        const text = 'intro words here '.repeat(10) + 'x'.repeat(600)
        const snippet = extractSnippet(text, 500)!
        expect(snippet.length).toBeGreaterThan(300)
        expect(snippet.length).toBeLessThanOrEqual(500)
    })
})
