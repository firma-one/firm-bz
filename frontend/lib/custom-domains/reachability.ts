import 'server-only'

/**
 * Whether a domain reaches this app: DNS points at Vercel, the certificate is issued, and Vercel
 * serves Firma there. It asks the domain for /api/custom-domains/health, which only this app answers
 * with `{ service: 'firma' }`. Approving a domain that fails this would send every member to a dead
 * page right after sign-in, so Approve and the daily re-check both use it.
 */

export const HEALTH_PATH = '/api/custom-domains/health'
export const HEALTH_SERVICE = 'firma'

export type ReachabilityResult = { ok: true; skipped?: boolean } | { ok: false; message: string }

function causeCode(e: unknown): string {
    const err = e as { cause?: { code?: string; message?: string }; code?: string; name?: string }
    return err?.cause?.code ?? err?.code ?? err?.name ?? ''
}

export async function checkDomainReachable(host: string, opts: { force?: boolean } = {}): Promise<ReachabilityResult> {
    // Local and preview can't reach production domains; don't let that block trying the flow there.
    if (!opts.force && process.env.VERCEL_ENV !== 'production') return { ok: true, skipped: true }
    try {
        const res = await fetch(`https://${host}${HEALTH_PATH}`, {
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(6000),
            headers: { 'user-agent': 'firma-domain-check' },
        })
        if (res.status >= 300 && res.status < 400) return { ok: false, message: `${host} redirects elsewhere · it may still point at another site` }
        if (!res.ok) return { ok: false, message: `${host} answers, but not from Firma (HTTP ${res.status})` }
        const body = (await res.json().catch(() => null)) as { service?: string } | null
        if (body?.service !== HEALTH_SERVICE) return { ok: false, message: `${host} answers, but not from Firma` }
        return { ok: true }
    } catch (e) {
        const code = causeCode(e)
        if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { ok: false, message: `${host} doesn't resolve · check its CNAME record` }
        if (code === 'TimeoutError' || code === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT') return { ok: false, message: `${host} didn't answer within 6 seconds` }
        if (/CERT|SSL|TLS/i.test(code)) return { ok: false, message: `${host} has no valid certificate yet · Vercel may still be issuing it` }
        return { ok: false, message: `${host} couldn't be reached (${code || 'network error'})` }
    }
}
