import { describe, it, expect } from 'vitest'
import { buildChatTranscript } from './chat-transcript'
import { FOLLOWUP_MARKER } from './engagement-chat'

const AT = new Date('2026-10-05T19:24:00Z')

describe('buildChatTranscript', () => {
    it('returns nothing when there is no conversation', () => {
        expect(buildChatTranscript([])).toBe('')
        expect(buildChatTranscript([{ role: 'assistant', content: '   ' }])).toBe('')
    })

    it('renders questions and answers in order', () => {
        const out = buildChatTranscript([
            { role: 'user', content: "What's overdue?" },
            { role: 'assistant', content: 'Nothing is overdue.' },
            { role: 'user', content: "What's unassigned?" },
            { role: 'assistant', content: 'Four documents.' },
        ], { generatedAt: AT })

        expect(out).toContain("**Q:** What's overdue?")
        expect(out).toContain('Nothing is overdue.')
        expect(out.indexOf("What's overdue?")).toBeLessThan(out.indexOf("What's unassigned?"))
    })

    it('titles the transcript with the engagement and client', () => {
        const out = buildChatTranscript(
            [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }],
            { engagementName: 'Q2 Go-To-Market Positioning', clientName: 'DataSentry', generatedAt: AT },
        )
        expect(out).toContain('# Brio — Q2 Go-To-Market Positioning')
        expect(out).toContain('DataSentry')
    })

    it('falls back to a generic title when names are unavailable', () => {
        const out = buildChatTranscript(
            [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }],
            { generatedAt: AT },
        )
        expect(out).toContain('# Brio — this engagement')
    })

    /** Same reason per-answer Copy parses: the sentinel is internal plumbing. */
    it('strips the follow-up marker and its questions', () => {
        const out = buildChatTranscript([
            { role: 'user', content: 'Q' },
            { role: 'assistant', content: `Four documents.\n${FOLLOWUP_MARKER}\nWho owns them?\nWhat else?` },
        ], { generatedAt: AT })

        expect(out).toContain('Four documents.')
        expect(out).not.toContain(FOLLOWUP_MARKER)
        expect(out).not.toContain('Who owns them?')
    })

    /**
     * The footer is load-bearing, not boilerplate. Answers are true of a moment — a transcript
     * pasted into a client update days later would otherwise state stale figures as current, with
     * nothing in the text to say so.
     */
    it('always carries the staleness footer', () => {
        const out = buildChatTranscript(
            [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }],
            { generatedAt: AT },
        )
        expect(out).toMatch(/Figures may have changed since\.$/)
    })

    /** Exporting mid-stream would leave a question with a blank answer beneath it. */
    it('skips the empty assistant turn while a reply is still streaming', () => {
        const out = buildChatTranscript([
            { role: 'user', content: 'First?' },
            { role: 'assistant', content: 'Done.' },
            { role: 'user', content: 'Second?' },
            { role: 'assistant', content: '' },
        ], { generatedAt: AT })

        expect(out).toContain('**Q:** Second?')
        // The unanswered question is the last thing before the footer — no empty answer block,
        // and the question itself is kept so the transcript does not silently drop it.
        expect(out).toMatch(/\*\*Q:\*\* Second\?\n\n---/)
        expect(out).toContain('Done.')
    })
})
