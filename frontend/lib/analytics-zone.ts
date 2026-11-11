/**
 * Which cookie rule a visitor gets for Google Analytics, decided from their country
 * (.claude/plans/campaign-visit-counts.md).
 *
 * - `consent`: today's opt-in banner; GA loads only after Accept. The EU and EEA, Quebec, and any
 *   visitor whose country can't be read.
 * - `notice`: on public pages GA loads on arrival with a small notice and an opt-out. Everyone else.
 *
 * App pages stay opt-in in both modes; that is decided in lib/cookie-consent-storage.ts, not here.
 * Pure and side-effect free, so the root layout can call it with the request headers.
 */

export type AnalyticsMode = 'consent' | 'notice'

/**
 * Countries where analytics cookies need opt-in consent: the EU 27, the rest of the EEA, and EU
 * territories that IP lookups report under their own codes (Åland, French overseas departments,
 * Saint Martin). Quebec is handled by region below. India joins this list before 12 May 2027,
 * when its DPDP consent rules apply in full.
 */
export const OPT_IN_COUNTRIES: ReadonlySet<string> = new Set([
    // EU 27
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
    'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    // Rest of the EEA
    'IS', 'LI', 'NO',
    // EU territories with their own codes
    'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
])

/** Regions inside a notice-zone country that still need opt-in, as `COUNTRY-REGION`. */
const OPT_IN_REGIONS: ReadonlySet<string> = new Set(['CA-QC'])

/** The mode for a country (ISO 3166-1 alpha-2) and optional region (ISO 3166-2 subdivision). */
export function analyticsModeFor(country: string | null | undefined, region?: string | null): AnalyticsMode {
    const c = country?.trim().toUpperCase()
    if (!c || !/^[A-Z]{2}$/.test(c)) return 'consent'
    if (OPT_IN_COUNTRIES.has(c)) return 'consent'
    const r = region?.trim().toUpperCase()
    if (r && OPT_IN_REGIONS.has(`${c}-${r}`)) return 'consent'
    return 'notice'
}

/**
 * The mode for a request. Vercel sends `x-vercel-ip-country` and `x-vercel-ip-country-region`.
 * Local dev has neither, so it keeps the opt-in banner unless `ANALYTICS_COUNTRY_OVERRIDE` is set
 * (`US`, `DE`, or `CA-QC` for a region). The override exists for local and preview checks and is
 * ignored in production.
 */
export function analyticsModeFromRequest({
    country,
    region,
    override,
    vercelEnv,
}: {
    country: string | null | undefined
    region?: string | null
    override?: string | null
    vercelEnv?: string | null
}): AnalyticsMode {
    const o = override?.trim()
    if (o && vercelEnv !== 'production') {
        const [overrideCountry, overrideRegion] = o.split('-')
        return analyticsModeFor(overrideCountry, overrideRegion)
    }
    return analyticsModeFor(country, region)
}
