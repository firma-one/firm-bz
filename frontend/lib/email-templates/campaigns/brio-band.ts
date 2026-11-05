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
 * moments follow the landing page's copy, which is held to ASSISTANT_POLICY. Moments use relative
 * dates because an email can't re-render. Brio's Files agent is left out while FILES_AGENT_PUBLIC is
 * off.
 */

/** Brio's byline at the top of a moment's card. */
function cardHead(ctx: CampaignContext, title?: string): string {
  return `<p style="margin:0 0 6px;font-family:${F.FONT};font-size:13px;line-height:18px;color:#37352F;">${brioMark(ctx, 'green', 13)}${title ? ` &nbsp;·&nbsp; <strong style="font-weight:600;">${escHtml(title)}</strong>` : ''}</p>`
}

function moments(ctx: CampaignContext): string {
  return [
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
}

/** The whole band. `imageFolder` is where the template keeps `brio-lockup.png`. */
export function meetBrioBand(ctx: CampaignContext, imageFolder: string): string {
  return bandRow(`
    <img src="${emailAsset(ctx, `${imageFolder}/brio-lockup.png`)}" width="130" height="32" alt="Brio AI" style="display:block;width:130px;height:32px;margin:0 0 10px;font-family:${F.DISPLAY};font-size:24px;font-weight:700;color:#FFFFFF;" />
    ${para(`The executive assistant for client delivery, built into ${escHtml(BRAND_NAME)}`, { color: '#B5C9C1', size: 14, margin: '0 0 22px' })}
    ${displayH2(`<span style="color:${C.ELECTRIC};">Meet Brio.</span> It already knows where every engagement stands.`, '#FFFFFF')}
    ${para(`Brio reads the delivery data in your workspace (deliverables, due dates, statuses, who’s involved) and turns it into the brief you’d write yourself if you had the time. It answers in plain words and drafts the client update, and it always waits for you before anything changes.`, { color: '#B5C9C1', margin: '0 0 30px' })}
    <h3 style="margin:0 0 4px;font-family:${F.DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.015em;line-height:27px;color:#FFFFFF;">A day with Brio</h3>
    ${para('Four moments from our demo firm. You make every call.', { color: '#B5C9C1', size: 14, margin: '0 0 18px' })}
    ${moments(ctx)}
    <div style="height:26px;line-height:26px;font-size:0;">&nbsp;</div>
    ${bandPanel(`
      ${eyebrow('How Brio is kept in its lane')}
      ${checkLine('Reads names, statuses and dates, never what’s inside a document or a comment.')}
      ${checkLine('Never changes anything without your consent.')}
      ${checkLine('Nothing reaches a client until a person on your team publishes it.')}
      ${checkLine('Leaves Mitigation and Next Steps to the engagement lead, by design.')}
    `)}
    ${para('25 Brio credits a month on the free plan, 500 on Standard. One credit is one brief, summary or answer.', { color: '#B5C9C1', size: 13, margin: '18px 0 0' })}
  `)
}
