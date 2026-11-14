import type Anthropic from '@anthropic-ai/sdk'
import type { MaskSession, Vault } from './pseudonymize'

/**
 * The model client every Brio call gets (lib/ai/guarded-client.ts), with placeholders on the way out and
 * the real words on the way back (lib/ai/pseudonymize.ts, §14 item 5). One `messages.create` is one mask
 * session:
 *
 * - Sent, masked: the system prompt, every message's text, tool results, and earlier tool calls sent back.
 *   Tool definitions aren't (they're ours), and neither are thinking blocks, which must go back as given.
 * - Back, unmasked: text and tool-call input, and streamed text as it arrives (a placeholder split across
 *   deltas is held until it closes, then put back whole). A stream keeps its `controller`, so it can still
 *   be stopped.
 *
 * Callers change nothing but asking with a vault: they see real words in and real words out.
 */

type Block = Record<string, unknown> & { type?: string }

function maskBlock(block: Block, session: MaskSession): Block {
    switch (block.type) {
        case 'text':
            return { ...block, text: session.mask(String(block.text ?? '')) }
        case 'tool_result':
            return {
                ...block,
                content: typeof block.content === 'string'
                    ? session.mask(block.content)
                    : Array.isArray(block.content) ? (block.content as Block[]).map((b) => maskBlock(b, session)) : block.content,
            }
        case 'tool_use':
            return { ...block, input: session.maskDeep(block.input) }
        default:
            // Thinking must go back exactly as it came; images and documents aren't text.
            return block
    }
}

function maskContent(content: unknown, session: MaskSession): unknown {
    if (typeof content === 'string') return session.mask(content)
    if (Array.isArray(content)) return (content as Block[]).map((b) => maskBlock(b, session))
    return content
}

/** The request as the model sees it. */
export function maskParams<P extends { system?: unknown; messages?: unknown }>(params: P, session: MaskSession): P {
    const messages = Array.isArray(params.messages)
        ? (params.messages as Array<Record<string, unknown>>).map((m) => ({ ...m, content: maskContent(m.content, session) }))
        : params.messages
    return { ...params, system: maskContent(params.system, session), messages } as P
}

/** The answer as people see it. */
export function unmaskMessage(message: Anthropic.Message, session: MaskSession): Anthropic.Message {
    const content = (message.content as unknown as Block[]).map((b) => {
        if (b.type === 'text') return { ...b, text: session.unmask(String(b.text ?? '')) }
        if (b.type === 'tool_use') return { ...b, input: session.unmaskDeep(b.input) }
        return b
    })
    return { ...message, content } as unknown as Anthropic.Message
}

type StreamEvent = Record<string, unknown> & { type: string; index?: number; delta?: Record<string, unknown> & { type?: string; text?: string } }

/** A stream of events with its text unmasked as it arrives; its `controller` still stops it. */
export function unmaskStream<S extends AsyncIterable<unknown> & { controller?: AbortController }>(stream: S, session: MaskSession): S {
    async function* events(): AsyncGenerator<unknown> {
        const byBlock = new Map<number, ReturnType<MaskSession['streamUnmasker']>>()
        const unmaskerFor = (index: number) => {
            let u = byBlock.get(index)
            if (!u) {
                u = session.streamUnmasker()
                byBlock.set(index, u)
            }
            return u
        }
        for await (const raw of stream) {
            const event = raw as StreamEvent
            const index = typeof event.index === 'number' ? event.index : 0
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                const text = unmaskerFor(index).push(String(event.delta.text ?? ''))
                if (text) yield { ...event, delta: { ...event.delta, text } }
                continue
            }
            if (event.type === 'content_block_stop') {
                const rest = byBlock.get(index)?.flush()
                if (rest) yield { type: 'content_block_delta', index, delta: { type: 'text_delta', text: rest } }
            }
            yield event
        }
        // A stream that ends without closing its blocks still gives back what was held.
        for (const [index, u] of Array.from(byBlock.entries())) {
            const rest = u.flush()
            if (rest) yield { type: 'content_block_delta', index, delta: { type: 'text_delta', text: rest } }
        }
    }
    const wrapped = { [Symbol.asyncIterator]: () => events(), controller: stream.controller }
    return wrapped as unknown as S
}

/**
 * `client` with every `messages.create` masked through `vault`: the same client in every other way. Any
 * other model call (`messages.stream`, `messages.countTokens`, batches) isn't used by Brio; if one ever is,
 * it must be masked here first.
 */
export function maskingClient(client: Anthropic, vault: Vault): Anthropic {
    const original = client.messages
    const messages = Object.create(original) as Anthropic['messages']
    const create = ((params: Record<string, unknown>, options?: unknown) => {
        const session = vault.session()
        const sent = original.create(maskParams(params, session) as never, options as never)
        return (sent as Promise<unknown>).then((result) => (params.stream
            ? unmaskStream(result as AsyncIterable<unknown> & { controller?: AbortController }, session)
            : unmaskMessage(result as Anthropic.Message, session)))
    }) as unknown as Anthropic['messages']['create']
    Object.defineProperty(messages, 'create', { value: create })
    return new Proxy(client, {
        get(target, prop, receiver) {
            return prop === 'messages' ? messages : Reflect.get(target, prop, receiver)
        },
    })
}
