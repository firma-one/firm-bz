import { describe, expect, it } from 'vitest'
import { BREADCRUMB_MAX_SHOWN, foldBreadcrumbTrail } from './breadcrumb-trail'

const trail = (n: number) => Array.from({ length: n }, (_, i) => `L${i + 1}`)
const shown = (slots: ReturnType<typeof foldBreadcrumbTrail<string>>) =>
    slots.map((s) => (s.kind === 'crumb' ? s.item : `[${s.entries.map((e) => e.item).join(',')}]`))

describe('foldBreadcrumbTrail', () => {
    it('shows nothing at the engagement root', () => {
        expect(foldBreadcrumbTrail([])).toEqual([])
    })

    it('shows every folder of a short trail, in order', () => {
        for (let n = 1; n <= BREADCRUMB_MAX_SHOWN; n++) {
            expect(shown(foldBreadcrumbTrail(trail(n)))).toEqual(trail(n))
        }
    })

    it('keeps every folder at the depth the old trail broke at (root plus four, where it showed only the last)', () => {
        expect(shown(foldBreadcrumbTrail(trail(4)))).toEqual(['L1', 'L2', 'L3', 'L4'])
    })

    it('folds the folders above the last three into one menu once the trail runs deep', () => {
        expect(shown(foldBreadcrumbTrail(trail(6)))).toEqual(['[L1,L2,L3]', 'L4', 'L5', 'L6'])
        expect(shown(foldBreadcrumbTrail(trail(9)))).toEqual(['[L1,L2,L3,L4,L5,L6]', 'L7', 'L8', 'L9'])
    })

    it('never loses a level: folded and shown together are the whole trail, each at its own index', () => {
        for (let n = 0; n <= 12; n++) {
            const flat = foldBreadcrumbTrail(trail(n)).flatMap((s) => (s.kind === 'crumb' ? [s] : s.entries))
            expect(flat.map((e) => e.item)).toEqual(trail(n))
            expect(flat.map((e) => e.index)).toEqual(trail(n).map((_, i) => i))
        }
    })

    it('indexes the whole trail when the folders follow the root crumb', () => {
        const slots = foldBreadcrumbTrail(trail(6), 1)
        expect(slots[0]).toEqual({ kind: 'folded', entries: [{ item: 'L1', index: 1 }, { item: 'L2', index: 2 }, { item: 'L3', index: 3 }] })
        expect(slots.at(-1)).toEqual({ kind: 'crumb', item: 'L6', index: 6 })
    })
})
