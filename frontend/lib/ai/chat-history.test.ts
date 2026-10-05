import { describe, it, expect, beforeEach } from 'vitest'
import {
    getChatHistory,
    recordChatQuestion,
    clearChatHistory,
    CHAT_HISTORY_MAX,
} from './chat-history'

const ENGAGEMENT = 'eng-1'

beforeEach(() => {
    localStorage.clear()
})

describe('chat history', () => {
    it('starts empty and records a question', () => {
        expect(getChatHistory(ENGAGEMENT)).toEqual([])
        recordChatQuestion(ENGAGEMENT, "What's overdue?")
        expect(getChatHistory(ENGAGEMENT).map((e) => e.question)).toEqual(["What's overdue?"])
    })

    it('keeps history separate per engagement', () => {
        recordChatQuestion('eng-a', 'Question A')
        recordChatQuestion('eng-b', 'Question B')
        expect(getChatHistory('eng-a').map((e) => e.question)).toEqual(['Question A'])
        expect(getChatHistory('eng-b').map((e) => e.question)).toEqual(['Question B'])
    })

    it('newest first', () => {
        recordChatQuestion(ENGAGEMENT, 'First')
        recordChatQuestion(ENGAGEMENT, 'Second')
        expect(getChatHistory(ENGAGEMENT).map((e) => e.question)).toEqual(['Second', 'First'])
    })

    /** A recall list showing the same question three times is worse than useless. */
    it('moves a repeated question to the top instead of duplicating it', () => {
        recordChatQuestion(ENGAGEMENT, 'Repeated')
        recordChatQuestion(ENGAGEMENT, 'Other')
        recordChatQuestion(ENGAGEMENT, 'Repeated')
        expect(getChatHistory(ENGAGEMENT).map((e) => e.question)).toEqual(['Repeated', 'Other'])
    })

    it('treats case and surrounding space as the same question', () => {
        recordChatQuestion(ENGAGEMENT, "What's overdue?")
        recordChatQuestion(ENGAGEMENT, "  what's OVERDUE?  ")
        expect(getChatHistory(ENGAGEMENT)).toHaveLength(1)
    })

    it('caps the list', () => {
        for (let i = 0; i < CHAT_HISTORY_MAX + 5; i += 1) recordChatQuestion(ENGAGEMENT, `Q${i}`)
        const out = getChatHistory(ENGAGEMENT)
        expect(out).toHaveLength(CHAT_HISTORY_MAX)
        expect(out[0].question).toBe(`Q${CHAT_HISTORY_MAX + 4}`)
    })

    it('ignores blank questions', () => {
        recordChatQuestion(ENGAGEMENT, '   ')
        expect(getChatHistory(ENGAGEMENT)).toEqual([])
    })

    it('clears', () => {
        recordChatQuestion(ENGAGEMENT, 'Something')
        clearChatHistory(ENGAGEMENT)
        expect(getChatHistory(ENGAGEMENT)).toEqual([])
    })

    /** This data outlives deploys, so an older or hand-edited shape must not crash the panel. */
    it('survives corrupt or foreign stored data', () => {
        localStorage.setItem(`fm_engagement_chat_history_${ENGAGEMENT}`, 'not json')
        expect(getChatHistory(ENGAGEMENT)).toEqual([])

        localStorage.setItem(`fm_engagement_chat_history_${ENGAGEMENT}`, '{"not":"an array"}')
        expect(getChatHistory(ENGAGEMENT)).toEqual([])

        localStorage.setItem(
            `fm_engagement_chat_history_${ENGAGEMENT}`,
            JSON.stringify([{ question: 'Valid', askedAt: 1 }, { nope: true }, { question: '', askedAt: 2 }]),
        )
        expect(getChatHistory(ENGAGEMENT).map((e) => e.question)).toEqual(['Valid'])
    })
})
