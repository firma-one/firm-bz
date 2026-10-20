/**
 * The article body: markdown (GFM + raw HTML) set in the reading column's type.
 *
 * - H2s get stable ids from `rehypeHeadingIds`, which uses the same slugger and order as `extractToc`,
 *   so the "On this page" links always land.
 * - A stray H1 in the body renders as an H2 (the page has one H1, the post title).
 * - A bullet list whose every item opens with bold text ("**Controlled access:** …") is the board's
 *   check list; other bullets get the small green dot.
 * - Tables scroll inside their own frame, never the page.
 */
import type { ComponentPropsWithoutRef, ElementType } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { createSlugger } from './format';
import './reading.css';

/** The slice of a hast node these renderers read. */
type HNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
};

const hastText = (node: HNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(hastText).join('');

/** Gives every H2 an id from its text, in document order (after rehype-raw, so raw HTML counts too). */
function rehypeHeadingIds() {
  return (tree: HNode) => {
    const slug = createSlugger();
    const walk = (node: HNode) => {
      if (node.type === 'element' && node.tagName === 'h2') {
        node.properties = { ...(node.properties ?? {}), id: slug(hastText(node)) };
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

const isBlank = (n: HNode) => n.type === 'text' && !(n.value ?? '').trim();

/** First meaningful child, looking through the <p> a loose list wraps each item in. */
function leadChild(li: HNode): HNode | undefined {
  const first = li.children?.find((c) => !isBlank(c));
  if (first?.type === 'element' && first.tagName === 'p') return first.children?.find((c) => !isBlank(c));
  return first;
}

function isCheckList(ul: HNode | undefined): boolean {
  const items = (ul?.children ?? []).filter((c) => c.type === 'element' && c.tagName === 'li');
  return (
    items.length > 0 &&
    items.every((li) => {
      const lead = leadChild(li);
      return lead?.type === 'element' && lead.tagName === 'strong';
    })
  );
}

type WithNode<T extends ElementType> = ComponentPropsWithoutRef<T> & { node?: unknown };

const components: Components = {
  h1: ({ node: _node, ...props }: WithNode<'h1'>) => <h2 {...props} className="mk-sub mk-read-h2" />,
  h2: ({ node: _node, ...props }: WithNode<'h2'>) => <h2 {...props} tabIndex={-1} className="mk-sub mk-read-h2" />,
  ul: ({ node, ...props }: WithNode<'ul'>) => (
    <ul {...props} className={isCheckList(node as HNode | undefined) ? 'mk-read-checks' : 'mk-read-bullets'} />
  ),
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

export function ArticleProse({ markdown }: { markdown: string }) {
  return (
    <div className="mk-read-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHeadingIds]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
