/**
 * Docs building blocks on the reading template: the page header (breadcrumb, `mk-article` title, dek),
 * sections, notes, step lists, boxes and link cards. Server-safe. They replace the legacy
 * `components/docs/{doc-section,info-box,step-list,code-block}` on the docs pages; those files stay
 * until the legacy sweep.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, ChevronRight, Info, Lightbulb } from 'lucide-react';
import { ReadBreadcrumb, type Crumb } from '../reading/breadcrumb';
// The breadcrumb's styles live in the reading stylesheet.
import '../reading/reading.css';
import './docs.css';

const DOCS_HOME = '/resources/docs';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Breadcrumb (Resources › Docs › section), the `mk-article` title and the dek. */
export function DocsHeader({ section, title, children }: { section?: string; title: ReactNode; children?: ReactNode }) {
  const crumbs: Crumb[] = [{ label: 'Resources' }, { label: 'Docs', href: DOCS_HOME }];
  if (section) crumbs.push({ label: section });
  return (
    <header className="mk-docs-head">
      <ReadBreadcrumb items={crumbs} current={!section} />
      <h1 className="mk-article mk-docs-title">{title}</h1>
      {children ? <p className="mk-docs-dek">{children}</p> : null}
    </header>
  );
}

/** One H2 section of a docs page. Body paragraphs inside it get the reading type. */
export function DocsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = slug(title);
  return (
    <section className="mk-docs-section" aria-labelledby={id}>
      <h2 id={id} className="mk-sub mk-docs-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DocsH3({ children }: { children: ReactNode }) {
  return <h3 className="mk-docs-h3">{children}</h3>;
}

type Tone = 'gray' | 'white' | 'green' | 'amber' | 'red';

/** A flat block (the legacy gray and tinted boxes). */
export function DocsBox({ tone = 'gray', title, children }: { tone?: Tone; title?: ReactNode; children: ReactNode }) {
  return (
    <div className={`mk-docs-box mk-docs-box--${tone}`}>
      {title ? <h3 className="mk-docs-h3">{title}</h3> : null}
      {children}
    </div>
  );
}

export function DocsGrid({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) {
  return <div className={`mk-docs-grid mk-docs-grid--${cols}`}>{children}</div>;
}

/** Bulleted list with the reading template's green dots. */
export function DocsList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mk-docs-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** "How it works" steps: numbered green circles. */
export function DocsSteps({ title, steps }: { title?: string; steps: ReactNode[] }) {
  return (
    <div className="mk-docs-box mk-docs-box--gray">
      {title ? <h3 className="mk-docs-h3">{title}</h3> : null}
      <ol className="mk-docs-steps">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

const NOTE = {
  info: { Icon: Info, label: 'Note' },
  tip: { Icon: Lightbulb, label: 'Tip' },
  warning: { Icon: AlertTriangle, label: 'Warning' },
  error: { Icon: AlertCircle, label: 'Important' },
} as const;

/** Callout (the legacy InfoBox): info, tip, warning or error. */
export function DocsNote({ type, title, children }: { type: keyof typeof NOTE; title?: string; children: ReactNode }) {
  const { Icon, label } = NOTE[type];
  return (
    <aside className={`mk-docs-note mk-docs-note--${type}`} aria-label={title ?? label}>
      <Icon size={20} strokeWidth={2.2} aria-hidden className="mk-docs-note-icon" />
      <div className="mk-docs-note-body">
        {title ? <p className="mk-docs-note-title">{title}</p> : null}
        {children}
      </div>
    </aside>
  );
}

/** A numbered step card ("1 · Enter Details"). */
export function DocsStepCard({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="mk-docs-box mk-docs-box--white mk-docs-stepcard">
      <div className="mk-docs-stepcard-top">
        <span className="mk-docs-stepcard-n" aria-hidden="true">
          {n}
        </span>
        <h3 className="mk-docs-h3">{title}</h3>
      </div>
      <p>{children}</p>
    </div>
  );
}

/** A status or file-type tile: a small icon (or label) beside a title. */
export function DocsTile({
  icon,
  title,
  tone = 'white',
  iconStyle,
  children,
}: {
  icon: ReactNode;
  title: string;
  tone?: Tone;
  /** Overrides the icon tile's tint (the file-type chips). */
  iconStyle?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className={`mk-docs-box mk-docs-box--${tone} mk-docs-tilebox`}>
      <div className="mk-docs-tile-top">
        <span className="mk-docs-tile-icon" style={iconStyle}>
          {icon}
        </span>
        <h3 className="mk-docs-h3">{title}</h3>
      </div>
      {children ? <div className="mk-docs-tile-body">{children}</div> : null}
    </div>
  );
}

/** A card that links to another docs page. */
export function DocsLinkCard({ href, icon, title, children }: { href: string; icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <Link href={href} className="mk-docs-linkcard">
      <span className="mk-docs-linkcard-top">
        {icon ? <span className="mk-docs-tile-icon">{icon}</span> : null}
        <span className="mk-docs-linkcard-title">{title}</span>
        <ChevronRight size={16} strokeWidth={2.6} aria-hidden className="mk-docs-linkcard-chevron" />
      </span>
      <span className="mk-docs-linkcard-copy">{children}</span>
    </Link>
  );
}

/** The closing gray panel (Troubleshooting, Quick Tips, Quick Reference). */
export function DocsPanel({ title, children }: { title: string; children: ReactNode }) {
  const id = slug(title);
  return (
    <section className="mk-docs-panel" aria-labelledby={id}>
      <h2 id={id} className="mk-docs-panel-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A question and its answer inside a DocsPanel. */
export function DocsQa({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="mk-docs-qa">
      <h3 className="mk-docs-h3">{q}</h3>
      <p>{children}</p>
    </div>
  );
}

/** A small white card inside a DocsPanel's grid (Quick Tips). */
export function DocsMiniCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mk-docs-mini">
      <h3 className="mk-docs-mini-title">{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function DocsCode({ children }: { children: ReactNode }) {
  return <code className="mk-docs-code">{children}</code>;
}

export function DocsPre({ children }: { children: string }) {
  return (
    <pre className="mk-docs-pre">
      <code>{children}</code>
    </pre>
  );
}
