/**
 * 11 · Final CTA. Deep-forest band, slanted at the top only, with the green mesh glowing through.
 * On phones the buttons stack full width and the copy drops its second sentence (the phone board).
 */
import { Brio } from '@/components/ui/brio';
import { Band, PillLink } from '../primitives';
import './final-cta.css';

export function FinalCtaSection() {
  return (
    <Band surface="dark" slant="top" aria-labelledby="mk-final-cta-title" className="mk-final-cta">
      <div className="mk-rail">
        {/* Centered by its wrapper: `.mk-cta` resets its own margin and loads after Tailwind. */}
        <div className="mx-auto max-w-[860px]">
          <h2 id="mk-final-cta-title" className="mk-cta text-white">
            <span className="mk-gradient-text">
              Ask <Brio iconClassName="text-[#7DFF77] mk-sparkle" />
            </span>{' '}
            about a real engagement.
          </h2>
        </div>
        <p className="mx-auto mt-3.5 max-w-[560px] text-[16px] leading-[1.6] text-[var(--mk-on-dark-body)] md:mt-[22px] md:text-[19px]">
          The tour opens a demo firm in the actual product, with{' '}
          <span className="text-white">
            <Brio iconClassName="text-[#7DFF77]" />
          </span>{' '}
          switched on.<span className="mk-final-cta-wide"> When you’re ready, your first client is free.</span>
        </p>
        <div className="mk-final-cta-actions mt-6 md:mt-[38px]">
          <PillLink href="/signup" block>
            Start free
          </PillLink>
          <PillLink href="/tour" variant="ghost-dark" block>
            Take the tour
          </PillLink>
        </div>
      </div>
    </Band>
  );
}
