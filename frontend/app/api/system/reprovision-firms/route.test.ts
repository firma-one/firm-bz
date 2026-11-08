import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Resume provisioning counts only what really started. No Inngest function listens for its event,
 * so today nothing can start: it says so, and changes no firm, where it used to rewrite each firm's
 * onboarding and report it "queued".
 */

const { firmUpdate, send } = vi.hoisted(() => ({ firmUpdate: vi.fn(), send: vi.fn(async () => true) }))
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }), admin: { getUserById: vi.fn() } } }),
}))
vi.mock('@/lib/system/user-data-map', () => ({ isSysAdminUser: async () => true }))
vi.mock('@/lib/prisma', () => ({ prisma: { firm: { findUnique: vi.fn(), update: firmUpdate } } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: send }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { POST } from './route'

describe('POST /api/system/reprovision-firms', () => {
    it('refuses, says why, and touches no firm, while no job handles the event', async () => {
        const res = await POST(new NextRequest('http://localhost/api/system/reprovision-firms', {
            method: 'POST',
            headers: { authorization: 'Bearer t' },
            body: JSON.stringify({ firmIds: ['00000000-0000-4000-8000-000000000001'] }),
        }))
        expect(res.status).toBe(409)
        const body = await res.json()
        expect(body.code).toBe('no_provision_job')
        expect(body.error).toMatch(/^Nothing was started: no background job handles provisioning/)
        expect(firmUpdate).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })
})
