const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const MONO = `'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace`
const HEADLINE_FONT = `'Helvetica Neue',Helvetica,Arial,sans-serif`

// ─── Shared badge HTML (email-safe inline badges) ────────────────────────────
const BADGE_RADIUS = '4px'
const STD_BADGE = `<span style="display:inline-block;background-color:#dcfce7;border:1px solid #86efac;padding:1px 6px;font-size:11px;font-weight:700;color:#166534;border-radius:${BADGE_RADIUS};vertical-align:middle;line-height:1.6;font-family:${FONT};">★ Standard</span>`
const PRO_BADGE = `<span style="display:inline-block;background-color:#dbeafe;border:1px solid #bfdbfe;padding:1px 6px;font-size:11px;font-weight:700;color:#1e3a8a;border-radius:${BADGE_RADIUS};vertical-align:middle;line-height:1.6;font-family:${FONT};">Pro ✦</span>`

// ─── Logo block ───────────────────────────────────────────────────────────────
const LOGO_HTML = `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;">
    <tr>
      <td style="padding-right:12px;vertical-align:middle;">
        <div style="width:40px;height:40px;background-color:#0d1520;border:2px solid #4aba5e;text-align:center;vertical-align:middle;line-height:40px;">
          <span style="font-size:20px;font-weight:900;color:#4aba5e;letter-spacing:-0.04em;font-family:${FONT};">f</span>
        </div>
      </td>
      <td style="vertical-align:middle;text-align:left;">
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;line-height:1;color:#4aba5e;font-family:${FONT};">firmä</div>
        <div style="font-size:10px;color:#7c8496;margin-top:4px;letter-spacing:0.1em;text-transform:uppercase;font-family:${FONT};">Organize &nbsp;·&nbsp; Protect &nbsp;·&nbsp; Deliver</div>
      </td>
    </tr>
  </table>
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
function bullet(color: string, text: string): string {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
        <tr>
          <td style="width:14px;vertical-align:top;padding-top:4px;">
            <div style="width:6px;height:6px;border-radius:50%;background-color:${color};"></div>
          </td>
          <td style="font-size:11px;font-weight:700;color:#45474c;text-transform:uppercase;letter-spacing:0.07em;font-family:${HEADLINE_FONT};padding-left:4px;line-height:1.5;">
            ${text}
          </td>
        </tr>
      </table>`
}

// ─── Left offer cards ─────────────────────────────────────────────────────────
const LEFT_CARDS_HTML = `
  <!-- Card 1: For You -->
  <div style="background-color:#ffffff;border-bottom:1px solid #e8e8ea;padding:16px 12px 14px 12px;">
    <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:#5a78ff;text-transform:uppercase;letter-spacing:0.15em;font-family:${HEADLINE_FONT};">01 / For You</p>
    <h2 style="margin:0 0 14px 0;font-size:20px;font-weight:800;color:#1b1b1d;line-height:1.25;letter-spacing:-0.02em;font-family:${HEADLINE_FONT};">
      Free 3 months on us.<br>Refer 5 friends &mdash; upgrade to ${PRO_BADGE}.
    </h2>
    <div>
      ${bullet('#22c55e', `Free 3-month ${STD_BADGE} &mdash; exclusively for Early Adopters`)}
      ${bullet('#22c55e', `5 referrals &rarr; free 3-month ${PRO_BADGE} upgrade`)}
    </div>
    <div style="margin-top:16px;">
      <a href="https://firma.bz/pricing" style="display:inline-block;background-color:#141c2a;color:#ffffff;font-size:10px;font-weight:700;text-decoration:none;padding:9px 14px;letter-spacing:0.12em;text-transform:uppercase;font-family:${HEADLINE_FONT};">
        Explore plans &amp; features &nbsp;&rarr;
      </a>
    </div>
  </div>

  <!-- Card 2: For Your Friends -->
  <div style="background-color:#ffffff;padding:16px 12px 14px 12px;">
    <p style="margin:0 0 10px 0;font-size:10px;font-weight:700;color:#5a78ff;text-transform:uppercase;letter-spacing:0.15em;font-family:${HEADLINE_FONT};">02 / For Your Friends</p>
    <h2 style="margin:0 0 14px 0;font-size:20px;font-weight:800;color:#1b1b1d;line-height:1.25;letter-spacing:-0.02em;font-family:${HEADLINE_FONT};">
      Share the spot.<br>They get the same deal.
    </h2>
    <div>
      ${bullet('#5a78ff', `They secure a free 3-month ${STD_BADGE} spot`)}
      ${bullet('#5a78ff', `Every referral counts toward your ${PRO_BADGE} upgrade`)}
    </div>
  </div>
`

