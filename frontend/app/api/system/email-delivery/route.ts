import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { listMailableAuthUsers } from '@/lib/system/auth-users'
import { EMAIL_DELIVERY_BATCH_SIZE, parseEmailList } from '@/lib/system/email-recipients'
import { emailFromAddress, isEmailConfigured, sendEmail } from '@/lib/email'
import { getCampaignTemplate, listCampaignTemplates, renderCampaignTemplate } from '@/lib/email-templates/campaigns'
import { embedCampaignImages } from '@/lib/email-templates/campaigns/embed'
import { UNSUBSCRIBE_MAILTO } from '@/lib/email-templates/campaigns/kit'
import { getPlatformSiteOrigin } from '@/config/platform-domain'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
/** One batch: each address gets its own SMTP conversation, in parallel. */
export const maxDuration = 60

const SendBody = z.object({
    templateId: z.string().min(1),
    recipients: z.array(z.string()).min(1).max(EMAIL_DELIVERY_BATCH_SIZE),
})

/** The signed-in system admin, or the response refusing everyone else. */
async function requireSystemAdmin(): Promise<{ adminId: string } | { refusal: NextResponse }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return { refusal: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (!(await isSysAdminUser(user.id))) return { refusal: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { adminId: user.id }
}

/**
 * GET /api/system/email-delivery
 *
 * What /system/email-delivery opens with: the templates, every account that can be emailed, and
 * whether this server can send at all.
 */
export async function GET() {
    const auth = await requireSystemAdmin()
    if ('refusal' in auth) return auth.refusal

    try {
        const users = await listMailableAuthUsers()
        return NextResponse.json({
            templates: listCampaignTemplates().map(({ id, name, description, createdAt, subject, preheader }) => ({
                id, name, description, createdAt, subject, preheader,
            })),
            users,
            email: { configured: isEmailConfigured(), from: emailFromAddress() },
        })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Could not load email delivery' },
            { status: 500 },
        )
    }
}

/**
 * POST /api/system/email-delivery { templateId, recipients }
 *
 * Sends one template to one batch. Each recipient gets their own message, so nobody sees anyone
 * else's address, and each outcome is reported separately: one bad address never fails the batch.
 * Links always point at the live site, whichever server this runs on, and the images travel inside
 * the message, so Outlook shows them without asking.
 */
export async function POST(request: Request) {
    const auth = await requireSystemAdmin()
    if ('refusal' in auth) return auth.refusal

    const parsed = SendBody.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json({ error: `Send a template and 1 to ${EMAIL_DELIVERY_BATCH_SIZE} recipients.` }, { status: 400 })
    }
    const { templateId } = parsed.data

    const template = getCampaignTemplate(templateId)
    if (!template) return NextResponse.json({ error: 'That template does not exist.' }, { status: 404 })

    const { valid, invalid } = parseEmailList(parsed.data.recipients.join(','))
    if (invalid.length > 0) {
        return NextResponse.json({ error: `Not valid email addresses: ${invalid.join(', ')}` }, { status: 400 })
    }

    // sendEmail returns quietly when SMTP is unset, which would report every address as sent.
    if (!isEmailConfigured()) {
        return NextResponse.json({ error: 'SMTP is not configured on this server, so nothing was sent.' }, { status: 503 })
    }

    let message: Awaited<ReturnType<typeof embedCampaignImages>>
    try {
        message = await embedCampaignImages(renderCampaignTemplate(template, getPlatformSiteOrigin()))
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Could not prepare the email, so nothing was sent.' },
            { status: 500 },
        )
    }

    const outcomes = await Promise.allSettled(
        valid.map((email) => sendEmail(email, template.subject, message.html, message.attachments, {
            headers: { 'List-Unsubscribe': `<${UNSUBSCRIBE_MAILTO}>` },
        })),
    )
    const results = valid.map((email, i) => {
        const outcome = outcomes[i]
        return outcome.status === 'fulfilled'
            ? { email, ok: true as const }
            : { email, ok: false as const, error: outcome.reason instanceof Error ? outcome.reason.message : 'Could not send' }
    })

    const sent = results.filter((r) => r.ok).length
    logger.info('Campaign email batch sent', 'EmailDelivery', {
        templateId,
        sent,
        failed: results.length - sent,
        adminId: auth.adminId,
    })
    return NextResponse.json({ results })
}
