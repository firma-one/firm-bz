import { getPlatformBrandDomain } from '@/config/platform-domain'
import { PRICING_COMPARISON, PRICING_PLANS, PRICING_SANDBOX_COLUMN_ID } from '@/config/pricing'
import { isFirmaHost, normalizeHost } from '@/lib/custom-domains/hosts'

export { isFirmaHost, isPlatformHost, normalizeHost } from '@/lib/custom-domains/hosts'

/**
 * Pure rules for a Firm Group's custom domain (.claude/plans/branded-host-email-links.md): what a
 * valid name is, which names are Firma's own, and which plans may ask for which kind. No database,
 * so the proxy, the browser and the server can all use it.
 */

export type DomainKind = 'SUBDOMAIN' | 'CUSTOM'
export type DomainStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REMOVED'

/** Statuses that hold a name: at most one per Group and one per host (partial unique indexes). */
export const LIVE_STATUSES: DomainStatus[] = ['REQUESTED', 'APPROVED']

/**
 * Subdomain labels Firma keeps for itself or that would mislead (admin.firma.bz). Shown to people as
 * "Not available", never "taken", so the list doesn't reveal which of these Firma uses.
 */
export const RESERVED_LABELS = new Set([
    'www', 'app', 'preview', 'api', 'admin', 'administrator', 'system', 'root', 'mail', 'email', 'smtp',
    'imap', 'pop', 'mx', 'ns', 'ns1', 'ns2', 'ftp', 'webmail', 'help', 'docs', 'status', 'blog', 'support',
    'auth', 'login', 'signin', 'signup', 'sso', 'account', 'accounts', 'billing', 'pay', 'dev', 'staging',
    'test', 'qa', 'demo', 'tour', 'cdn', 'static', 'assets', 'media', 'files', 'agents', 'firma', 'firmaone',
    'security', 'legal', 'privacy', 'abuse', 'postmaster', 'hostmaster', 'webmaster', 'noreply', 'no-reply',
])

const LABEL = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export type NameCheck =
    | { ok: true; host: string }
    | { ok: false; reason: 'format' | 'reserved' | 'platform' | 'apex'; message: string }

/** "acme" → "acme.firma.bz", if it is a name a Group may ask for. */
export function checkSubdomainLabel(input: string): NameCheck {
    const label = input.trim().toLowerCase()
    if (!LABEL.test(label) || label.includes('--')) {
        return { ok: false, reason: 'format', message: 'Use letters, numbers and hyphens · 3 to 40 characters' }
    }
    if (RESERVED_LABELS.has(label)) return { ok: false, reason: 'reserved', message: 'Not available · try another' }
    return { ok: true, host: `${label}.${getPlatformBrandDomain()}` }
}

/** The customer's own domain, such as portal.acme.com. A subdomain of their site, not the bare domain. */
export function checkCustomHost(input: string): NameCheck {
    const host = normalizeHost(input)
    const labels = host.split('.')
    const valid =
        host.length <= 253 &&
        labels.length >= 2 &&
        labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) &&
        /^[a-z]{2,63}$/.test(labels[labels.length - 1])
    if (!valid) return { ok: false, reason: 'format', message: 'Enter a domain such as portal.yourcompany.com' }
    if (isFirmaHost(host)) return { ok: false, reason: 'platform', message: 'Choose "Firma subdomain" for a name ending in ' + getPlatformBrandDomain() }
    if (labels.length === 2) return { ok: false, reason: 'apex', message: 'Use a subdomain of your site, such as portal.' + host }
    return { ok: true, host }
}

// ── Plan gate ────────────────────────────────────────────────────────────────────────────────────

/** The /pricing comparison rows that decide who may ask for which kind. */
export const KIND_FEATURE: Record<DomainKind, string> = {
    SUBDOMAIN: 'Custom subdomain',
    CUSTOM: 'Custom DNS domain',
}

/** A Subscription.plan value ("Pro", "Firma Business (annual)", "Free", null) → its /pricing column. */
export function pricingColumnForPlan(plan: string | null | undefined): string {
    const p = (plan ?? '').toLowerCase()
    // Most specific first: "Enterprise" never matches "pro", but check in tier order anyway.
    for (const id of ['Enterprise', 'Business', 'Pro', 'Standard']) {
        if (PRICING_PLANS.some((x) => x.id === id) && new RegExp(`\\b${id.toLowerCase()}\\b`).test(p)) return id
    }
    return PRICING_SANDBOX_COLUMN_ID
}

function featureValue(feature: string, column: string): boolean {
    for (const cat of PRICING_COMPARISON) {
        const row = cat.rows.find((r) => r.feature === feature)
        if (row) return row.values[column] === true
    }
    return false
}

/** Which kinds a plan includes, read from the /pricing comparison so the page stays the one source. */
export function kindsForPlan(plan: string | null | undefined): Record<DomainKind, boolean> {
    const column = pricingColumnForPlan(plan)
    return { SUBDOMAIN: featureValue(KIND_FEATURE.SUBDOMAIN, column), CUSTOM: featureValue(KIND_FEATURE.CUSTOM, column) }
}

/** The lowest plan on /pricing that includes a kind ("Pro", "Enterprise"), for the upgrade line. */
export function lowestPlanFor(kind: DomainKind): string | null {
    for (const plan of PRICING_PLANS) {
        if (featureValue(KIND_FEATURE[kind], plan.id)) return plan.title
    }
    return null
}

/**
 * The CNAME target a domain points at: Vercel's generic one. Vercel may show a project-specific value
 * when the domain is added there; the System Admin's checklist says to use whatever Vercel shows.
 * The record's name is the full host (every DNS provider accepts it; working out "portal" from
 * portal.acme.co.uk would need the public suffix list).
 */
export const CNAME_TARGET = 'cname.vercel-dns.com'
