import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { prisma } = vi.hoisted(() => ({
    prisma: { platformConfig: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('@/lib/prisma', () => ({ prisma }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('@/config/brand', () => ({ BRAND_NAME: 'Firma' }))
vi.mock('@/lib/system/admin-check', () => ({ isSystemAdminEmail: vi.fn(() => false) }))

const row = (over: Record<string, unknown> = {}) => ({
    key: 'platform_maintenance',
    value: { active: true, gracePeriod: false, graceEndsAt: null, scheduledFrom: null, scheduledTo: null, message: null, enabledAt: null, disabledAt: null, enabledBy: null, ...over },
})

// The module caches the config row in a module-level variable (see lib/platform-maintenance.ts) —
// reset modules between tests so each test starts from a cold cache, same as a fresh deployment.
beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('getPlatformMaintenanceConfig caching', () => {
    it('serves repeat reads within the TTL from cache, without hitting the DB again', async () => {
        const { getPlatformMaintenanceConfig } = await import('./platform-maintenance')
        prisma.platformConfig.findUnique.mockResolvedValue(row())

        const first = await getPlatformMaintenanceConfig()
        expect(first?.active).toBe(true)
        expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(1)

        // A burst of concurrent readers (middleware on every nav, client polls from many tabs)
        // collapses to the one query above instead of one query per reader.
        await getPlatformMaintenanceConfig()
        await getPlatformMaintenanceConfig()
        expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(1)
    })

    it('re-queries once the TTL has elapsed', async () => {
        const { getPlatformMaintenanceConfig } = await import('./platform-maintenance')
        prisma.platformConfig.findUnique.mockResolvedValue(row())

        await getPlatformMaintenanceConfig()
        vi.setSystemTime(new Date('2026-10-29T09:00:11Z')) // +11s, past the 10s TTL
        await getPlatformMaintenanceConfig()

        expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(2)
    })

    it('caches a null (no row) result too, instead of re-querying on every call', async () => {
        const { getPlatformMaintenanceConfig } = await import('./platform-maintenance')
        prisma.platformConfig.findUnique.mockResolvedValue(null)

        expect(await getPlatformMaintenanceConfig()).toBeNull()
        expect(await getPlatformMaintenanceConfig()).toBeNull()
        expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(1)
    })

    it('writes through the cache so a toggle is visible immediately, before the TTL would expire', async () => {
        const { getPlatformMaintenanceConfig, setPlatformMaintenanceConfig } = await import('./platform-maintenance')
        prisma.platformConfig.findUnique.mockResolvedValue(row({ active: false }))

        expect((await getPlatformMaintenanceConfig())?.active).toBe(false)

        await setPlatformMaintenanceConfig({
            active: true, gracePeriod: false, graceEndsAt: null, scheduledFrom: null, scheduledTo: null,
            message: null, enabledAt: null, disabledAt: null, enabledBy: 'admin@firma.bz',
        })

        // Still within the old read's TTL window — a stale cache would still say `false`.
        expect((await getPlatformMaintenanceConfig())?.active).toBe(true)
        expect(prisma.platformConfig.findUnique).toHaveBeenCalledTimes(1)
    })
})

describe('maintenance emails report how many went out', () => {
    const config = { active: true, gracePeriod: false, graceEndsAt: null, scheduledFrom: null, scheduledTo: null, message: null, enabledAt: null, disabledAt: null, enabledBy: null }

    it('sendPlatformMaintenanceEmail answers "sent to 2 of 3" rather than only logging', async () => {
        const { sendEmail } = await import('@/lib/email')
        vi.mocked(sendEmail).mockImplementation(async (to: string) => {
            if (to === 'b@x.test') throw new Error('SMTP 550')
            return undefined as never
        })
        const { sendPlatformMaintenanceEmail } = await import('./platform-maintenance')
        const out = await sendPlatformMaintenanceEmail('on', config, [{ email: 'a@x.test' }, { email: 'b@x.test' }, { email: 'c@x.test' }])
        expect(out).toEqual({ sent: 2, total: 3 })
    })

    it('notifyPlatformMaintenance says when the list of people couldn’t be read, instead of nothing', async () => {
        const { createAdminClient } = await import('@/utils/supabase/admin')
        vi.mocked(createAdminClient).mockImplementation(() => { throw new Error('service role key missing') })
        const { notifyPlatformMaintenance } = await import('./platform-maintenance')
        const out = await notifyPlatformMaintenance('on', config)
        expect(out.emails).toBeNull()
        expect(out.problem).toBe("Couldn't read the list of people to email, so no email went out.")
    })
})
