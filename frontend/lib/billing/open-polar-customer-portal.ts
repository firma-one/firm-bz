import { failureFrom, failureReason } from '@/lib/files/action-failure'

/**
 * Client-side: create a Polar customer portal session and return the redirect URL. Never rejects:
 * a failure comes back as words to show ("Couldn't open billing · <why>. Your plan is unchanged.").
 * The portal is the only way to cancel or change plan, so the reason matters.
 */

function portalFailed(reason: string): { ok: false; error: string } {
    return { ok: false, error: `Couldn't open billing · ${reason.trim().replace(/\.?$/, '.')} Your plan is unchanged.` }
}

export async function openPolarCustomerPortalSession(options: {
    firmId: string
    returnTo?: string
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    let res: Response
    try {
        res = await fetch('/api/billing/customer-portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firmId: options.firmId,
                ...(options.returnTo ? { returnTo: options.returnTo } : {}),
            }),
        })
    } catch (e) {
        return portalFailed(failureReason(e))
    }
    if (!res.ok) return portalFailed(failureReason(await failureFrom(res)))
    const data = (await res.json().catch(() => ({}))) as { url?: unknown }
    if (typeof data.url === 'string' && data.url.startsWith('http')) {
        return { ok: true, url: data.url }
    }
    return portalFailed("Polar didn't send a billing link back. Try again in a minute")
}
