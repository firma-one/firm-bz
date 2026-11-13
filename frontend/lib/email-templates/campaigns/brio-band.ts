import { BRAND_NAME } from '@/config/brand'
import { EMAIL_COLORS as C, EMAIL_FONTS as F, escHtml } from '../base'
import {
  askBubble,
  bandPanel,
  bandRow,
  brioMark,
  checkLine,
  displayH2,
  emailAsset,
  eyebrow,
  para,
  timelineMoment,
  type CampaignContext,
} from './kit'

/*
 * "Meet Brio": the dark band both current templates share. Brio's lines and the "A day with Brio"
 * moments follow the landing page's copy (meet-brio.tsx, meet-brio-timeline.tsx), which is held to
 * ASSISTANT_POLICY: one engagement, Q2 – Product Launch Campaign, with Dana Whitfield reviewing.
 * Moments use relative dates because an email can't re-render. An email can't show the site's RAID
 * info tip, so RAID is spelled out. Brio's Files agent is left out while FILES_AGENT_PUBLIC is off.
 */

/** Brio's byline at the top of a moment's card. */
function cardHead(ctx: CampaignContext, title?: string): string {
  return `<p style="margin:0 0 6px;font-family:${F.FONT};font-size:13px;line-height:18px;color:#37352F;">${brioMark(ctx, 'green', 13)}${title ? ` &nbsp;·&nbsp; <strong style="font-weight:600;">${escHtml(title)}</strong>` : ''}</p>`
}

/** Small gray print inside a card. */
const muted = (html: string) => `<span style="font-size:12.5px;color:#6B6964;">${html}</span>`

