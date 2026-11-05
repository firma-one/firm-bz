import { BRAND_NAME } from '@/config/brand'
import { PLATFORM_SUPPORT_EMAIL } from '@/config/platform-emails'
import { EMAIL_COLORS as C, EMAIL_FONTS as F, escHtml } from '../base'

/*
 * The rich kit for campaign emails: the landing page's look, rebuilt for the inbox.
 *
 * `base.ts` is deliberately plain, for transactional mail. These are for announcements, so they use
 * what the site does: the silk ribbon, dark slanted bands, electric-green pills and real product
 * screens. Canvas, SVG and clip-path don't survive email clients, so the ribbon, the slants and the
 * Brio mark are images (public/email/), and every layout is an inline-styled table. A send embeds the
 * images in the message (./embed.ts), so they must all be plain `<img>`s, never CSS backgrounds.
 *
 * Everything degrades to something readable: with images blocked the bands keep their color, the
 * copy is live text and each screen has alt text; without media queries the column just scales.
 *
 * Checked against a real send to Outlook: it ignores CSS gradients and the `align` attribute. So
 * anything that must show is built from what it does keep (table cells, borders, `text-align`), and
 * a gradient may only ever be decoration over a solid `bgcolor`.
 */

/** The dark band color. The hosted slant images are drawn in exactly this, so change them together. */
export const BAND = '#052319'
const BAND_DEEP = '#04160F'
const BAND_LINE = '#1C5C43'
const BAND_PANEL = '#0A3527'
const ON_BAND_BODY = '#B5C9C1'
const PAGE = '#EEF3F0'

/**
 * The email's widest size, in px. It is a maximum, not a fixed width: the column shrinks to fit a
 * narrower reading pane or a phone. Hosted images are drawn at about 1200 px to stay sharp at this.
 */
export const EMAIL_WIDTH = 680
/** Column padding, in px. */
const GUTTER = 40
/** Inside a padded column, less the feature card's 1 px borders. */
const CARD_IMAGE_WIDTH = EMAIL_WIDTH - GUTTER * 2 - 2
/** The hero's ribbon strip. */
const RIBBON_WIDTH = 200

export type CampaignContext = {
  /** Where the email's links and images point: the live site for a send, this server for a preview. */
  origin: string
  /** The template id, used as the UTM campaign. */
  campaignId: string
}

/** A link into the site, tagged so a campaign's clicks can be told apart in analytics. */
export function campaignLink(ctx: CampaignContext, path: string): string {
  const url = new URL(path, ctx.origin)
  url.searchParams.set('utm_source', 'email')
  url.searchParams.set('utm_medium', 'product-update')
  url.searchParams.set('utm_campaign', ctx.campaignId)
  return url.toString()
}

/** An image under public/email/. A send embeds it in the message; the preview loads it from this server. */
export function emailAsset(ctx: CampaignContext, path: string): string {
  return new URL(`/email/${path}`, ctx.origin).toString()
}

