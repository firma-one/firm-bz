/**
 * 4 · Final CTA: the dark forest band with the top slant and the slow green glow, straight into the
 * footer.
 */
import { Brio } from '@/components/ui/brio';
import { Band, PillLink } from '../primitives';

export function PricingFinalCta() {
  return (
    <Band surface="dark" slant="top" aria-labelledby="mk-pricing-cta-title" className="mk-pricing-final">
      <div className="mk-rail text-center">
        <h2 id="mk-pricing-cta-title" className="mk-cta mx-auto max-w-[860px] text-white">
          <span className="mk-gradient-text">
            Ask <Brio iconClassName="text-[#7DFF77] mk-sparkle" />
          </span>{' '}
          about a real engagement.
        </h2>
        <p className="mk-pricing-final-lede">
          The tour opens a demo firm in the actual product, with{' '}
          <span className="text-white">
            <Brio iconClassName="text-[#7DFF77]" />
          </span>{' '}
          switched on. When you’re ready, your first client is free.
        </p>
        <div className="mk-pricing-final-actions">
          <PillLink href="/signup" block className="mk-pricing-final-btn mk-pricing-final-btn--primary">
            Start free
          </PillLink>
          <PillLink href="/tour" variant="ghost-dark" block className="mk-pricing-final-btn">
            Take the tour
          </PillLink>
        </div>
      </div>
    </Band>
  );
}
