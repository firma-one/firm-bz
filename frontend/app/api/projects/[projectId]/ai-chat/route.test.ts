import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Brio chat's failure words before the stream starts. During the stream the route fails the
 * stream (see the route), and the panel marks the partial answer as cut off: tested in the panel.
 */

const { creditCap, LimitError, create } = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 500
        used = 500
    }
    return { creditCap: vi.fn(async () => {}), LimitError, create: vi.fn() }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/resolve-project-context', () => ({
    resolveProjectContext: async () => ({ firmId: 'f1', clientId: 'c1', projectId: 'p1' }),
}))
vi.mock('@/lib/permission-helpers', () => ({ canViewProject: async () => true, canViewProjectInternalTabs: async () => true }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/ai/client', () => ({
    isAiConfigured: () => true,
    AI_MODEL: 'test-model',
    getAnthropic: () => ({ messages: { create } }),
}))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: creditCap, AiCreditLimitError: LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/ai/engagement-activity', () => ({ buildEngagementActivity: async () => '' }))
vi.mock('@/lib/ai/files-context', () => ({ loadEngagementFiles: async () => [], buildFilesContext: () => '' }))
vi.mock('@/lib/prisma', () => ({
    prisma: {
        engagement: { findUnique: async () => ({ name: 'Audit', description: null, tags: [], contractType: null, client: { name: 'Acme' } }) },
        engagementDocument: { findMany: async () => [] },
    },
}))

import { POST } from './route'

const ask = () =>
    POST(
        new NextRequest('http://localhost/api/projects/p1/ai-chat', {
            method: 'POST',
            body: JSON.stringify({ question: 'Which deliverables are late?' }),
        }),
        { params: Promise.resolve({ projectId: 'p1' }) },
    )

beforeEach(() => {
    creditCap.mockReset()
    creditCap.mockResolvedValue(undefined)
    create.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ deliverables: [] }) })))
})

describe('POST /api/projects/[projectId]/ai-chat', () => {
    it('the model fails before the stream: Brio’s words, not "Internal server error"', async () => {
        create.mockRejectedValue(new Error('529 overloaded_error'))
        const res = await ask()
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Brio couldn't finish this answer. Try again.")
    })

    it('out of credits: the limit’s own words', async () => {
        creditCap.mockRejectedValue(new LimitError('Too many AI requests in a short time. This usually clears within a few hours.'))
        const res = await ask()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe('Too many AI requests in a short time. This usually clears within a few hours.')
        expect(create).not.toHaveBeenCalled()
    })

    it('the engagement data can’t be read: says so, and never reaches the model', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
        const res = await ask()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Brio couldn't read the data it works from. Try again.")
        expect(create).not.toHaveBeenCalled()
    })
})
