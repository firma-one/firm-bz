import Link from 'next/link';
import { BrandMarkIcon } from '@/components/brand/BrandMarkIcon';
import { BrandName } from '@/components/brand/BrandName';
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';
import { CONTACT_EMAIL, FOOTER_COLUMNS } from './config';
import { LegalLinks } from './legal-links';
import { PageGuides } from './primitives';

const isExternal = (href: string) => /^https?:/.test(href);

/** Marketing footer, v2: deep forest, guide lines continuing from the final CTA band. */
export function SiteFooter() {
  return (
    <footer className="mk-band mk-band--dark relative !overflow-visible">
      <PageGuides dark />
      <div className="mk-rail relative pb-11 pt-6">
        <div className="flex flex-wrap gap-x-14 gap-y-10 border-t border-white/[0.08] pt-11">
          <div className="min-w-0 flex-[2_1_260px]">
            <Link href="/" aria-label={`${BRAND_NAME} home`} className="inline-flex items-center gap-2">
              <BrandMarkIcon variant="onDark" className="h-6 w-6" />
              <BrandName
                gradient={false}
                className="bg-gradient-to-r from-white via-[#C9F7C2] to-[#72ff70] bg-clip-text text-[21px] leading-none !text-transparent"
              />
            </Link>
            <p className="mt-3.5 max-w-[300px] text-[14.5px] leading-[1.6] text-[var(--mk-on-dark-muted)]">
              The client workspace for consultancies and fractional leaders, built on your own Drive.
            </p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="flex min-w-0 flex-[1_1_140px] flex-col gap-2.5 text-[14.5px]">
              <span className="font-bold text-white">{col.title}</span>
              {col.links.map((l) =>
                isExternal(l.href) ? (
                  <a key={l.href} href={l.href} className="text-[var(--mk-on-dark-body)] transition-colors hover:!text-white">
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.href} href={l.href} className="text-[var(--mk-on-dark-body)] transition-colors hover:!text-white">
                    {l.brio ? <Brio iconClassName="text-[#7DFF77]" /> : l.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>
        {/* Bottom bar: the legal links (the same row as sign-in's), and the contact address. */}
        <div className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/[0.08] pt-5">
          <LegalLinks tone="dark" />
          <div className="mk-legal mk-legal--dark -mx-2.5 text-[13.5px] text-[var(--mk-on-dark-muted)]">
            <a href={`mailto:${CONTACT_EMAIL}`} className="mk-legal-link">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
