import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    listConversations,
    saveConversation,
    getConversation,
    deleteConversation,
    setConversationPinned,
    clearConversations,
    deriveTitle,
    MAX_CONVERSATIONS,
    MAX_AGE_DAYS,
    MAX_STORED_TURNS,
    MAX_TITLE_CHARS,
    MAX_PINNED,
    type StoredMessage,
} from './chat-conversations'

const ENGAGEMENT = 'eng-1'
const SURFACE = 'overview'

const turn = (role: 'user' | 'assistant', content: string, at = Date.now()): StoredMessage =>
    ({ role, content, at })

const exchange = (question: string, answer = 'An answer.'): StoredMessage[] =>
    [turn('user', question), turn('assistant', answer)]

beforeEach(() => {
    localStorage.clear()
})

describe('deriveTitle', () => {
    it('uses the question as written when it fits', () => {
        expect(deriveTitle('Which documents need a due date?'))
            .toBe('Which documents need a due date?')
    })

    it('collapses whitespace', () => {
        expect(deriveTitle('  Which   documents\nneed dates? ')).toBe('Which documents need dates?')
    })

    it('truncates on a word boundary', () => {
        const long = 'Which of the supporting documents under the market intelligence deliverable lack owners'
        const title = deriveTitle(long)
        expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1)
        expect(title.endsWith('…')).toBe(true)
        // Not cut mid-word.
        expect(title.slice(0, -1).trimEnd().split(' ').pop()).not.toBe('docum')
    })

    it('falls back for an empty question', () => {
        expect(deriveTitle('   ')).toBe('Untitled')
    })
})

describe('conversations', () => {
    it('starts empty, then creates one titled from the first question', () => {
        expect(listConversations(ENGAGEMENT, SURFACE)).toEqual([])

        const id = saveConversation(ENGAGEMENT, SURFACE, null, exchange('Which docs lack dates?'))
        expect(id).toBeTruthy()

        const list = listConversations(ENGAGEMENT, SURFACE)
        expect(list).toHaveLength(1)
        expect(list[0].title).toBe('Which docs lack dates?')
        expect(list[0].messages).toHaveLength(2)
    })

    it('keeps the original title as the conversation grows', () => {
        const id = saveConversation(ENGAGEMENT, SURFACE, null, exchange('First question?'))
        saveConversation(ENGAGEMENT, SURFACE, id, [
            ...exchange('First question?'),
            ...exchange('A completely different follow-up?'),
        ])

        const list = listConversations(ENGAGEMENT, SURFACE)
        expect(list).toHaveLength(1)
        // Retitling mid-conversation would rename a thread under the user as they used it.
        expect(list[0].title).toBe('First question?')
        expect(list[0].messages).toHaveLength(4)
    })

    it('reopens a conversation by id', () => {
        const id = saveConversation(ENGAGEMENT, SURFACE, null, exchange('Recall me'))!
        const found = getConversation(ENGAGEMENT, SURFACE, id)
        expect(found?.messages.map((m) => m.content)).toEqual(['Recall me', 'An answer.'])
        expect(getConversation(ENGAGEMENT, SURFACE, 'nope')).toBeNull()
    })

    it('orders newest-updated first', () => {
        const a = saveConversation(ENGAGEMENT, SURFACE, null, [turn('user', 'A', 1000), turn('assistant', 'x', 1000)])
        saveConversation(ENGAGEMENT, SURFACE, null, [turn('user', 'B', 2000), turn('assistant', 'x', 2000)])
        // Touching A moves it to the top.
        saveConversation(ENGAGEMENT, SURFACE, a, [turn('user', 'A', 1000), turn('assistant', 'later', 3000)])
        expect(listConversations(ENGAGEMENT, SURFACE).map((c) => c.title)).toEqual(['A', 'B'])
    })

    it('deletes, and deletes by saving an empty thread', () => {
        const id = saveConversation(ENGAGEMENT, SURFACE, null, exchange('Gone soon'))!
        expect(deleteConversation(ENGAGEMENT, SURFACE, id)).toEqual([])

        const id2 = saveConversation(ENGAGEMENT, SURFACE, null, exchange('Also gone'))!
        // An emptied thread must not leave a titled, bodyless entry behind.
        expect(saveConversation(ENGAGEMENT, SURFACE, id2, [])).toBeNull()
        expect(listConversations(ENGAGEMENT, SURFACE)).toEqual([])
    })

    it('trims to the turn cap and drops streaming-empty messages', () => {
        const many: StoredMessage[] = []
        for (let i = 0; i < MAX_STORED_TURNS + 10; i++) many.push(turn('user', `q${i}`))
        many.push(turn('assistant', '   '))
        const id = saveConversation(ENGAGEMENT, SURFACE, null, many)!
        const stored = getConversation(ENGAGEMENT, SURFACE, id)!
        expect(stored.messages).toHaveLength(MAX_STORED_TURNS)
        expect(stored.messages.some((m) => m.content.trim() === '')).toBe(false)
    })
})

