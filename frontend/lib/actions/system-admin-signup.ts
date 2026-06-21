'use server'

import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { sendEmail } from '@/lib/email'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from '@/lib/email-templates/base'
import { prisma } from '@/lib/prisma'
import { serverActionWrapper, type ActionResponse } from '@/lib/server-action-wrapper'
import { isSystemAdminEmail } from '@/lib/system/admin-check'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

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


function buildAdminSignupEmailHtml({
  fullName,
  couponCode,
  actionLink,
}: {
  fullName: string
  couponCode?: string
  actionLink: string
}): string {
  const couponSection = couponCode
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin:20px 0;">
        <tr>
          <td style="padding:16px 20px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">Discount Coupon</p>
            <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;font-size:24px;font-weight:800;letter-spacing:0.12em;color:#1b1b1d;">${escHtml(couponCode)}</span>
          </td>
        </tr>
      </table>`
    : ''

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">Complete your signup</h2>
    <p style="margin:0 0 16px;font-size:15px;color:${TEXT_MUTED};line-height:1.6;">Hi ${escHtml(fullName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:${TEXT_MUTED};line-height:1.6;">
      Your account setup is almost done. Confirm your email to activate access and continue to your workspace.
    </p>
    ${ctaButton('Confirm and Complete Signup', actionLink)}
    ${couponSection}
    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      This link is single-use and tied to your email address. If you did not expect this email, you can safely ignore it.
    </p>
  `

  const title = couponCode ? 'Complete your signup and claim your coupon' : 'Complete your signup'
  return renderEmail({ title, preheader: `Hi ${fullName}, confirm your email to activate your account.`, body })
}

async function assertSystemAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')
  if (!isSystemAdminEmail(user.email)) {
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
