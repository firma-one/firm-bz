'use client';

/**
 * Pricing FAQ list: one answer open at a time, the first open on arrival. Closed answers stay in the
 * page (hidden), so they are still in the HTML for search engines and `aria-controls` always resolves.
 * Opening fades the answer in; the chevron turns.
 */
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export type FaqEntry = { q: string; a: string[] };

export function FaqAccordion({ items }: { items: FaqEntry[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="mk-pricing-faq-list">
      {items.map((f, i) => {
        const isOpen = i === open;
        return (
          <div key={f.q} className="mk-pricing-faq-item">
            <h3 className="m-0">
              <button
                type="button"
                id={`mk-pricing-faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`mk-pricing-faq-a-${i}`}
                className="mk-pricing-faq-q"
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                {f.q}
                <span aria-hidden="true" className="mk-pricing-faq-chev" data-open={isOpen || undefined}>
                  <ChevronDown size={18} strokeWidth={2.4} />
                </span>
              </button>
            </h3>
            <div id={`mk-pricing-faq-a-${i}`} role="region" aria-labelledby={`mk-pricing-faq-q-${i}`} hidden={!isOpen} className="mk-pricing-faq-a">
              {f.a.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
