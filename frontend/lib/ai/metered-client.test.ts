import { describe, it, expect, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Every model call writes exactly one usage row, however it ends (no free calls, 2026-11-19): finished,
 * declined, cut off, broken, stopped, timed out. A call the API turned away spent nothing and is
 * recorded at no charge. The model and the ledger are mocked.
 */

const { record } = vi.hoisted(() => ({ record: vi.fn(async () => ({ credits: 1, costMicros: 1 })) }))
vi.mock('./usage', () => ({ recordAiUsage: record }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { meteredClient, failureOf } from './metered-client'

const scope = { groupId: 'g1', firmId: 'f1', userId: 'u1', feature: 'summary' as const }
const params = { model: 'claude-haiku-5-5', max_tokens: 8000, system: 's', messages: [{ role: 'user', content: 'x'.repeat(400) }] }

function clientWith(create: (...a: unknown[]) => Promise<unknown>): Anthropic {
    return { messages: { create } } as unknown as Anthropic
}

function streamOf(events: unknown[], fail?: Error) {
    const controller = new AbortController()
    return {
        controller,
        async *[Symbol.asyncIterator]() {
            for (const e of events) yield e
            if (fail) throw fail
        },
    }
}

async function drain(stream: AsyncIterable<unknown>) {
    const seen: unknown[] = []
    for await (const e of stream) seen.push(e)
    return seen
}

beforeEach(() => record.mockClear())

describe('meteredClient · a finished call', () => {
    it('records the model’s own counts once, cached input included', async () => {
        const message = { stop_reason: 'end_turn', content: [], usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 50 } }
        const client = meteredClient(clientWith(async () => message), scope)
        expect(await client.messages.create(params as never)).toBe(message)
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', feature: 'summary', inputTokens: 100, cacheReadTokens: 900, outputTokens: 50, status: 'ok', estimated: false,
        }))
    })

    it('charges a decline and a cut-off like any answer, with their stop reason', async () => {
        for (const [stop, status] of [['refusal', 'refused'], ['max_tokens', 'cut_off']] as const) {
            record.mockClear()
            const client = meteredClient(clientWith(async () => ({ stop_reason: stop, content: [], usage: { input_tokens: 10, output_tokens: 8000 } })), scope)
            await client.messages.create(params as never)
            expect(record).toHaveBeenCalledWith(expect.objectContaining({ status, stopReason: stop, outputTokens: 8000 }))
        }
    })
})

describe('meteredClient · a call that throws', () => {
    it('a timeout is charged an estimate, then the error goes on to the caller', async () => {
        const client = meteredClient(clientWith(async () => { throw new Anthropic.APIConnectionTimeoutError() }), scope)
        await expect(client.messages.create(params as never)).rejects.toBeInstanceOf(Anthropic.APIConnectionTimeoutError)
        const row = (record.mock.calls[0] as unknown[])[0] as Record<string, unknown>
        expect(row).toMatchObject({ status: 'timeout', estimated: true })
        expect(row.inputTokens as number).toBeGreaterThan(0)
    })

    it('a call the API turned away (an HTTP error) is recorded with nothing spent', async () => {
        const rejected = Anthropic.APIError.generate(529, { type: 'error', error: { type: 'overloaded_error' } }, 'overloaded', new Headers())
        const client = meteredClient(clientWith(async () => { throw rejected }), scope)
        await expect(client.messages.create(params as never)).rejects.toBe(rejected)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', inputTokens: 0, outputTokens: 0 }))
    })
})

describe('meteredClient · a stream', () => {
    const start = { type: 'message_start', message: { usage: { input_tokens: 3000 } } }
    const text = (t: string) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })
    const end = (stop: string, out: number) => ({ type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: out } })

    it('meters once when it finishes, with the final output count', async () => {
        const client = meteredClient(clientWith(async () => streamOf([start, text('Hi'), end('end_turn', 400)])), scope)
        const stream = await client.messages.create({ ...params, stream: true } as never) as unknown as AsyncIterable<unknown>
        expect(record).not.toHaveBeenCalled()
        expect(await drain(stream)).toHaveLength(3)
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 3000, outputTokens: 400, status: 'ok', estimated: false }))
    })

    it('a stream cut off at the cap is charged as cut off', async () => {
        const client = meteredClient(clientWith(async () => streamOf([start, end('max_tokens', 8000)])), scope)
        await drain(await client.messages.create({ ...params, stream: true } as never) as unknown as AsyncIterable<unknown>)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 'cut_off', outputTokens: 8000 }))
    })

    it('a stream that breaks part-way is charged its input and an estimate of its output', async () => {
        const client = meteredClient(clientWith(async () => streamOf([start, text('x'.repeat(4000))], new Error('stream reset'))), scope)
        const stream = await client.messages.create({ ...params, stream: true } as never) as unknown as AsyncIterable<unknown>
        await expect(drain(stream)).rejects.toThrow('stream reset')
        expect(record).toHaveBeenCalledTimes(1)
        const row = (record.mock.calls[0] as unknown[])[0] as Record<string, unknown>
        expect(row).toMatchObject({ status: 'error', inputTokens: 3000, estimated: true })
        // At least the text it wrote: 4,000 characters is about 1,000 tokens.
        expect(row.outputTokens as number).toBeGreaterThanOrEqual(1000)
    })

    it('a reader who stops early is charged what was spent, once', async () => {
        const client = meteredClient(clientWith(async () => streamOf([start, text('Half'), text(' more'), end('end_turn', 50)])), scope)
        const stream = await client.messages.create({ ...params, stream: true } as never) as unknown as AsyncIterable<unknown>
        for await (const e of stream) { if ((e as { type: string }).type === 'content_block_delta') break }
        expect(record).toHaveBeenCalledTimes(1)
        expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled', inputTokens: 3000, estimated: true }))
    })

    it('keeps the stream’s controller, so it can still be stopped', async () => {
        const inner = streamOf([start])
        const client = meteredClient(clientWith(async () => inner), scope)
        const stream = await client.messages.create({ ...params, stream: true } as never) as unknown as { controller: AbortController }
        expect(stream.controller).toBe(inner.controller)
    })
})

describe('failureOf', () => {
    it('tells a stop, a timeout and a turned-away call apart', () => {
        expect(failureOf(new Anthropic.APIUserAbortError())).toEqual({ status: 'cancelled', spent: true })
        expect(failureOf(new Anthropic.APIConnectionTimeoutError())).toEqual({ status: 'timeout', spent: true })
        expect(failureOf(Anthropic.APIError.generate(400, {}, 'bad', new Headers()))).toEqual({ status: 'rejected', spent: false })
        expect(failureOf(new Error('masking failed'))).toEqual({ status: 'error', spent: true })
    })
})
