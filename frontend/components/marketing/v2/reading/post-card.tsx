/**
 * Post cards on the card hover kit (MkCard: cursor-chasing rim and spotlight, title nudge, chip lift, touch press).
 *
 * - `PostCard`: the board's "Keep reading" card: a pastel panel with the category chip, the title and
 *   the date line. The listing adds the excerpt. Each category has its own arrangement of the same
 *   pastel mesh, so a grid reads as sections, not one repeated tile.
 * - `FeaturedPostCard`: the newest post on the blog index, wide, with its photo.
 *
 * No hooks here, so the server pages and the client listing share them. Cards don't fade in on scroll:
 * a listing must read before hydration, and the card's own transform belongs to the touch press.
 */
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { MkCard } from '../motion';
import { cardMeta, type PostCardData } from './format';

export function PostCard({
  post,
  headingLevel = 3,
  showExcerpt = false,
}: {
  post: PostCardData;
  headingLevel?: 2 | 3;
  showExcerpt?: boolean;
}) {
  const Title = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <MkCard as="li" className="mk-read-card" rimSize={300} spotSize={520}>
      <Link href={post.href} className="mk-read-card-link">
        <span aria-hidden="true" className="mk-read-art" data-cat={post.category}>
          <span className="mk-read-chip mk-card-lift">{post.categoryLabel}</span>
        </span>
        <span className="mk-read-card-body">
          <Title className="mk-read-card-title">
            <span className="mk-card-title-wrap">{post.title}</span>
          </Title>
          {showExcerpt && post.excerpt ? <span className="mk-read-card-excerpt">{post.excerpt}</span> : null}
          <span className="mk-read-card-meta">
            <time dateTime={post.date}>{post.dateLabel}</time>
            {post.readingTime ? <> · {post.readingTime} min read</> : null}
          </span>
        </span>
      </Link>
    </MkCard>
  );
}

export function FeaturedPostCard({ post }: { post: PostCardData }) {
  return (
    <MkCard as="article" className="mk-read-feature" spotSize={760}>
      <Link href={post.href} className="mk-read-feature-link">
        <span className="mk-read-feature-media">
          <Image
            src={post.image}
            alt=""
            fill
            preload
            sizes="(max-width: 1023px) 100vw, 600px"
            className="mk-read-feature-img"
          />
        </span>
        <span className="mk-read-feature-body">
          <span className="mk-read-feature-chips">
            <span className="mk-eyebrow">Featured</span>
            <span className="mk-read-chip mk-read-chip--quiet">{post.categoryLabel}</span>
          </span>
          <h2 className="mk-read-feature-title">
            <span className="mk-card-title-wrap">{post.title}</span>
          </h2>
          {post.excerpt ? <span className="mk-read-feature-excerpt">{post.excerpt}</span> : null}
          <span className="mk-read-feature-foot">
            <span className="mk-read-card-meta">{cardMeta(post)}</span>
            <span className="mk-read-feature-cta">
              Read article
              <ChevronRight size={16} strokeWidth={2.6} aria-hidden className="mk-card-nudge" />
            </span>
          </span>
        </span>
      </Link>
    </MkCard>
  );
}
