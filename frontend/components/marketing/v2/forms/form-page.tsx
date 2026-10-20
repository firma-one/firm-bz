/**
 * Marketing v2 form pages: the white section that clears the fixed header, the hero copy, the
 * form-and-info split, the card from the sign-in board, and the flat blocks that sit beside it.
 * Server-safe; the ribbon is the only client piece.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Eyebrow, PageGuides } from '../primitives';
import { FormRibbon } from './form-ribbon';
import './forms.css';

/**
 * The page's first section: white, the guide lines, an optional ribbon (lg up), and room for the fixed
 * header (64 px on phones, 76 px from md) before the content.
 */
export function FormPageSection({
  ribbon = false,
  className = '',
  children,
}: {
  ribbon?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative overflow-clip bg-white pb-20 pt-16 md:pb-[104px] md:pt-[76px] ${className}`}>
      {ribbon && <FormRibbon />}
      <PageGuides />
      <div className="mk-rail relative z-[2] pt-10 md:pt-16">{children}</div>
    </section>
  );
}

/** Eyebrow chip, the page headline (`mk-page`) and a short lede. */
export function FormHero({
  eyebrow,
  title,
  lede,
  className = '',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mk-form-hero ${className}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className={`mk-page text-[var(--mk-ink)] ${eyebrow ? 'mt-6' : ''}`}>{title}</h1>
      {lede && <p className="mk-lede mt-5 max-w-[600px] md:mt-6">{lede}</p>}
    </div>
  );
}

/**
 * The form and its supporting info. The form comes first in reading order (and on phones); from lg the
 * info sits on the left, sticky under the header, and the card on the right.
 */
export function FormSplit({ main, aside, asideLabel }: { main: ReactNode; aside: ReactNode; asideLabel?: string }) {
  return (
    <div className="mk-form-split">
      <div className="mk-form-split__main">{main}</div>
      <aside className="mk-form-split__aside" aria-label={asideLabel}>
        {aside}
      </aside>
    </div>
  );
}

/** White card, 12 px radius, the two-layer shadow; an optional gray strip along the bottom. */
export function FormCard({ children, foot, className = '' }: { children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={`mk-form-card ${className}`}>
      <div className="mk-form-card__body">{children}</div>
      {foot && <div className="mk-form-card__foot">{foot}</div>}
    </div>
  );
}

export type FormPoint = { title: ReactNode; body: ReactNode };

/** Points with the short bottle-green bar; they rise in one after another on load. */
export function InfoPoints({ items, startDelay = 260 }: { items: FormPoint[]; startDelay?: number }) {
  return (
    <ul className="mk-form-points">
      {items.map((p, i) => (
        <li key={i} className="mk-form-point" style={{ '--mk-delay': `${startDelay + i * 120}ms` } as CSSProperties}>
          <h2 className="mk-form-point__title">{p.title}</h2>
          <p className="mk-form-point__body">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}

export type FormLinkRow = {
  href: string;
  label: ReactNode;
  icon: LucideIcon;
  /** Opens in a new tab. */
  external?: boolean;
};

/** Rows of links with an icon tile and a chevron that nudges right on hover. */
export function LinkRows({ rows, className = '' }: { rows: FormLinkRow[]; className?: string }) {
  return (
    <ul className={`mk-form-rows ${className}`}>
      {rows.map(({ href, label, icon: Icon, external }) => {
        const inner = (
          <>
            <span className="mk-form-tile" aria-hidden="true">
              <Icon size={18} strokeWidth={2} />
            </span>
            <span className="mk-form-row__label">
              {label}
              {external && <span className="sr-only"> (opens in a new tab)</span>}
            </span>
            <ChevronRight size={16} strokeWidth={2.4} aria-hidden className="mk-form-row__chev" />
          </>
        );
        return (
          <li key={href}>
            {external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="mk-form-row">
                {inner}
              </a>
            ) : /^mailto:/.test(href) ? (
              <a href={href} className="mk-form-row">
                {inner}
              </a>
            ) : (
              <Link href={href} className="mk-form-row">
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