/** A draft Brio wrote, in its pale green box. */
const draft = (html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2FAF6" style="background-color:#F2FAF6;border:1px solid #CFEADC;border-radius:8px;margin:8px 0 0;"><tr><td style="padding:9px 11px;font-family:${F.FONT};font-size:13.5px;line-height:1.5;color:#37352F;"><strong style="display:block;font-size:12px;font-weight:600;color:#009669;">Brio draft</strong>${html}</td></tr></table>`

/** A blank in a draft, for the lead to fill before sending. */
const blank = (text: string) => `<span style="background-color:#FFF1C2;color:#5C4300;border-radius:3px;padding:0 3px;">${escHtml(text)}</span>`

/** A RAID suggestion's type letter. */
const badge = (letter: string) =>
  `<span style="display:inline-block;width:18px;border-radius:4px;background-color:#EFEEE9;font-size:11px;font-weight:700;line-height:18px;text-align:center;color:#37352F;">${letter}</span>`

const tick = (html: string) => `<span style="color:#2F8F4E;">&#10003;</span> ${html}`
const open = (html: string) => `<span style="color:#A86A06;">&#9675;</span> <span style="color:#A86A06;">${html}</span>`

function moments(ctx: CampaignContext): string {
  return [
    timelineMoment({
      label: '8:30 AM · Your brief',
      card: `${cardHead(ctx, 'Your brief')}Two things need you today. Dana’s question on Creative &amp; Landing Page Assets is waiting for your reply, and PR &amp; Media Outreach Pack is due this week.`,
      foot: 'You · start with what needs you',
    }),
    timelineMoment({
      label: '10:15 AM · Ask Brio',
      card: `${askBubble('Which deliverables are at risk?')}${cardHead(ctx)}Two. Creative &amp; Landing Page Assets is overdue and waiting on the client. PR &amp; Media Outreach Pack is due this week and still in progress.`,
      foot: 'You · ask in plain words, get the facts',
    }),
    timelineMoment({
      label: '11:30 AM · Draft a reply',
      card: `${cardHead(ctx, 'Reply draft')}<strong style="font-weight:600;">Dana Whitfield</strong> ${muted('Reviewer')}<br />Is the pricing on the landing page final?${draft(`Hi Dana, good question. The pricing comes from ${blank('[pricing sheet date]')}. I’ll confirm by ${blank('[day]')} and update the page if anything has changed.`)}<p style="margin:8px 0 0;">${muted('2 blanks to fill before it can be sent')}</p>`,
      foot: 'You · fill the blanks, then send',
    }),
    timelineMoment({
      label: '1:00 PM · Call notes into actions',
      card: `${cardHead(ctx, 'Found 3 actions')}<strong style="font-weight:600;">Call with Dana</strong> ${muted('Internal only')}<br />
        ${tick('Reminder: send Dana the revised launch timeline')}<br />
        ${tick('Due date: Post-Launch Retrospective Report moved')}<br />
        ${muted('&#9675; New deliverable: Media list refresh, skipped')}`,
      foot: 'You · keep what’s right, skip the rest',
    }),
    timelineMoment({
      label: '2:00 PM · The client update',
      card: `${cardHead(ctx, 'Status update')}${muted('To')} Dana Whitfield<br />
        ${tick('Approved: GTM Plan &amp; Launch Readiness Kit')}<br />
        ${tick('In review: Creative &amp; Landing Page Assets')}<br />
        ${open('Next steps: yours to write')}`,
      foot: 'You · add next steps, then send it',
    }),
    timelineMoment({
      label: '3:30 PM · A gentle nudge',
      card: `${cardHead(ctx, 'Nudge')}<strong style="font-weight:600;">Creative &amp; Landing Page Assets</strong> ${muted('Waiting on the client')}${draft('Hi Dana, a quick check-in on Creative &amp; Landing Page Assets, which is with you for review. If anything needs changing, a comment here is the quickest way to get it to us.')}`,
      foot: 'You · send it, or let it wait',
    }),
    timelineMoment({
      label: '5:00 PM · The RAID log',
      card: `${cardHead(ctx, 'RAID check')}${muted('Risks, Assumptions, Issues and Decisions, suggested from new messages and memos')}<br />
        ${badge('R')} Landing page pricing may change before launch ${muted('· Dana’s thread')}<br />
        ${badge('A')} Dana sends the final brand photos this week ${muted('· the call memo')}`,
      foot: 'You · accept what’s real, dismiss the rest',
    }),
    timelineMoment({
      label: '9:40 PM · Your client asks Brio',
      card: `${askBubble('Is anything waiting on me?')}${cardHead(ctx)}Yes, one thing. Creative &amp; Landing Page Assets is with you for review, and it’s overdue. GTM Plan &amp; Launch Readiness Kit is already approved.<p style="margin:8px 0 0;">${muted('Answers only from what Dana can already see.')}</p>`,
      foot: 'You · off for the night. Dana has an answer.',
      last: true,
    }),
  ].join('')
}

/** The whole band. `imageFolder` is where the template keeps `brio-lockup.png`. */
export function meetBrioBand(ctx: CampaignContext, imageFolder: string): string {
  return bandRow(`
    <img src="${emailAsset(ctx, `${imageFolder}/brio-lockup.png`)}" width="130" height="32" alt="Brio AI" style="display:block;width:130px;height:32px;margin:0 0 10px;font-family:${F.DISPLAY};font-size:24px;font-weight:700;color:#FFFFFF;" />
    ${para(`The executive assistant for client delivery, built into ${escHtml(BRAND_NAME)}`, { color: '#B5C9C1', size: 14, margin: '0 0 22px' })}
    ${displayH2(`<span style="color:${C.ELECTRIC};">Meet Brio.</span> It already knows where every engagement stands.`, '#FFFFFF')}
    ${para(`Brio reads the delivery data in your workspace (deliverables, due dates, statuses, who’s involved) and turns it into the brief you’d write yourself if you had the time. It tells you each morning what needs you, drafts the client update, the reply and the nudge, keeps the RAID log (Risks, Assumptions, Issues and Decisions) and turns call notes into actions, and it always waits for you before anything changes.`, { color: '#B5C9C1', margin: '0 0 30px' })}
    <h3 style="margin:0 0 4px;font-family:${F.DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.015em;line-height:27px;color:#FFFFFF;">A day with Brio</h3>
    ${para('Eight moments from our demo firm. You make every call.', { color: '#B5C9C1', size: 14, margin: '0 0 18px' })}
    ${moments(ctx)}
    <div style="height:26px;line-height:26px;font-size:0;">&nbsp;</div>
    ${bandPanel(`
      ${eyebrow('How Brio is kept in its lane')}
      ${checkLine('Never opens the files you deliver. Reads comments and internal memos only to draft a reply, log a risk or find actions.')}
      ${checkLine('Never changes anything without your consent.')}
      ${checkLine('Nothing reaches a client until a person on your team sends or publishes it.')}
      ${checkLine('Your clients get answers only from what they can already see, never your internal notes.')}
      ${checkLine('Leaves Mitigation and Next Steps to the engagement lead, by design.')}
    `)}
    ${para('25 Brio credits a month on the free plan, 500 on Standard. One credit is one answer, summary or draft. Brio’s morning rundown of what needs you is free, and your clients can ask Brio only once you turn that on.', { color: '#B5C9C1', size: 13, margin: '18px 0 0' })}
  `)
}
