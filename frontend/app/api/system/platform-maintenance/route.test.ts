import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Turning platform maintenance on tells the admin how many were emailed ("sent to 40 of 42") and
 * what didn't happen, and a failed save says why instead of a bare 500.
 */

const { setConfig, notify, send } = vi.hoisted(() => ({
    setConfig: vi.fn(async () => {}),
    notify: vi.fn(),
    send: vi.fn(async () => true),
}))
vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin', email: 'ops@firma.test' } } }) } }),
}))
vi.mock('@/lib/system/user-data-map', () => ({ isSysAdminUser: async () => true }))
vi.mock('@/lib/platform-maintenance', () => ({
    getPlatformMaintenanceConfig: vi.fn(async () => ({ active: true })),
    setPlatformMaintenanceConfig: setConfig,
    notifyPlatformMaintenance: notify,
}))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: send }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { POST } from './route'

const post = (action: string) =>
    POST(new NextRequest('http://localhost/api/system/platform-maintenance', { method: 'POST', body: JSON.stringify({ action }) }))

beforeEach(() => {
    setConfig.mockReset()
    setConfig.mockResolvedValue(undefined)
    notify.mockReset()
    notify.mockResolvedValue({ emails: { sent: 40, total: 42 }, problem: null })
    send.mockReset()
    send.mockResolvedValue(true)
})

describe('POST /api/system/platform-maintenance', () => {
    it('enable: answers how many were emailed', async () => {
        const body = await (await post('enable')).json()
        expect(body).toMatchObject({ ok: true, emails: { sent: 40, total: 42 } })
        expect(body.warning).toBeUndefined()
    })

    it('enable: says so when the background job didn’t start', async () => {
        send.mockResolvedValue(false)
        const body = await (await post('enable')).json()
        expect(body.ok).toBe(true)
        expect(body.warning).toMatch(/The background job didn't start/)
    })

    it('disable after maintenance: the "complete" emails are counted too', async () => {
        notify.mockResolvedValue({ emails: { sent: 3, total: 3 }, problem: "The in-app notice wasn't posted." })
        const body = await (await post('disable')).json()
        expect(body).toMatchObject({ ok: true, emails: { sent: 3, total: 3 }, warning: "The in-app notice wasn't posted." })
    })

    it('a failed save says why', async () => {
        setConfig.mockRejectedValue(new Error('connection pool timeout'))
        const res = await post('enable')
        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe("Couldn't turn maintenance on · connection pool timeout")
        expect(notify).not.toHaveBeenCalled()
    })
})
