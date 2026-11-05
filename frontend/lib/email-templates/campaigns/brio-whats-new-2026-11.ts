import { BRAND_NAME } from '@/config/brand'
import { EMAIL_COLORS as C, escHtml } from '../base'
import { meetBrioBand } from './brio-band'
import type { CampaignTemplate } from './index'
import {
  bandRow,
  brioMark,
  campaignDocument,
  campaignLink,
  displayH2,
  emailAsset,
  eyebrow,
  featureCard,
  footerRow,
  grayRow,
  heroRow,
  imageRow,
  listCard,
  para,
  pills,
  slant,
  type CampaignContext,
} from './kit'

/*
 * What's new, November 2026: Brio and the rebuilt workspace around it.
 *
 * Every claim here is about what ships today. Two things that exist in code are left out on purpose
 * because they are hidden from users: Brio's Files agent (FILES_AGENT_PUBLIC) and Ask mode on Doc
 * Search.
 */

const ID = 'brio-whats-new-2026-11'
const image = (ctx: CampaignContext, name: string) => emailAsset(ctx, `${ID}/${name}`)

function render(ctx: CampaignContext): string {
  const signup = campaignLink(ctx, '/signup')
  const tour = campaignLink(ctx, '/tour')

  return campaignDocument({
    title: `What’s new in ${BRAND_NAME}`,
    preheader: 'Brio briefs you, answers your questions and drafts the client update. Plus a sharper Board, timeline and Files.',
    rows: [
      heroRow({
        ctx,
        ribbon: image(ctx, 'ribbon.jpg'),
        chip: 'NEW',
        chipText: `What’s new in ${BRAND_NAME} · November 2026`,
        headline: `Every client engagement, <span style="color:${C.BOTTLE};">now with Brio.</span>`,
        lede: `${escHtml(BRAND_NAME)} now comes with an assistant for client delivery, and a rebuilt workspace around it. ${brioMark(ctx)} briefs you, answers your questions and drafts the client update. Your files still never leave your Drive.`,
        actions: pills([
          { label: 'Start free', href: signup, variant: 'electric' },
          { label: 'Take the tour', href: tour, variant: 'white' },
        ]),
      }),
      imageRow({
        src: image(ctx, 'hero.jpg'),
        alt: 'The Engagement Overview for a product launch campaign, with the Ask Brio panel open. Asked what needs attention today, Brio names one overdue deliverable waiting on the client’s approval.',
      }),
      slant(ctx, 'white-band'),
      meetBrioBand(ctx, ID),
      slant(ctx, 'band-gray'),
      grayRow(`
        ${eyebrow('Also new')}
        ${displayH2('A sharper workspace around it.', C.BOTTLE)}
        ${para('Your client work, rebuilt screen by screen.', { margin: '0 0 22px' })}
        ${featureCard({
          title: 'One Board for every deliverable',
          html: 'An owner, a due date and a status for each one, with comments right on the card. Your team and your client see the same Board.',
          src: image(ctx, 'board.jpg'),
          alt: 'A Board with deliverables in To do, In progress, In review and Approved, each card showing its due date, owner and progress.',
        })}
        ${featureCard({
          title: 'A timeline for the whole engagement',
          html: 'Every deliverable as a bar running to its due date, on a month and week axis with today marked. Time past a due date shows up in red. Zoom to 30 days, 90 days or all of it.',
          src: image(ctx, 'timeline.jpg'),
          alt: 'A timeline of four deliverables as bars, with today marked and one deliverable shown running nine days late.',
        })}
        ${featureCard({
          title: 'Files that track the work',
          html: 'Status, Due and Assignee right in the table, with filters for Status and Assigned to me. Files outside a deliverable can carry a Status for your own tracking, and clients never see it. Dropped uploads retry by themselves and keep a Retry button if they still fail.',
          src: image(ctx, 'files.jpg'),
          alt: 'The Files table for an engagement with Status, Due and Assignee columns and a row of filters above it.',
        })}
        ${featureCard({
          title: 'An Inbox that knows what needs you',
          html: 'Approvals, client comments and overdue deliverables in one list, with a read pane beside it. The badge counts only what needs you.',
          src: image(ctx, 'inbox.jpg'),
          alt: 'The Inbox, with its Needs you tab listing items waiting for approval, client comments and overdue deliverables.',
        })}
        ${listCard('And more', [
          '<strong style="color:#05271C;font-weight:600;">Overviews rebuilt.</strong> An Action Center on every Overview, and a health score that shows what lowered it.',
          '<strong style="color:#05271C;font-weight:600;">Previews in place.</strong> PDFs with find, spreadsheets, text, CSV, archives, images and media open right inside the app.',
          '<strong style="color:#05271C;font-weight:600;">Discussions.</strong> Every comment thread on an engagement, in one tab.',
        ])}
      `),
      slant(ctx, 'gray-band'),
      bandRow(`
        ${displayH2(`<span style="color:${C.ELECTRIC};">Ask Brio</span> about a real engagement.`, '#FFFFFF')}
        ${para('The tour opens a demo firm in the actual product, with Brio switched on. When you’re ready, your first client is free.', { color: '#B5C9C1', margin: '0 0 26px' })}
        ${pills([
          { label: 'Start free', href: signup, variant: 'electric' },
          { label: 'Take the tour', href: tour, variant: 'ghost-dark' },
        ])}
      `, '28px 40px 44px'),
      footerRow(ctx, [
        { label: 'Website', path: '/' },
        { label: 'Changelog', path: '/resources/changelog' },
        { label: 'Trust Center', path: '/resources/trust-center' },
        { label: 'Pricing', path: '/pricing' },
      ]),
    ],
  })
}

export const brioWhatsNew2026_11: CampaignTemplate = {
  id: ID,
  name: 'What’s new: Brio and the rebuilt workspace',
  description: 'The November 2026 product update. Introduces Brio, then the Board, the timeline, Files and the Inbox.',
  createdAt: '2026-11-05',
  subject: `Meet Brio, and what else is new in ${BRAND_NAME}`,
  preheader: 'Brio briefs you, answers your questions and drafts the client update. Plus a sharper Board, timeline and Files.',
  render,
}
