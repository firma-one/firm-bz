import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, isCiphertext, openText, sealText } from './encryption'

/**
 * The text-field helpers for values the Prisma extension can't reach (a quote inside a JSON column),
 * and the one test that decides what counts as already encrypted. A throwaway key, never a real one.
 */

beforeAll(() => {
    process.env.ENCRYPTION_KEY_V1 = 'a'.repeat(64)
    delete process.env.CURRENT_KEY_VERSION
})

describe('isCiphertext', () => {
    it('knows what encrypt wrote', () => {
        expect(isCiphertext(encrypt('Chase the 1099-B'))).toBe(true)
    })

    it('never mistakes a sentence that starts with v and holds a $ for ciphertext', () => {
        // The old test was "starts with v and contains $": this line would have been stored as plain text.
        expect(isCiphertext('valued at $5,000 before the K-1 arrives')).toBe(false)
        expect(isCiphertext('v1$ is the format')).toBe(false)
        expect(isCiphertext('')).toBe(false)
    })
})

describe('sealText and openText', () => {
    it('round trip, and what is stored never holds the words', () => {
        const sealed = sealText('She will send the K-1s by Friday')
        expect(sealed).not.toContain('K-1')
        expect(openText(sealed)).toBe('She will send the K-1s by Friday')
    })

    it('never encrypts twice, and leaves an empty value empty', () => {
        const sealed = sealText('the line')
        expect(sealText(sealed)).toBe(sealed)
        expect(sealText('')).toBe('')
    })

    it('reads a value saved before encryption as it is, so old rows need no backfill', () => {
        expect(openText('valued at $5,000 before the K-1 arrives')).toBe('valued at $5,000 before the K-1 arrives')
        expect(openText('')).toBe('')
    })
})
