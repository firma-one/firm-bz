import { firmaIntro2026_11 } from './firma-intro-2026-11'
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
 * A send embeds every image in the message, so each one adds to every email: keep the set small
 * (about 350 KB today), and use plain `<img>`s, never CSS backgrounds. `embed.test.ts` checks both.
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

/**
 * `brio-whats-new-2026-11.ts` stays off this list: it reads as an update to existing customers, and
 * there are none yet. Add it here once there are.
 */
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [firmaIntro2026_11]

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

/** Every image a rendered template points at, once each. */
export function campaignImageUrls(html: string): string[] {
  return Array.from(new Set(Array.from(html.matchAll(/<img\s[^>]*src="([^"]+)"/g), (match) => match[1])))
}
