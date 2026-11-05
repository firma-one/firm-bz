import { BRAND_NAME } from '@/config/brand'
import { EMAIL_COLORS as C, EMAIL_FONTS as F, escHtml } from '../base'
import type { CampaignTemplate } from './index'
import {
  askBubble,
  bandPanel,
  bandRow,
  brioMark,
  campaignDocument,
  campaignLink,
  checkLine,
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
  timelineMoment,
  type CampaignContext,
} from './kit'

/*
 * What's new, November 2026: Brio and the rebuilt workspace around it.
 *
 * Every claim here is about what ships today. Two things that exist in code are left out on purpose
 * because they are hidden from users: Brio's Files agent (FILES_AGENT_PUBLIC) and Ask mode on Doc
 * Search. Brio's lines and the "A day with Brio" moments follow the landing page's copy, which is
 * held to ASSISTANT_POLICY. Moments use relative dates because an email can't re-render.
 */

const ID = 'brio-whats-new-2026-11'
const image = (ctx: CampaignContext, name: string) => emailAsset(ctx, `${ID}/${name}`)

/** Brio's byline at the top of a moment's card. */
function cardHead(ctx: CampaignContext, title?: string): string {
  return `<p style="margin:0 0 6px;font-family:${F.FONT};font-size:13px;line-height:18px;color:#37352F;">${brioMark(ctx, 'green', 13)}${title ? ` &nbsp;·&nbsp; <strong style="font-weight:600;">${escHtml(title)}</strong>` : ''}</p>`
}

function render(ctx: CampaignContext): string {
  const tour = campaignLink(ctx, '/tour')
  const app = campaignLink(ctx, '/d')

  const moments = [
    timelineMoment({
      label: '8:30 AM · Today’s brief',
      card: `${cardHead(ctx, 'Today’s brief')}4 live engagements, worth $79K. Two are behind pace. Creative &amp; Landing Page Assets is overdue and still in review.`,
      foot: 'You · know where things stand in 30 seconds',
    }),
    timelineMoment({
      label: '10:15 AM · Ask Brio',
      card: `${askBubble('Which deliverables are at risk?')}${cardHead(ctx)}Two. Creative &amp; Landing Page Assets is overdue and waiting on the client. PR &amp; Media Outreach Pack is due this week and still in progress.`,
      foot: 'You · ask in plain words, get the facts',
    }),
    timelineMoment({
      label: '2:00 PM · The client update',
      card: `${cardHead(ctx, 'Status update draft')}
        <span style="color:#2F8F4E;">&#10003;</span> Summary · Progress · Collaboration<br />
        <span style="color:#2F8F4E;">&#10003;</span> Risks · Needs Attention<br />
        <span style="color:#A86A06;">&#9675;</span> <span style="color:#A86A06;">Mitigation &amp; Next Steps: yours to write</span>`,
      foot: 'You · edit, then publish to the client',
    }),
    timelineMoment({
      label: '4:30 PM · Ask Brio on Files',
      card: `${askBubble('What’s still in Drafts?')}${cardHead(ctx)}Three files are still in Drafts: Media List – Q2.xlsx, Landing Page Copy v3.docx and Launch FAQ.docx. None is shared with Horizon FinTech yet.`,
      foot: 'You · find what’s unfinished, before the client asks',
      last: true,
    }),
  ].join('')

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
          { label: 'Ask Brio', href: app, variant: 'electric' },
          { label: 'Take the tour', href: tour, variant: 'white' },
        ]),
      }),
      imageRow({
        src: image(ctx, 'hero.jpg'),
        alt: 'The Engagement Overview for a product launch campaign, with the Ask Brio panel open. Asked what needs attention today, Brio names one overdue deliverable waiting on the client’s approval.',
      }),
      slant(ctx, 'white-band'),
      bandRow(`
        <img src="${image(ctx, 'brio-lockup.png')}" width="130" height="32" alt="Brio AI" style="display:block;width:130px;height:32px;margin:0 0 10px;font-family:${F.DISPLAY};font-size:24px;font-weight:700;color:#FFFFFF;" />
        ${para(`The executive assistant for client delivery, built into ${escHtml(BRAND_NAME)}`, { color: '#B5C9C1', size: 14, margin: '0 0 22px' })}
        ${displayH2(`<span style="color:${C.ELECTRIC};">Meet Brio.</span> It already knows where every engagement stands.`, '#FFFFFF')}
        ${para(`Brio reads the delivery data in your workspace (deliverables, due dates, statuses, who’s involved) and turns it into the brief you’d write yourself if you had the time. It answers in plain words and drafts the client update, and it always waits for you before anything changes.`, { color: '#B5C9C1', margin: '0 0 30px' })}
        <h3 style="margin:0 0 4px;font-family:${F.DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.015em;line-height:27px;color:#FFFFFF;">A day with Brio</h3>
        ${para('Four moments from our demo firm. You make every call.', { color: '#B5C9C1', size: 14, margin: '0 0 18px' })}
        ${moments}
        <div style="height:26px;line-height:26px;font-size:0;">&nbsp;</div>
        ${bandPanel(`
          ${eyebrow('How Brio is kept in its lane')}
          ${checkLine('Reads names, statuses and dates, never what’s inside a document or a comment.')}
          ${checkLine('Never changes anything without your consent.')}
          ${checkLine('Nothing reaches a client until a person on your team publishes it.')}
          ${checkLine('Leaves Mitigation and Next Steps to the engagement lead, by design.')}
        `)}
        ${para('25 Brio credits a month on the free plan, 500 on Standard. One credit is one brief, summary or answer.', { color: '#B5C9C1', size: 13, margin: '18px 0 0' })}
      `),
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
        ${para('Open your workspace and ask what needs you today. Or take the tour: a demo firm in the actual product, narrated by Brio in Autopilot, Guided or Explore mode.', { color: '#B5C9C1', margin: '0 0 26px' })}
        ${pills([
          { label: 'Ask Brio', href: app, variant: 'electric' },
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
