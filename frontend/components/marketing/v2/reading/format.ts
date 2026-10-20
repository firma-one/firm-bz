/**
 * Reading pages (blog, v2): pure helpers shared by the server pages and the client listing.
 * No fs or server-only imports, so the listing can import the card model and its types.
 */
import type { BlogPost } from '@/lib/blog-types';
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav';

/** Category slug → sentence-case label, as the board writes it ("best-practices" → "Best practices"). */
export function categoryLabel(slug: string): string {
  const words = slug.replace(/-/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Post dates are calendar days ("2025-07-10"), parsed as UTC midnight, so format them in UTC too:
// a reader west of Greenwich must not see the day before.
const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function safeDate(date: string): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "July 10, 2025" (the article header). */
export const formatLongDate = (date: string) => {
  const d = safeDate(date);
  return d ? LONG_DATE.format(d) : '';
};

/** "Jul 3, 2025" (cards). */
export const formatShortDate = (date: string) => {
  const d = safeDate(date);
  return d ? SHORT_DATE.format(d) : '';
};

/** Avatar initials from an author name ("Firma Editorial" → "FE"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export const postHref = (category: string, slug: string) => `${BLOG_BASE_PATH}/${category}/${slug}`;

/** The slim post a card needs: keeps each post's full markdown out of the client payload. */
export type PostCardData = {
  id: string;
  href: string;
  slug: string;
  category: string;
  categoryLabel: string;
  title: string;
  excerpt: string;
  date: string;
  dateLabel: string;
  readingTime?: number;
  tags: string[];
  image: string;
};

export function toCardData(post: BlogPost): PostCardData {
  return {
    id: post.id,
    href: postHref(post.category, post.slug),
    slug: post.slug,
    category: post.category,
    categoryLabel: categoryLabel(post.category),
    title: post.title,
    excerpt: post.excerpt,
    date: post.date,
    dateLabel: formatShortDate(post.date),
    readingTime: post.readingTime,
    tags: post.tags ?? [],
    image: post.image,
  };
}

/** "Jul 3, 2025 · 4 min read" */
export function cardMeta(post: Pick<PostCardData, 'dateLabel' | 'readingTime'>): string {
  return [post.dateLabel, post.readingTime ? `${post.readingTime} min read` : ''].filter(Boolean).join(' · ');
}

/* ── Headings: stable ids for the "On this page" list ─────────────────────────────────────── */

export type TocItem = { id: string; text: string };

// `main` is the shell's <main id="main">; a heading must never take it.
const RESERVED_IDS = new Set(['main']);

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return 'section';
  return RESERVED_IDS.has(base) ? `${base}-section` : base;
}

/** A slugger that numbers repeats ("faq", "faq-2"), in document order. */
export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Heading source → the text the reader sees (links, emphasis, code and tags unwrapped). */
function plainHeading(src: string): string {
  return src
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    // Underscores inside a word ("Final_Final_v3") are literal, as in CommonMark; asterisks never are.
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\W)__(.+?)__(?=\W|$)/g, '$1$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1$2')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The article's H2s, in order, with the ids `rehypeHeadingIds` gives them (same slugger, same order).
 * Skips fenced code so a `## comment` in a code sample is not a section.
 */
export function extractToc(markdown: string): TocItem[] {
  const slug = createSlugger();
  const items: TocItem[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      const mark = f[1].charAt(0);
      if (fence === null) fence = mark;
      else if (fence === mark) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = line.match(/^\s{0,3}##\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = plainHeading(m[1]);
    if (text) items.push({ id: slug(text), text });
  }
  return items;
}

/** Drops a leading `# Title` line: the page renders the post title as its one H1. */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]*(\r?\n|$)/, '');
}