/** The whole document. `rows` is a run of `<tr>`s from the helpers below. */
export function campaignDocument({ title, preheader, rows }: { title: string; preheader: string; rows: string[] }): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escHtml(title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" /><!--<![endif]-->
  <style>
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
    img { border: 0; outline: none; text-decoration: none; }
    a { text-decoration: none; }
    @media only screen and (max-width: ${EMAIL_WIDTH + 20}px) {
      .fc-page { padding: 0 !important; }
      .fc-shell { border-radius: 0 !important; }
      .fc-pad { padding-left: 24px !important; padding-right: 24px !important; }
      .fc-hero { padding-right: 24px !important; }
      .fc-hero-art { display: none !important; }
      .fc-h1 { font-size: 36px !important; line-height: 40px !important; }
      .fc-h2 { font-size: 28px !important; line-height: 33px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
    <tr>
      <td align="center" class="fc-page" style="padding:32px 12px;">
        <!--[if mso]><table role="presentation" width="${EMAIL_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="fc-shell" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="max-width:${EMAIL_WIDTH}px;margin:0 auto;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">
          ${rows.join('\n')}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`
}

const heading = (level: 1 | 2, className: string, size: number, lineHeight: number, color: string, html: string, margin = '0 0 16px') =>
  `<h${level} class="${className}" style="margin:${margin};font-family:${F.DISPLAY};font-size:${size}px;font-weight:700;letter-spacing:-0.02em;line-height:${lineHeight}px;color:${color};">${html}</h${level}>`

/** The big hero line. `html` is trusted markup. */
export const displayH1 = (html: string, color: string = C.INK) => heading(1, 'fc-h1', 46, 50, color, html)
/** A section title. `html` is trusted markup. */
export const displayH2 = (html: string, color: string = C.BOTTLE) => heading(2, 'fc-h2', 34, 39, color, html)

/** A paragraph. `html` is trusted markup. */
export function para(html: string, { color = C.BODY, size = 16, margin = '0 0 24px', align = 'left' }: { color?: string; size?: number; margin?: string; align?: 'left' | 'center' } = {}): string {
  return `<p style="margin:${margin};font-family:${F.FONT};font-size:${size}px;line-height:1.6;color:${color};text-align:${align};">${html}</p>`
}

/**
 * Brio's mark: sparkle, name and AI subscript, as `components/ui/brio.tsx` draws it. The sparkle is a
 * PNG because email clients drop inline SVG; `tone` says what it sits on.
 */
export function brioMark(ctx: CampaignContext, tone: 'light' | 'dark' | 'green' = 'light', size = 16): string {
  const sparkle = tone === 'dark' ? 'brio-sparkle-electric.png' : 'brio-sparkle-green.png'
  const color = tone === 'dark' ? '#FFFFFF' : tone === 'green' ? C.BOTTLE : C.INK
  return `<span style="white-space:nowrap;color:${color};font-weight:700;"><img src="${emailAsset(ctx, `shared/${sparkle}`)}" width="${size}" height="${size}" alt="" style="display:inline-block;vertical-align:-2px;width:${size}px;height:${size}px;" />&nbsp;Brio<span aria-hidden="true" style="font-size:0.5em;letter-spacing:0.06em;margin-left:0.15em;opacity:0.8;">AI</span></span>`
}

/** The electric chip the site puts above a section title. */
export function eyebrow(label: string, margin = '0 0 14px'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};"><tr><td bgcolor="${C.ELECTRIC}" style="background-color:${C.ELECTRIC};border-radius:999px;padding:5px 12px;font-family:${F.FONT};font-size:12px;font-weight:700;letter-spacing:0.03em;line-height:1;color:${C.ON_ELECTRIC};text-transform:uppercase;">${escHtml(label)}</td></tr></table>`
}

export type PillVariant = 'electric' | 'white' | 'ghost-dark'

const PILLS: Record<PillVariant, { bg: string; color: string; border: string; chevron: string }> = {
  electric: { bg: C.ELECTRIC, color: C.ON_ELECTRIC, border: C.ELECTRIC, chevron: C.ON_ELECTRIC },
  white: { bg: '#FFFFFF', color: C.INK, border: '#CBD8D2', chevron: C.INK },
  'ghost-dark': { bg: BAND_PANEL, color: '#FFFFFF', border: BAND_LINE, chevron: C.ELECTRIC },
}

/** The site's pills, side by side, each with its chevron. */
export function pills(items: { label: string; href: string; variant: PillVariant }[], align: 'left' | 'center' = 'left'): string {
  const cells = items.map((item, i) => {
    const p = PILLS[item.variant]
    return `<td bgcolor="${p.bg}" style="background-color:${p.bg};border:1px solid ${p.border};border-radius:999px;">
        <a href="${escHtml(item.href)}" style="display:inline-block;padding:13px 22px;font-family:${F.FONT};font-size:15px;font-weight:700;line-height:1;color:${p.color};text-decoration:none;border-radius:999px;white-space:nowrap;">${escHtml(item.label)}&nbsp;<span style="color:${p.chevron};">&rsaquo;</span></a>
      </td>${i < items.length - 1 ? '<td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>' : ''}`
  })
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${align === 'center' ? ' align="center" style="margin:0 auto;"' : ''}><tr>${cells.join('')}</tr></table>`
}

/** A full-bleed screen or artwork, as wide as the email. */
export function imageRow({ src, alt, bg = '#FFFFFF' }: { src: string; alt: string; bg?: string }): string {
  return `<tr><td bgcolor="${bg}" style="background-color:${bg};font-size:0;line-height:0;"><img src="${src}" width="${EMAIL_WIDTH}" alt="${escHtml(alt)}" style="display:block;width:100%;max-width:${EMAIL_WIDTH}px;height:auto;font-family:${F.FONT};font-size:14px;line-height:1.5;color:${C.MUTED};" /></td></tr>`
}

/** The site's slanted band edge: an image, since clip-path doesn't reach the inbox. */
export function slant(ctx: CampaignContext, name: 'white-band' | 'band-gray' | 'gray-band'): string {
  return `<tr><td style="font-size:0;line-height:0;"><img src="${emailAsset(ctx, `shared/slant-${name}.png`)}" width="${EMAIL_WIDTH}" alt="" style="display:block;width:100%;max-width:${EMAIL_WIDTH}px;height:auto;" /></td></tr>`
}

/**
 * The hero: logo, announcement chip, headline, copy and buttons on white, with the silk ribbon down
 * the right side. The ribbon is its own cell rather than a background, because a background can't be
 * embedded reliably; it fades to white at the bottom, so the text can run longer than it, and phones
 * drop it to give the text the full width.
 */
export function heroRow({
  ctx,
  ribbon,
  chip,
  chipText,
  headline,
  lede,
  actions,
}: {
  ctx: CampaignContext
  ribbon: string
  chip: string
  chipText: string
  headline: string
  lede: string
  actions: string
}): string {
  return `<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="fc-pad fc-hero" valign="top" style="padding:32px 12px 32px ${GUTTER}px;">
      <a href="${escHtml(campaignLink(ctx, '/'))}" style="display:inline-block;"><img src="${emailAsset(ctx, 'shared/logo.png')}" width="109" height="28" alt="${escHtml(BRAND_NAME)}" style="display:block;width:109px;height:28px;font-family:${F.DISPLAY};font-size:22px;font-weight:700;color:${C.INK};" /></a>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:34px 0 20px;"><tr>
        <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #DCE6E1;border-radius:999px;padding:4px 14px 4px 4px;font-family:${F.FONT};font-size:13px;line-height:18px;color:${C.INK};">
          <span style="display:inline-block;background-color:${C.ELECTRIC};color:${C.ON_ELECTRIC};border-radius:999px;padding:1px 9px;font-size:11px;font-weight:700;letter-spacing:0.02em;">${escHtml(chip)}</span>&nbsp;&nbsp;${escHtml(chipText)}
        </td>
      </tr></table>
      ${displayH1(headline)}
      ${para(lede, { margin: '0 0 26px' })}
      ${actions}
    </td>
    <td class="fc-hero-art" width="${RIBBON_WIDTH}" valign="top" style="width:${RIBBON_WIDTH}px;font-size:0;line-height:0;"><img src="${ribbon}" width="${RIBBON_WIDTH}" alt="" style="display:block;width:${RIBBON_WIDTH}px;height:auto;" /></td>
    </tr></table>
  </td></tr>`
}

/** A padded section on white. */
export function whiteRow(inner: string, padding = `40px ${GUTTER}px`): string {
  return `<tr><td class="fc-pad" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:${padding};">${inner}</td></tr>`
}

/** A padded section on the site's pale gray band. */
export function grayRow(inner: string, padding = `28px ${GUTTER}px 44px`): string {
  return `<tr><td class="fc-pad" bgcolor="${C.GRAY}" style="background-color:${C.GRAY};padding:${padding};">${inner}</td></tr>`
}

/** A padded section on the dark band. Solid in Outlook; the gradient only deepens the middle. */
export function bandRow(inner: string, padding = `28px ${GUTTER}px 40px`): string {
  return `<tr><td class="fc-pad" bgcolor="${BAND}" style="background-color:${BAND};background-image:linear-gradient(180deg,${BAND} 0%,${BAND_DEEP} 45%,${BAND} 100%);padding:${padding};">${inner}</td></tr>`
}

/**
 * One step of a vertical timeline on the band: a dot and its label, then a white card beside the line.
 * The line is a cell border running the height of the card, so it holds in every client; centered
 * under the 14 px dot by the 6 px spacer cell.
 */
export function timelineMoment({ label, card, foot, last = false }: { label: string; card: string; foot: string; last?: boolean }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td colspan="2" width="26" valign="middle" style="width:26px;">
        <div style="width:14px;height:14px;line-height:14px;font-size:0;border-radius:50%;background-color:${C.ELECTRIC};">&nbsp;</div>
      </td>
      <td valign="middle" style="font-family:${F.FONT};font-size:13px;font-weight:600;line-height:15px;color:#FFFFFF;">${label}</td>
    </tr>
    <tr>
      <td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
      <td width="20" style="width:20px;font-size:0;line-height:0;border-left:2px solid ${last ? 'transparent' : BAND_LINE};">&nbsp;</td>
      <td valign="top" style="padding:10px 0 ${last ? 0 : 22}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:12px;">
          <tr><td style="padding:14px 16px 12px;font-family:${F.FONT};font-size:14px;line-height:1.5;color:#37352F;">
            ${card}
            <p style="margin:12px 0 0;padding-top:10px;border-top:1px solid ${C.LINE};font-family:${F.FONT};font-size:12.5px;font-weight:500;line-height:1.4;color:${C.LINK};">${escHtml(foot)}</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>`
}

/** A question to Brio, right-aligned in a gray bubble as in the product. */
export function askBubble(question: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr><td align="right" style="text-align:right;"><span style="display:inline-block;background-color:#F1F1EF;border-radius:10px;padding:6px 11px;font-family:${F.FONT};font-size:13.5px;line-height:1.4;color:#37352F;text-align:left;">${escHtml(question)}</span></td></tr></table>`
}

/** The translucent "kept in its lane" box on the band. */
export function bandPanel(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BAND_PANEL}" style="background-color:${BAND_PANEL};border:1px solid ${BAND_LINE};border-radius:14px;"><tr><td style="padding:18px 20px 8px;">${inner}</td></tr></table>`
}

/** A check-marked line, for lists on the band or on white. */
export function checkLine(html: string, { tone = 'dark' }: { tone?: 'dark' | 'light' } = {}): string {
  const mark = tone === 'dark' ? C.ELECTRIC : C.BOTTLE
  const color = tone === 'dark' ? '#FFFFFF' : C.BODY
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr>
    <td width="22" valign="top" style="width:22px;font-family:${F.FONT};font-size:14px;font-weight:700;line-height:21px;color:${mark};">&#10003;</td>
    <td valign="top" style="font-family:${F.FONT};font-size:14px;line-height:21px;color:${color};">${html}</td>
  </tr></table>`
}

/** A feature: title and copy above a real screen on its pastel panel, like the site's bento cards. */
export function featureCard({ title, html, src, alt }: { title: string; html: string; src: string; alt: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid ${C.LINE};border-radius:14px;overflow:hidden;margin:0 0 16px;">
    <tr><td style="padding:20px 22px 16px;">
      <h3 style="margin:0 0 6px;font-family:${F.DISPLAY};font-size:20px;font-weight:700;letter-spacing:-0.015em;line-height:25px;color:${C.INK};">${escHtml(title)}</h3>
      <p style="margin:0;font-family:${F.FONT};font-size:14.5px;line-height:1.55;color:${C.BODY};">${html}</p>
    </td></tr>
    <tr><td style="font-size:0;line-height:0;"><img src="${src}" width="${CARD_IMAGE_WIDTH}" alt="${escHtml(alt)}" style="display:block;width:100%;height:auto;font-family:${F.FONT};font-size:13px;line-height:1.5;color:${C.MUTED};" /></td></tr>
  </table>`
}

/** A white card holding a short list under the feature cards. */
export function listCard(title: string, lines: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid ${C.LINE};border-radius:14px;">
    <tr><td style="padding:20px 22px 12px;">
      <h3 style="margin:0 0 12px;font-family:${F.DISPLAY};font-size:20px;font-weight:700;letter-spacing:-0.015em;line-height:25px;color:${C.INK};">${escHtml(title)}</h3>
      ${lines.map((line) => checkLine(line, { tone: 'light' })).join('')}
    </td></tr>
  </table>`
}

/** The address opt-outs reach. The system page's send also carries it as a List-Unsubscribe header. */
export const UNSUBSCRIBE_MAILTO = `mailto:${PLATFORM_SUPPORT_EMAIL}?subject=${encodeURIComponent('Unsubscribe from product updates')}`

/** The closing row: site links, why you got this, and how to stop. */
export function footerRow(
  ctx: CampaignContext,
  links: { label: string; path: string }[],
  reason = `You’re receiving this product update from ${BRAND_NAME}, the client workspace built on your own Drive.`,
): string {
  const linkStyle = `color:#FFFFFF;font-weight:600;text-decoration:none;`
  return `<tr><td class="fc-pad" bgcolor="${BAND_DEEP}" style="background-color:${BAND_DEEP};padding:24px ${GUTTER}px 30px;font-family:${F.FONT};font-size:12.5px;line-height:1.7;color:${ON_BAND_BODY};text-align:center;">
    <p style="margin:0 0 10px;">${links.map((l) => `<a href="${escHtml(campaignLink(ctx, l.path))}" style="${linkStyle}">${escHtml(l.label)}</a>`).join(' &nbsp;·&nbsp; ')}</p>
    <p style="margin:0;">${escHtml(reason)}<br />
    Prefer not to get these? <a href="${escHtml(UNSUBSCRIBE_MAILTO)}" style="color:${ON_BAND_BODY};text-decoration:underline;">Unsubscribe</a>.<br />
    &copy; ${new Date().getFullYear()} ${escHtml(BRAND_NAME)}</p>
  </td></tr>`
}
