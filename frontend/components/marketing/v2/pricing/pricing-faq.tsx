/**
 * 3 · FAQ (white). The questions the board shows, read from `data/faq-data.ts` (Billing, plus the
 * AI-credits question from Features). Answers are the data's plain `answer` text, as on the board. If a
 * question is ever renamed in the data, the list falls back to the Billing category rather than
 * showing a gap.
 */
import Link from 'next/link';
import { FAQ_DATA, type FAQItem } from '@/data/faq-data';
import { Band } from '../primitives';
import { FaqAccordion, type FaqEntry } from './faq-accordion';

const BOARD_QUESTIONS = [
  'Are there per-user charges?',
  'What are AI credits, and what happens when I run out?',
  'Is there a free plan?',
  'Can I upgrade, downgrade or cancel my plan?',
  'What does "bring your own Storage Drive" mean?',
];

const toEntry = (f: FAQItem): FaqEntry => ({
  q: f.question,
  a: f.answer
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean),
});

function pricingFaqs(): FaqEntry[] {
  const picked = BOARD_QUESTIONS.map((q) => FAQ_DATA.find((f) => f.question === q)).filter((f): f is FAQItem => !!f);
  const items = picked.length >= 3 ? picked : FAQ_DATA.filter((f) => f.category === 'Billing').slice(0, 5);
  return items.map(toEntry);
}

export function PricingFaq() {
  return (
    <Band surface="white" id="faq" aria-labelledby="mk-pricing-faq-title" className="mk-pricing-faq">
      <div className="mk-rail mk-pricing-faq-grid">
        <div>
          <span className="mk-pricing-faq-chip">FAQ</span>
          <h2 id="mk-pricing-faq-title" className="mk-section mk-pricing-faq-title">
            Questions about pricing
          </h2>
          <p className="mk-pricing-faq-more">
            Something else? <Link href="/contact">Talk to us</Link> or read the <Link href="/resources/faq">full FAQ</Link>.
          </p>
        </div>
        <FaqAccordion items={pricingFaqs()} />
      </div>
    </Band>
  );
}
