import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NODE_STEPS, tourSteps } from '@/components/demo/demo-tour-steps'
import { engagementTabGuide } from '@/components/projects/engagement-tabs'
import { DEFAULT_TOUR_MODE, GUIDE_PARAM, TOUR_MODES, TOUR_NODES, TOUR_NODE_IDS, autoplayDuration, nextTourNode, parseGuideParam, parseModeParam, tourGuideHref, tourSubtree, type TourNodeId } from './tour-chapters'

/**
 * The guided tour's outline (.claude/plans/tour-chapters.md). At run time a step whose target is
 * missing is retried and then skipped, so a renamed or removed data-demo-tour attribute would only
 * show as a step that never appears. This guards the targets, the outline's order, and every
 * chapter's and section's deep link.
 */

const ROOT = join(__dirname, '..', '..')
const SCAN = ['components', 'app']
const STEPS_FILE = join(ROOT, 'components', 'demo', 'demo-tour-steps.tsx')

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) sourceFiles(full, out)
        else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) && full !== STEPS_FILE) out.push(full)
    }
    return out
}

/** Every data-demo-tour value the components set: `data-demo-tour="x"`, a string literal on a line
 * that sets data-demo-tour (`data-demo-tour={open ? 'x' : undefined}`), or a `tour="x"` prop that a
 * component passes on to the attribute. */
function definedTargets(): Set<string> {
    const found = new Set<string>()
    for (const file of SCAN.flatMap((dir) => sourceFiles(join(ROOT, dir)))) {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            Array.from(line.matchAll(/data-demo-tour="([^"]+)"/g), (m) => found.add(m[1]))
            Array.from(line.matchAll(/\btour="([^"]+)"/g), (m) => found.add(m[1]))
            if (line.includes('data-demo-tour={')) Array.from(line.matchAll(/'([a-z0-9-]+)'/g), (m) => found.add(m[1]))
        }
    }
    return found
}

const allSteps = TOUR_NODES.flatMap((n) => NODE_STEPS[n.id].map((step) => [n.id, step] as const))

describe('tour step targets', () => {
    const targets = definedTargets()

    it.each(allSteps.map(([node, step]) => [node, step.target] as [TourNodeId, string]))('%s: %s exists in the components', (_node, target) => {
        const value = /^\[data-demo-tour="([^"]+)"\]$/.exec(target)?.[1]
        expect(value, 'targets are [data-demo-tour="…"] selectors').toBeTruthy()
        expect(targets.has(value!)).toBe(true)
    })

    it('stay on the tour', () => {
        for (const [, step] of allSteps) expect(step.route).toMatch(/^\/tour(\/|\?|$)/)
    })
})

describe('tour outline', () => {
    it('lists every node once, each before its own, in the order the whole tour runs', () => {
        expect(TOUR_NODES.map((n) => n.id)).toEqual([...TOUR_NODE_IDS])
    })

    it('follows the data model: Firm, then Clients, then Engagements', () => {
        const at = (id: TourNodeId) => TOUR_NODE_IDS.indexOf(id)
        expect(at('firm')).toBeLessThan(at('clients'))
        expect(at('clients')).toBeLessThan(at('engagements'))
        expect(tourSubtree('engagements').map((n) => n.id)).toContain('file-details')
    })

    it.each(TOUR_NODES.filter((n) => !n.children).map((n) => [n.id] as [TourNodeId]))('%s has 1 to 6 steps', (id) => {
        expect(NODE_STEPS[id].length).toBeGreaterThanOrEqual(1)
        expect(NODE_STEPS[id].length).toBeLessThanOrEqual(6)
    })

    it.each(TOUR_NODES.map((n) => [n.id] as [TourNodeId]))('%s is reachable by its deep link', (id) => {
        const url = new URL(tourGuideHref(id), 'https://firma.test')
        expect(url.pathname).toBe('/tour')
        expect(parseGuideParam(url.searchParams.get(GUIDE_PARAM))).toBe(id)
        expect(tourSteps(id).length).toBeGreaterThan(0)
    })

    it('ignore a missing or unknown guide', () => {
        expect(parseGuideParam(null)).toBeNull()
        expect(parseGuideParam(undefined)).toBeNull()
        expect(parseGuideParam('')).toBeNull()
        expect(parseGuideParam('wiki')).toBeNull()
        expect(parseGuideParam('Files')).toBeNull()
    })

    it('run a section with its own sections, or every step for the whole tour', () => {
        const files = tourSteps('files')
        expect(Array.from(new Set(files.map((s) => s.node)))).toEqual(['files', 'file-details'])
        expect(files.filter((s) => s.node === 'files').map((s) => s.indexInNode)).toEqual(NODE_STEPS.files.map((_, i) => i))
        expect(tourSteps(null)).toHaveLength(allSteps.length)
    })

    it('lead each part on to what follows it', () => {
        expect(nextTourNode('files')?.id).toBe('board')
        expect(nextTourNode('file-details')?.id).toBe('board')
        expect(nextTourNode('firm')?.id).toBe('clients')
        expect(nextTourNode('brio')?.id).toBe('support')
        expect(nextTourNode('billing')).toBeNull()
    })
})

describe('tour modes', () => {
    it('play by themselves unless asked otherwise', () => {
        expect(DEFAULT_TOUR_MODE).toBe('autoplay')
    })

    it.each(TOUR_MODES.map((m) => [m]))('%s is a deep link mode (&mode=)', (mode) => {
        expect(parseModeParam(mode)).toBe(mode)
    })

    it('ignore a missing or unknown mode', () => {
        expect(parseModeParam(null)).toBeNull()
        expect(parseModeParam('guided')).toBeNull()
    })

    it("give each step time to read it, within 5 to 15 seconds", () => {
        expect(autoplayDuration('')).toBe(5000)
        expect(autoplayDuration(Array(30).fill('word').join(' '))).toBe(8500)
        expect(autoplayDuration(Array(200).fill('word').join(' '))).toBe(15000)
    })

    it('let a step set its own autoplay time, within the same bounds', () => {
        for (const [, step] of allSteps) if (step.duration !== undefined) expect(step.duration).toBeGreaterThanOrEqual(3000)
    })
})

describe("the engagement page's How this works link", () => {
    it.each([
        ['analytics', 'engagement-overview'],
        ['files', 'files'],
        ['board', 'board'],
        ['comments', 'discussions'],
        ['members', 'engagement-members'],
        ['audit', 'engagement-audit'],
    ])('opens %s on its %s section', (tab, node) => {
        expect(engagementTabGuide(tab)).toBe(node)
    })

    it('is left out on Settings and Wiki, which the tour only points at', () => {
        expect(engagementTabGuide('settings')).toBeNull()
        expect(engagementTabGuide('wiki')).toBeNull()
    })
})
