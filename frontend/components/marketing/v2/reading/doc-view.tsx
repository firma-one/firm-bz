/**
 * The reading template for reference documents (privacy policy, terms, changelog): the blog
 * article's white header (breadcrumb, `mk-article` title, dek, a meta line) and its 720 px column
 * beside a sticky "On this page" list. No hero image and no sales card: the page is the document.
 *
 * Below 1024 px the sidebar folds away and "On this page" becomes a disclosure above the document.
 */
import type { ReactNode } from 'react';
import { FinalCtaSection } from '../home/final-cta';
import { Band, PageGuides } from '../primitives';
import { ArticleToc } from './article-toc';
import { ReadBreadcrumb, type Crumb } from './breadcrumb';
import type { TocItem } from './format';
import './reading.css';
import './reference.css';

export function DocView({
  crumbs,
  title,
  dek,
  meta,
  toc,
  children,
}: {
  crumbs: Crumb[];
  title: ReactNode;
  dek?: ReactNode;
  /** The line under the dek ("Last updated January 2026"). */
  meta?: ReactNode;
  toc: TocItem[];
  children: ReactNode;
}) {
  const showToc = toc.length >= 2;
  return (
    <article className="mk-read-article">
      <Band surface="white" className="mk-read-head">
        <div className="mk-rail">
          <ReadBreadcrumb items={crumbs} current />
          <h1 className="mk-article mk-read-title">{title}</h1>
          {dek ? <p className="mk-read-dek">{dek}</p> : null}
          {meta ? <p className="mk-doc-meta">{meta}</p> : null}
          <span aria-hidden="true" className="mk-doc-head-rule" />
        </div>
      </Band>

      <Band surface="white" className="mk-read-body mk-doc-body">
        <div className="mk-rail mk-read-grid">
          <div className="mk-read-main">
            {showToc ? (
              <div className="mk-read-only-narrow">
                <ArticleToc items={toc} variant="disclosure" />
              </div>
            ) : null}
            {children}
          </div>
          {showToc ? (
            <div className="mk-read-side">
              <ArticleToc items={toc} variant="sidebar" />
            </div>
          ) : null}
        </div>
      </Band>
    </article>
  );
}

/** The dark final CTA after a white band (`ReadingFinalCta` is the same over gray). */
export function FinalCtaOnWhite() {
  return (
    <div className="mk-band mk-band--white">
      <PageGuides />
      <FinalCtaSection />
    </div>
  );
}
