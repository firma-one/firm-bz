import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkFirmSubscriptionAccess } from './subscription-gate'
import * as billingGroup from './billing-group'

vi.mock('./billing-group')
vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const mockGetFirmRow = vi.mocked(billingGroup.getFirmRowForBillingGate)

function makeOrg(overrides: Partial<billingGroup.BillingAnchorRow> = {}): billingGroup.BillingAnchorRow {
    return {
        id: 'firm-1',
        subscriptionStatus: 'active',
        sandboxOnly: false,
        anchorFirmId: null,
        ...overrides,
    }
}

describe('checkFirmSubscriptionAccess', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        process.env.ENFORCE_BILLING_GATES = 'true'
    })

    it('returns true when ENFORCE_BILLING_GATES is not set', async () => {
        delete process.env.ENFORCE_BILLING_GATES
        const result = await checkFirmSubscriptionAccess('any-id')
        expect(result).toBe(true)
        expect(mockGetFirmRow).not.toHaveBeenCalled()
    })

    it('returns true when ENFORCE_BILLING_GATES is false', async () => {
        process.env.ENFORCE_BILLING_GATES = 'false'
        const result = await checkFirmSubscriptionAccess('any-id')
        expect(result).toBe(true)
    })

    it('fails open (true) on DB error', async () => {
        mockGetFirmRow.mockRejectedValueOnce(new Error('DB connection refused'))
        const result = await checkFirmSubscriptionAccess('firm-1')
        expect(result).toBe(true)
    })

    it('fails open (true) when firm is not found', async () => {
        mockGetFirmRow.mockResolvedValueOnce(null)
        const result = await checkFirmSubscriptionAccess('unknown-firm')
        expect(result).toBe(true)
    })

    it('returns true for active subscription', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: 'active' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(true)
    })

    it('returns true for trialing subscription', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: 'trialing' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(true)
    })

    it('returns true for past_due subscription (grace period)', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: 'past_due' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(true)
    })

    it('returns false for canceled subscription', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: 'canceled' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(false)
    })

    it('returns false for unpaid subscription', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: 'unpaid' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(false)
    })

    it('returns false for none (no subscription)', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: 'none' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(false)
    })

    it('sandboxOnly firm always passes regardless of subscription status', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ sandboxOnly: true, subscriptionStatus: 'canceled' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(true)
    })

    it('sandboxOnly anchor: satellite firm passes even though satellite itself is not sandboxOnly', async () => {
        // getFirmRowForBillingGate resolves to the ANCHOR row, not satellite.
        // Anchor has sandboxOnly=true — satellite should pass.
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({
            id: 'anchor-1',
            sandboxOnly: true,
            subscriptionStatus: 'canceled',
            anchorFirmId: null,
        }))
        expect(await checkFirmSubscriptionAccess('satellite-firm-id')).toBe(true)
    })

    it('is case-insensitive and trims whitespace on subscription status', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: '  Active  ' }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(true)
    })

    it('returns false for null subscriptionStatus', async () => {
        mockGetFirmRow.mockResolvedValueOnce(makeOrg({ subscriptionStatus: null }))
        expect(await checkFirmSubscriptionAccess('firm-1')).toBe(false)
    })
})
