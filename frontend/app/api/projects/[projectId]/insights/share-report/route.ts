import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProjectSettings } from '@/lib/permission-helpers'
import { sendEmail } from '@/lib/email'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading, escHtml } from '@/lib/email-templates/base'
import { resolveDisplayName } from '@/lib/auth/display-name'
import { logger } from '@/lib/logger'
import { shareReportText, type ShareReportOutcome } from '@/lib/insights/share-report-outcome'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canManage = await canViewProjectSettings(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const pdfBase64: string | undefined = body?.pdfBase64
    const pageUrl: string | undefined = body?.pageUrl

    if (!pdfBase64) return NextResponse.json({ error: 'Missing pdfBase64' }, { status: 400 })

    // Fetch engagement name and all member user IDs
    const [engagement, members] = await Promise.all([
      prisma.engagement.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        select: { userId: true },
      }),
    ])

    const engagementName = engagement?.name ?? 'Engagement'
    const userIds = members.map((m) => m.userId)

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'No one is on this engagement yet, so there is no one to send it to.', code: 'no_recipients' }, { status: 400 })
    }

    // Without a mail server nothing is sent (sendEmail returns quietly): that's a failure to say,
    // never a tick (OT-3).
    if (!process.env.SMTP_HOST) {
      logger.warn('share-report: SMTP_HOST not configured, report not sent', 'ShareReport', { projectId })
      return NextResponse.json({ error: "Email isn't set up, so the report wasn't sent.", code: 'email_not_configured' }, { status: 503 })
    }

    // Resolve emails via Supabase admin. A member whose address can't be read isn't reached either.
    const admin = createAdminClient()
    const recipientResults = await Promise.allSettled(
      userIds.map(async (userId) => {
        const { data } = await admin.auth.admin.getUserById(userId)
        const email = data?.user?.email ?? null
        return email ? { email, name: resolveDisplayName(data?.user?.user_metadata ?? {}, email) || email } : null
      })
    )
    const recipients = recipientResults
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((r): r is { email: string; name: string } => !!r)

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const subject = `Engagement Health Report — ${engagementName}`
    const analyticsLink = pageUrl ?? ''

    const emailBody = [
      emailHeading('Engagement Health Report'),
      detailCard({
        label: 'Engagement',
        title: engagementName,
        lines: ["A snapshot of this engagement's health has been shared with your team. The full report is attached as a PDF."],
      }),
      analyticsLink ? ctaButton('View live analytics', analyticsLink) : '',
      emailFootnote(`You are receiving this because you are a member of ${escHtml(engagementName)}.`),
    ].join('\n')
    const html = renderEmail({ title: subject, preheader: `Engagement health snapshot for ${engagementName}`, body: emailBody })

    // Send to all members in parallel, and count what each send really did: a rejected send, or one
    // that returned nothing (no mail server), didn't reach that person.
    const sends = await Promise.allSettled(
      recipients.map((r) =>
        sendEmail(r.email, subject, html, [
          {
            filename: `${engagementName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Health_Report.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ])
      )
    )
    const outcome: ShareReportOutcome = {
      sent: sends.filter((s) => s.status === 'fulfilled' && s.value).length,
      total: userIds.length,
      failed: recipients.filter((_, i) => !(sends[i].status === 'fulfilled' && (sends[i] as PromiseFulfilledResult<unknown>).value)).map((r) => r.name),
    }

    // Nothing sent is an error, with who it couldn't reach; some sent is a success the browser words
    // as "Sent to 3 of 5. Couldn't reach Ana, Raj."
    if (outcome.sent === 0) {
      return NextResponse.json({ ...outcome, error: shareReportText(outcome).message, code: 'not_sent' }, { status: 502 })
    }
    return NextResponse.json(outcome)
  } catch (e) {
    logger.error('share-report POST error', e as Error)
    return NextResponse.json({ error: "Couldn't send the report. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
