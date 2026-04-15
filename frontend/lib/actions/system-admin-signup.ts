'use server'

import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { sendEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'
import { serverActionWrapper, type ActionResponse } from '@/lib/server-action-wrapper'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

const JWT_ADMIN_ROLE = 'SYS_ADMIN'

const inputSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  couponCode: z.string().trim().max(80, 'Coupon code is too long').optional(),
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'First name is too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Last name is too long'),
})

type SystemAdminSignupInput = z.infer<typeof inputSchema>
const updateInviteSchema = z.object({
  inviteId: z.string().uuid('Invalid invite id'),
  firstName: z.string().trim().min(1, 'First name is required').max(80, 'First name is too long'),
  lastName: z.string().trim().min(1, 'Last name is required').max(80, 'Last name is too long'),
  couponCode: z.string().trim().max(80, 'Coupon code is too long').optional(),
})

interface SendSystemAdminSignupInviteResult {
  sent: boolean
}

export interface SystemSignupInviteListItem {
  id: string
  email: string
  firstName: string
  lastName: string
  couponCode: string | null
  inviteCount: number
  lastInvitedAt: string
  isConfirmed: boolean
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildAdminSignupEmailHtml({
  fullName,
  couponCode,
  actionLink,
}: {
  fullName: string
  couponCode?: string
  actionLink: string
}): string {
  const greeting = `Hi ${escapeHtml(fullName)},`
  const safeCouponCode = couponCode ? escapeHtml(couponCode) : ''
  const safeActionLink = escapeHtml(actionLink)
  const couponSection = couponCode
    ? `<div style="margin:0 0 18px 0;padding:18px 16px;text-align:center;border-radius:12px;border:1px solid #c6c6cc;background:linear-gradient(180deg,#f8f9fa 0%,#eceff1 100%);">
          <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#76777d;">
            Discount Coupon
          </p>
          <span style="display:block;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;font-size:26px;font-weight:800;letter-spacing:0.12em;color:#2d6d3a;">
            ${safeCouponCode}
          </span>
        </div>`
    : ''
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete your signup</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b1b1d;line-height:1.5;">
  <div style="max-width:560px;margin:40px auto 0 auto;padding:0 16px;">
    <div style="background-color:#ffffff;border:1px solid #d7d9df;border-radius:16px;overflow:hidden;box-shadow:0 14px 36px rgba(27,27,29,0.08);">
      <div style="height:4px;background:linear-gradient(90deg,#4d4d4d 0%,#2d6d3a 55%,#4aba5e 100%);"></div>
      <div style="padding:30px 32px 18px 32px;text-align:center;border-bottom:1px solid #eceff2;background:linear-gradient(180deg,#fbfcfd 0%,#f7f9fb 100%);">
        <div style="display:inline-block;font-size:28px;font-weight:800;letter-spacing:-0.03em;line-height:1;color:#1b1b1d;background:linear-gradient(90deg,#4d4d4d 0%,#2d6d3a 55%,#4aba5e 100%);-webkit-background-clip:text;background-clip:text;">
          firmä
        </div>
        <p style="margin:10px 0 0 0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#76777d;">
          Organize • Protect • Deliver
        </p>
      </div>
      <div style="padding:30px 32px 32px 32px;">
        <h1 style="margin:0 0 10px 0;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#1b1b1d;text-align:center;">
          Complete your signup
        </h1>
        <p style="margin:0 0 16px 0;font-size:15px;color:#45474c;">
          ${greeting}
        </p>
        <p style="margin:0 0 20px 0;font-size:15px;color:#45474c;">
          Your account setup is almost done. Confirm your email to activate access and continue to your workspace.
        </p>
        <div style="margin:0 0 22px 0;padding:16px;border:1px solid #c6c6cc;background:linear-gradient(180deg,#f8f9fa 0%,#eceff1 100%);border-radius:12px;text-align:center;">
          <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#76777d;">
            Secure Confirmation
          </p>
          <a href="${safeActionLink}" style="display:inline-block;text-decoration:none;border-radius:10px;border:1px solid #2d6d3a;background:#4aba5e;color:#0d1f12;font-size:14px;font-weight:800;letter-spacing:0.02em;padding:12px 20px;">
            Confirm and Complete Signup
          </a>
          <p style="margin:10px 0 0 0;font-size:12px;color:#76777d;">
            This link is single-use and tied to your email address.
          </p>
        </div>
        ${couponSection}
        <p style="margin:0;font-size:13px;color:#76777d;text-align:center;">
          If you did not expect this email, you can safely ignore it.
        </p>
      </div>
      <div style="padding:18px 32px;text-align:center;border-top:1px solid #eceff2;background-color:#f7f9fb;">
        <p style="margin:0;font-size:12px;color:#76777d;">
          &copy; 2026 firmä. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

async function assertSystemAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')
  if ((user.app_metadata?.role as string | undefined) !== JWT_ADMIN_ROLE) {
    throw new Error('Only system admins can send signup invites')
  }
  return { userId: user.id }
}

async function sendInviteEmailAndGenerateLink(input: {
  email: string
  firstName: string
  lastName: string
  couponCode?: string
}): Promise<void> {
  const adminClient = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const fullName = `${input.firstName} ${input.lastName}`.trim()
  const redirectTo = `${appUrl}/signin?email=${encodeURIComponent(input.email)}`

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: {
      redirectTo,
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        full_name: fullName,
      },
    },
  })

  if (error) throw new Error(error.message)

  const actionLink = data?.properties?.action_link
  if (!actionLink) throw new Error('Failed to generate signup confirmation link')

  const html = buildAdminSignupEmailHtml({
    fullName,
    couponCode: input.couponCode,
    actionLink,
  })
  await sendEmail(
    input.email,
    input.couponCode ? 'Complete your signup and claim your coupon' : 'Complete your signup',
    html
  )
}

