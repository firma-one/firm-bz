'use client';

/**
 * The audience hero's compact silk ribbon.
 *
 * From 1024 px it enters at the top right, wraps the right side and leaves through the right edge above
 * the hero's end (so no hard cut shows), with the white wash keeping the copy on near-white; the copy
 * column is capped so the two never meet. Below 1024 px the copy is full width, so the ribbon runs across
 * a strip under the buttons instead (`AudienceStripRibbon`), shallower on tablets than on phones.
 */
import { useEffect, useState } from 'react';
import { RIBBON_PALETTE, SilkRibbon, type RibbonConfig } from '../silk-ribbon';

const DESKTOP: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[1.05, -0.1], [0.76, 0.08], [0.78, 0.32], [1.12, 0.44]], width: 0.2, turns: 0.9, phase: 0.2, axis: -0.25, lines: 130, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[1.1, 0.02], [0.94, 0.14], [0.93, 0.32], [1.16, 0.42]], width: 0.09, turns: 0.6, phase: 2.0, axis: -0.1, lines: 52, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

/** For a strip 0.30 × the screen width tall. */
const PHONE: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[-0.15, 0.2], [0.3, 0.05], [0.68, 0.27], [1.15, 0.1]], width: 0.13, turns: 0.9, phase: 0.2, axis: -0.25, lines: 110, steps: 90, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[-0.12, 0.17], [0.34, 0.09], [0.66, 0.23], [1.12, 0.13]], width: 0.05, turns: 0.6, phase: 2.0, axis: -0.1, lines: 40, steps: 90, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

/** For a strip 0.22 × the screen width tall. */
const TABLET: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[-0.12, 0.15], [0.3, 0.01], [0.68, 0.21], [1.12, 0.05]], width: 0.1, turns: 0.9, phase: 0.2, axis: -0.25, lines: 120, steps: 100, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[-0.1, 0.12], [0.34, 0.05], [0.66, 0.17], [1.1, 0.08]], width: 0.04, turns: 0.6, phase: 2.0, axis: -0.1, lines: 44, steps: 100, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
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

/** Fills the hero from 1024 px up (the wash is CSS, `.mk-aud-hero-wash`). */
export function AudienceHeroRibbon() {
  const size = useSize();
  return size === 'desktop' ? <SilkRibbon config={DESKTOP} className="absolute inset-0 h-full w-full" /> : null;
}

/** Below 1024 px: the strip under the hero's buttons. */
export function AudienceStripRibbon() {
  const size = useSize();
  return (
    <div aria-hidden="true" className="mk-aud-hero-strip">
      {(size === 'phone' || size === 'tablet') && (
        <SilkRibbon key={size} config={size === 'phone' ? PHONE : TABLET} className="absolute inset-0 h-full w-full" />
      )}
    </div>
  );
}
