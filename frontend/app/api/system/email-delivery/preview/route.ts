import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import {
    campaignImageUrls,
    getCampaignTemplate,
    renderCampaignTemplate,
    type CampaignTemplate,
} from '@/lib/email-templates/campaigns'
import { getPlatformSiteOrigin } from '@/config/platform-domain'

export const dynamic = 'force-dynamic'

const IMAGE_CHECK_TIMEOUT_MS = 8000

/**
 * Whether a template's images are up where a real send points them.
 *
 * A send always links to the live site, so a template whose images haven't been deployed goes out
 * with every image broken, while its preview here looks perfect. `missing` means the site answered
 * and the image isn't there; `unverified` means this check couldn't tell, so it never blocks a send.
 */
async function checkLiveImages(template: CampaignTemplate) {
    const origin = getPlatformSiteOrigin()
    const missing: string[] = []
    const unverified: string[] = []

    await Promise.all(campaignImageUrls(renderCampaignTemplate(template, origin)).map(async (url) => {
        const path = new URL(url).pathname
        try {
            const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS) })
            if (res.ok && res.headers.get('content-type')?.startsWith('image/')) return
            // A 200 that isn't an image is a site's fallback page, which is just as broken in an inbox.
            if (res.ok || res.status === 404 || res.status === 410) missing.push(path)
            else unverified.push(path)
        } catch {
            unverified.push(path)
        }
    }))

    return { origin, missing: missing.sort(), unverified: unverified.sort() }
}

/**
 * GET /api/system/email-delivery/preview?templateId=…
 *
 * The rendered email for the page's preview frame, and whether its images are live yet. The preview
 * renders against this server rather than the live site, so a new template's images show here before
 * they have been deployed; `images` is what says whether they'd show in an inbox.
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isSysAdminUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const template = getCampaignTemplate(request.nextUrl.searchParams.get('templateId') ?? '')
    if (!template) return NextResponse.json({ error: 'That template does not exist.' }, { status: 404 })

    return NextResponse.json({
        html: renderCampaignTemplate(template, request.nextUrl.origin),
        images: await checkLiveImages(template),
    })
}
