import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The draft stream every "Brio draft" surface uses: complete drafts arrive as `done`, anything a
 * person should not send (declined, cut off, broken) arrives as `error` in the surface's words, and
 * every call that spent tokens is metered exactly once. The model is mocked.
 */

const { meter } = vi.hoisted(() => ({ meter: vi.fn(async () => {}) }))
vi.mock('./client', () => ({ AI_MODEL: 'test-model' }))
vi.mock('./guarded-client', () => ({ meterAiCall: meter }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { streamDraft } from './stream-draft'

const scope = { firmId: 'f1', userId: 'u1', feature: 'replyDraft' as const }

function clientYielding(events: unknown[], fail?: Error) {
    const create = vi.fn(async (_params: Record<string, unknown>) => ({
        controller: { abort: vi.fn() },
        async *[Symbol.asyncIterator]() {
            for (const e of events) yield e
            if (fail) throw fail
        },
    }))
    return { client: { messages: { create } } as never, create }
}

async function lines(res: Response) {
    return (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
}

const run = (client: never) => streamDraft({
    client, scope, system: 's', user: 'u', effort: 'low', maxTokens: 1000,
    failure: 'Brio couldn’t write a draft. Try again.', label: 'test',
})

beforeEach(() => meter.mockClear())

describe('streamDraft', () => {
    it('streams the draft, then the whole text, and meters once', async () => {
        const { client, create } = clientYielding([
            { type: 'message_start', message: { usage: { input_tokens: 100 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Dana.' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } },
        ])
        const out = await lines(await run(client))
        expect(out.map((l) => l.type)).toEqual(['meta', 'delta', 'delta', 'done'])
        expect(out[3].text).toBe('Hi Dana.')
        expect(meter).toHaveBeenCalledTimes(1)
        expect(meter).toHaveBeenCalledWith(scope, { inputTokens: 100, outputTokens: 20 })
        // No sampling parameters: Haiku 5.5 refuses them.
        expect(create.mock.calls[0][0]).not.toHaveProperty('temperature')
    })

    it('a declined draft is an error, never a draft to send', async () => {
        const { client } = clientYielding([
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Part' } },
            { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 2 } },
        ])
        const out = await lines(await run(client))
        expect(out.at(-1)).toEqual({ type: 'error', message: 'Brio couldn’t write a draft. Try again.' })
    })

    it('a draft cut off at the cap is an error', async () => {
        const { client } = clientYielding([
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Half' } },
            { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 2 } },
        ])
        const out = await lines(await run(client))
        expect(out.at(-1)?.type).toBe('error')
    })

    it('a stream that breaks part-way says so in the surface’s words, and still meters', async () => {
        const { client } = clientYielding([
            { type: 'message_start', message: { usage: { input_tokens: 50 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Half a ' } },
        ], new Error('stream reset'))
        const out = await lines(await run(client))
        expect(out.map((l) => l.type)).toEqual(['meta', 'delta', 'error'])
        expect(meter).toHaveBeenCalledTimes(1)
    })
})
