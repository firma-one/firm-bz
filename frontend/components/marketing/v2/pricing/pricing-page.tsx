/**
 * /pricing on the v2 design (board: "Pricing — sample inner page"). Renders inside the marketing shell,
 * which provides the `.mk` scope, the fixed header and the footer.
 *
 * 1 · Hero with the compact silk ribbon, billing toggle and plan cards (white)
 * 2 · Compare every plan (gray)
 * 3 · Questions about pricing (white)
 * 4 · Final CTA (dark, top slant)
 */
import { Brio } from '@/components/ui/brio';
import { Band } from '../primitives';
import { PricingCompareMatrix } from './pricing-compare';
import { PricingFinalCta } from './pricing-cta';
import { PricingFaq } from './pricing-faq';
import { PricingHero } from './pricing-hero';
import './pricing.css';

function PricingCompare() {
  return (
    <Band surface="gray" id="compare" aria-labelledby="mk-pricing-compare-title" className="mk-pricing-compare">
      <div className="mk-rail">
        <h2 id="mk-pricing-compare-title" className="mk-section">
          Compare every plan
        </h2>
        <p className="mk-pricing-compare-lede">
          Four limits change between plans: clients, <Brio fixedColor /> credits, audit history and comment history. Nothing is charged per
          seat.
        </p>
        <PricingCompareMatrix />
      </div>
    </Band>
  );
}

export function PricingPageV2() {
  return (
    <>
      <PricingHero />
      <PricingCompare />
      <PricingFaq />
      <PricingFinalCta />
    </>
  );
}
