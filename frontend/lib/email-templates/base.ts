import { BRAND_NAME, FIRMA_COLOR } from '@/config/brand'

const PRIMARY = FIRMA_COLOR
const PRIMARY_DARK = '#004d3a'
const TEXT_DARK = '#1b1b1d'
const TEXT_MUTED = '#45474c'
const BORDER = '#e5e7eb'
const BG_SURFACE = '#f9f9fb'

/**
 * Wrap any HTML body content in the Firma branded email shell.
 * Usage: renderEmail({ title, preheader, body })
 */
export function renderEmail({
  title,
  preheader,
  body,
}: {
  title: string
  preheader?: string
  body: string
}): string {
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid ${BORDER};overflow:hidden;">

          <!-- Header bar -->
          <tr>
            <td style="background:${PRIMARY};padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${escHtml(brandCap)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BG_SURFACE};border-top:1px solid ${BORDER};padding:20px 32px;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">
                You're receiving this email because you're a member of a ${escHtml(brandCap)} workspace.
                <br/>
                &copy; ${new Date().getFullYear()} ${escHtml(brandCap)}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Renders a primary CTA button.
 */
export function ctaButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
    <tr>
      <td style="border-radius:4px;background:${PRIMARY};">
        <a href="${escHtml(href)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:4px;letter-spacing:0.01em;">${escHtml(label)}</a>
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

export { TEXT_DARK, TEXT_MUTED, BORDER, PRIMARY, PRIMARY_DARK }
