import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProjectSettings } from '@/lib/permission-helpers'
import { sendEmail } from '@/lib/email'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from '@/lib/email-templates/base'

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
      return NextResponse.json({ sent: 0 })
    }

    // Resolve emails via Supabase admin
    const admin = createAdminClient()
    const emailResults = await Promise.allSettled(
      userIds.map(async (userId) => {
        const { data } = await admin.auth.admin.getUserById(userId)
        return data?.user?.email ?? null
      })
    )
    const emails = emailResults
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((e): e is string => !!e)

    if (emails.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    const subject = `Engagement Health Report — ${engagementName}`
    const analyticsLink = pageUrl ?? ''

    const emailBody = `
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">Engagement Health Report</h2>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">Engagement</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${escHtml(engagementName)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:${TEXT_MUTED};">A snapshot of this engagement's health has been shared with your team. The full report is attached as a PDF.</p>
          </td>
        </tr>
      </table>

      ${analyticsLink ? ctaButton('View Live Analytics →', analyticsLink) : ''}

      <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
        You are receiving this because you are a member of ${escHtml(engagementName)}.
      </p>
    `
    const html = renderEmail({ title: subject, preheader: `Engagement health snapshot for ${engagementName}`, body: emailBody })

    // Send to all members in parallel
    await Promise.allSettled(
      emails.map((email) =>
        sendEmail(email, subject, html, [
          {
            filename: `${engagementName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Health_Report.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ])
      )
    )

    return NextResponse.json({ sent: emails.length })
  } catch (e) {
    console.error('share-report POST error', e)
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 })
  }
}
