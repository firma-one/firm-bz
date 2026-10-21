'use client';

/**
 * The comparison's feature explanations (the old page's tooltips), as a small info button.
 *
 * Mouse: opens on hover and stays open while the pointer is on the button or the bubble. Touch and
 * keyboard: a tap or Enter pins it open; a second tap, Escape, a tap elsewhere or tabbing away closes it.
 * A Radix popover rather than a tooltip, because tooltips never open on a tap. It renders in place (no
 * portal) so it keeps the `.mk` type and tokens; Radix positions it `fixed`, so the table never clips it.
 */
import * as Popover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const timer = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = pinned || hover;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hoverTo = (next: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(next), next ? 90 : 160);
  };

  const close = () => {
    window.clearTimeout(timer.current);
    setPinned(false);
    setHover(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => !next && close()}>
      <Popover.Anchor asChild>
        <button
          ref={button}
          type="button"
          className="mk-pricing-tip-btn"
          aria-label={`More about ${label}`}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onPointerEnter={hoverTo(true)}
          onPointerLeave={hoverTo(false)}
          onClick={() => (pinned ? close() : setPinned(true))}
        >
          <Info size={15} strokeWidth={2.2} aria-hidden />
        </button>
      </Popover.Anchor>
      <Popover.Content
        id={id}
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="mk-pricing-tip"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // The button toggles on its own click; don't let the outside-press close race it.
          if (button.current?.contains(e.detail.originalEvent.target as Node)) e.preventDefault();
        }}
        onPointerEnter={hoverTo(true)}
        onPointerLeave={hoverTo(false)}
      >
        {children}
      </Popover.Content>
    </Popover.Root>
  );
}
