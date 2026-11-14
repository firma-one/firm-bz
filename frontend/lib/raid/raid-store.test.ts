import { describe, it, expect, vi, beforeAll } from 'vitest'

/**
 * A RAID entry's merged sources: a thread quote inside `extraSources` (JSON) is stored encrypted, as
 * the row's own `quote` is by the Prisma extension. Nothing here reaches the database.
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/files/file-creator', () => ({ loadPeople: vi.fn() }))
vi.mock('@/lib/auth/display-name', () => ({ resolveNames: vi.fn() }))

import { extraSourcesOf, sealExtraSources, type RaidExtraSource } from './raid-store'

beforeAll(() => {
    // A throwaway key, never a real one.
    process.env.ENCRYPTION_KEY_V1 = 'c'.repeat(64)
    delete process.env.CURRENT_KEY_VERSION
})

const SOURCES: RaidExtraSource[] = [
    { kind: 'THREAD', ref: 'm1', quote: 'We may miss the K-1 deadline', internal: false, at: '2026-11-14T10:00:00Z' },
    { kind: 'MEMO', ref: 'memo-1', internal: true, at: '2026-11-14T10:05:00Z' },
]

describe('extraSources', () => {
    it('stores a thread quote encrypted and reads it back as written', () => {
        const stored = sealExtraSources(SOURCES)
        expect(JSON.stringify(stored)).not.toContain('K-1')
        expect(stored[0].quote).toMatch(/^v1\$/)
        expect(extraSourcesOf(JSON.parse(JSON.stringify(stored)))).toEqual(SOURCES)
    })

    it('reads a quote saved before encryption as it is', () => {
        expect(extraSourcesOf([{ kind: 'THREAD', ref: 'm1', quote: 'plain words', internal: false, at: '' }])[0].quote).toBe('plain words')
    })

    it('never keeps words for a memo source, whatever a row holds', () => {
        expect(extraSourcesOf([{ kind: 'MEMO', ref: 'memo-1', quote: 'a memo line', internal: true, at: '' }])[0]).not.toHaveProperty('quote')
    })
})
