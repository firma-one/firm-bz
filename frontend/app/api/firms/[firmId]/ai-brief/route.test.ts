import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * "Rewrite with Brio" streams: the brief is sent as Brio writes it and saved only once complete.
 */

const { stream, firmUpdate } = vi.hoisted(() => ({
    stream: vi.fn(),
    firmUpdate: vi.fn(async () => ({})),
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/user-settings-plus', () => ({ userSettingsPlus: { getUserSettingsPlus: async () => ({ permissions: {} }) } }))
vi.mock('@/lib/permission-helpers', () => ({ findFirmInPermissions: () => ({ id: 'f1', scopes: { firm: ['can_manage'] } }) }))
vi.mock('@/lib/ai/client', () => ({ isAiConfigured: () => true }))
vi.mock('@/lib/ai/credit-cap', () => ({ assertWithinAiCreditCap: vi.fn(async () => {}), AiCreditLimitError: class extends Error {} }))
vi.mock('@/lib/ai/guarded-client', () => ({ aiLimitResponse: () => null }))
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

import { POST } from './route'

const post = (query = '?stream=1') =>
    POST(new NextRequest(`http://localhost/api/firms/f1/ai-brief${query}`, { method: 'POST' }), { params: Promise.resolve({ firmId: 'f1' }) })

/** The NDJSON lines of a response. */
async function lines(res: Response) {
    const text = await res.text()
    return text.trim().split('\n').map((l) => JSON.parse(l))
}

beforeEach(() => {
    stream.mockReset()
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

    it('saves nothing when the rewrite fails', async () => {
        stream.mockResolvedValue(null)
        const out = await lines(await post())
        expect(out.map((l) => l.type)).toEqual(['meta', 'error'])
        expect(firmUpdate).not.toHaveBeenCalled()
    })
})
