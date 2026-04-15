import type { PricingModel } from '@/lib/billing/pricing-model'

/** Polar recurring interval on the product’s fixed recurring price (when applicable). */
export type BillingCatalogRecurringInterval = 'day' | 'week' | 'month' | 'year'

export type BillingCatalogPlan = {
    id: string
    name: string
    description: string | null
    priceLabel: string
    isRecurring: boolean
    pricingModel: PricingModel
    isRecommended: boolean
    /** Smallest currency unit (e.g. USD cents) for one billing period; null if not a fixed recurring price. */
    recurringAmountCents: number | null
    priceCurrency: string
    recurringInterval: BillingCatalogRecurringInterval | null
    /** Trial length in days when configured on the product/price; null when no trial is configured. */
    trialDays: number | null
}