describe('caps and ageing', () => {
    it('evicts the oldest past the conversation cap', () => {
        for (let i = 0; i < MAX_CONVERSATIONS + 5; i++) {
            saveConversation(ENGAGEMENT, SURFACE, null, [
                turn('user', `q${i}`, 1000 + i), turn('assistant', 'x', 1000 + i),
            ])
        }
        const list = listConversations(ENGAGEMENT, SURFACE)
        expect(list).toHaveLength(MAX_CONVERSATIONS)
        // The newest survive; q0 is gone.
        expect(list.map((c) => c.title)).not.toContain('q0')
        expect(list.map((c) => c.title)).toContain(`q${MAX_CONVERSATIONS + 4}`)
    })

    it('drops conversations older than the age cap', () => {
        vi.useFakeTimers()
        try {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
            saveConversation(ENGAGEMENT, SURFACE, null, exchange('Ancient'))
            expect(listConversations(ENGAGEMENT, SURFACE)).toHaveLength(1)

            vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + (MAX_AGE_DAYS + 1) * 86400000)
            expect(listConversations(ENGAGEMENT, SURFACE)).toEqual([])
        } finally {
            vi.useRealTimers()
        }
    })

    it('exempts pinned conversations from the age cap', () => {
        vi.useFakeTimers()
        try {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
            const id = saveConversation(ENGAGEMENT, SURFACE, null, exchange('Kept forever'))!
            setConversationPinned(ENGAGEMENT, SURFACE, id, true)

            vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + (MAX_AGE_DAYS + 90) * 86400000)
            const list = listConversations(ENGAGEMENT, SURFACE)
            expect(list.map((c) => c.title)).toEqual(['Kept forever'])
        } finally {
            vi.useRealTimers()
        }
    })

    it('exempts pinned conversations from the count cap', () => {
        const pinnedId = saveConversation(ENGAGEMENT, SURFACE, null, [
            turn('user', 'Pinned one', 1), turn('assistant', 'x', 1),
        ])!
        setConversationPinned(ENGAGEMENT, SURFACE, pinnedId, true)

        for (let i = 0; i < MAX_CONVERSATIONS + 5; i++) {
            saveConversation(ENGAGEMENT, SURFACE, null, [
                turn('user', `filler${i}`, 1000 + i), turn('assistant', 'x', 1000 + i),
            ])
        }
        // The oldest entry in the list survives purely because it is pinned.
        expect(listConversations(ENGAGEMENT, SURFACE).map((c) => c.title)).toContain('Pinned one')
    })

    it('refuses to pin past the pin cap rather than evicting a pin', () => {
        const ids: string[] = []
        for (let i = 0; i < MAX_PINNED + 2; i++) {
            ids.push(saveConversation(ENGAGEMENT, SURFACE, null, [
                turn('user', `p${i}`, 1000 + i), turn('assistant', 'x', 1000 + i),
            ])!)
        }
        for (let i = 0; i < MAX_PINNED; i++) setConversationPinned(ENGAGEMENT, SURFACE, ids[i], true)
        setConversationPinned(ENGAGEMENT, SURFACE, ids[MAX_PINNED], true)

        const pinned = listConversations(ENGAGEMENT, SURFACE).filter((c) => c.pinned)
        expect(pinned).toHaveLength(MAX_PINNED)
        // The first pin was not dropped to make room for the last.
        expect(pinned.map((c) => c.title)).toContain('p0')
    })

    it('clearing keeps pins', () => {
        const keep = saveConversation(ENGAGEMENT, SURFACE, null, exchange('Pinned'))!
        saveConversation(ENGAGEMENT, SURFACE, null, exchange('Unpinned'))
        setConversationPinned(ENGAGEMENT, SURFACE, keep, true)

        clearConversations(ENGAGEMENT, SURFACE)
        expect(listConversations(ENGAGEMENT, SURFACE).map((c) => c.title)).toEqual(['Pinned'])
    })
})

describe('isolation and robustness', () => {
    it('keeps conversations separate per engagement and per surface', () => {
        saveConversation('eng-a', 'overview', null, exchange('A overview'))
        saveConversation('eng-a', 'files', null, exchange('A files'))
        saveConversation('eng-b', 'overview', null, exchange('B overview'))

        expect(listConversations('eng-a', 'overview').map((c) => c.title)).toEqual(['A overview'])
        expect(listConversations('eng-a', 'files').map((c) => c.title)).toEqual(['A files'])
        expect(listConversations('eng-b', 'overview').map((c) => c.title)).toEqual(['B overview'])
    })

    it('survives malformed stored data', () => {
        const key = `fm_chat_conversations_${SURFACE}_${ENGAGEMENT}`
        localStorage.setItem(key, 'not json')
        expect(listConversations(ENGAGEMENT, SURFACE)).toEqual([])

        localStorage.setItem(key, '{"not":"an array"}')
        expect(listConversations(ENGAGEMENT, SURFACE)).toEqual([])

        localStorage.setItem(key, JSON.stringify([
            { id: 'ok', title: 'Fine', messages: [turn('user', 'q')], createdAt: 1, updatedAt: Date.now() },
            { id: '', title: 'No id', messages: [], createdAt: 1, updatedAt: Date.now() },
            { nope: true },
            null,
        ]))
        expect(listConversations(ENGAGEMENT, SURFACE).map((c) => c.title)).toEqual(['Fine'])
    })
})
