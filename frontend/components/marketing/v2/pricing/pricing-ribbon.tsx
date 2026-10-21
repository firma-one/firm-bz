'use client';

/**
 * The pricing hero's compact silk ribbon.
 *
 * Desktop (the board): it wraps the right side, behind the third plan card, with the white wash keeping
 * the headline on near-white. Tablet: the same ribbon pulled further right, so the narrower headline
 * stays clear of it. Phones: the headline is full width, so instead of sitting behind it the ribbon runs
 * across the screen between the billing toggle and the first plan card, which overlaps its lower half.
 */
import { useEffect, useState } from 'react';
import { RIBBON_PALETTE, SilkRibbon, type RibbonConfig } from '../silk-ribbon';

/** The board's `data-wave`. */
const DESKTOP: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[1.06, -0.12], [0.74, 0.14], [0.74, 0.56], [1.14, 0.8]], width: 0.3, turns: 0.9, phase: 0.2, axis: -0.25, lines: 150, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[1.1, 0.06], [0.94, 0.24], [0.92, 0.56], [1.16, 0.74]], width: 0.12, turns: 0.6, phase: 2.0, axis: -0.1, lines: 60, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

const TABLET: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[1.08, -0.1], [0.78, 0.14], [0.8, 0.5], [1.14, 0.74]], width: 0.26, turns: 0.9, phase: 0.2, axis: -0.25, lines: 140, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[1.12, 0.06], [0.94, 0.24], [0.93, 0.5], [1.16, 0.68]], width: 0.1, turns: 0.6, phase: 2.0, axis: -0.1, lines: 56, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

/** For a strip 0.44 × the screen width tall; the first card covers it from 0.30 down. */
const PHONE: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[-0.15, 0.32], [0.3, 0.06], [0.68, 0.36], [1.15, 0.1]], width: 0.17, turns: 0.9, phase: 0.2, axis: -0.25, lines: 120, steps: 90, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[-0.12, 0.22], [0.34, 0.1], [0.66, 0.3], [1.12, 0.16]], width: 0.06, turns: 0.6, phase: 2.0, axis: -0.1, lines: 44, steps: 90, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

type Size = 'phone' | 'tablet' | 'desktop';

function useSize() {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const tablet = window.matchMedia('(max-width: 1023px)');
    const on = () => setSize(phone.matches ? 'phone' : tablet.matches ? 'tablet' : 'desktop');
    on();
    phone.addEventListener('change', on);
    tablet.addEventListener('change', on);
    return () => {
      phone.removeEventListener('change', on);
      tablet.removeEventListener('change', on);
    };
  }, []);
  return size;
}

/** Fills the hero from tablet up (and draws nothing on phones). */
export function PricingHeroRibbon() {
  const size = useSize();
  return (
    <>
      {(size === 'desktop' || size === 'tablet') && (
        <SilkRibbon key={size} config={size === 'desktop' ? DESKTOP : TABLET} className="absolute inset-0 h-full w-full" />
      )}
      <div aria-hidden="true" className="mk-pricing-wash" />
    </>
  );
}

/** Phones only: the strip between the billing toggle and the plan cards. */
export function PricingPhoneRibbon() {
  const size = useSize();
  return (
    <div aria-hidden="true" className="mk-pricing-strip">
      {size === 'phone' && <SilkRibbon config={PHONE} className="absolute inset-0 h-full w-full" />}
    </div>
  );
}
