/**
 * 1 · Hero (the silk-ribbon variant). White page; the ribbon wraps the right side behind the product
 * screen. The H1 and the product screen are plain HTML, so neither waits on the canvas.
 */
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';
import { DEMO_BOOKING_URL } from '../config';
import { PageGuides, PillLink } from '../primitives';
import { ScaleToFit } from '../scale-to-fit';
import { AskBrioCard, AskBrioPanel } from './hero-ask';
import { ApprovedCard, EngagementOverviewFrame, HealthRing } from './hero-overview';
import { HeroRibbon } from './hero-ribbon';

const BrioLight = () => <Brio fixedColor iconClassName="mk-sparkle" />;

function DesktopComposite() {
  return (
    <div
      role="img"
      aria-label={`${BRAND_NAME} Engagement Overview for Q2 – Product Launch Campaign, health 71 of 100, with the Ask Brio panel open: Brio answers where the engagement stands and what needs attention today.`}
    >
      <ScaleToFit width={1152} height={720} overhang={[36, 40]}>
        <div style={{ position: 'relative', width: 1152 }}>
          <EngagementOverviewFrame />
          <ApprovedCard />
          <AskBrioPanel />
        </div>
      </ScaleToFit>
    </div>
  );
}

function PhoneComposite() {
  return (
    <div role="img" aria-label="Engagement health for Q2 – Product Launch Campaign, 71 of 100, with Brio answering what needs attention today.">
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 0 0 1px rgba(5,39,28,0.08), 0 30px 60px -24px rgba(3,40,27,0.42)',
          padding: 16,
          fontSize: 13,
          color: '#37352F',
        }}
      >
        <div style={{ color: '#8D8B86', fontSize: 11.5 }}>Horizon FinTech</div>
        <div style={{ marginTop: 2, fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em' }}>Q2 – Product Launch Campaign</div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 12,
            border: '1px solid rgba(55,53,47,0.10)',
            borderRadius: 8,
          }}
        >
          <HealthRing size={64} sub={false} />
          <div>
            <div style={{ fontWeight: 600, color: '#A86A06' }}>Needs attention</div>
            <div style={{ marginTop: 3, color: '#8D8B86', fontSize: 12 }}>1 overdue · behind pace · 8 gaps</div>
          </div>
        </div>
      </div>
      <AskBrioCard />
    </div>
  );
}

export function HeroSection() {
  return (
    <section data-mk-hero className="relative overflow-hidden bg-white pb-20 pt-16 md:pb-[104px] md:pt-[76px]">
      <HeroRibbon />
      <PageGuides />

      <div className="mk-rail relative z-[2] pb-8 pt-7 md:pb-16 md:pt-[72px]">
        <Link
          href="#brio"
          className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/85 py-1 pl-1 pr-3 text-[13px] shadow-[0_0_0_1px_rgba(5,39,28,0.08),0_6px_18px_-10px_rgba(5,39,28,0.35)] md:gap-2.5 md:py-[5px] md:pl-[5px] md:pr-3.5 md:text-[14px]"
        >
          <span className="rounded-full bg-[var(--mk-electric)] px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] text-[var(--mk-on-electric)] md:px-2.5 md:py-[3px] md:text-[12px]">
            NEW
          </span>
          <span className="hidden md:inline">
            Meet <BrioLight />, the client-delivery assistant every firm owner wishes they had
          </span>
          <span className="md:hidden">
            Meet <BrioLight />, your delivery assistant
          </span>
          <ChevronRight size={16} strokeWidth={2.4} aria-hidden className="flex-none" />
        </Link>

        <h1 className="mk-display mt-5 max-w-[980px] text-[var(--mk-ink)] md:mt-[30px]">
          Run every client engagement <span className="text-[var(--mk-bottle)]">from your own Drive.</span>
        </h1>

        <p className="mk-lede mt-4 max-w-[640px] md:mt-7">
          <span className="hidden md:inline">
            {BRAND_NAME} turns the Google Drive or OneDrive you already use into a client workspace: every deliverable on a Board, every
            approval in one thread, and <BrioLight />, the assistant for client delivery that briefs you, answers your questions and drafts
            the client update. Your files never leave your Drive.
          </span>
          <span className="md:hidden">
            A client workspace on the Google Drive or OneDrive you already use, with <BrioLight /> as your assistant for client delivery.
            Your files never leave your Drive.
          </span>
        </p>

        <div className="mt-6 flex flex-col gap-2.5 md:mt-9 md:flex-row md:flex-wrap md:items-center md:gap-3.5">
          <PillLink href="/signup" block>
            Start free
          </PillLink>
          <PillLink href="/tour" variant="secondary" block>
            Take the tour
          </PillLink>
          <a href={DEMO_BOOKING_URL} className="ml-1.5 hidden text-[15px] font-semibold !text-[var(--mk-bottle-dark)] hover:underline md:inline">
            or book a demo
          </a>
        </div>
        <p className="mt-3.5 text-center text-[13.5px] text-[var(--mk-body)] md:mt-[22px] md:text-left md:text-[14px] md:text-[var(--mk-muted)]">
          <span className="hidden md:inline">Free for your first client · No credit card · Google Drive and OneDrive</span>
          <span className="md:hidden">
            Free for your first client · No credit card ·{' '}
            <a href={DEMO_BOOKING_URL} className="font-semibold underline">
              Book a demo
            </a>
          </span>
        </p>
      </div>

      <div className="mk-rail relative z-[2]">
        <div className="hidden md:block">
          <DesktopComposite />
        </div>
        <div className="md:hidden">
          <PhoneComposite />
        </div>
      </div>
    </section>
  );
}
