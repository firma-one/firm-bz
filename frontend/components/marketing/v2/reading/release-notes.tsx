/**
 * One changelog release on the reading template: the version chip, tags and date, the release title
 * as the section's H2, then its notes in the article's prose (a size down, without the lede).
 *
 * The id sits on the header (version and date included), so "On this page" lands with the whole
 * header in view.
 */
import type { ComponentPropsWithoutRef, ElementType } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './reading.css';
import './reference.css';

type WithNode<T extends ElementType> = ComponentPropsWithoutRef<T> & { node?: unknown };

const components: Components = {
  // The release title is the H2; headings inside the notes are its topics.
  h1: ({ node: _node, ...props }: WithNode<'h1'>) => <h3 {...props} className="mk-doc-notes-h3" />,
  h2: ({ node: _node, ...props }: WithNode<'h2'>) => <h3 {...props} className="mk-doc-notes-h3" />,
  h3: ({ node: _node, ...props }: WithNode<'h3'>) => <h3 {...props} className="mk-doc-notes-h3" />,
  ul: ({ node: _node, ...props }: WithNode<'ul'>) => <ul {...props} className="mk-read-bullets" />,
  ol: ({ node: _node, start, ...props }: WithNode<'ol'>) => (
    <ol
      {...props}
      start={start}
      className="mk-read-steps"
      style={start && start > 1 ? { counterReset: `mk-read-step ${start - 1}` } : undefined}
    />
  ),
  table: ({ node: _node, ...props }: WithNode<'table'>) => (
    <div className="mk-read-table" role="region" aria-label="Table" tabIndex={0}>
      <table {...props} />
    </div>
  ),
};

export type ReleaseSectionData = {
  /** "2.0.0" */
  version: string;
  title: string;
  /** ISO date, when the release metadata has one. */
  date?: string;
  dateLabel?: string;
  /** Major / Minor / Patch, when the release metadata has one. */
  typeLabel?: string;
  latest: boolean;
  /** The notes' markdown. */
  body: string;
};

export function ReleaseSection({ release, id }: { release: ReleaseSectionData; id: string }) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="mk-doc-release">
      <header id={id} tabIndex={-1} className="mk-doc-release-head">
        <p className="mk-doc-release-meta">
          <span className="mk-doc-version">v{release.version}</span>
          {release.latest ? <span className="mk-doc-tag mk-doc-tag--on">Latest</span> : null}
          {release.typeLabel ? <span className="mk-doc-tag">{release.typeLabel}</span> : null}
          {release.date && release.dateLabel ? <time dateTime={release.date}>{release.dateLabel}</time> : null}
        </p>
        <h2 id={titleId} className="mk-sub mk-doc-release-title">
          {release.title}
        </h2>
      </header>
      {release.body ? (
        <div className="mk-read-prose mk-doc-notes">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {release.body}
          </ReactMarkdown>
        </div>
      ) : null}
    </section>
  );
}
