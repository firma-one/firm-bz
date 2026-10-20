'use client';

/**
 * The silk ribbon behind the sign-in and sign-up cards (configs from the SignIn / SignUp boards).
 * Sign in: a wide ribbon sweeps from the top past the card's right edge, with a thinner one at the far
 * right. Sign up: it rises behind the card's lower edge. Phones: one tall ribbon behind the card.
 *
 * Sign-up between 768 and 1023 px stacks the value points under the card, where the rising ribbon would
 * run behind their copy, so it borrows the sign-in sweep (top-anchored, clear of the points).
 */
import { useEffect, useState } from 'react';
import { RIBBON_PALETTE, SilkRibbon, type RibbonConfig } from '../silk-ribbon';

const SIGNIN_DESKTOP: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[0.36, -0.16], [0.52, 0.12], [0.7, 0.38], [1.0, 0.74]], width: 0.46, turns: 0.9, phase: 0.2, axis: -0.25, lines: 160, hue: 0, spread: 0.8, across: 0.35 },
    { p: [[0.78, -0.1], [0.86, 0.12], [0.95, 0.3], [1.18, 0.5]], width: 0.2, turns: 0.6, phase: 2.0, axis: -0.1, lines: 80, hue: 0.45, spread: 0.6, across: 0.25, alpha: 0.88 },
  ],
};

const SIGNUP_DESKTOP: RibbonConfig = {
  anchor: 'bottom',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[0.62, -0.3], [0.64, 0.1], [0.83, 0.34], [1.12, 0.58]], width: 0.42, turns: 0.9, phase: 0.2, axis: -0.2, lines: 160, hue: 0.1, spread: 0.8, across: 0.35 },
  ],
};

const PHONE: RibbonConfig = {
  anchor: 'top',
  t0: 32,
  pal: RIBBON_PALETTE,
  deep: '#009669',
  ribbons: [
    { p: [[0.4, -0.45], [0.8, 0.45], [0.62, 1.45], [1.3, 2.15]], width: 0.62, turns: 0.9, phase: 0.2, axis: -0.2, lines: 100, hue: 0, spread: 0.8, across: 0.35 },
  ],
};

type Viewport = 'phone' | 'tablet' | 'desktop';

function pickConfig(kind: 'signin' | 'signup', vp: Viewport): RibbonConfig {
  if (vp === 'phone') return PHONE;
  if (kind === 'signup' && vp === 'desktop') return SIGNUP_DESKTOP;
  return SIGNIN_DESKTOP;
}

export function AuthRibbon({ kind }: { kind: 'signin' | 'signup' }) {
  const [vp, setVp] = useState<Viewport | null>(null);

  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const desktop = window.matchMedia('(min-width: 1024px)');
    const read = () => setVp(phone.matches ? 'phone' : desktop.matches ? 'desktop' : 'tablet');
    read();
    phone.addEventListener('change', read);
    desktop.addEventListener('change', read);
    return () => {
      phone.removeEventListener('change', read);
      desktop.removeEventListener('change', read);
    };
  }, []);

  if (vp === null) return null;
  const config = pickConfig(kind, vp);
  return <SilkRibbon key={vp} config={config} className="mk-auth-ribbon" />;
}
