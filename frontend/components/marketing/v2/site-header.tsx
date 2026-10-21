'use client';

/**
 * Marketing header, v2. Fixed over the page: transparent at the top (the hero's ribbon shows behind
 * it), then white at 80% with a blur and a hairline once the page scrolls. The desktop links and
 * dropdowns live in `DesktopNav`. On phones, Start free stays next to the menu button, and the menu
 * opens as a full-screen sheet with the same entries, grouped under each dropdown's name.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Menu, X } from 'lucide-react';
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon';
import { BrandName } from '@/components/brand/BrandName';
import { BRAND_NAME } from '@/config/brand';
import { NAV_BAR, NAV_MENUS, type NavMenuItem } from './config';
import { NavIcon } from './nav-icons';
import { DesktopNav, NavItemLink, NavItemTitle } from './site-nav';

type PhoneItem = Pick<NavMenuItem, 'label' | 'href' | 'icon' | 'external'>;

/**
 * The phone menu: one group per dropdown, in the bar's order. A plain link that a dropdown already
 * lists isn't repeated; one that isn't (Pricing) joins the group before it.
 */
const PHONE_GROUPS: { title: string; items: PhoneItem[] }[] = (() => {
  const listed = new Set(Object.values(NAV_MENUS).flatMap((m) => m.items.map((i) => i.href)));
  const groups: { title: string; items: PhoneItem[] }[] = [];
  for (const entry of NAV_BAR) {
    if (entry.kind === 'menu') groups.push({ title: NAV_MENUS[entry.id].label, items: [...NAV_MENUS[entry.id].items] });
    else if (!listed.has(entry.href) && groups.length)
      groups[groups.length - 1].items.push({ label: entry.label, href: entry.href, icon: entry.icon ?? 'features' });
  }
  return groups;
})();

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300"
      style={{
        backgroundColor: scrolled || open ? 'rgba(255,255,255,0.82)' : 'transparent',
        backdropFilter: scrolled || open ? 'saturate(1.6) blur(14px)' : 'none',
        WebkitBackdropFilter: scrolled || open ? 'saturate(1.6) blur(14px)' : 'none',
        boxShadow: scrolled && !open ? '0 1px 0 rgba(5,39,28,0.08)' : 'none',
      }}
    >
      <nav aria-label="Main" className="mk-rail flex h-16 items-center gap-9 md:h-[76px]">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="group inline-flex items-center gap-2">
          <BrandMarkIcon className="h-[23px] w-[23px] md:h-[26px] md:w-[26px]" />
          <BrandName className="text-[22px] leading-none md:text-[24px]" />
        </Link>

        {/* The wrapper owns visibility (the nav's own class sets display) and stretches to the bar's full height. */}
        <div className="hidden self-stretch lg:flex">
          <DesktopNav />
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {/* The wrapper owns visibility: .mk-btn sets display after Tailwind loads, so `hidden` on the link itself would lose. */}
          <span className="hidden sm:inline-flex">
            <Link href="/signin" className="mk-btn mk-btn--secondary mk-btn--sm">
              Sign in
              <ChevronRight size={14} strokeWidth={2.6} aria-hidden />
            </Link>
          </span>
          <Link href="/signup" className="mk-btn mk-btn--primary mk-btn--sm max-md:!h-11 max-md:!text-[15px] max-md:!font-bold">
            Start free
            <ChevronRight size={14} strokeWidth={2.6} aria-hidden />
          </Link>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mk-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/60 text-[var(--mk-ink)] lg:hidden"
          >
            {open ? <X size={22} strokeWidth={1.9} aria-hidden /> : <Menu size={22} strokeWidth={1.9} aria-hidden />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mk-mobile-menu" className="mk-rail h-[calc(100dvh-64px)] overflow-y-auto bg-white pb-10 pt-2 lg:hidden">
          {PHONE_GROUPS.map((g) => (
            <section key={g.title} aria-label={g.title} className="mk-phone-group">
              <h2 className="mk-phone-group-title">{g.title}</h2>
              <ul>
                {g.items.map((item) => (
                  <li key={item.href}>
                    <NavItemLink item={item} className="mk-phone-item" onNavigate={() => setOpen(false)}>
                      <NavIcon icon={item.icon} size={30} />
                      <span className="flex-1">
                        <NavItemTitle item={item} />
                      </span>
                      <ChevronRight size={18} strokeWidth={2.2} aria-hidden className="text-[var(--mk-muted)]" />
                    </NavItemLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="mt-8 flex flex-col gap-2.5">
            <Link href="/signup" onClick={() => setOpen(false)} className="mk-btn mk-btn--primary mk-btn--block-phone">
              Start free
              <ChevronRight size={15} strokeWidth={2.6} aria-hidden />
            </Link>
            <Link href="/signin" onClick={() => setOpen(false)} className="mk-btn mk-btn--secondary mk-btn--block-phone">
              Sign in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
