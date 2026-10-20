'use client';

/**
 * A compact silk ribbon for the form pages. It enters at the top right, wraps the right side behind the
 * form card and leaves through the right edge well above the section's end, so no hard cut shows. Drawn
 * from lg up only: there the hero text is capped at 640 px and the ribbon stays right of it. On phones
 * and tablets the form sits under the text, so the page goes without.
 */
import { useEffect, useState } from 'react';
import { RIBBON_PALETTE, SilkRibbon, type RibbonConfig } from '../silk-ribbon';

const FORM_RIBBON: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[1.04, -0.1], [0.8, 0.06], [0.8, 0.3], [1.12, 0.44]], width: 0.2, turns: 0.9, phase: 0.2, axis: -0.25, lines: 130, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[1.1, 0.02], [0.95, 0.14], [0.94, 0.32], [1.16, 0.42]], width: 0.09, turns: 0.6, phase: 2.0, axis: -0.1, lines: 52, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

/** Keeps the left side (the hero copy) on near-white, as on the home and pricing heroes. */
const WASH = 'linear-gradient(100deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0) 58%)';

export function FormRibbon({ wash = true }: { wash?: boolean }) {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setWide(mq.matches);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  if (!wide) return null;
  return (
    <>
      <SilkRibbon config={FORM_RIBBON} className="absolute inset-0 h-full w-full" />
      {wash && <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: WASH }} />}
    </>
  );
}
