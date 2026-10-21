'use client';

/**
 * The blog listing (index and category pages): category pills, client-side search, the featured post
 * (index only), then the card grid in a gray band, twelve at a time.
 *
 * While a search is active the featured slot steps aside and every match shows at once; the result
 * count is announced politely.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { PageGuides } from '../primitives';
import type { PostCardData } from './format';
import { FeaturedPostCard, PostCard } from './post-card';
import './reading.css';

export type CategoryPill = { slug: string; label: string; href: string; count: number };

const PAGE = 12;

export function BlogListing({
  posts,
  categories,
  allHref,
  allCount,
  activeCategory,
  showFeatured,
  gridTitle,
}: {
  posts: PostCardData[];
  categories: CategoryPill[];
  allHref: string;
  allCount: number;
  /** `all` on the index, else the category slug. */
  activeCategory: string;
  showFeatured: boolean;
  gridTitle: string;
}) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const query = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!query) return posts;
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.excerpt.toLowerCase().includes(query) ||
        p.categoryLabel.toLowerCase().includes(query) ||
        p.tags.some((t) => t.toLowerCase().replace(/-/g, ' ').includes(query) || t.toLowerCase().includes(query)),
    );
  }, [posts, query]);

  const featured = showFeatured && !query ? matches[0] : undefined;
  const rest = featured ? matches.slice(1) : matches;
  const visible = query ? rest : rest.slice(0, shown);
  const remaining = rest.length - visible.length;

  const status = query
    ? `${matches.length} ${matches.length === 1 ? 'article matches' : 'articles match'} “${q.trim()}”`
    : `Showing ${visible.length} of ${rest.length}`;

  return (
    <>
      <div className="mk-band mk-band--white">
        <PageGuides />
        <div className="mk-rail mk-read-controls relative">
          <nav aria-label="Blog categories">
            <ul className="mk-read-pills">
              <li>
                <Link href={allHref} className="mk-read-pill" aria-current={activeCategory === 'all' ? 'page' : undefined}>
                  All posts <span className="mk-read-pill-count">{allCount}</span>
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={c.href} className="mk-read-pill" aria-current={activeCategory === c.slug ? 'page' : undefined}>
                    {c.label} <span className="mk-read-pill-count">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form role="search" className="mk-read-search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="mk-read-search" className="sr-only">
              Search articles
            </label>
            <Search size={17} strokeWidth={2.2} aria-hidden className="mk-read-search-icon" />
            <input
              id="mk-read-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search articles"
              autoComplete="off"
              enterKeyHint="search"
            />
            {q ? (
              <button type="button" className="mk-read-search-clear" aria-label="Clear search" onClick={() => setQ('')}>
                <X size={15} strokeWidth={2.6} aria-hidden />
              </button>
            ) : null}
          </form>
        </div>

        {featured ? (
          <section aria-label="Featured article" className="mk-rail mk-read-featured relative">
            <FeaturedPostCard post={featured} />
          </section>
        ) : (
          <div className="mk-read-featured-gap" aria-hidden="true" />
        )}
      </div>

      <section className="mk-band mk-band--gray mk-read-gridband" aria-labelledby="mk-read-grid-title">
        <PageGuides />
        <div className="mk-rail relative">
          <div className="mk-read-gridhead">
            <h2 id="mk-read-grid-title" className="mk-sub">
              {query ? 'Search results' : gridTitle}
            </h2>
            <p className="mk-read-gridcount" aria-live="polite">
              {status}
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="mk-read-empty">
              <p>{query ? 'No articles match that search.' : 'More articles are on the way.'}</p>
              {query ? (
                <button type="button" className="mk-btn mk-btn--secondary mk-btn--sm" onClick={() => setQ('')}>
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="mk-read-cards">
              {visible.map((post) => (
                <PostCard key={post.id} post={post} showExcerpt />
              ))}
            </ul>
          )}

          {remaining > 0 ? (
            <div className="mk-read-more">
              <button type="button" className="mk-btn mk-btn--secondary" onClick={() => setShown((n) => n + PAGE)}>
                Show more articles
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
