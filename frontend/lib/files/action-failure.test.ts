import { describe, it, expect } from 'vitest'
import { failureFrom, failureReason } from './action-failure'

// What a person is told when a file action fails: the server's reason, and if the request never got
// there, that.

describe('failureFrom', () => {
    it("carries the server's reason", async () => {
        const res = new Response(JSON.stringify({ error: 'OneDrive is busy right now. Try again in a minute.', code: 'busy' }), { status: 503 })
        expect((await failureFrom(res)).message).toBe('OneDrive is busy right now. Try again in a minute.')
    })

    it('still says something when the answer has no reason in it', async () => {
        expect((await failureFrom(new Response('<html>', { status: 500 }))).message).toBe('The server answered 500. Try again.')
        expect((await failureFrom(new Response('{}', { status: 403 }))).message).toBe('The server answered 403. Try again.')
    })
})

describe('failureReason', () => {
    it('says the request never got there, in place of the browser\'s "Failed to fetch"', () => {
        expect(failureReason(new TypeError('Failed to fetch'))).toBe("Couldn't reach Firma. Check your connection and try again.")
    })

    it("uses an error's own words", () => {
        expect(failureReason(new Error('Drive said no'))).toBe('Drive said no')
    })

    it('never comes back empty', () => {
        expect(failureReason(new Error(''))).toBe('Something went wrong. Try again.')
        expect(failureReason('nope')).toBe('Something went wrong. Try again.')
    })
})
