/**
 * Blog article, v2 (board: "Blog article — sample reading page"). No ribbon: a white header with the
 * breadcrumb, the `mk-article` title, the excerpt as dek, the author line and the hero image; then the
 * 720 px reading column beside a sticky "On this page" list and a quiet CTA card; then "Keep reading"
 * on gray and the dark final CTA.
 *
 * Below 1024 px the sidebar folds away: "On this page" becomes a disclosure above the article and the
 * CTA card follows it.
 */
import Image from 'next/image';
import { Band } from '../primitives';
import { ArticleProse } from './article-prose';
import { ArticleToc } from './article-toc';
import { ReadBreadcrumb, type Crumb } from './breadcrumb';
import { KeepReading, ReadingFinalCta } from './closing';
import { ReadCtaCard } from './cta-card';
import { formatLongDate, initials, type PostCardData, type TocItem } from './format';
import { ListenButton } from './listen-button';
import './reading.css';

export type ArticleViewData = {
  title: string;
  excerpt: string;
  date: string;
  readingTime?: number;
  authorName: string;
  authorTitle: string;
  image?: string;
  tldr?: string;
  tags: string[];
  /** Body markdown, its leading H1 already dropped. */
  markdown: string;
  /** Plain text for read-aloud. */
  listenText: string;
};

export function ArticleView({
  post,
  crumbs,
  toc,
  related,
}: {
  post: ArticleViewData;
  crumbs: Crumb[];
  toc: TocItem[];
  related: PostCardData[];
}) {
  const showToc = toc.length >= 2;
  return (
    <>
      <article className="mk-read-article">
        <Band surface="white" className="mk-read-head">
          <div className="mk-rail">
            <ReadBreadcrumb items={crumbs} />
            <h1 className="mk-article mk-read-title">{post.title}</h1>
            {post.excerpt ? <p className="mk-read-dek">{post.excerpt}</p> : null}
            <div className="mk-read-meta">
              <span className="mk-read-author">
                <span aria-hidden="true" className="mk-read-avatar">
                  {initials(post.authorName)}
                </span>
                <span>
                  <span className="mk-read-author-name">{post.authorName}</span>
                  <span className="mk-read-author-title">{post.authorTitle}</span>
                </span>
              </span>
              <span aria-hidden="true" className="mk-read-meta-rule" />
              <span className="mk-read-meta-when">
                <time dateTime={post.date}>{formatLongDate(post.date)}</time>
                {post.readingTime ? <> · {post.readingTime} min read</> : null}
              </span>
              <ListenButton text={post.listenText} />
            </div>
          </div>
          {post.image ? (
            <figure className="mk-rail mk-read-hero">
              <span className="mk-read-hero-frame">
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  preload
                  sizes="(max-width: 1247px) calc(100vw - 40px), 1152px"
                  className="mk-read-hero-img"
                />
              </span>
            </figure>
          ) : null}
        </Band>

        <Band surface="white" className="mk-read-body">
          <div className="mk-rail mk-read-grid">
            <div className="mk-read-main">
              {showToc ? (
                <div className="mk-read-only-narrow">
                  <ArticleToc items={toc} variant="disclosure" />
                </div>
              ) : null}

              {post.tldr ? (
                <aside aria-label="Summary" className="mk-read-tldr">
                  <p className="mk-read-tldr-label">TL;DR</p>
                  <p className="mk-read-tldr-text">{post.tldr}</p>
                </aside>
              ) : null}

              <ArticleProse markdown={post.markdown} />

              {post.tags.length > 0 ? (
                <ul aria-label="Tags" className="mk-read-tags">
                  {post.tags.map((tag) => (
                    <li key={tag}>{tag.replace(/-/g, ' ')}</li>
                  ))}
                </ul>
              ) : null}

              <ReadCtaCard className="mk-read-only-narrow mk-read-cta-card--after" />
            </div>

            <div className="mk-read-side">
              {showToc ? <ArticleToc items={toc} variant="sidebar" /> : null}
              <ReadCtaCard className={showToc ? undefined : 'mk-read-cta-card--solo'} />
            </div>
          </div>
        </Band>
      </article>

      <KeepReading posts={related} />
      <ReadingFinalCta />
    </>
  );
}
