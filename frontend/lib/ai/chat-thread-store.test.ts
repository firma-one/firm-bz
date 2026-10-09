import { describe, it, expect, beforeEach } from 'vitest'
import { readThread, writeThread, clearThread, MAX_STORED_TURNS } from './chat-thread-store'

const msg = (role: 'user' | 'assistant', content: string, at = 1_700_000_000_000) =>
    ({ role, content, at })

beforeEach(() => sessionStorage.clear())

describe('chat thread persistence', () => {
    it('round-trips a thread', () => {
        writeThread('eng-1', 'files', [msg('user', 'Which are duplicates?'), msg('assistant', 'Two.')])
        expect(readThread('eng-1', 'files').map((m) => m.content))
            .toEqual(['Which are duplicates?', 'Two.'])
    })

    /** Overview and Files hold different conversations about the same engagement. */
    it('keeps a separate thread per surface', () => {
        writeThread('eng-1', 'files', [msg('user', 'files question')])
        writeThread('eng-1', 'overview', [msg('user', 'overview question')])
        expect(readThread('eng-1', 'files')[0].content).toBe('files question')
        expect(readThread('eng-1', 'overview')[0].content).toBe('overview question')
    })

    it('keeps a separate thread per engagement', () => {
        writeThread('eng-1', 'files', [msg('user', 'first')])
        writeThread('eng-2', 'files', [msg('user', 'second')])
        expect(readThread('eng-1', 'files')[0].content).toBe('first')
        expect(readThread('eng-2', 'files')[0].content).toBe('second')
    })

    it('returns nothing for a thread never written', () => {
        expect(readThread('eng-never', 'files')).toEqual([])
    })

    /** The time each turn was produced drives the relative timestamp on restore. */
    it('preserves the timestamp', () => {
        writeThread('eng-1', 'files', [msg('user', 'q', 1_234_567_890)])
        expect(readThread('eng-1', 'files')[0].at).toBe(1_234_567_890)
    })

    it('keeps the most recent turns when over the cap', () => {
        const many = Array.from({ length: MAX_STORED_TURNS + 10 }, (_, i) => msg('user', `q${i}`))
        writeThread('eng-1', 'files', many)
        const stored = readThread('eng-1', 'files')
        expect(stored).toHaveLength(MAX_STORED_TURNS)
        expect(stored[stored.length - 1].content).toBe(`q${MAX_STORED_TURNS + 9}`)
    })

    /** An empty turn is a message still being streamed, not a settled one. */
    it('drops empty turns', () => {
        writeThread('eng-1', 'files', [msg('user', 'real'), msg('assistant', '   ')])
        expect(readThread('eng-1', 'files')).toHaveLength(1)
    })

    it('clears the store when nothing is left to keep', () => {
        writeThread('eng-1', 'files', [msg('user', 'real')])
        writeThread('eng-1', 'files', [])
        expect(readThread('eng-1', 'files')).toEqual([])
    })

    it('truncates an answer too long to be worth its quota', () => {
        writeThread('eng-1', 'files', [msg('assistant', 'x'.repeat(20_000))])
        const stored = readThread('eng-1', 'files')[0]
        expect(stored.content.length).toBeLessThan(20_000)
        expect(stored.content.endsWith('…')).toBe(true)
    })

    it('clears on request', () => {
        writeThread('eng-1', 'files', [msg('user', 'q')])
        clearThread('eng-1', 'files')
        expect(readThread('eng-1', 'files')).toEqual([])
    })

    /** This survives deploys, so an older or hand-edited shape must not crash the panel. */
    it('ignores malformed stored data', () => {
        sessionStorage.setItem('fm_chat_thread_files_eng-1', '{"not":"an array"}')
        expect(readThread('eng-1', 'files')).toEqual([])

        sessionStorage.setItem('fm_chat_thread_files_eng-1', 'not json at all')
        expect(readThread('eng-1', 'files')).toEqual([])
    })

    it('drops entries with a wrong shape but keeps the good ones', () => {
        sessionStorage.setItem('fm_chat_thread_files_eng-1', JSON.stringify([
            { role: 'user', content: 'good', at: 1 },
            { role: 'robot', content: 'bad role', at: 1 },
            { role: 'user', at: 1 },
            { role: 'user', content: 'no timestamp' },
        ]))
        expect(readThread('eng-1', 'files').map((m) => m.content)).toEqual(['good'])
    })
})
