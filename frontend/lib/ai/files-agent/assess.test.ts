import { describe, it, expect } from 'vitest'
import { assessOrganization, renderAssessment, assessmentMarkdown } from './assess'
import { FLAT_FOLDER_THRESHOLD, type FileNode } from './analyze'

let seq = 0
function file(fileName: string, parentId: string | null = 'R'): FileNode {
    seq += 1
    return { externalId: `f${seq}`, fileName, isFolder: false, parentId }
}
function folder(fileName: string, externalId: string, parentId: string | null = 'R'): FileNode {
    return { externalId, fileName, isFolder: true, parentId }
}

describe('assessOrganization', () => {
    it('scores a clean tree at 100 with no issues', () => {
        const nodes = [
            folder('Deliverables', 'd1'),
            file('01-Scope-Note.docx', 'd1'),
            file('02-Client-Brief.docx', 'd1'),
            file('03-Final-Report.docx', 'd1'),
        ]
        const a = assessOrganization(nodes)
        expect(a.score).toBe(100)
        expect(a.issues).toHaveLength(0)
        expect(a.naming).toBe('hyphens')
    })

    /** Every penalty must be explained, and every explanation must cost something. */
    it('derives the score from the findings, so the two cannot disagree', () => {
        const nodes = [
            folder('Deliverables', 'd1'),
            file('Report.docx', 'd1'),
            file('Report (1).docx', 'd1'),
            file('loose.docx', 'R'),
        ]
        const a = assessOrganization(nodes)
        expect(a.issues.length).toBeGreaterThan(0)
        const totalPenalty = a.issues.reduce((n, i) => n + i.penalty, 0)
        expect(a.score).toBe(100 - totalPenalty)
        for (const issue of a.issues) expect(issue.penalty).toBeGreaterThan(0)
    })

    it('caps a penalty so one kind cannot sink the score alone', () => {
        const nodes: FileNode[] = [folder('Deliverables', 'd1')]
        for (let i = 0; i < 200; i += 1) nodes.push(file(`loose-${i}.docx`, 'R'))
        const a = assessOrganization(nodes)
        const loose = a.issues.find((i) => i.kind === 'loose-at-root')
        expect(loose?.count).toBe(200)
        expect(loose?.penalty).toBeLessThanOrEqual(20)
        expect(a.score).toBeGreaterThan(0)
    })

    it('never leaves the 0–100 range', () => {
        const nodes: FileNode[] = [folder('Bulk', 'b1')]
        for (let i = 0; i < FLAT_FOLDER_THRESHOLD + 40; i += 1) nodes.push(file(`a_${i}.docx`, 'b1'))
        for (let i = 0; i < 40; i += 1) nodes.push(file(`b-${i}.docx`, 'R'))
        const a = assessOrganization(nodes)
        expect(a.score).toBeGreaterThanOrEqual(0)
        expect(a.score).toBeLessThanOrEqual(100)
    })

    it('raises severity once an issue is past a stray', () => {
        const few = assessOrganization([folder('D', 'd1'), file('one.docx', 'R')])
        expect(few.issues.find((i) => i.kind === 'loose-at-root')?.severity).toBe('info')

        const many: FileNode[] = [folder('D', 'd2')]
        for (let i = 0; i < 30; i += 1) many.push(file(`x-${i}.docx`, 'R'))
        expect(assessOrganization(many).issues.find((i) => i.kind === 'loose-at-root')?.severity)
            .toBe('warning')
    })

    it('carries examples so a reader sees which files', () => {
        const nodes = [
            folder('D', 'd1'), file('Report.docx', 'd1'), file('Report (1).docx', 'd1'),
        ]
        const dupes = assessOrganization(nodes).issues.find((i) => i.kind === 'duplicate-name')
        expect(dupes?.examples).toContain('Report (1).docx')
        expect(dupes?.examples.length).toBeLessThanOrEqual(5)
    })
})

describe('renderAssessment', () => {
    it('states the score, the counts and the convention', () => {
        const nodes = [
            folder('Deliverables', 'd1'),
            file('01-Scope-Note.docx', 'd1'),
            file('02-Client-Brief.docx', 'd1'),
        ]
        const text = renderAssessment(assessOrganization(nodes))
        expect(text).toContain('score 100/100')
        expect(text).toContain('hyphens')
        expect(text).toContain('No issues found.')
    })

    it('lists each issue with its penalty', () => {
        const nodes = [
            folder('D', 'd1'), file('Report.docx', 'd1'), file('Report (1).docx', 'd1'),
        ]
        const text = renderAssessment(assessOrganization(nodes))
        expect(text).toMatch(/duplicates of each other \(-\d+\)/)
    })
})

describe('assessmentMarkdown', () => {
    const tree = [
        folder('Deliverables', 'd1'),
        file('Report.docx', 'd1'),
        file('Report (1).docx', 'd1'),
        file('loose.docx', 'R'),
    ]

    /** A table in the message flow, not a bespoke stats card. */
    it('renders a GFM table of the counts', () => {
        const md = assessmentMarkdown(assessOrganization(tree))
        expect(md).toContain('|---|---|')
        expect(md).toMatch(/\| Files \| \d+ \|/)
        expect(md).toMatch(/\| Folders \| \d+ \|/)
        expect(md).toMatch(/\| Duplicates \| \d+ \|/)
        expect(md).toMatch(/\| Naming \| /)
    })

    it('lists what is worth fixing', () => {
        const md = assessmentMarkdown(assessOrganization(tree))
        expect(md).toContain('Worth fixing:')
        expect(md).toMatch(/- .*duplicates/)
    })

    /** A clean tree still reports what was checked. */
    it('says so plainly when nothing is wrong', () => {
        const clean = [
            folder('Deliverables', 'd1'),
            file('01-Scope-Note.docx', 'd1'),
            file('02-Client-Brief.docx', 'd1'),
        ]
        const md = assessmentMarkdown(assessOrganization(clean))
        expect(md).toContain('Nothing to fix.')
        expect(md).not.toContain('Worth fixing:')
    })

    /** Omitted when zero, so a clean tree does not carry an empty row. */
    it('shows empty folders only when there are some', () => {
        const withEmpty = [...tree, folder('Unused', 'd2')]
        expect(assessmentMarkdown(assessOrganization(withEmpty))).toContain('| Empty folders |')
        expect(assessmentMarkdown(assessOrganization(tree))).not.toContain('| Empty folders |')
    })
})