// ─── Right referral panel ─────────────────────────────────────────────────────
function rightPanelHtml(opts: {
    referralCode: string
    referralCount: number
    campaignId: string
    siteOrigin: string
    email: string
    newJoinerEmail?: string
}): string {
    const { referralCode, referralCount, siteOrigin, campaignId, email, newJoinerEmail } = opts
    const isPro = referralCount >= 5
    const referralUrl = `${siteOrigin}/waitlist/${campaignId}?ref=${referralCode}&utm_source=referral&utm_medium=email&utm_campaign=waitlist`
    const waitlistUrl = `${siteOrigin}/waitlist/${campaignId}?email=${encodeURIComponent(email)}`
    const progressPct = Math.min(100, Math.round((referralCount / 5) * 100))

    return `
      <!-- Panel header -->
      <div style="background-color:#F0EDEE;border-bottom:1px solid #e8e2dc;padding:14px 20px;display:flex;align-items:center;gap:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:10px;vertical-align:middle;">
              <div style="width:22px;height:22px;border-radius:50%;background-color:#22c55e;text-align:center;line-height:22px;">
                <span style="color:#ffffff;font-size:13px;font-weight:700;">✓</span>
              </div>
            </td>
            <td style="vertical-align:middle;">
              <span style="font-size:15px;font-weight:800;color:#1b1b1d;font-family:${HEADLINE_FONT};">You're on the list!</span>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:12px;">

        ${newJoinerEmail ? `
        <!-- New joiner notification -->
        <div style="background-color:#ffffff;border:1px solid #F0EDEE;padding:10px 12px;margin-bottom:10px;">
          <p style="margin:0 0 3px 0;font-size:10px;font-weight:700;color:#76777d;text-transform:uppercase;letter-spacing:0.1em;font-family:${HEADLINE_FONT};">New referral</p>
          <p style="margin:0;font-size:16px;font-weight:800;color:#141c2a;font-family:${HEADLINE_FONT};">${newJoinerEmail}</p>
          <p style="margin:4px 0 0 0;font-size:13px;color:#45474c;">joined using your referral link.</p>
        </div>
        ` : ''}

        <!-- Plan status -->
        <div style="background-color:${isPro ? '#eef1ff' : '#f0fdf4'};border:1px solid ${isPro ? '#c7d2fe' : '#bbf7d0'};padding:10px 12px;margin-bottom:10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="width:22px;vertical-align:top;padding-top:1px;">
                <div style="width:18px;height:18px;border-radius:50%;background-color:${isPro ? '#5a78ff' : '#22c55e'};text-align:center;line-height:18px;">
                  <span style="color:#ffffff;font-size:11px;font-weight:700;">✓</span>
                </div>
              </td>
              <td style="padding-left:10px;vertical-align:top;">
                <p style="margin:0 0 2px 0;font-size:13px;font-weight:700;color:#1b1b1d;font-family:${HEADLINE_FONT};">
                  Free 3-month ${isPro ? PRO_BADGE : STD_BADGE} plan secured!
                </p>
                <p style="margin:0;font-size:12px;color:#45474c;">
                  ${isPro
                    ? `${referralCount} referrals — Pro upgrade unlocked 🎉`
                    : referralCount === 0
                        ? 'Refer 5 friends to unlock a free 3-month Pro upgrade'
                        : `${referralCount} of 5 referrals — ${5 - referralCount} more to unlock Pro`
                  }
                </p>
              </td>
              ${!isPro && referralCount > 0 ? `
              <td style="text-align:right;white-space:nowrap;padding-left:8px;">
                <span style="font-size:22px;font-weight:900;color:#1b1b1d;font-family:${HEADLINE_FONT};">${referralCount}</span>
                <span style="font-size:11px;color:#45474c;"> / 5</span>
              </td>` : ''}
            </tr>
          </table>
        </div>

        ${!isPro ? `
        <!-- Progress bar -->
        <div style="margin-bottom:14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:5px;">
            <tr>
              <td style="font-size:10px;font-weight:700;color:#45474c;text-transform:uppercase;letter-spacing:0.08em;font-family:${HEADLINE_FONT};">Referral progress</td>
              <td style="font-size:10px;font-weight:700;color:#45474c;text-align:right;font-family:${HEADLINE_FONT};">${referralCount} / 5</td>
            </tr>
          </table>
          <div style="background-color:#F0EDEE;height:5px;overflow:hidden;">
            <div style="background-color:#72ff70;height:5px;width:${progressPct}%;"></div>
          </div>
        </div>
        ` : ''}

        <!-- Referral link -->
        <div style="background-color:#ffffff;border:1px solid #F0EDEE;padding:10px 12px;margin-bottom:10px;">
          <p style="margin:0 0 3px 0;font-size:10px;font-weight:700;color:#76777d;text-transform:uppercase;letter-spacing:0.1em;font-family:${HEADLINE_FONT};">Your referral link</p>
          <p style="margin:0 0 10px 0;font-size:12px;color:#45474c;">Copy and share — every sign-up counts toward your free ${PRO_BADGE} upgrade.</p>
          <div style="background-color:#FDF8FA;border:1px solid #F0EDEE;padding:8px 10px;word-break:break-all;">
            <code style="font-family:${MONO};font-size:11px;color:#2d6d3a;">${referralUrl}</code>
          </div>
        </div>

        ${!isPro ? `
        <!-- Pro nudge -->
        <div style="background-color:#eef1ff;border:1px solid #c7d2fe;padding:12px 16px;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#45474c;">
            ⚡ Refer <strong>5 friends</strong> to unlock a free 3-month ${PRO_BADGE} upgrade!
          </p>
        </div>
        ` : ''}

        <!-- Black CTA -->
        <div style="text-align:center;">
          <a href="${waitlistUrl}" style="display:inline-block;background-color:#141c2a;color:#ffffff;font-family:${HEADLINE_FONT};font-size:12px;font-weight:700;text-decoration:none;padding:13px 28px;letter-spacing:0.12em;text-transform:uppercase;">
            Check your referral count &rarr;
          </a>
        </div>

      </div>
    `
}

