'use client';

/**
 * The docs navigation: a search box and the page list.
 *
 * `sidebar` is the sticky column beside the reading column (from 1024 px). `disclosure` folds the same
 * list into a collapsed panel above the page on tablets and phones; it closes itself after a jump.
 *
 * The list and the search index are the legacy sidebar's (`components/docs/sidebar.tsx`,
 * `docs-search.tsx`), copied verbatim: the docs are stale and only restyled here.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

type NavItem = { href: string; label: string };

const DOCS_NAV: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: '/resources/docs', label: 'Introduction' }] },
  {
    title: 'Authentication',
    items: [
      { href: '/resources/docs/authentication/signup', label: 'Signup' },
      { href: '/resources/docs/authentication/signin', label: 'Signin' },
      { href: '/resources/docs/authentication/logout', label: 'Logout' },
    ],
  },
  {
    title: 'Dashboard',
    items: [
      { href: '/resources/docs/dash/connectors', label: 'Connectors' },
      { href: '/resources/docs/dash/insights', label: 'Insights' },
      { href: '/resources/docs/dash/document-actions', label: 'Document Actions' },
    ],
  },
  { title: 'Resources', items: [{ href: '/resources/docs/security', label: 'Security & Privacy' }] },
];

type SearchResult = { title: string; path: string; section: string; snippet: string };

const DOCUMENTATION_PAGES: SearchResult[] = [
  // Authentication
  { title: 'Signup', path: '/resources/docs/authentication/signup', section: 'Authentication', snippet: 'Create your account with email code or sign in with Google' },
  { title: 'Email Code Signup', path: '/resources/docs/authentication/signup', section: 'Authentication', snippet: 'Sign up without creating a password using a one-time code' },
  { title: 'Sign in with Google', path: '/resources/docs/authentication/signup', section: 'Authentication', snippet: 'Sign up instantly using your existing Google account' },
  { title: 'Signin', path: '/resources/docs/authentication/signin', section: 'Authentication', snippet: 'Access your account securely with email code or Google' },
  { title: 'Email Code Signin', path: '/resources/docs/authentication/signin', section: 'Authentication', snippet: 'Sign in without a password using a one-time code' },
  { title: 'Session Management', path: '/resources/docs/authentication/signin', section: 'Authentication', snippet: 'Sessions remain active for 7 days and auto-renew' },
  { title: 'Logout', path: '/resources/docs/authentication/logout', section: 'Authentication', snippet: 'Securely end your session and protect your account' },

  // Dashboard - Connectors
  { title: 'Connectors', path: '/resources/docs/dash/connectors', section: 'Dashboard', snippet: 'Connect your Google Drive and start monitoring documents' },
  { title: 'Connecting Google Drive', path: '/resources/docs/dash/connectors', section: 'Dashboard', snippet: 'Connect your Google Drive account in just a few clicks' },
  { title: 'Permissions', path: '/resources/docs/dash/connectors', section: 'Dashboard', snippet: 'What Pockett can and cannot access in your Drive' },
  { title: 'Connector Status', path: '/resources/docs/dash/connectors', section: 'Dashboard', snippet: 'Active, Warning, and Syncing connector states' },

  // Dashboard - Insights
  { title: 'Insights', path: '/resources/docs/dash/insights', section: 'Dashboard', snippet: 'Security insights and analytics about your Google Drive' },
  { title: 'Security Alerts', path: '/resources/docs/dash/insights', section: 'Dashboard', snippet: 'Identify security risks and potential issues' },
  { title: 'File Sharing Analytics', path: '/resources/docs/dash/insights', section: 'Dashboard', snippet: 'Understand how your files are being shared' },
  { title: 'Public Files', path: '/resources/docs/dash/insights', section: 'Dashboard', snippet: 'Identify files that are publicly accessible' },
  { title: 'Expiring Shares', path: '/resources/docs/dash/insights', section: 'Dashboard', snippet: 'Track share links that are about to expire' },

  // Dashboard - Document Actions
  { title: 'Document Actions', path: '/resources/docs/dash/document-actions', section: 'Dashboard', snippet: 'Preview, download, and manage your documents' },
  { title: 'Document Preview', path: '/resources/docs/dash/document-actions', section: 'Dashboard', snippet: 'Preview Google Docs, Sheets, and Slides directly' },
  { title: 'Version History', path: '/resources/docs/dash/document-actions', section: 'Dashboard', snippet: 'Track all changes with activity timeline and version history' },
  { title: 'Downloads', path: '/resources/docs/dash/document-actions', section: 'Dashboard', snippet: 'Download documents and specific versions securely' },
  { title: 'File Information', path: '/resources/docs/dash/document-actions', section: 'Dashboard', snippet: 'View detailed information about each document' },

  // Security
  { title: 'Security & Privacy', path: '/resources/docs/security', section: 'Resources', snippet: 'How Pockett protects your data and maintains privacy' },
];

function DocsSearch() {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const q = query.trim().toLowerCase();
  const results = q
    ? DOCUMENTATION_PAGES.filter((p) => `${p.title} ${p.snippet} ${p.section}`.toLowerCase().includes(q)).slice(0, 8)
    : [];

  /** Arrow keys move between the input and the results; Escape clears and returns to the input. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
      inputRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    if (links.length === 0) return;
    e.preventDefault();
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown') links[Math.min(at + 1, links.length - 1)].focus();
    else if (at <= 0) inputRef.current?.focus();
    else links[at - 1].focus();
  };

  return (
    <div className="mk-docs-search" onKeyDown={onKeyDown}>
      <div className="mk-docs-search-field">
        <Search size={16} strokeWidth={2.2} aria-hidden className="mk-docs-search-icon" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          aria-label="Search the docs"
          aria-controls={q ? resultsId : undefined}
          autoComplete="off"
        />
        {query ? (
          <button type="button" className="mk-docs-search-clear" aria-label="Clear search" onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}>
            <X size={14} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {q ? `${results.length} ${results.length === 1 ? 'result' : 'results'}` : ''}
      </p>

      {q ? (
        <div id={resultsId} className="mk-docs-results">
          {results.length > 0 ? (
            <ul ref={listRef} aria-label="Search results">
              {results.map((r, i) => (
                <li key={`${r.title}-${i}`}>
                  <Link href={r.path} onClick={() => setQuery('')}>
                    <span className="mk-docs-result-top">
                      <span className="mk-docs-result-title">{r.title}</span>
                      <span className="mk-docs-result-section">{r.section}</span>
                    </span>
                    <span className="mk-docs-result-snippet">{r.snippet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mk-docs-noresults">
              <p>No results found for “{query}”</p>
              <p>Try different keywords</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NavList({ pathname }: { pathname: string }) {
  // Both variants render on every page (CSS shows one), so the group label ids need a unique base.
  const base = useId();
  return (
    <div className="mk-docs-nav-groups">
      {DOCS_NAV.map((group, gi) => {
        const labelId = `${base}-group-${gi}`;
        return (
          <div key={group.title ?? gi} className="mk-docs-nav-group">
            {group.title ? (
              <p id={labelId} className="mk-docs-nav-label">
                {group.title}
              </p>
            ) : null}
            <ul className="mk-docs-nav-list" aria-labelledby={group.title ? labelId : undefined}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="mk-docs-nav-link"
                    aria-current={pathname === item.href ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const currentLabel = (pathname: string) =>
  DOCS_NAV.flatMap((g) => g.items).find((i) => i.href === pathname)?.label ?? 'Documentation';

export function DocsNav({ variant }: { variant: 'sidebar' | 'disclosure' }) {
  const pathname = usePathname() ?? '';
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // A jump to another page closes the phone menu.
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  if (variant === 'disclosure') {
    return (
      <details ref={detailsRef} className="mk-docs-disclosure">
        <summary>
          <span className="mk-docs-disclosure-label">
            <span className="mk-docs-disclosure-kicker">Docs</span>
            <span className="mk-docs-disclosure-current">{currentLabel(pathname)}</span>
          </span>
          <ChevronDown size={18} strokeWidth={2.4} aria-hidden className="mk-docs-disclosure-chevron" />
        </summary>
        <div className="mk-docs-disclosure-body">
          <DocsSearch />
          <nav aria-label="Documentation">
            <NavList pathname={pathname} />
          </nav>
        </div>
      </details>
    );
  }

  return (
    <div className="mk-docs-nav">
      <DocsSearch />
      <nav aria-label="Documentation">
        <NavList pathname={pathname} />
      </nav>
    </div>
  );
}
