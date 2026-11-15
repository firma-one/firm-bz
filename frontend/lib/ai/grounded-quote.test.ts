import { describe, expect, it } from 'vitest'
import { groundedRun } from './grounded-quote'

const words = (s: string) => s.split(' ')
const TRANSCRIPT = 'Tom Ortiz: this could become Maya Chen: Oh. Tom Ortiz: a monthly feature for the newsletter, every first Tuesday.'

describe('groundedRun', () => {
    it('finds the longest run of the quote that is in the text when a turn splits it', () => {
        const quote = words('this could become a monthly feature for the newsletter, every first Tuesday.')
        const run = groundedRun(quote, TRANSCRIPT)
        expect(run).toEqual([3, 12])
        expect(quote.slice(run![0], run![1]).join(' ')).toBe('a monthly feature for the newsletter, every first Tuesday.')
    })

    it('needs at least five words, so a stock phrase never stands in for a quote', () => {
        expect(groundedRun(words('this could become something else'), TRANSCRIPT)).toBeNull()
    })

    it('needs at least half the quote', () => {
        const quote = words('we agreed a monthly feature for the newsletter was the plan, pending the budget sign-off from finance next quarter')
        expect(groundedRun(quote, TRANSCRIPT)).toBeNull()
    })

    it('takes the longer of two runs that are both there', () => {
        const quote = words('Tom Ortiz: this could become a monthly feature for the newsletter, every first')
        const run = groundedRun(quote, TRANSCRIPT)
        expect(quote.slice(run![0], run![1]).join(' ')).toBe('a monthly feature for the newsletter, every first')
    })
})
