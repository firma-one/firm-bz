'use client';

/**
 * Marketing header, v2. Fixed over the page: transparent at the top (the hero's ribbon shows behind
 * it), then white at 80% with a blur and a hairline once the page scrolls. On phones, Start free stays
 * next to the menu button, and the menu opens as a full-screen sheet.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Menu, X } from 'lucide-react';
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon';
import { BrandName } from '@/components/brand/BrandName';
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';
import { HEADER_LINKS, type NavLink } from './config';

function NavLabel({ link }: { link: NavLink }) {
  return link.brio ? <Brio fixedColor iconClassName="mk-sparkle" /> : <>{link.label}</>;
}

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

        <div className="hidden items-center gap-[30px] text-[15px] font-medium lg:flex">
          {HEADER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:!text-[var(--mk-bottle-dark)]">
              <NavLabel link={l} />
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {/* The wrapper owns visibility: .mk-btn sets display after Tailwind loads, so `hidden` on the link itself would lose. */}
          <span className="hidden sm:inline-flex">
            <Link href="/signin" className="mk-btn mk-btn--sm !bg-white/55 !font-semibold" style={{ color: 'var(--mk-ink)' }}>
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
        <div id="mk-mobile-menu" className="mk-rail h-[calc(100dvh-64px)] overflow-y-auto bg-white pb-10 pt-4 lg:hidden">
          <ul className="flex flex-col">
            {HEADER_LINKS.map((l) => (
              <li key={l.href} className="border-b border-[rgba(5,39,28,0.08)]">
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[56px] items-center justify-between text-[19px] font-semibold"
                >
                  <NavLabel link={l} />
                  <ChevronRight size={18} strokeWidth={2.2} aria-hidden className="text-[var(--mk-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
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
