import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The server actions left after moving the userId-taking helpers out must take identity from the
 * Supabase session — never from an argument. Each test signs in as u-session and checks the
 * helper underneath receives exactly that id.
 */

const { auth, svc, prefs, landing, domain, prisma } = vi.hoisted(() => ({
    auth: { user: { id: 'u-session', email: 'pat@acme.test' } as { id: string; email: string } | null },
    svc: { computeDueReminders: vi.fn(async () => []), upsertFollowUpReminder: vi.fn(async () => {}) },
    prefs: {
        getUserNotificationPrefs: vi.fn(async () => ({ timezone: 'UTC', remindersDigest: { lastNotifiedDate: null } })),
        isValidTimezone: vi.fn(async () => true),
        localDateFor: vi.fn(async () => '2026-10-15'),
        claimDailyDigest: vi.fn(async () => true),
    },
    landing: { resolveDefaultFirmLandingPath: vi.fn(async () => '/d/onboarding') },
    domain: { getDomainOnboardingOptions: vi.fn(async () => ({ orgsToJoin: [], orgsAlreadyIn: [] })), emailDomain: (e: string) => e.split('@')[1] },
    prisma: { userPersonalization: { upsert: vi.fn(async () => ({})) } },
}))

vi.mock('@/utils/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }),
}))
vi.mock('@/lib/prisma', () => ({ prisma, basePrisma: prisma }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/inngest/client', () => ({ safeInngestSend: vi.fn() }))
vi.mock('@/lib/reminders/reminder-service', () => svc)
vi.mock('@/lib/notification-prefs', () => prefs)
vi.mock('@/lib/landing/default-landing-path', () => landing)
vi.mock('@/lib/onboarding/domain-options', () => domain)
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('redirect') }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getUserReminders, checkDailyReminderDigest, createManualReminder } from './user-reminders'
import { setUserTimezone } from './user-notification-prefs'
import { getDomainOnboardingOptionsForCurrentUser } from './domain-onboarding'
import { firmAdminMustCompleteOnboarding } from './firms'

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u-session', email: 'pat@acme.test' }
})

describe('session-scoped server actions', () => {
    it('getUserReminders reads the signed-in user\'s reminders', async () => {
        await getUserReminders()
        expect(svc.computeDueReminders).toHaveBeenCalledWith('u-session')
    })

    it('checkDailyReminderDigest reads and claims for the signed-in user only', async () => {
        svc.computeDueReminders.mockResolvedValueOnce([{ hiddenAt: null, delta: 0 }] as never)
        await checkDailyReminderDigest()
        expect(prefs.getUserNotificationPrefs).toHaveBeenCalledWith('u-session')
        expect(prefs.claimDailyDigest).toHaveBeenCalledWith('u-session', '2026-10-15')
    })

    it('createManualReminder writes to the signed-in user, whatever the payload says', async () => {
        await createManualReminder({ entityKey: 'k', entityValue: 'v', action: 'Follow-up', dateValue: null, entityName: 'X', firmId: 'f1', ctaUrl: null, userId: 'u-victim' } as never)
        expect(svc.upsertFollowUpReminder).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-session' }))
    })

    it('setUserTimezone only writes the signed-in user\'s row', async () => {
        await setUserTimezone('Europe/Paris')
        expect(prefs.getUserNotificationPrefs).toHaveBeenCalledWith('u-session')
        expect(prisma.userPersonalization.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u-session' } }))
    })

    it('getDomainOnboardingOptionsForCurrentUser uses the session\'s id and email', async () => {
        await getDomainOnboardingOptionsForCurrentUser()
        expect(domain.getDomainOnboardingOptions).toHaveBeenCalledWith('u-session', 'pat@acme.test')
    })

    it('firmAdminMustCompleteOnboarding resolves the landing path for the session user', async () => {
        expect(await firmAdminMustCompleteOnboarding()).toBe(true)
        expect(landing.resolveDefaultFirmLandingPath).toHaveBeenCalledWith('u-session')
    })

    it('does nothing for a signed-out caller', async () => {
        auth.user = null
        expect(await getUserReminders()).toEqual([])
        expect(await setUserTimezone('UTC')).toEqual({ ok: false })
        expect(await firmAdminMustCompleteOnboarding()).toBe(false)
        expect(svc.computeDueReminders).not.toHaveBeenCalled()
        expect(prisma.userPersonalization.upsert).not.toHaveBeenCalled()
    })
})
