/**
 * The end of every reading page: "Keep reading" on gray, then the home page's dark final CTA with its
 * top slant cut over the same gray (the board wraps the CTA in the gray band so the slant shows it).
 */
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { BLOG_BASE_PATH } from '@/lib/marketing/target-audience-nav';
import { FinalCtaSection } from '../home/final-cta';
import { Band, PageGuides } from '../primitives';
import type { PostCardData } from './format';
import { PostCard } from './post-card';
import './reading.css';

export function KeepReading({ posts }: { posts: PostCardData[] }) {
  if (posts.length === 0) return null;
  return (
    <Band surface="gray" className="mk-read-related" aria-labelledby="mk-read-related-title">
      <div className="mk-rail">
        <div className="mk-read-related-head">
          <h2 id="mk-read-related-title" className="mk-section">
            Keep reading
          </h2>
          <Link href={BLOG_BASE_PATH} className="mk-read-alllink">
            All articles
            <ChevronRight size={14} strokeWidth={2.6} aria-hidden />
          </Link>
        </div>
        <ul className="mk-read-cards mk-read-cards--related">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </ul>
      </div>
    </Band>
  );
}

/** The dark CTA band over a gray ground (it follows a gray band on every reading page). */
export function ReadingFinalCta() {
  return (
    <div className="mk-band mk-band--gray">
      <PageGuides />
      <FinalCtaSection />
    </div>
  );
}