// ─── Email shell (wide 2-column layout) ──────────────────────────────────────
function emailShell(rightPanelContent: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    @media only screen and (max-width:640px) {
      .col { display:block !important; width:100% !important; }
      .col-left { border-right:none !important; border-bottom:1px solid #e8e8ea !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FDF8FA;font-family:${FONT};color:#1b1b1d;line-height:1.5;">
  <div style="max-width:820px;margin:40px auto 0 auto;padding:0 0 32px 0;">
    <div style="background-color:#ffffff;overflow:hidden;box-shadow:0 14px 36px rgba(27,27,29,0.07);">

      <!-- Hero header -->
      <div style="background-color:#141c2a;padding:24px 20px 20px 20px;text-align:center;">
        ${LOGO_HTML}
        <div style="width:40px;height:3px;background-color:#72ff70;margin:0 auto 18px auto;"></div>
        <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;line-height:1.2;font-family:${HEADLINE_FONT};">
          You're on the list!
        </h1>
        <p style="margin:0;font-size:14px;color:#7c8496;line-height:1.6;font-family:${FONT};">
          Welcome to the Firma early access waitlist. Here's everything you need.
        </p>
      </div>

      <!-- 2-column body -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <!-- Left: offer cards -->
          <td class="col col-left" style="width:48%;vertical-align:top;border-right:1px solid #e8e8ea;">
            ${LEFT_CARDS_HTML}
          </td>
          <!-- Right: referral panel -->
          <td class="col" style="width:52%;vertical-align:top;background-color:#ffffff;">
            ${rightPanelContent}
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <div style="padding:14px 20px;text-align:center;border-top:1px solid #F0EDEE;background-color:#F0EDEE;">
        <p style="margin:0;font-size:11px;color:#76777d;font-family:${FONT};">
          &copy; 2026 firmä. All rights reserved.
        </p>
      </div>

    </div>
  </div>
</body>
</html>`
}

// ─── Exported email functions ─────────────────────────────────────────────────
export function waitlistConfirmationEmail(opts: {
    referralCode: string
    campaignId: string
    siteOrigin: string
    email: string
}): string {
    return emailShell(rightPanelHtml({ ...opts, referralCount: 0 }))
}

export function referrerNotificationEmail(opts: {
    referralCount: number
    newJoinerEmail: string
    referralCode: string
    campaignId: string
    siteOrigin: string
    email: string
}): string {
    const { referralCount, newJoinerEmail, referralCode, campaignId, siteOrigin, email } = opts
    return emailShell(rightPanelHtml({ referralCode, referralCount, siteOrigin, campaignId, email, newJoinerEmail }))
}
