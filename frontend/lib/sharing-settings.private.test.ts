import { describe, it, expect } from 'vitest'
import { internalOnlyTree, privateSubtreeIds } from './sharing-settings'

// What's private to the firm: a document marked private, and all a private folder holds.

const PRIVATE = { lock: { type: 'private' } }
const row = (externalId: string, parentId: string | null, settings: unknown = {}) => ({ externalId, parentId, settings })

describe('privateSubtreeIds', () => {
    it('is empty when nothing is private', () => {
        expect(privateSubtreeIds([row('a', null), row('b', 'a')]).size).toBe(0)
    })

    it('holds a private document and not its siblings', () => {
        expect(Array.from(privateSubtreeIds([row('f', null), row('a', 'f', PRIVATE), row('b', 'f')]))).toEqual(['a'])
    })

    it('holds everything inside a private folder, at any depth', () => {
        const ids = privateSubtreeIds([row('p', null, PRIVATE), row('sub', 'p'), row('deep', 'sub'), row('other', null)])
        expect(Array.from(ids).sort()).toEqual(['deep', 'p', 'sub'])
    })

    it('reads the legacy flag too', () => {
        expect(Array.from(privateSubtreeIds([row('a', null, { locked: 'private' })]))).toEqual(['a'])
    })

    it("doesn't take a finalized or intake lock for private", () => {
        expect(privateSubtreeIds([row('a', null, { lock: { type: 'finalize' } }), row('b', null, { lock: { type: 'intake' } })]).size).toBe(0)
    })

    it('survives a cycle in provider data, and a row with no external ID', () => {
        const ids = privateSubtreeIds([row('a', 'b', PRIVATE), row('b', 'a'), { externalId: null, parentId: 'a', settings: {} }])
        expect(Array.from(ids).sort()).toEqual(['a', 'b'])
    })
})

describe('internalOnlyTree', () => {
    const PRIVATE = { lock: { type: 'private' } }
    const row = (externalId: string, parentId: string | null, settings: object = {}) => ({ externalId, parentId, settings })
    const sorted = (ids: Set<string>) => Array.from(ids).sort()

    it('is empty when nothing is internal only', () => {
        const { ids, ancestorIds } = internalOnlyTree([row('root', null), row('a', 'root')])
        expect(ids.size).toBe(0)
        expect(ancestorIds.size).toBe(0)
    })

    it('holds a marked file, and the folders that lead to it but not their other contents', () => {
        const { ids, ancestorIds } = internalOnlyTree([
            row('root', null),
            row('deliverable', 'root'),
            row('secret', 'deliverable', PRIVATE),
            row('open', 'deliverable'),
            row('elsewhere', 'root'),
        ])
        expect(sorted(ids)).toEqual(['secret'])
        expect(sorted(ancestorIds)).toEqual(['deliverable', 'root'])
    })

    it('holds everything inside a marked folder', () => {
        const { ids } = internalOnlyTree([
            row('notes', 'deliverable', PRIVATE),
            row('sub', 'notes'),
            row('deep', 'sub'),
        ])
        expect(sorted(ids)).toEqual(['deep', 'notes', 'sub'])
    })

    it("doesn't hang on a cycle in provider data", () => {
        const { ancestorIds } = internalOnlyTree([row('a', 'b', PRIVATE), row('b', 'a')])
        expect(ancestorIds.size).toBeGreaterThan(0)
    })
})

