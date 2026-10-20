/**
 * A value that changes with the billing toggle. Every value sits in the same grid cell, so the box is as
 * wide as the widest one and nothing around it moves; the current value rolls in (transform + opacity)
 * while the old one rolls out the other way. Baselines stay true, so "$39 /month" still lines up.
 * Server-safe (no hooks).
 */
import type { ReactNode } from 'react';

export function RollSwap({
  values,
  index,
  block = false,
  className = '',
}: {
  values: ReactNode[];
  index: number;
  /** A block that may wrap (the billing note), instead of one inline line (a price). */
  block?: boolean;
  className?: string;
}) {
  return (
    <span className={`mk-pricing-swap${block ? ' mk-pricing-swap--block' : ''} ${className}`}>
      {values.map((v, i) => (
        <span key={i} data-pos={i < index ? 'before' : i > index ? 'after' : 'on'} aria-hidden={i !== index || undefined}>
          {v}
        </span>
      ))}
    </span>
  );
}
