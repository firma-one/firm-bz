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
 * The introduction, for prospects who have never heard of firmä: what it is first, then Brio, then
 * how it runs an engagement. Nearly every line is the landing page's own copy, which is written for
 * the same reader. It shares its screens with the product update.
 */

const ID = 'firma-intro-2026-11'
/** The screens this shares with the product update. */
const IMAGES = 'brio-whats-new-2026-11'
const image = (ctx: CampaignContext, name: string) => emailAsset(ctx, `${IMAGES}/${name}`)

const PREHEADER = 'A client workspace on the Google Drive or OneDrive you already use, with Brio as your assistant for client delivery.'
const label = (text: string) => `<strong style="color:#05271C;font-weight:600;">${text}</strong>`

function render(ctx: CampaignContext): string {
  const signup = campaignLink(ctx, '/signup')
  const tour = campaignLink(ctx, '/tour')
  const brand = escHtml(BRAND_NAME)

  return campaignDocument({
    title: `${BRAND_NAME}: run every client engagement from your own Drive`,
    preheader: PREHEADER,
    rows: [
      heroRow({
        ctx,
        ribbon: image(ctx, 'ribbon.jpg'),
        chip: 'NEW',
        chipText: 'Meet Brio, your delivery assistant',
        headline: `Run every client engagement <span style="color:${C.BOTTLE};">from your own Drive.</span>`,
        lede: `${brand} turns the Google Drive or OneDrive you already use into a client workspace: every deliverable on a Board, every approval in one thread, and ${brioMark(ctx)}, the assistant for client delivery that briefs you, answers your questions and drafts the client update. Your files never leave your Drive.`,
        actions: `${pills([
          { label: 'Start free', href: signup, variant: 'electric' },
          { label: 'Take the tour', href: tour, variant: 'white' },
        ])}${para('Free for your first client · No credit card · Google Drive and OneDrive', { size: 13, color: C.MUTED, margin: '14px 0 0' })}`,
      }),
      imageRow({
        src: image(ctx, 'hero.jpg'),
        alt: 'The Engagement Overview for a product launch campaign, with the Ask Brio panel open. Asked what needs attention today, Brio names one overdue deliverable waiting on the client’s approval.',
      }),
      slant(ctx, 'white-band'),
      meetBrioBand(ctx, IMAGES),
      slant(ctx, 'band-gray'),
      grayRow(`
        ${eyebrow('The whole engagement')}
        ${displayH2('Everything an engagement needs. Nothing it doesn’t.', C.BOTTLE)}
        ${para(`Built for consultancies, agencies and fractional leaders: people who deliver their value in documents. ${brand} gives every engagement one place where the work, its status and the conversation live together.`, { margin: '0 0 22px' })}
        ${featureCard({
          title: 'Start from the folders you already have.',
          html: `Sign in with Google or Microsoft and pick the folders for a client. ${brand} maps them to Client → Engagement → Deliverable. Nothing is copied or moved, and you don’t need an IT admin.`,
          src: image(ctx, 'files.jpg'),
          alt: 'An engagement’s files in firmä, with Status, Due and Assignee beside each deliverable folder.',
        })}
        ${featureCard({
          title: 'Every deliverable on one Board.',
          html: 'Each deliverable gets an owner, a due date and a status: to do, in progress, in review, approved. Your team and your client look at the same Board, so nobody has to ask.',
          src: image(ctx, 'board.jpg'),
          alt: 'A Board with deliverables in To do, In progress, In review and Approved, each card showing its due date, owner and progress.',
        })}
        ${featureCard({
          title: 'Know which engagement needs you today.',
          html: `Health scores pace, overdue work and planning gaps. The Action Center lists what to do next, the Firm Overview rolls it up across every client, and the brief from ${brioMark(ctx, 'light', 14)} tells you in two sentences.`,
          src: image(ctx, 'timeline.jpg'),
          alt: 'A timeline of four deliverables as bars, with today marked and one deliverable shown running nine days late.',
        })}
        ${featureCard({
          title: 'Comments and approvals.',
          html: 'Threaded comments on each deliverable, and a sign-off your client clicks, not an email you search for later. Every client comment lands in one inbox.',
          src: image(ctx, 'inbox.jpg'),
          alt: 'The Inbox, with its Needs you tab listing items waiting for approval, client comments and overdue deliverables.',
        })}
        ${listCard('And more', [
          `${label('Your brand in front. Your Drive behind.')} Clients open a view in your firm’s brand that shows only what you’ve shared.`,
          `${label('Client reminders.')} Nudge a client about what’s waiting on them, and set a follow-up date for every contact.`,
          `${label('Audit trail.')} See who was given access to which files, and when, for every engagement.`,
          `${label('Doc Search.')} Find any file across clients by type, client, engagement or date.`,
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
        { label: 'Pricing', path: '/pricing' },
        { label: 'Trust Center', path: '/resources/trust-center' },
      ], `You’re receiving this introduction to ${BRAND_NAME}, the client workspace built on your own Drive.`),
    ],
  })
}

export const firmaIntro2026_11: CampaignTemplate = {
  id: ID,
  name: `Introducing ${BRAND_NAME}: for prospects`,
  description: 'For people who have never heard of us. Explains what the product is, introduces Brio, then shows how it runs an engagement.',
  createdAt: '2026-11-05',
  subject: 'Run every client engagement from your own Drive',
  preheader: PREHEADER,
  render,
}
