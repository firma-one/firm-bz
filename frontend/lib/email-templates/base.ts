import { BRAND_NAME } from '@/config/brand'

/*
 * firmä email design system: the marketing site's green system, kept minimal for the inbox.
 * One white card on a pale green-gray page, a text wordmark, Inter, an electric-green pill button,
 * and gray detail boxes. No header bars, gradients, images or web fonts (clients block them).
 * Everything is inline-styled tables, so it holds in Gmail, Apple Mail and Outlook.
 */

/** Ink: headings and strong text. */
const INK = '#05271C'
/** Body copy. */
const BODY = '#3F5650'
/** Captions, labels, footer. */
const MUTED = '#4F625B'
/** Bottle green: the brand color (titles, accents). */
const BOTTLE = '#009669'
/** Small green text and links (5.4:1 on white). */
const LINK = '#007A55'
/** Electric green: buttons, always with ON_ELECTRIC text. */
const ELECTRIC = '#7DFF77'
const ON_ELECTRIC = '#03281B'
/** The page and detail-box gray. */
const GRAY = '#F6FAF8'
/** Hairlines. */
const LINE = '#E3EBE7'

const FONT = `Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
const DISPLAY = `'Space Grotesk',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
const MONO = `'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace`

/** Kept for templates that import the older names. */
const TEXT_DARK = INK
const TEXT_MUTED = BODY
const BORDER = LINE
const PRIMARY = BOTTLE
const PRIMARY_DARK = LINK

const DEFAULT_FOOTER_NOTE = `You're receiving this email because you're a member of a ${BRAND_NAME} workspace.`

/**
 * Wrap any HTML body content in the firmä email shell.
 * Usage: renderEmail({ title, preheader, body }). `footerNote` replaces the default line
 * ("You're receiving this email because…") for mail that isn't about a workspace.
 */
export function renderEmail({
  title,
  preheader,
  body,
  footerNote = DEFAULT_FOOTER_NOTE,
}: {
  title: string
  preheader?: string
  body: string
  footerNote?: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escHtml(title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    /* For plain fragments passed straight to sendEmail; templates style inline. */
    .fm-body p { margin: 0 0 14px; }
    .fm-body p:last-child { margin-bottom: 0; }
    .fm-body ul { margin: 0 0 14px; padding-left: 20px; }
    .fm-body a { color: ${LINK}; font-weight: 600; }
    .fm-body strong { color: ${INK}; }
    .fm-body code { font-family: ${MONO}; font-size: 13px; background: ${GRAY}; padding: 2px 5px; border-radius: 4px; }
    @media only screen and (max-width: 600px) {
      .fm-card { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${GRAY};-webkit-text-size-adjust:100%;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GRAY}" style="background-color:${GRAY};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 18px;">
              <span style="font-family:${DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.04em;line-height:1;color:${INK};">${escHtml(BRAND_NAME)}</span>
            </td>
          </tr>
          <tr>
            <td class="fm-card fm-body" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid ${LINE};border-radius:12px;padding:32px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
              ${escHtml(footerNote)}<br />
              ${escHtml(BRAND_NAME)} · The client workspace built on your own Drive ·
              <a href="https://firma.bz" style="color:${LINK};text-decoration:none;font-weight:600;">firma.bz</a><br />
              &copy; ${new Date().getFullYear()} ${escHtml(BRAND_NAME)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** The email's title line. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 10px;font-family:${DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.02em;line-height:1.25;color:${INK};">${escHtml(text)}</h1>`
}

/** A body paragraph. `html` is trusted markup: escape user values before passing them in. */
export function emailText(html: string): string {
  return `<p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${html}</p>`
}

/**
 * A gray box naming what the email is about: a small label, a title and up to a few muted lines.
 * Values are escaped here; `extraHtml` is trusted markup for anything richer.
 */
export function detailCard({
  label,
  title,
  lines = [],
  extraHtml = '',
}: {
  label: string
  title: string
  lines?: string[]
  extraHtml?: string
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GRAY}" style="background-color:${GRAY};border-radius:10px;margin:0 0 4px;">
    <tr>
      <td style="padding:16px 20px;font-family:${FONT};">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${LINK};">${escHtml(label)}</p>
        <p style="margin:0;font-size:15px;font-weight:600;line-height:1.45;color:${INK};">${escHtml(title)}</p>
        ${lines.map((l) => `<p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:${BODY};">${escHtml(l)}</p>`).join('')}
        ${extraHtml}
      </td>
    </tr>
  </table>`
}

/** Small print under the button (why you got this, how to turn it off). */
export function emailFootnote(html: string): string {
  return `<p style="margin:24px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${html}</p>`
}

/**
 * The primary button: an electric-green pill with a › chevron, as on the website. A trailing
 * arrow in the label ("Open →") is dropped in favor of the chevron.
 */
export function ctaButton(label: string, href: string): string {
  const text = label.replace(/\s*(→|&rarr;|›)\s*$/, '')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
    <tr>
      <td bgcolor="${ELECTRIC}" style="border-radius:999px;background-color:${ELECTRIC};">
        <a href="${escHtml(href)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${ON_ELECTRIC};text-decoration:none;border-radius:999px;">${escHtml(text)}&nbsp;&rsaquo;</a>
      </td>
    </tr>
  </table>`
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const EMAIL_COLORS = { INK, BODY, MUTED, BOTTLE, LINK, ELECTRIC, ON_ELECTRIC, GRAY, LINE } as const
export const EMAIL_FONTS = { FONT, DISPLAY, MONO } as const

export { TEXT_DARK, TEXT_MUTED, BORDER, PRIMARY, PRIMARY_DARK }
