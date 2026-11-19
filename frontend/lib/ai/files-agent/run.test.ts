import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A review whose model turn fails says so (`modelFailed`) rather than breaking out quietly and
 * returning findings with no suggestions, which the panel read as "Nothing to change". The model
 * is mocked: nothing here reaches Anthropic, a Drive or OneDrive.
 */

const { create, record } = vi.hoisted(() => ({ create: vi.fn(), record: vi.fn(async () => ({ credits: 1, costMicros: 1000 })) }))

vi.mock('@/lib/ai/client', () => ({ AI_MODEL: 'test-model', AI_EFFORT: { filesAgent: 'medium' } }))
// As the gate does: the SDK client, metered (lib/ai/metered-client.ts) for the scope it was asked for.
vi.mock('@/lib/ai/guarded-client', async () => {
    const { meteredClient } = await import('@/lib/ai/metered-client')
    return {
        getGuardedAnthropic: async (scope: { firmId?: string | null; userId?: string | null; feature: 'filesAgent' }) =>
            meteredClient({ messages: { create } } as never, { groupId: 'g1', ...scope }),
    }
})
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: record }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import Anthropic from '@anthropic-ai/sdk'
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
    record.mockClear()
})

describe('runFilesReview', () => {
    it('a failed model turn is reported, and the findings still come back', async () => {
        create.mockRejectedValue(Anthropic.APIError.generate(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers()))
        const result = await runFilesReview({ nodes: NODES, rootId: 'R', scope, vault: null })
        expect(result).not.toBeNull()
        expect(result!.modelFailed).toBe(true)
        expect(result!.findings.length).toBeGreaterThan(0)
        expect(result!.proposals).toHaveLength(0)
        // A turn the API turned away is still a row, so the failure shows, with nothing charged.
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', feature: 'filesAgent', status: 'rejected', inputTokens: 0, outputTokens: 0, estimated: false,
        }))
    })

    it('a turn that answers is not marked failed', async () => {
        create.mockResolvedValue({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } })
        const result = await runFilesReview({ nodes: NODES, rootId: 'R', scope, vault: null })
        expect(result!.modelFailed).toBe(false)
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', feature: 'filesAgent', inputTokens: 10, outputTokens: 5, status: 'ok' }))
    })

    it('a declined turn is reported as failed', async () => {
        create.mockResolvedValue({ content: [], stop_reason: 'refusal', usage: { input_tokens: 10, output_tokens: 0 } })
        const result = await runFilesReview({ nodes: NODES, rootId: 'R', scope, vault: null })
        expect(result!.modelFailed).toBe(true)
    })

    it('a truncated turn continues with a tool result for every call, then the instruction', async () => {
        const toolUse = (id: string) => ({
            type: 'tool_use', id, name: 'propose_renames',
            input: { renames: [{ externalId: 'f2', proposedName: 'Report-v2.docx', reason: 'copy suffix' }] },
        })
        create
            .mockResolvedValueOnce({
                content: [toolUse('call_1'), toolUse('call_2')],
                stop_reason: 'max_tokens',
                usage: { input_tokens: 10, output_tokens: 5 },
            })
            .mockResolvedValueOnce({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } })

        const result = await runFilesReview({ nodes: NODES, rootId: 'R', scope, vault: null })

        expect(create).toHaveBeenCalledTimes(2)
        const second = create.mock.calls[1][0]
        const last = second.messages[second.messages.length - 1]
        expect(last.role).toBe('user')
        expect(Array.isArray(last.content)).toBe(true)
        // Every tool call answered, in order, before the instruction: the API refuses anything else.
        expect(last.content.slice(0, 2).map((b: { type: string; tool_use_id: string }) => [b.type, b.tool_use_id]))
            .toEqual([['tool_result', 'call_1'], ['tool_result', 'call_2']])
        expect(last.content[2].type).toBe('text')
        expect(result!.modelFailed).toBe(false)
    })
})
