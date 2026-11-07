import { describe, it, expect } from 'vitest'
import { privateSubtreeIds } from './sharing-settings'

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
