/**
 * Building blocks for legal documents on the reading template (privacy policy, terms). They carry
 * layout only: every word of the documents stays in `components/legal/*`.
 *
 * A section is a numbered H2 (the "On this page" target), a lead paragraph, then its clauses in one
 * flat gray block, or a check list of plain statements.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './reference.css';

export function LegalSection({
  id,
  n,
  title,
  children,
}: {
  /** The heading's id: the "On this page" and deep-link target (`/privacy#cookies`). */
  id: string;
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mk-doc-section">
      <h2 id={id} tabIndex={-1} className="mk-sub mk-doc-h2">
        <span className="mk-doc-num">{n}</span>
        <span>{title}</span>
      </h2>
      {children}
    </section>
  );
}

export function LegalLead({ children }: { children: ReactNode }) {
  return <p className="mk-doc-lead">{children}</p>;
}

export function Clauses({ children }: { children: ReactNode }) {
  return <div className="mk-doc-clauses">{children}</div>;
}

const iconProps = { size: 18, strokeWidth: 2.2, 'aria-hidden': true } as const;

export function Clause({
  icon: Icon,
  title,
  tag,
  children,
}: {
  icon: LucideIcon;
  title?: string;
  tag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mk-doc-clause">
      <span className="mk-doc-clause-icon">
        <Icon {...iconProps} />
      </span>
      <div className="mk-doc-clause-body">
        {title ? (
          <div className="mk-doc-clause-head">
            <h3 className="mk-doc-clause-title">{title}</h3>
            {tag}
          </div>
        ) : null}
        <p className="mk-doc-clause-text">{children}</p>
      </div>
    </div>
  );
}

/** Required / Optional beside a clause title. */
export function ClauseTag({ on = false, children }: { on?: boolean; children: ReactNode }) {
  return <span className={`mk-doc-tag${on ? ' mk-doc-tag--on' : ''}`}>{children}</span>;
}

export function Checks({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mk-doc-checks">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** The closing contact block: a sentence, then the address as the block's one big link. */
export function ContactBlock({ icon: Icon, text, email }: { icon: LucideIcon; text: ReactNode; email: string }) {
  return (
    <div className="mk-doc-contact">
      <span className="mk-doc-clause-icon">
        <Icon {...iconProps} />
      </span>
      <div className="mk-doc-clause-body">
        <p className="mk-doc-clause-text">{text}</p>
        <a href={`mailto:${email}`} className="mk-doc-link mk-doc-mail">
          {email}
        </a>
      </div>
    </div>
  );
}
