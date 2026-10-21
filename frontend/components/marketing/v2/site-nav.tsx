'use client';

/**
 * The header's desktop navigation, with dropdowns that move as Stripe's do. The panel stays put under
 * the bar while you move between menus: it changes height, its arrow slides to the item, and the menus
 * pass through it like a carousel (the new one slides in from the side you moved toward as the old one
 * fades). It opens and closes with a downward wipe. Transform, opacity, clip and height only; reduced
 * motion makes it instant.
 *
 * Opens on hover with a mouse, on click or Enter/Space, and ArrowDown or Tab moves focus into it.
 * Escape, a click outside or leaving the nav closes it. Menus not shown are inert.
 */
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { Brio } from '@/components/ui/brio';
import { NAV_BAR, NAV_MENUS, type NavMenuId, type NavMenuItem } from './config';
import { NavIcon } from './nav-icons';

const ORDER: NavMenuId[] = ['product', 'resources', 'contact'];
/** How far the incoming menu travels as it slides in (Stripe moves its menus a fifth of the panel's width). */
const SHIFT = 160;

/** A menu entry's title: Brio wears its mark, and a link that leaves the site says so. */
export function NavItemTitle({ item }: { item: Pick<NavMenuItem, 'label' | 'icon' | 'external'> }) {
  return (
    <>
      {item.icon === 'brio' ? <Brio noIcon /> : item.label}
      {item.external && (
        <>
          <span aria-hidden="true"> ↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </>
  );
}

/** A link that opens outside the site gets its own tab; everything else is client-side navigation. */
export function NavItemLink({
  item,
  className,
  onNavigate,
  children,
}: {
  item: Pick<NavMenuItem, 'href' | 'external'>;
  className: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onNavigate}>
      {children}
    </a>
  ) : (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}

export function DesktopNav() {
  const [open, setOpen] = useState<NavMenuId | null>(null);
  const [instant, setInstant] = useState(true);
  const [geom, setGeom] = useState({ left: 0, width: 0, height: 0, arrow: 0 });
  const openRef = useRef<NavMenuId | null>(null);
  const lastRef = useRef<NavMenuId>('product');
  const pointerRef = useRef<string>('');
  const closeTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLUListElement>(null);
  const triggers = useRef<Partial<Record<NavMenuId, HTMLButtonElement | null>>>({});
  const sections = useRef<Partial<Record<NavMenuId, HTMLDivElement | null>>>({});

  const measure = useCallback((id: NavMenuId) => {
    const t = triggers.current[id];
    const s = sections.current[id];
    const bar = barRef.current;
    if (!t || !s || !bar) return;
    const b = bar.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    // Every menu is the same width, so the panel never moves sideways: it sits centered under the whole
    // bar (wider than it, so the arrow reaches every item), never closer than 16px to the window's edge.
    const w = s.offsetWidth;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(16, Math.min(vw - 16 - w, b.left + b.width / 2 - w / 2));
    const center = r.left + r.width / 2;
    setGeom({ left, width: w, height: s.offsetHeight, arrow: Math.max(20, Math.min(w - 20, center - left)) });
  }, []);

  const show = useCallback((id: NavMenuId) => {
    window.clearTimeout(closeTimer.current);
    if (openRef.current === id) return;
    // From closed, the panel wipes open with the menu already in place; between menus, it carousels.
    setInstant(openRef.current === null);
    openRef.current = id;
    lastRef.current = id;
    setOpen(id);
  }, []);

  const hide = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    openRef.current = null;
    setOpen(null);
  }, []);

  /** A short grace period, so a pointer crossing a plain link on its way to the next menu doesn't close the panel. */
  const hideSoon = useCallback(
    (ms = 160) => {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(hide, ms);
    },
    [hide],
  );

  const focusFirst = (id: NavMenuId) => {
    show(id);
    requestAnimationFrame(() => sections.current[id]?.querySelector<HTMLElement>('a')?.focus());
  };

  useLayoutEffect(() => {
    if (open) measure(open);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measure(open);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = triggers.current[open];
      hide();
      t?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) hide();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, measure, hide]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // The panel sits after the bar in the page, so Tab is steered by hand: from the first link back to
  // its item, and from the last link on to whatever follows that item in the bar.
  const onSectionKey = (id: NavMenuId) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const links = Array.from(sections.current[id]?.querySelectorAll<HTMLElement>('a') ?? []);
    const trigger = triggers.current[id];
    if (!trigger || !links.length) return;
    if (e.shiftKey && document.activeElement === links[0]) {
      e.preventDefault();
      trigger.focus();
    } else if (!e.shiftKey && document.activeElement === links[links.length - 1]) {
      const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.mk-nav-item') ?? []);
      const next = items[items.indexOf(trigger) + 1];
      // Past the last item, the page's own order (Sign in) is already right, and blur closes the menu.
      if (next) {
        e.preventDefault();
        hide();
        next.focus();
      }
    }
  };

  const shown = open ?? lastRef.current;
  const shiftFor = (id: NavMenuId) =>
    id === shown ? 0 : ORDER.indexOf(id) < ORDER.indexOf(shown) ? -SHIFT : SHIFT;

  return (
    <div
      ref={rootRef}
      className="mk-nav"
      onPointerEnter={() => window.clearTimeout(closeTimer.current)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hideSoon()}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) hide();
      }}
    >
      <ul ref={barRef} className="mk-nav-bar">
        {NAV_BAR.map((entry) =>
          entry.kind === 'menu' ? (
            <li key={entry.id}>
              <button
                ref={(el) => {
                  triggers.current[entry.id] = el;
                }}
                type="button"
                className="mk-nav-item mk-nav-trigger"
                aria-expanded={open === entry.id}
                aria-controls={`mk-dd-${entry.id}`}
                onPointerEnter={(e) => e.pointerType === 'mouse' && show(entry.id)}
                onPointerDown={(e) => {
                  pointerRef.current = e.pointerType;
                }}
                onClick={(e) => {
                  // A mouse has already opened it by hovering, so its click keeps it open; a tap or a key toggles.
                  const mouse = e.detail > 0 && pointerRef.current === 'mouse';
                  if (open === entry.id && !mouse) hide();
                  else show(entry.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey && open === entry.id)) {
                    e.preventDefault();
                    focusFirst(entry.id);
                  }
                }}
              >
                {NAV_MENUS[entry.id].label}
                <ChevronDown className="mk-nav-chevron" size={15} strokeWidth={2.2} aria-hidden />
              </button>
            </li>
          ) : (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="mk-nav-item"
                onPointerEnter={(e) => e.pointerType === 'mouse' && hideSoon(240)}
                onFocus={hide}
              >
                {entry.brio ? <Brio fixedColor iconClassName="mk-sparkle" /> : entry.label}
              </Link>
            </li>
          ),
        )}
      </ul>

      <div className={`mk-dd${open ? ' is-open' : ''}${instant ? ' is-instant' : ''}`} inert={!open}>
        <div className="mk-dd-panel" style={{ transform: `translate3d(${geom.left}px, 0, 0)`, width: geom.width, height: geom.height }}>
          <div className="mk-dd-card" onPointerEnter={() => window.clearTimeout(closeTimer.current)}>
            <span aria-hidden="true" className="mk-dd-arrow" style={{ transform: `translate3d(${geom.arrow - 7}px, 0, 0) rotate(45deg)` }} />
            <div className="mk-dd-clip">
              {ORDER.map((id) => {
                const menu = NAV_MENUS[id];
                return (
                  <div
                    key={id}
                    id={`mk-dd-${id}`}
                    ref={(el) => {
                      sections.current[id] = el;
                    }}
                    className={`mk-dd-section${id === shown ? ' is-shown' : ''}`}
                    style={{ '--mk-dd-shift': `${shiftFor(id)}px` } as CSSProperties}
                    inert={open !== id}
                    onKeyDown={onSectionKey(id)}
                  >
                    <ul className="mk-dd-grid" aria-label={menu.label}>
                      {menu.items.map((item) => (
                        <li key={item.href}>
                          <NavItemLink item={item} className="mk-dd-item" onNavigate={hide}>
                            <NavIcon icon={item.icon} />
                            <span className="mk-dd-text">
                              <span className="mk-dd-title">
                                <NavItemTitle item={item} />
                              </span>
                              <span className="mk-dd-desc">{item.description}</span>
                            </span>
                          </NavItemLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
