'use client';

/**
 * A small info button with a white bubble: the pricing comparison's feature explanations (the old page's
 * tooltips), and every RAID mention on the site (`../raid-tip.tsx`).
 *
 * Mouse: opens on hover and stays open while the pointer is on the button or the bubble. Touch and
 * keyboard: a tap or Enter pins it open; a second tap, Escape, a tap elsewhere or tabbing away closes it.
 * A Radix popover rather than a tooltip, because tooltips never open on a tap.
 *
 * The bubble renders into the page's `.mk` root, not beside the button: it keeps the `.mk` type and
 * tokens, and a button inside a paragraph (an FAQ answer, the Meet Brio lede) never puts the bubble's
 * divs inside a `<p>`. Radix positions it `fixed`, so a table or a card never clips it.
 */
import * as Popover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import './info-tip.css';

export function InfoTip({ label, tone, children }: { label: string; tone?: 'dark'; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const timer = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = pinned || hover;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Where the bubble goes: found from the button the first time it opens; its place never changes. */
  const hostFrom = (el: Element) => {
    if (!host) setHost(el.closest<HTMLElement>('.mk') ?? document.body);
  };

  const hoverTo = (next: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (next) hostFrom(e.currentTarget);
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
          className={tone === 'dark' ? 'mk-pricing-tip-btn mk-pricing-tip-btn--dark' : 'mk-pricing-tip-btn'}
          aria-label={`More about ${label}`}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onPointerEnter={hoverTo(true)}
          onPointerLeave={hoverTo(false)}
          onClick={(e) => {
            if (pinned) return close();
            hostFrom(e.currentTarget);
            setPinned(true);
          }}
        >
          <Info size={15} strokeWidth={2.2} aria-hidden />
        </button>
      </Popover.Anchor>
      <Popover.Portal container={host ?? undefined}>
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
      </Popover.Portal>
    </Popover.Root>
  );
}
