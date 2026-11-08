import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * "Rewrite with Brio" streams: the brief is sent as Brio writes it and saved only once complete.
 */

const { stream, firmUpdate, creditCap, LimitError } = vi.hoisted(() => {
    class LimitError extends Error {
        kind = 'period' as const
        limit = 500
        used = 500
    }
    return {
        stream: vi.fn(),
        firmUpdate: vi.fn(async () => ({})),
        creditCap: vi.fn(async () => {}),
        LimitError,
    }
})

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/user-settings-plus', () => ({ userSettingsPlus: { getUserSettingsPlus: async () => ({ permissions: {} }) } }))
vi.mock('@/lib/permission-helpers', () => ({ findFirmInPermissions: () => ({ id: 'f1', scopes: { firm: ['can_manage'] } }) }))
vi.mock('@/lib/ai/client', () => ({ isAiConfigured: () => true }))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: creditCap, AiCreditLimitError: LimitError }))
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({
    prisma: { firm: { findUnique: async () => ({ settings: { theme: 'kept' } }), update: firmUpdate } },
}))
vi.mock('@/lib/ai/firm-brief', () => ({
    generateFirmBrief: vi.fn(),
    isBriefFresh: () => false,
    briefFingerprint: () => 'fp-now',
    streamFirmBrief: stream,
}))

import { GET, POST } from './route'

const post = (query = '?stream=1') =>
    POST(new NextRequest(`http://localhost/api/firms/f1/ai-brief${query}`, { method: 'POST' }), { params: Promise.resolve({ firmId: 'f1' }) })

/** The NDJSON lines of a response. */
async function lines(res: Response) {
    const text = await res.text()
    return text.trim().split('\n').map((l) => JSON.parse(l))
}

beforeEach(() => {
    stream.mockReset()
    creditCap.mockReset()
    creditCap.mockResolvedValue(undefined)
    firmUpdate.mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ activeEngagements: 1 }) })))
})

describe('POST /api/firms/[firmId]/ai-brief?stream=1', () => {
    it('streams the brief as it is written, then saves it', async () => {
        stream.mockImplementation(async (_d: unknown, _m: unknown, onDelta: (t: string) => void) => {
            onDelta('## Where things stand\n')
            onDelta('All quiet.')
            return '## Where things stand\nAll quiet.'
        })
        const res = await post()
        expect(res.headers.get('content-type')).toBe('application/x-ndjson')
        const out = await lines(res)
        expect(out.map((l) => l.type)).toEqual(['meta', 'delta', 'delta', 'done'])
        expect(out[3].brief.content).toBe('## Where things stand\nAll quiet.')
        // Saved alongside the firm's other settings, which it keeps.
        expect(firmUpdate).toHaveBeenCalledWith({
            where: { id: 'f1' },
            data: { settings: { theme: 'kept', aiBrief: expect.objectContaining({ content: '## Where things stand\nAll quiet.', fingerprint: 'fp-now' }) } },
        })
    })

    it('saves nothing when the rewrite fails, and says so in Brio’s words', async () => {
        stream.mockResolvedValue(null)
        const out = await lines(await post())
        expect(out.map((l) => l.type)).toEqual(['meta', 'error'])
        expect(out[1].message).toBe("Brio couldn't write a new brief. Try again.")
        expect(firmUpdate).not.toHaveBeenCalled()
    })

    it('answers the credit limit in its own words, before any writing', async () => {
        creditCap.mockRejectedValue(new LimitError("You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more."))
        const res = await post()
        expect(res.status).toBe(429)
        expect((await res.json()).error).toBe("You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more.")
        expect(stream).not.toHaveBeenCalled()
    })

    it('says Brio couldn’t read its data when the insights fail to load', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
        const res = await post()
        expect(res.status).toBe(502)
        expect((await res.json()).error).toBe("Brio couldn't read the data it works from. Try again.")
    })
})

describe('GET /api/firms/[firmId]/ai-brief', () => {
    const get = () =>
        GET(new NextRequest('http://localhost/api/firms/f1/ai-brief'), { params: Promise.resolve({ firmId: 'f1' }) })

    it('with no brief to fall back on, says why there is none rather than answering an empty brief', async () => {
        creditCap.mockRejectedValue(new LimitError("You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more."))
        const body = await (await get()).json()
        expect(body.brief).toBeNull()
        expect(body.reason).toBe("You have used this month's 500 AI credits. They refill on Dec 1. Upgrade your plan for more.")
    })
})
