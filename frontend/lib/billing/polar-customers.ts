import { logger } from '@/lib/logger'
import { polarVersionHeaders } from '@/lib/billing/polar-client'

function polarApiBase(): string {
    return process.env.POLAR_SERVER === 'production'
        ? 'https://api.polar.sh'
        : 'https://sandbox-api.polar.sh'
}

/**
 * Best-effort: update the Polar Customer name for a given externalId (we use firmId as externalId).
 * Requires POLAR_ACCESS_TOKEN with customers:write.
 */
export async function updatePolarCustomerNameByExternalId(params: {
    externalId: string
    name: string
}): Promise<void> {
    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) return

    const externalId = params.externalId.trim()
    const name = params.name.trim()
    if (!externalId || !name) return

    const url = `${polarApiBase()}/v1/customers/external/${encodeURIComponent(externalId)}`

    let res: Response
    try {
        res = await fetch(url, {
            method: 'PATCH',
            headers: polarVersionHeaders({
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ name }),
        })
    } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e))
    }

    if (res.ok) return
    if (res.status === 404) return

    const body = await res.text().catch(() => '')
    logger.warn('[polar-customers] Failed to update customer name by externalId', {
        externalId,
        status: res.status,
        body: body.slice(0, 500),
    })
    throw new Error(`Polar customer update failed (${res.status}).`)
}

