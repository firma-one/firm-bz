/**
 * 1 · Pricing hero (white). The compact silk ribbon wraps the right side behind the third plan card; the
 * headline, lede and toggle sit on the white wash, then the plan cards and the "Every plan includes" row.
 * The fixed header is 76 px tall (64 px on phones), so the hero's top padding clears it.
 */
import { Check } from 'lucide-react';
import { Brio } from '@/components/ui/brio';
import { PageGuides } from '../primitives';
import { PricingHeroRibbon } from './pricing-ribbon';
import { PricingPlans } from './pricing-plans';

const INCLUDES = ['Your own Google Drive', 'Branded client portal', 'Deliverable Board', 'brio', 'Scheduled follow-ups', 'One-click engagement closure'];

export function PricingHero() {
  return (
    <section aria-labelledby="mk-pricing-title" className="mk-pricing-hero">
      <PricingHeroRibbon />
      <PageGuides />

      <div className="mk-rail mk-pricing-hero-head">
        <p className="mk-pricing-chip">
          <span className="mk-pricing-chip-badge">PRICING</span>
          No per-seat pricing: unlimited members on every paid plan
        </p>
        <h1 id="mk-pricing-title" className="mk-page mk-pricing-title">
          Pricing that grows with your clients, <span className="text-[var(--mk-bottle)]">not your headcount.</span>
        </h1>
        <p className="mk-lede mk-pricing-lede">
          Every plan includes <Brio fixedColor iconClassName="mk-sparkle" />. Start free with your first client, and upgrade when the second
          one signs.
        </p>
      </div>

      <PricingPlans />

      <div className="mk-rail mk-pricing-hero-head">
        <ul className="mk-pricing-includes" aria-label="Every plan includes">
          <li className="mk-pricing-includes-label" aria-hidden="true">
            EVERY PLAN INCLUDES
          </li>
          {INCLUDES.map((item) => (
            <li key={item}>
              <Check size={16} strokeWidth={3} aria-hidden className="mk-pricing-check" />
              {item === 'brio' ? (
                <span>
                  <Brio fixedColor /> summaries and answers
                </span>
              ) : (
                item
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
