import { describe, it, expect, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { maskingClient } from './masked-client'
import { buildVault } from './pseudonymize'

/**
 * The client every Brio call gets: placeholders on the way out, the real words on the way back. The model
 * is a stub that records what it was sent and answers in placeholders; nothing reaches Anthropic.
 */

const vault = buildVault([
    { kind: 'person', id: 'user-dana', name: 'Dana Whitfield' },
    { kind: 'client', id: 'client-acme', name: 'Acme Robotics' },
])
const DANA = vault.tokenOf('person', 'user-dana')!
const ACME = vault.tokenOf('client', 'client-acme')!

function stubClient(answer: (params: Record<string, unknown>) => unknown) {
    const sent: Array<Record<string, unknown>> = []
    const create = vi.fn(async (params: Record<string, unknown>) => {
        sent.push(params)
        return answer(params)
    })
    const client = { messages: { create, countTokens: vi.fn() }, apiKey: 'test' } as unknown as Anthropic
    return { client, sent, create }
}

describe('maskingClient', () => {
    it('sends placeholders, never the names, and answers with the real words, in text and in tool calls', async () => {
        const { client, sent } = stubClient(() => ({
            id: 'm1', role: 'assistant', stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 },
            content: [
                { type: 'thinking', thinking: 'ok', signature: 'sig' },
                { type: 'text', text: `${DANA} at ${ACME} will send it.` },
                { type: 'tool_use', id: 't1', name: 'record', input: { reminders: [{ title: `Check ${DANA} sent the K-1`, quote: `${DANA}: by Friday, to [EMAIL_1]` }] } },
            ],
        }))
        const masked = maskingClient(client, vault)
        const answer = await masked.messages.create({
            model: 'm', max_tokens: 10,
            system: [{ type: 'text', text: 'You read notes for Acme Robotics.', cache_control: { type: 'ephemeral' } }],
            messages: [
                { role: 'user', content: 'Dana Whitfield: by Friday, to dana@acme.com' },
                { role: 'assistant', content: [{ type: 'tool_use', id: 't0', name: 'lookup', input: { who: 'Dana Whitfield' } }] },
                { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't0', content: 'Dana Whitfield is the CFO of Acme Robotics' }] },
            ],
        } as never) as Anthropic.Message

        const out = JSON.stringify(sent[0])
        expect(out).not.toMatch(/Dana|Whitfield|Acme|dana@acme\.com/)
        expect(out).toContain(`You read notes for ${ACME}.`)
        // The prompt cache marker stays where it was.
        expect((sent[0].system as Array<Record<string, unknown>>)[0].cache_control).toEqual({ type: 'ephemeral' })

        expect(answer.content[0]).toEqual({ type: 'thinking', thinking: 'ok', signature: 'sig' })
        expect(answer.content[1]).toEqual({ type: 'text', text: 'Dana Whitfield at Acme Robotics will send it.' })
        expect((answer.content[2] as Anthropic.ToolUseBlock).input).toEqual({
            reminders: [{ title: 'Check Dana Whitfield sent the K-1', quote: 'Dana Whitfield: by Friday, to dana@acme.com' }],
        })
    })

    it('a stream: text comes back whole even when a placeholder is split across deltas, and it can still be stopped', async () => {
        const controller = new AbortController()
        const deltas = ['Ask ', DANA.slice(0, 5), DANA.slice(5), ' at ', ACME, ' today.']
        const { client } = stubClient(() => ({
            controller,
            async *[Symbol.asyncIterator]() {
                yield { type: 'message_start', message: { usage: { input_tokens: 3 } } }
                yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
                for (const text of deltas) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }
                yield { type: 'content_block_stop', index: 0 }
                yield { type: 'message_delta', usage: { output_tokens: 7 } }
            },
        }))
        const stream = await maskingClient(client, vault).messages.create({ model: 'm', max_tokens: 10, stream: true, messages: [{ role: 'user', content: 'Dana Whitfield?' }] } as never) as unknown as AsyncIterable<Record<string, unknown>> & { controller: AbortController }
        expect(stream.controller).toBe(controller)
        let text = ''
        const types: string[] = []
        for await (const event of stream) {
            types.push(event.type as string)
            const delta = event.delta as { type?: string; text?: string } | undefined
            if (event.type === 'content_block_delta' && delta?.type === 'text_delta') text += delta.text
        }
        expect(text).toBe('Ask Dana Whitfield at Acme Robotics today.')
        expect(types[0]).toBe('message_start')
        expect(types[types.length - 1]).toBe('message_delta')
    })

    it('every other part of the client is the client itself', () => {
        const { client } = stubClient(() => ({}))
        const masked = maskingClient(client, vault)
        expect((masked as unknown as { apiKey: string }).apiKey).toBe('test')
        expect(masked.messages.countTokens).toBe(client.messages.countTokens)
    })
})
