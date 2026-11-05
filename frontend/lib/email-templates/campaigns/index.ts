import { brioWhatsNew2026_11 } from './brio-whats-new-2026-11'
import type { CampaignContext } from './kit'

/**
 * The emails /system/email-delivery can send: designed one at a time and checked into the repo, so
 * what goes out has been reviewed like any other change. Nothing here is editable at runtime.
 *
 * To add one:
 * 1. Write `lib/email-templates/campaigns/<id>.ts` and build it from `./kit`. The id is a slug with
 *    the date in it, and it also names the image folder and the UTM campaign.
 * 2. Put its images in `public/email/<id>/`, at twice the size they display. Keep them on real product
 *    screens (the /tour demo firm), and remember a screen in an image can't be updated after sending.
 * 3. Add it to CAMPAIGN_TEMPLATES below. It then appears on the page, and `campaigns.test.ts` checks
 *    it: a full document under Gmail's clipping limit, absolute links, images that exist, no em dashes.
 * 4. Hold every claim to what ships today. Features hidden behind a flag don't count.
 *
 * Images load from the live site, so a template's images must be deployed before its first real
 * send. The page checks, and holds Send until they are live.
 */
export type CampaignTemplate = {
  /** Stable slug. Also the image folder and the UTM campaign. */
  id: string
  /** What the picker shows. */
  name: string
  /** One line on what it says and when to use it. */
  description: string
  /** When it was designed, YYYY-MM-DD. The picker lists newest first. */
  createdAt: string
  subject: string
  /** The inbox preview line. */
  preheader: string
  render: (ctx: CampaignContext) => string
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [brioWhatsNew2026_11]

/** Newest first, as the picker shows them. */
export function listCampaignTemplates(): CampaignTemplate[] {
  return [...CAMPAIGN_TEMPLATES].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getCampaignTemplate(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((template) => template.id === id)
}

/** Renders a template with its id as the campaign. */
export function renderCampaignTemplate(template: CampaignTemplate, origin: string): string {
  return template.render({ origin, campaignId: template.id })
}

/** Every hosted image a rendered template points at: `<img>`s and CSS or attribute backgrounds. */
export function campaignImageUrls(html: string): string[] {
  const patterns = [/<img\s[^>]*src="([^"]+)"/g, /\sbackground="([^"]+)"/g, /url\('([^']+)'\)/g]
  const urls = patterns.flatMap((pattern) => Array.from(html.matchAll(pattern), (match) => match[1]))
  return Array.from(new Set(urls))
}
