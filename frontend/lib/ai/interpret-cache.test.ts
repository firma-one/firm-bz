import { describe, it, expect } from 'vitest'
import { buildInterpretCacheKey, getCachedInterpretation, setCachedInterpretation } from './interpret-cache'
import type { InterpretCandidates } from './search-interpreter'

const candidates = (clients: Array<{ id: string; name: string }>): InterpretCandidates => ({
    clients,
    engagements: [],
    deliverables: [],
})

const ACME = candidates([{ id: 'c1', name: 'Acme Corp' }])

describe('buildInterpretCacheKey', () => {
    it('matches for the same question and the same visible entities', () => {
        expect(buildInterpretCacheKey('f1', 'u1', 'Acme scope doc', ACME))
            .toBe(buildInterpretCacheKey('f1', 'u1', 'Acme scope doc', ACME))
    })

    it('ignores case and repeated whitespace', () => {
        expect(buildInterpretCacheKey('f1', 'u1', '  ACME   scope doc ', ACME))
            .toBe(buildInterpretCacheKey('f1', 'u1', 'acme scope doc', ACME))
    })

    it('differs when a client is ADDED to what the user can see', () => {
        // Resolution is scoped to the caller's visible entities, so the same words must resolve
        // again once that set changes — otherwise a new client is invisible to search.
        const more = candidates([{ id: 'c1', name: 'Acme Corp' }, { id: 'c2', name: 'Beta Ltd' }])
        expect(buildInterpretCacheKey('f1', 'u1', 'Acme scope doc', more))
            .not.toBe(buildInterpretCacheKey('f1', 'u1', 'Acme scope doc', ACME))
    })

    it('differs when a client is RENAMED but keeps its id', () => {
        // Ids alone would miss this: the model resolves against names, so a rename must invalidate.
        const renamed = candidates([{ id: 'c1', name: 'Acme Industries' }])
        expect(buildInterpretCacheKey('f1', 'u1', 'Acme scope doc', renamed))
            .not.toBe(buildInterpretCacheKey('f1', 'u1', 'Acme scope doc', ACME))
    })

    it('differs per user and per firm', () => {
        const k = buildInterpretCacheKey('f1', 'u1', 'q', ACME)
        expect(buildInterpretCacheKey('f1', 'u2', 'q', ACME)).not.toBe(k)
        expect(buildInterpretCacheKey('f2', 'u1', 'q', ACME)).not.toBe(k)
    })
})

describe('interpret cache', () => {
    it('returns what was stored, and misses for an unknown key', () => {
        const key = buildInterpretCacheKey('f1', 'u1', 'stored query', ACME)
        const value = { chips: [{ stage: 'client' as const, id: 'c1', name: 'Acme Corp' }], residualText: 'scope doc' }
        setCachedInterpretation(key, value)
        expect(getCachedInterpretation(key)).toEqual(value)
        expect(getCachedInterpretation(buildInterpretCacheKey('f1', 'u1', 'other', ACME))).toBeNull()
    })
})
