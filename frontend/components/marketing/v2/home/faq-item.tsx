'use client';

/**
 * One FAQ disclosure (APG pattern): the question is a button inside the heading, the answer a labelled
 * region. Collapsing is instant; reopening fades the answer in (opacity and transform only).
 */
import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function FaqItem({ question, children, defaultOpen = true }: { question: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [touched, setTouched] = useState(false);
  const id = useId();
  const qId = `${id}q`;
  const aId = `${id}a`;
  return (
    <div className="mk-faq-teaser-item">
      <h3 className="m-0">
        <button
          id={qId}
          type="button"
          aria-expanded={open}
          aria-controls={aId}
          className="mk-faq-teaser-q"
          onClick={() => {
            setOpen((o) => !o);
            setTouched(true);
          }}
        >
          <span>{question}</span>
          <ChevronDown aria-hidden size={18} strokeWidth={2.4} className="mk-faq-teaser-icon" />
        </button>
      </h3>
      <div id={aId} role="region" aria-labelledby={qId} hidden={!open} className={`mk-faq-teaser-a${touched ? ' mk-faq-teaser-a--in' : ''}`}>
        {children}
      </div>
    </div>
  );
}
