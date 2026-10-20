'use client';

/**
 * The FAQ page's list: topic pills (the blog listing's look, as toggle buttons), then every topic as a
 * group of disclosures on gray: its heading beside the questions from 1024 px, above them below.
 *
 * Each question follows the APG disclosure pattern (as the home page's `FaqItem`): a button inside the
 * H3, the answer a labelled region. Answers start closed (there are 30-odd); "Expand all" opens every
 * visible one. Opening fades the answer in (opacity and transform only, none with reduced motion).
 *
 * Answers render the data's `displayAnswer` HTML (falling back to the plain `answer`); the
 * `[[POLAR_LINK]]` placeholder becomes the inline Polar link, as it did in `FaqGrid`.
 */
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { BillingPolarExplainInline } from '@/components/billing/billing-polar-inline';
import { BRAND_NAME } from '@/config/brand';
import type { FAQItem } from '@/data/faq-data';
import { DEMO_BOOKING_URL } from '../config';
import { PageGuides, PillLink } from '../primitives';
import { slugify } from './format';
import './reading.css';
import './reference.css';

const ALL = 'All';
const POLAR_LINK_PLACEHOLDER = '[[POLAR_LINK]]';

const topicOf = (item: FAQItem) => item.category || 'General';
const keyOf = (item: FAQItem) => `${topicOf(item)}::${item.question}`;

/**
 * The data's brand-name snippet (`brandNameInlineHtml`) carries the old wordmark's inline font and
 * gradient; dropping its style lets the answer's own type set the name (see `.mk-faqs-a`).
 */
const plainBrandName = (html: string) => html.replace(/<span data-brand-name style="[^"]*">/g, '<span data-brand-name>');

function Answer({ item }: { item: FAQItem }) {
  const html = item.displayAnswer ? plainBrandName(item.displayAnswer) : undefined;
  if (!html) return <p>{item.answer}</p>;
  if (!html.includes(POLAR_LINK_PLACEHOLDER)) return <p dangerouslySetInnerHTML={{ __html: html }} />;
  const parts = html.split(POLAR_LINK_PLACEHOLDER);
  return (
    <p>
      {parts.map((part, i) => (
        <Fragment key={i}>
          <span dangerouslySetInnerHTML={{ __html: part }} />
          {i < parts.length - 1 ? <BillingPolarExplainInline className="mx-0.5" /> : null}
        </Fragment>
      ))}
    </p>
  );
}

function Disclosure({
  question,
  open,
  onToggle,
  children,
}: {
  question: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const qId = `${id}q`;
  const aId = `${id}a`;
  return (
    <div className="mk-faqs-item">
      <h3>
        <button id={qId} type="button" aria-expanded={open} aria-controls={aId} className="mk-faqs-q" onClick={onToggle}>
          <span>{question}</span>
          <span aria-hidden="true" className="mk-faqs-icon">
            <ChevronDown size={17} strokeWidth={2.4} />
          </span>
        </button>
      </h3>
      <div id={aId} role="region" aria-labelledby={qId} hidden={!open} className="mk-faqs-a">
        {children}
      </div>
    </div>
  );
}

/** Under the list: the way to a person. */
function StillHaveQuestions() {
  return (
    <aside aria-labelledby="mk-faqs-more-title" className="mk-faqs-more">
      <div>
        <h2 id="mk-faqs-more-title" className="mk-faqs-more-title">
          Still have questions?
        </h2>
        <p className="mk-faqs-more-copy">Talk to our team about how {BRAND_NAME} fits your workflow.</p>
      </div>
      <div className="mk-faqs-more-actions">
        <PillLink href={DEMO_BOOKING_URL} size="sm">
          Book a demo
        </PillLink>
        <PillLink href="/contact" variant="secondary" size="sm">
          Contact us
        </PillLink>
      </div>
    </aside>
  );
}

const countLabel = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;

export function FaqList({ items }: { items: FAQItem[] }) {
  const [topic, setTopic] = useState(ALL);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  /** Topics in the order the data first mentions them, with their questions. */
  const groups = useMemo(() => {
    const map = new Map<string, FAQItem[]>();
    for (const item of items) {
      const t = topicOf(item);
      const list = map.get(t);
      if (list) list.push(item);
      else map.set(t, [item]);
    }
    return Array.from(map, ([name, list]) => ({ name, id: `faq-${slugify(name)}`, items: list }));
  }, [items]);

  const visible = topic === ALL ? groups : groups.filter((g) => g.name === topic);
  const visibleKeys = visible.flatMap((g) => g.items.map(keyOf));
  const allOpen = visibleKeys.length > 0 && visibleKeys.every((k) => open.has(k));
  const shownCount = visibleKeys.length;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setOpen((prev) => {
      const next = new Set(prev);
      for (const k of visibleKeys) {
        if (allOpen) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const pills = [{ name: ALL, count: items.length }, ...groups.map((g) => ({ name: g.name, count: g.items.length }))];

  return (
    <>
      <div className="mk-band mk-band--white">
        <PageGuides />
        <div className="mk-rail mk-read-controls mk-faqs-controls relative">
          <div role="group" aria-label="Filter questions by topic">
            <ul className="mk-read-pills">
              {pills.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    className="mk-read-pill"
                    aria-pressed={topic === p.name}
                    onClick={() => setTopic(p.name)}
                  >
                    {p.name === ALL ? 'All questions' : p.name} <span className="mk-read-pill-count">{p.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="mk-btn mk-btn--secondary mk-btn--sm mk-faqs-toggle" onClick={toggleAll}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>

      <section className="mk-band mk-band--gray mk-faqs-band" aria-label="Questions">
        <PageGuides />
        <div className="mk-rail relative">
          <p className="sr-only" aria-live="polite">
            {topic === ALL ? `Showing all ${countLabel(shownCount)}` : `Showing ${countLabel(shownCount)} about ${topic}`}
          </p>

          {visible.map((group) => (
            <section key={group.name} aria-labelledby={group.id} className="mk-faqs-group">
              <div className="mk-faqs-group-head">
                <h2 id={group.id} className="mk-sub">
                  {group.name}
                </h2>
                <p className="mk-faqs-group-count">{countLabel(group.items.length)}</p>
              </div>
              <div className="mk-faqs-card">
                {group.items.map((item) => {
                  const key = keyOf(item);
                  return (
                    <Disclosure key={key} question={item.question} open={open.has(key)} onToggle={() => toggle(key)}>
                      <Answer item={item} />
                    </Disclosure>
                  );
                })}
              </div>
            </section>
          ))}

          <StillHaveQuestions />
        </div>
      </section>
    </>
  );
}
