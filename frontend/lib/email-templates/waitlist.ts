import { BRAND_NAME } from '@/config/brand'
import { EMAIL_COLORS as C, EMAIL_FONTS as F, ctaButton, detailCard, emailHeading, emailText, escHtml, renderEmail } from './base'

/*
 * Waitlist emails, on the shared minimal shell: the confirmation a new joiner gets, and the note a
 * referrer gets when someone joins with their link. One column; the referral status first, then
 * the offer.
 */

const REFERRALS_FOR_PRO = 5

function progressBar(count: number): string {
  const pct = Math.min(100, Math.round((count / REFERRALS_FOR_PRO) * 100))
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
      <tr>
        <td style="font-family:${F.FONT};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${C.MUTED};padding-bottom:6px;">Referral progress</td>
        <td style="font-family:${F.FONT};font-size:11px;font-weight:700;color:${C.MUTED};text-align:right;padding-bottom:6px;">${count} / ${REFERRALS_FOR_PRO}</td>
      </tr>
      <tr>
        <td colspan="2" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:999px;height:6px;line-height:6px;font-size:0;">
          <table role="presentation" width="${pct || 1}%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.BOTTLE}" style="background-color:${C.BOTTLE};border-radius:999px;height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr></table>
        </td>
      </tr>
    </table>`
}

function offerList(title: string, items: string[]): string {
  return `<p style="margin:20px 0 6px;font-family:${F.FONT};font-size:15px;font-weight:700;color:${C.INK};">${title}</p>
    <ul style="margin:0;padding-left:20px;font-family:${F.FONT};font-size:14px;line-height:1.6;color:${C.BODY};">
      ${items.map((i) => `<li style="margin:0 0 4px;">${i}</li>`).join('')}
    </ul>`
}

function waitlistBody(opts: {
  referralCode: string
  referralCount: number
  campaignId: string
  siteOrigin: string
  email: string
  newJoinerEmail?: string
}): string {
  const { referralCode, referralCount, siteOrigin, campaignId, email, newJoinerEmail } = opts
  const isPro = referralCount >= REFERRALS_FOR_PRO
  const referralUrl = `${siteOrigin}/waitlist/${campaignId}?ref=${referralCode}&utm_source=referral&utm_medium=email&utm_campaign=waitlist`
  // TODO(pii): this puts the recipient's address in a query string, so it lands in request
  // logs, log drains and Referer headers — and unlike a DB row, a logged address cannot be
  // removed on an erasure request. Everywhere else that needs to carry an address through a
  // URL now uses a `#email=` fragment instead, which is never sent over HTTP (see
  // lib/actions/engagement-membership.ts and app/(app)/signin/use-sign-in-flow.ts).
  // Left as-is deliberately: the waitlist flow is not operational, and converting it also
  // means teaching app/(marketing)/waitlist/[campaignId] to read the fragment. Do that before
  // this flow goes live.
  const waitlistUrl = `${siteOrigin}/waitlist/${campaignId}?email=${encodeURIComponent(email)}`

  const status = isPro
    ? `${referralCount} referrals: Pro upgrade unlocked`
    : referralCount === 0
      ? `Refer ${REFERRALS_FOR_PRO} friends to unlock a free 3-month Pro upgrade`
      : `${referralCount} of ${REFERRALS_FOR_PRO} referrals: ${REFERRALS_FOR_PRO - referralCount} more to unlock Pro`

  const linkBox = `<p style="margin:10px 0 0;font-family:${F.FONT};font-size:13px;line-height:1.5;color:${C.BODY};">Copy and share it. Every sign-up counts toward your free Pro upgrade.</p>
    <p style="margin:10px 0 0;padding:10px 12px;background-color:#FFFFFF;border:1px solid ${C.LINE};border-radius:8px;font-family:${F.MONO};font-size:12px;line-height:1.5;color:${C.LINK};word-break:break-all;">${escHtml(referralUrl)}</p>`

  return [
    emailHeading("You're on the list!"),
    emailText(`Welcome to the ${escHtml(BRAND_NAME)} early access waitlist. Here’s everything you need.`),
    newJoinerEmail ? detailCard({ label: 'New referral', title: newJoinerEmail, lines: ['joined using your referral link.'] }) : '',
    newJoinerEmail ? '<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>' : '',
    detailCard({
      label: 'Your plan',
      title: `Free 3-month ${isPro ? 'Pro' : 'Standard'} plan secured`,
      lines: [status],
      extraHtml: isPro ? '' : progressBar(referralCount),
    }),
    '<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>',
    detailCard({ label: 'Your referral link', title: 'Share your spot', extraHtml: linkBox }),
    ctaButton('Check your referral count', waitlistUrl),
    offerList('For you: free 3 months on us', [
      'A free 3-month <strong>Standard</strong> plan, exclusively for early adopters',
      `${REFERRALS_FOR_PRO} referrals unlock a free 3-month <strong>Pro</strong> upgrade`,
    ]),
    offerList('For your friends: the same deal', [
      'They secure a free 3-month <strong>Standard</strong> spot',
      'Every referral counts toward your <strong>Pro</strong> upgrade',
    ]),
    `<p style="margin:20px 0 0;font-family:${F.FONT};font-size:14px;"><a href="${escHtml(`${siteOrigin}/pricing`)}" style="color:${C.LINK};font-weight:700;text-decoration:none;">Explore plans and features &rsaquo;</a></p>`,
  ].join('\n')
}

const FOOTER_NOTE = `You're receiving this email because you joined the ${BRAND_NAME} waitlist.`

export function waitlistConfirmationEmail(opts: {
  referralCode: string
  campaignId: string
  siteOrigin: string
  email: string
}): string {
  return renderEmail({
    title: "You're on the list!",
    preheader: 'Your free 3-month plan is secured. Here is your referral link.',
    body: waitlistBody({ ...opts, referralCount: 0 }),
    footerNote: FOOTER_NOTE,
  })
}

export function referrerNotificationEmail(opts: {
  referralCount: number
  newJoinerEmail: string
  referralCode: string
  campaignId: string
  siteOrigin: string
  email: string
}): string {
  return renderEmail({
    title: 'Someone joined with your referral link',
    preheader: `${opts.newJoinerEmail} joined using your referral link.`,
    body: waitlistBody(opts),
    footerNote: FOOTER_NOTE,
  })
}
