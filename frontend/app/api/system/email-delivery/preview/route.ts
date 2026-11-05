import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { getCampaignTemplate, renderCampaignTemplate } from '@/lib/email-templates/campaigns'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/email-delivery/preview?templateId=…
 *
 * The rendered email for the page's preview frame. Images load from this server here, because a
 * frame can't show the inline attachments a real send carries; the two render the same files.
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isSysAdminUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const template = getCampaignTemplate(request.nextUrl.searchParams.get('templateId') ?? '')
    if (!template) return NextResponse.json({ error: 'That template does not exist.' }, { status: 404 })

    return NextResponse.json({ html: renderCampaignTemplate(template, request.nextUrl.origin) })
}
