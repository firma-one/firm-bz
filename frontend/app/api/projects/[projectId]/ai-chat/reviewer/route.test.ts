import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Brio for Reviewers: who may ask, when, and how often. The model is mocked.
 */

const st = vi.hoisted(() => ({
    member: { role: 'eng_viewer' } as { role: string } | null,
    enabled: true,
    used: 0,
}))
const { create, meter } = vi.hoisted(() => ({ create: vi.fn(), meter: vi.fn(async () => {}) }))

// Masking has its own tests (lib/ai/pseudonymize, masked-client, known-entities): no vault here.
vi.mock('@/lib/ai/known-entities', () => ({ vaultForEngagement: async () => null, vaultForFirms: async () => null }))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'dana' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/engagement-access', () => ({
    requireEngagementMember: async () => st.member,
    isExternalEngagementRole: (r: string) => r === 'eng_viewer' || r === 'eng_ext_collaborator',
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({ isAiConfigured: () => true, AI_MODEL: 'm', AI_EFFORT: { chat: 'low' } }))
vi.mock('@/lib/ai/guarded-client', () => ({
    getGuardedAnthropic: async () => ({ messages: { create } }),
    meterAiCall: meter,
    aiFailureResponse: (_e: unknown, words: string) => Response.json({ error: words }, { status: 500 }),
}))
vi.mock('@/lib/ai/reviewer-brio', () => ({
    REVIEWER_DAILY_ANSWERS: 10,
    reviewerBrioEnabled: async () => st.enabled,
    reviewerAnswersToday: async () => st.used,
}))
vi.mock('@/lib/ai/reviewer-context', () => ({
    REVIEWER_CHAT_SYSTEM_PROMPT: 'system',
    buildReviewerContext: () => 'facts',
    loadReviewerView: async () => ({ engagementName: 'E', roleName: 'Reviewer', summary: null, deliverables: [], waiting: [] }),
}))

import { POST } from './route'

const post = (body: unknown = { question: 'What is with me?' }) => POST(
    new NextRequest('http://localhost/api/projects/p1/ai-chat/reviewer', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ projectId: 'p1' }) },
)

beforeEach(() => {
    st.member = { role: 'eng_viewer' }
    st.enabled = true
    st.used = 0
    create.mockReset()
    meter.mockClear()
    create.mockResolvedValue({
        async *[Symbol.asyncIterator]() {
            yield { type: 'message_start', message: { usage: { input_tokens: 10 } } }
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'QSR-9 is with you.' } }
            yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }
        },
    })
})

describe('POST /api/projects/[projectId]/ai-chat/reviewer', () => {
    it('answers a Reviewer from their own facts, and meters it', async () => {
        const res = await post()
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('QSR-9 is with you.')
        expect(meter).toHaveBeenCalledTimes(1)
        expect(create.mock.calls[0][0].system[0].text).toContain('facts')
    })

    it('refuses firm roles: they have the wider engagement chat, and this one must never be it', async () => {
        st.member = { role: 'eng_admin' }
        expect((await post()).status).toBe(403)
        expect(create).not.toHaveBeenCalled()
    })

    it('refuses everyone until the firm turns it on', async () => {
        st.enabled = false
        expect((await post()).status).toBe(403)
        expect(create).not.toHaveBeenCalled()
    })

    it('stops at the daily cap, before any tokens are spent, and says so', async () => {
        st.used = 10
        const res = await post()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toMatch(/10 questions today/)
        expect(create).not.toHaveBeenCalled()
    })

    it('a non-member is not found', async () => {
        st.member = null
        expect((await post()).status).toBe(404)
    })

    it('a question is required', async () => {
        expect((await post({ question: '  ' })).status).toBe(400)
    })
})
