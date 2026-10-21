/**
 * 10 · FAQ. White band. The six questions firms ask first, as a disclosure list (all open, as on the
 * board), and the way to every other answer.
 *
 * The Files agent (Brio renaming and moving files) is not public yet, so the line about approving
 * renames and moves shows only once `FILES_AGENT_PUBLIC` flips (proposal decision 7).
 */
import type { ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';
import { FILES_AGENT_PUBLIC } from '../config';
import { Band, ChevronLink } from '../primitives';
import { FaqItem } from './faq-item';
import './faq.css';

const BrioMark = () => <Brio fixedColor />;

const QUESTIONS: { q: ReactNode; a: ReactNode }[] = [
  {
    q: (
      <>
        Does <BrioMark /> read my clients’ documents?
      </>
    ),
    a: 'No. Brio reads delivery data only: deliverable and file names, statuses, due dates, comment counts and who is on the engagement. It never receives a document’s contents or a comment’s text.',
  },
  {
    q: (
      <>
        Can <BrioMark /> change anything on its own?
      </>
    ),
    a: FILES_AGENT_PUBLIC
      ? 'No. Brio drafts and suggests; a person approves. Summaries wait for someone to publish them, and file renames or moves run only after you preview and approve the batch.'
      : 'No. Brio drafts and suggests; a person approves. Summaries wait for someone to publish them.',
  },
  {
    q: 'Do you store my files?',
    a: `No. Your files stay in Google Drive or OneDrive. ${BRAND_NAME} stores only the metadata that runs your workspace: engagements, statuses, permissions and the audit log.`,
  },
  {
    q: `How does ${BRAND_NAME} connect to my Drive?`,
    a: `Through Google or Microsoft sign-in (OAuth). You choose the folders, and ${BRAND_NAME} organizes them into engagements and manages sharing on top. You don’t need IT admin permissions. OneDrive and SharePoint are in beta.`,
  },
  {
    q: `What happens if I stop using ${BRAND_NAME}?`,
    a: 'Nothing happens to your files. Your folders stay exactly where they are in your Drive. You lose the client view and the access controls, not your work.',
  },
  {
    q: 'Is there a free plan?',
    a: (
      <>
        Yes: one client, two users and 25 <BrioMark /> credits a month, with no credit card. Upgrade to Standard when you take on more
        clients.
      </>
    ),
  },
];

export function FaqSection() {
  return (
    <Band surface="white" id="faq" aria-labelledby="mk-faq-teaser-title" className="pb-[88px] pt-20 md:pb-[clamp(104px,9.72vw,140px)] md:pt-[clamp(96px,8.9vw,128px)]">
      <div className="mk-rail leading-[normal]">
        <h2 id="mk-faq-teaser-title" className="mk-section text-[var(--mk-bottle)]">
          Questions firms ask first
        </h2>
        <div className="mk-faq-teaser-grid mt-9 md:mt-12">
          {QUESTIONS.map((item, i) => (
            <FaqItem key={i} question={item.q}>
              <p>{item.a}</p>
            </FaqItem>
          ))}
        </div>
        <ChevronLink href="/resources/faq" className="mt-10 text-[16px] md:mt-12">
          All questions
        </ChevronLink>
      </div>
    </Band>
  );
}
