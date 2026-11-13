/**
 * RAID, explained where the site says it: an info tip after the term (the pricing comparison's
 * `InfoTip`), with the meaning the app's RAID card uses (`RAID_MEANING`).
 *
 * One tip per block of copy, on its first RAID. Inside a tooltip, a tip can't open another, so copy there
 * spells RAID out instead (config/pricing.ts).
 */
import type { ReactNode } from 'react';
import { RAID_MEANING } from '@/lib/raid/raid-shared';
import { InfoTip } from './pricing/info-tip';

export function RaidTip({ tone }: { tone?: 'dark' }) {
  return (
    <InfoTip label="RAID" tone={tone}>
      <span className="mk-raid-tip">
        <span className="mk-raid-tip-title">RAID log</span>
        <span>{RAID_MEANING}</span>
        <span className="mk-pricing-tip-foot">
          Each engagement keeps one, for your team only. Brio suggests entries from new messages and memos, and a
          person accepts or dismisses each one.
        </span>
      </span>
    </InfoTip>
  );
}

/** "RAID" and the word after it ("log", "check", "entries"), kept on one line with its tip. */
const RAID_TERM = /\bRAID(?: (?:log|check|entries|entry))?/;

/** `text` with a RAID tip after its first RAID term; unchanged when there is none. */
export function withRaidTip(text: string, tone?: 'dark'): ReactNode {
  const match = RAID_TERM.exec(text);
  if (!match) return text;
  const at = match.index;
  const end = at + match[0].length;
  return (
    <>
      {text.slice(0, at)}
      <RaidTerm tone={tone}>{match[0]}</RaidTerm>
      {text.slice(end)}
    </>
  );
}

/** A RAID term with its tip, which never wraps onto a line of its own. */
export function RaidTerm({ tone, children }: { tone?: 'dark'; children: ReactNode }) {
  return (
    <span className="mk-raid-term">
      {children}
      <RaidTip tone={tone} />
    </span>
  );
}
