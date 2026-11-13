import { getPlatformBrandDomain } from '@/config/platform-domain'

/**
 * Which hosts are Firma's own and which are a workspace's custom domain. Kept apart from
 * domain-rules.ts (which reads the pricing config) so the proxy can use it with a small bundle.
 */

/** Lowercase host without scheme, path, port or trailing dot: "https://Portal.Acme.com/x" → "portal.acme.com". */
export function normalizeHost(input: string): string {
    let h = input.trim().toLowerCase()
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    h = h.split(/[/?#]/)[0]
    h = h.replace(/:\d+$/, '').replace(/\.$/, '')
    return h
}

/** Whether a host is the brand domain or any name under it (firma.bz, www.firma.bz, acme.firma.bz). */
export function isFirmaHost(host: string): boolean {
    const brand = getPlatformBrandDomain().toLowerCase()
    const h = normalizeHost(host)
    return h === brand || h.endsWith(`.${brand}`)
}

/**
 * Hosts that belong to Firma itself rather than to a workspace: the brand domain and www, preview,
 * localhost and Vercel deployment URLs. Sign-in hands people over only from these, and the proxy treats
 * every other host as a branded one.
 */
export function isPlatformHost(host: string): boolean {
    const h = normalizeHost(host)
    const brand = getPlatformBrandDomain().toLowerCase()
    if (h === brand || h === `www.${brand}` || h === `preview.${brand}`) return true
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')) return true
    if (h.endsWith('.vercel.app')) return true
    const appHost = hostOf(process.env.NEXT_PUBLIC_APP_URL)
    return appHost !== null && h === appHost
}

function hostOf(url: string | undefined): string | null {
    if (!url) return null
    try {
        return new URL(url).host.toLowerCase().replace(/:\d+$/, '')
    } catch {
        return null
    }
}
