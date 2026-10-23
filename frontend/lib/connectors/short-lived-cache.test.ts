import { describe, it, expect, vi, afterEach } from 'vitest'
import { createShortLivedCache, tokenCacheExpiry } from './short-lived-cache'

afterEach(() => vi.useRealTimers())

describe('createShortLivedCache', () => {
    it('keeps a value for the TTL, then drops it', () => {
        vi.useFakeTimers()
        const cache = createShortLivedCache<string>(1000)
        cache.set('c1', 'tok')
        vi.advanceTimersByTime(999)
        expect(cache.get('c1')).toBe('tok')
        vi.advanceTimersByTime(1)
        expect(cache.get('c1')).toBeUndefined()
    })

    it('never keeps a value past the expiry it was given', () => {
        vi.useFakeTimers()
        const cache = createShortLivedCache<string>(60_000)
        cache.set('c1', 'tok', Date.now() + 500)
        vi.advanceTimersByTime(500)
        expect(cache.get('c1')).toBeUndefined()
    })

    it('delete clears one entry', () => {
        const cache = createShortLivedCache<string>(60_000)
        cache.set('c1', 'a')
        cache.set('c2', 'b')
        cache.delete('c1')
        expect(cache.get('c1')).toBeUndefined()
        expect(cache.get('c2')).toBe('b')
    })
})

describe('tokenCacheExpiry', () => {
    it('is 30s before the token expires, or undefined when unknown or past', () => {
        vi.useFakeTimers()
        const now = Date.now()
        expect(tokenCacheExpiry(new Date(now + 3_600_000))).toBe(now + 3_600_000 - 30_000)
        expect(tokenCacheExpiry(new Date(now + 10_000))).toBeUndefined()
        expect(tokenCacheExpiry(null)).toBeUndefined()
    })
})
