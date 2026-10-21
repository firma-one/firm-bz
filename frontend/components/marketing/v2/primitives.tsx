/**
 * Marketing v2 building blocks: bands, page guides, eyebrows and pill buttons.
 * Server-safe (no hooks), so sections can stay server components where they have no motion.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/** Dashed guide lines on the rail's 4-column grid (five lines; three on phones). */
export function PageGuides({ dark = false }: { dark?: boolean }) {
  return (
    <div aria-hidden="true" className={`mk-guides${dark ? ' mk-guides--dark' : ''}`}>
      <div>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/**
 * A full-width section on one flat surface. `slant` gives the 6° parallelogram edges (both, or the top
 * only for the final CTA). Dark bands carry the slow green glow.
 */
export function Band({
  surface,
  slant,
  id,
  className = '',
  style,
  guides = true,
  children,
  ...rest
}: {
  surface: 'white' | 'gray' | 'dark';
  slant?: 'both' | 'top';
  id?: string;
  className?: string;
  style?: CSSProperties;
  guides?: boolean;
  children: ReactNode;
  'aria-labelledby'?: string;
}) {
  const slantClass = slant === 'both' ? ' mk-slant' : slant === 'top' ? ' mk-slant-top' : '';
  return (
    <section id={id} className={`mk-band mk-band--${surface}${slantClass} ${className}`} style={style} {...rest}>
      {surface === 'dark' && <div aria-hidden="true" className="mk-dark-mesh" />}
      {guides && <PageGuides dark={surface === 'dark'} />}
      <div className="relative">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`mk-eyebrow ${className}`}>{children}</span>;
}

const isExternal = (href: string) => /^https?:|^mailto:/.test(href);

/** Pill button with the › chevron. */
export function PillLink({
  href,
  variant = 'primary',
  size,
  block,
  className = '',
  children,
  chevron = true,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost-dark';
  size?: 'sm';
  /** Full width on phones. */
  block?: boolean;
  className?: string;
  children: ReactNode;
  chevron?: boolean;
}) {
  const cls = `mk-btn mk-btn--${variant}${size ? ` mk-btn--${size}` : ''}${block ? ' mk-btn--block-phone' : ''} ${className}`;
  const inner = (
    <>
      {children}
      {chevron && (
        <ChevronRight
          size={size === 'sm' ? 14 : 16}
          strokeWidth={2.6}
          aria-hidden
          style={variant === 'ghost-dark' ? { color: 'var(--mk-electric)' } : undefined}
        />
      )}
    </>
  );
  return isExternal(href) ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** Small text link with a chevron (Compare all plans ›). */
export function ChevronLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`mk-link ${className}`}>
      {children}
      <ChevronRight size={15} strokeWidth={2.6} aria-hidden />
    </Link>
  );
}

/** Electric check dot used in trust strips and plan lists. */
export function CheckDot({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full"
      style={{ width: size, height: size, background: 'var(--mk-electric)' }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#03281B" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/** Inline style for an `mk-reveal` element inside a revealed card: it plays after `delay` ms. */
export const revealDelay = (delay: number): CSSProperties => ({ ['--mk-delay' as string]: `${delay}ms` });