export async function sendSystemAdminSignupInvite(
  rawInput: SystemAdminSignupInput
): Promise<ActionResponse<SendSystemAdminSignupInviteResult>> {
  return serverActionWrapper(async () => {
    const input = inputSchema.parse(rawInput)
    const { userId } = await assertSystemAdmin()
    const normalizedEmail = input.email.toLowerCase()

    await sendInviteEmailAndGenerateLink({
      email: normalizedEmail,
      firstName: input.firstName,
      lastName: input.lastName,
      couponCode: input.couponCode,
    })

    await prisma.$executeRaw`
      INSERT INTO system.system_signup_invites
        (email, first_name, last_name, coupon_code, created_by, invite_count, last_invited_at, updated_at)
      VALUES
        (${normalizedEmail}, ${input.firstName}, ${input.lastName}, ${input.couponCode ?? null}, ${userId}::uuid, 1, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        coupon_code = EXCLUDED.coupon_code,
        invite_count = system.system_signup_invites.invite_count + 1,
        last_invited_at = NOW(),
        updated_at = NOW()
    `

    return { sent: true }
  }, 'sendSystemAdminSignupInvite')
}

export async function getSystemSignupInvites(): Promise<ActionResponse<SystemSignupInviteListItem[]>> {
  return serverActionWrapper(async () => {
    await assertSystemAdmin()

    const invites = await prisma.$queryRaw<Array<{
      id: string
      email: string
      first_name: string
      last_name: string
      coupon_code: string | null
      invite_count: number
      last_invited_at: Date
    }>>`
      SELECT id::text, email, first_name, last_name, coupon_code, invite_count, last_invited_at
      FROM system.system_signup_invites
      ORDER BY last_invited_at DESC
    `

    const emails = invites.map((invite) => invite.email.toLowerCase())
    const confirmed = new Set<string>()
    if (emails.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ email: string }>>(
        Prisma.sql`
          SELECT lower(email) AS email
          FROM auth.users
          WHERE lower(email) IN (${Prisma.join(emails)})
            AND email_confirmed_at IS NOT NULL
        `
      )
      rows.forEach((row) => confirmed.add(row.email))
    }

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      firstName: invite.first_name,
      lastName: invite.last_name,
      couponCode: invite.coupon_code,
      inviteCount: invite.invite_count,
      lastInvitedAt: invite.last_invited_at.toISOString(),
      isConfirmed: confirmed.has(invite.email.toLowerCase()),
    }))
  }, 'getSystemSignupInvites')
}

export async function resendSystemSignupInvite(
  inviteId: string
): Promise<ActionResponse<SendSystemAdminSignupInviteResult>> {
  return serverActionWrapper(async () => {
    await assertSystemAdmin()

    const rows = await prisma.$queryRaw<Array<{
      email: string
      first_name: string
      last_name: string
      coupon_code: string | null
    }>>`
      SELECT email, first_name, last_name, coupon_code
      FROM system.system_signup_invites
      WHERE id = ${inviteId}::uuid
      LIMIT 1
    `

    const invite = rows[0]
    if (!invite) throw new Error('Invite not found')

    const alreadyConfirmed = await prisma.$queryRaw<Array<{ email: string }>>`
      SELECT lower(email) AS email
      FROM auth.users
      WHERE lower(email) = lower(${invite.email})
        AND email_confirmed_at IS NOT NULL
      LIMIT 1
    `

    if (alreadyConfirmed.length > 0) {
      throw new Error('User is already confirmed')
    }

    await sendInviteEmailAndGenerateLink({
      email: invite.email,
      firstName: invite.first_name,
      lastName: invite.last_name,
      couponCode: invite.coupon_code ?? undefined,
    })

    await prisma.$executeRaw`
      UPDATE system.system_signup_invites
      SET invite_count = invite_count + 1,
          last_invited_at = NOW(),
          updated_at = NOW()
      WHERE id = ${inviteId}::uuid
    `

    return { sent: true }
  }, 'resendSystemSignupInvite')
}

export async function updateSystemSignupInvite(
  rawInput: z.infer<typeof updateInviteSchema>
): Promise<ActionResponse<{ updated: true }>> {
  return serverActionWrapper(async () => {
    const input = updateInviteSchema.parse(rawInput)
    await assertSystemAdmin()

    const updatedCount = await prisma.$executeRaw`
      UPDATE system.system_signup_invites
      SET
        first_name = ${input.firstName},
        last_name = ${input.lastName},
        coupon_code = ${input.couponCode ?? null},
        updated_at = NOW()
      WHERE id = ${input.inviteId}::uuid
    `

    if (updatedCount === 0) {
      throw new Error('Invite not found')
    }

    return { updated: true }
  }, 'updateSystemSignupInvite')
}
