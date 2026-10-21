'use client';

/**
 * The hero's silk ribbon. Desktop: it wraps the right side, down beside the headline, behind the product
 * screen and out at its lower right. Phones: one tall ribbon behind the product cards, rising from the
 * lower left. A white wash keeps the headline and copy on near-white either way.
 */
import { useEffect, useState } from 'react';
import { RIBBON_PALETTE, SilkRibbon, type RibbonConfig } from '../silk-ribbon';

const DESKTOP: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[1.06, -0.1], [0.62, 0.22], [0.63, 0.82], [1.14, 1.08]], width: 0.34, turns: 0.9, phase: 0.2, axis: -0.25, lines: 160, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[1.1, 0.1], [0.92, 0.3], [0.9, 0.7], [1.16, 0.92]], width: 0.14, turns: 0.6, phase: 2.0, axis: -0.1, lines: 70, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

const PHONE: RibbonConfig = {
  anchor: 'bottom',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[1.3, 2.0], [0.62, 1.45], [0.42, 0.62], [-0.32, -0.08]], width: 0.62, turns: 0.9, phase: 0.2, axis: -0.25, lines: 160, steps: 90, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[1.22, 1.12], [0.92, 0.82], [0.62, 0.3], [0.2, -0.16]], width: 0.2, turns: 0.6, phase: 2.0, axis: -0.1, lines: 66, steps: 90, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

const DESKTOP_WASH = 'linear-gradient(100deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0) 58%)';
const PHONE_WASH =
  'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.9) 40%, rgba(255,255,255,0) 58%, rgba(255,255,255,0) 91%, #FFFFFF 100%)';

export function HeroRibbon() {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setPhone(mq.matches);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  return (
    <>
      {phone !== null && (
        <SilkRibbon key={phone ? 'phone' : 'desktop'} config={phone ? PHONE : DESKTOP} className="absolute inset-0 h-full w-full" />
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block" style={{ background: DESKTOP_WASH }} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 md:hidden" style={{ background: PHONE_WASH }} />
    </>
  );
}
