'use client';

/**
 * "On this page": the article's H2s, highlighting the section being read.
 *
 * One IntersectionObserver watches the headings against a line 40% down the viewport; each time a
 * heading crosses it (either way), the current section is the last heading above that line. No scroll
 * listener, so nothing runs while the reader scrolls inside a section.
 *
 * `sidebar` is the sticky list beside the column (from 1024 px); `disclosure` is the collapsed list
 * above the article on smaller screens.
 */
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TocItem } from './format';

const READ_LINE = 0.4;

function useActiveHeading(items: TocItem[]) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  const key = items.map((i) => i.id).join('|');

  useEffect(() => {
    const els = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const pick = () => {
      const line = window.innerHeight * READ_LINE;
      let current = els[0].id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
        else break;
      }
      setActive(current);
    };

    // The root box runs from far above the page down to the read line, so a heading is "intersecting"
    // exactly when it has been read past. Any scroll that carries a heading across the line, however
    // far it jumps (End key, scrollbar drag), changes that state and calls `pick`.
    const io = new IntersectionObserver(pick, { rootMargin: `100000px 0px -${Math.round((1 - READ_LINE) * 100)}% 0px` });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  return [active, setActive] as const;
}

function TocList({
  items,
  active,
  onJump,
}: {
  items: TocItem[];
  active: string;
  onJump: (e: MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  return (
    <ol className="mk-read-toc-list">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            aria-current={item.id === active ? 'location' : undefined}
            onClick={(e) => onJump(e, item.id)}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function ArticleToc({ items, variant }: { items: TocItem[]; variant: 'sidebar' | 'disclosure' }) {
  const [active, setActive] = useActiveHeading(items);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const labelId = useId();

  const onJump = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Headings carry tabIndex -1, so keyboard readers continue from the section they jumped to.
    target.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, '', `#${id}`);
    setActive(id);
    if (detailsRef.current) detailsRef.current.open = false;
  };

  if (items.length === 0) return null;

  if (variant === 'disclosure') {
    return (
      <details ref={detailsRef} className="mk-read-toc-disclosure">
        <summary>
          <span>On this page</span>
          <ChevronDown size={18} strokeWidth={2.4} aria-hidden className="mk-read-toc-chevron" />
        </summary>
        <nav aria-label="On this page">
          <TocList items={items} active={active} onJump={onJump} />
        </nav>
      </details>
    );
  }

  return (
    <nav aria-labelledby={labelId} className="mk-read-toc">
      <p id={labelId} className="mk-read-toc-label">
        On this page
      </p>
      <TocList items={items} active={active} onJump={onJump} />
    </nav>
  );
}
