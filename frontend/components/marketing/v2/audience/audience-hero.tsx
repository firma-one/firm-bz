/**
 * The audience hero (white). The audience chip, the page headline with its last phrase in bottle green,
 * the lede, Start free and Take the tour, and the page's own demo link. The compact silk ribbon wraps
 * the right side from 1024 px and runs across a strip under the buttons below that.
 */
import type { AudienceContent } from '@/lib/marketing/audience-content';
import { DEMO_BOOKING_URL } from '../config';
import { Eyebrow, PageGuides, PillLink } from '../primitives';
import { AudienceHeroRibbon, AudienceStripRibbon } from './audience-ribbon';

/** Splits the headline so its accent phrase (when it ends the headline) can take the bottle green. */
function headlineParts(headline: string, accent?: string): [lead: string, accent: string] {
  if (accent && headline.endsWith(accent) && headline.length > accent.length) {
    return [headline.slice(0, headline.length - accent.length).trimEnd(), accent];
  }
  return [headline, ''];
}

export function AudienceHero({ content }: { content: AudienceContent }) {
  const [lead, accent] = headlineParts(content.heroHeadline, content.heroAccent);
  return (
    <section aria-labelledby="mk-aud-hero-title" className="mk-aud-hero">
      <AudienceHeroRibbon />
      <div aria-hidden="true" className="mk-aud-hero-wash" />
      <PageGuides />

      <div className="mk-rail mk-aud-hero-copy">
        <Eyebrow>{content.audienceLabel}</Eyebrow>
        <h1 id="mk-aud-hero-title" className="mk-page mk-aud-hero-title">
          {lead}
          {accent && (
            <>
              {' '}
              <span className="text-[var(--mk-bottle)]">{accent}</span>
            </>
          )}
        </h1>
        <p className="mk-lede mk-aud-hero-lede">{content.heroSubheading}</p>
        <div className="mk-aud-hero-actions">
          <PillLink href="/signup" block>
            Start free
          </PillLink>
          <PillLink href="/tour" variant="secondary" block>
            Take the tour
          </PillLink>
          <a href={DEMO_BOOKING_URL} className="mk-aud-hero-demo">
            {content.ctaText}
          </a>
        </div>
      </div>

      <AudienceStripRibbon />
    </section>
  );
}
