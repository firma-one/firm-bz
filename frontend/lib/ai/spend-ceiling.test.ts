import { describe, it, expect } from 'vitest'
import { FREE_SPEND_CEILING_MICROS, monthlyPlanPrice, spendCeilingMicros } from './spend-ceiling'
import { CREDIT_UNIT_MICROS } from './pricing'

/** The dollar backstop: 30% of the plan's monthly price, 50¢ on Free (Deepak, 2026-11-19). */
describe('monthlyPlanPrice', () => {
    it('reads the plan from the name Polar sends, at its annual monthly rate', () => {
        expect(monthlyPlanPrice('Standard')).toBe(39)
        expect(monthlyPlanPrice('standard (annual)')).toBe(39)
        expect(monthlyPlanPrice('Pro')).toBe(79)
    })

    it('knows no price for a quoted or unknown plan', () => {
        expect(monthlyPlanPrice('Enterprise')).toBeNull()
        expect(monthlyPlanPrice('Mystery')).toBeNull()
        expect(monthlyPlanPrice(null)).toBeNull()
    })
})

describe('spendCeilingMicros', () => {
    it('is 30% of a priced plan: $11.70 on Standard', () => {
        expect(spendCeilingMicros({ planName: 'Standard', hasSubscription: true, allowance: 500 })).toBe(11_700_000)
    })

    it('is 50¢ on Free and with no subscription', () => {
        expect(spendCeilingMicros({ planName: 'Free', hasSubscription: true, allowance: 25 })).toBe(FREE_SPEND_CEILING_MICROS)
        expect(spendCeilingMicros({ planName: null, hasSubscription: false, allowance: 25 })).toBe(500_000)
    })

    it('on a quoted plan, sits at twice what its whole allowance costs', () => {
        expect(spendCeilingMicros({ planName: 'Enterprise', hasSubscription: true, allowance: 10_000 })).toBe(10_000 * CREDIT_UNIT_MICROS * 2)
    })

    it('has nothing to set it from with no price and no allowance', () => {
        expect(spendCeilingMicros({ planName: 'Enterprise', hasSubscription: true, allowance: Infinity })).toBeNull()
    })

    it('sits far above what a full allowance of credits can cost', () => {
        // Credits keep a group well below the backstop: 500 credits cost at most $1.25.
        expect(500 * CREDIT_UNIT_MICROS).toBeLessThan(spendCeilingMicros({ planName: 'Standard', hasSubscription: true, allowance: 500 })!)
    })
})
