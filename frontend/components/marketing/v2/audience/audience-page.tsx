/**
 * An audience landing page (/landing/*) on the v2 design. Renders inside the marketing shell, which
 * provides the `.mk` scope, the fixed header and the footer. The copy comes from
 * `lib/marketing/audience-content.ts`; the page file renders the FAQPage JSON-LD from the same FAQ list.
 *
 * Surfaces alternate in flat blocks, as on the home page:
 * 1 · Hero with the compact silk ribbon (white)
 * 2 · The challenge: pain points (gray)
 * 3 · How it works: the home page's product story (white)
 * 4 · Built for control and collaboration (dark, slanted between two white bands)
 * 5 · The shift: without and with (white)
 * 6 · The impact: outcomes (gray)
 * 7 · FAQ (white)
 * 8 · Related reading (gray, only when the audience has posts)
 * 9 · The home page's final CTA (dark, top slant; over the gray when the reading band precedes it)
 */
import type { BlogPost } from '@/lib/blog-types';
import type { AudienceContent } from '@/lib/marketing/audience-content';
import { FinalCtaSection } from '../home/final-cta';
import { ProductStorySection } from '../home/product-story';
import { ReadingFinalCta } from '../reading/closing';
import { toCardData } from '../reading/format';
import { AudienceHero } from './audience-hero';
import { AudienceChallenge, AudienceFaq, AudienceImpact, AudiencePrinciples, AudienceReading, AudienceShift } from './audience-sections';

export function AudiencePageV2({ content, blogPosts = [] }: { content: AudienceContent; blogPosts?: BlogPost[] }) {
  // Cards get the slim post (no markdown body), mapped here on the server.
  const posts = blogPosts.map(toCardData);
  return (
    <>
      <AudienceHero content={content} />
      <AudienceChallenge content={content} />
      <ProductStorySection />
      <AudiencePrinciples />
      <AudienceShift content={content} />
      <AudienceImpact content={content} />
      <AudienceFaq faqs={content.faqs} />
      {posts.length > 0 ? (
        <>
          <AudienceReading posts={posts} audienceLabel={content.audienceLabel} />
          <ReadingFinalCta />
        </>
      ) : (
        <FinalCtaSection />
      )}
    </>
  );
}
