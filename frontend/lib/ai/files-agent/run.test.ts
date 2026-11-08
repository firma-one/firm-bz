import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A review whose model turn fails says so (`modelFailed`) rather than breaking out quietly and
 * returning findings with no suggestions, which the panel read as "Nothing to change". The model
 * is mocked: nothing here reaches Anthropic, a Drive or OneDrive.
 */

const { create, meter } = vi.hoisted(() => ({ create: vi.fn(), meter: vi.fn(async () => {}) }))

vi.mock('@/lib/ai/client', () => ({ AI_MODEL: 'test-model' }))
vi.mock('@/lib/ai/guarded-client', () => ({
    getGuardedAnthropic: async () => ({ messages: { create } }),
    meterAiCall: meter,
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { runFilesReview } from './run'
import type { FileNode } from './analyze'

/** A tree with something for the model to fix: a copy-suffixed duplicate and a generic name. */
const NODES: FileNode[] = [
    { externalId: 'd1', fileName: 'Deliverables', isFolder: true, parentId: 'R' },
    { externalId: 'f1', fileName: 'Report.docx', isFolder: false, parentId: 'd1' },
    { externalId: 'f2', fileName: 'Report (1).docx', isFolder: false, parentId: 'd1' },
    { externalId: 'f3', fileName: 'loose.docx', isFolder: false, parentId: 'R' },
]
const scope = { firmId: 'f1', userId: 'u1', feature: 'filesAgent' as const }

beforeEach(() => {
    create.mockReset()
    meter.mockClear()
})

describe('runFilesReview', () => {
    it('a failed model turn is reported, and the findings still come back', async () => {
        create.mockRejectedValue(new Error('529 overloaded_error'))
        const result = await runFilesReview({ nodes: NODES, rootId: 'R', scope })
        expect(result).not.toBeNull()
        expect(result!.modelFailed).toBe(true)
        expect(result!.findings.length).toBeGreaterThan(0)
        expect(result!.proposals).toHaveLength(0)
        // A turn that never ran is not metered.
        expect(meter).not.toHaveBeenCalled()
    })

    it('a turn that answers is not marked failed', async () => {
        create.mockResolvedValue({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } })
        const result = await runFilesReview({ nodes: NODES, rootId: 'R', scope })
        expect(result!.modelFailed).toBe(false)
        expect(meter).toHaveBeenCalledTimes(1)
    })
})
