/**
 * Reading-page breadcrumb (board: Resources › Blog › Best practices). The last crumb is green;
 * `current` marks it as the page itself on the listings (on an article it is the section above).
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/** A crumb without `href` is a plain label (Resources has no page of its own). */
export type Crumb = { label: string; href?: string };

export function ReadBreadcrumb({ items, current = false }: { items: Crumb[]; current?: boolean }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="mk-read-crumbs">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.label}>
              {i > 0 && (
                <span aria-hidden="true" className="mk-read-crumbs-sep">
                  <ChevronRight size={14} strokeWidth={2.6} />
                </span>
              )}
              {item.href ? (
                <Link
                  href={item.href}
                  className={last ? 'mk-read-crumbs-last' : undefined}
                  aria-current={last && current ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ) : (
                <span className={last ? 'mk-read-crumbs-last' : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
