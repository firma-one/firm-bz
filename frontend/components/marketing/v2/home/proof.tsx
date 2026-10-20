/**
 * 8 · Proof. White band. The tour card (the real product, no account needed) beside a customer's word.
 * The testimonial is Dharita Gada's real quote, verbatim. Both cards carry the hover rim.
 */
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Brio } from '@/components/ui/brio';
import { MkCard } from '../motion';
import { Band } from '../primitives';
import { ProofMesh } from './proof-mesh';
import './proof.css';

export function ProofSection() {
  return (
    <Band surface="white" aria-labelledby="mk-proof-title" className="pb-20 pt-[72px] md:pb-[clamp(96px,8.9vw,128px)] md:pt-[clamp(88px,7.78vw,112px)]">
      <div className="mk-rail leading-[normal]">
        <h2 id="mk-proof-title" className="sr-only">
          See it for yourself
        </h2>
        <div className="mk-proof-grid">
          <MkCard className="mk-proof-card mk-proof-tour">
            <ProofMesh />
            <div className="relative">
              <span className="mk-proof-chip">SEE IT BEFORE YOU SIGN UP</span>
              <h3
                className="m-0 mt-4 text-[30px] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--mk-ink)] md:mt-[18px] md:text-[38px]"
                style={{ fontFamily: 'var(--mk-font-display)' }}
              >
                The tour is the real product.
              </h3>
              <p className="mt-3.5 max-w-[480px] text-[16px] leading-[1.6] text-[#0E3A2B] md:text-[17px]">
                Open a sample firm, Beacon Growth Partners, with two clients, four engagements and <Brio fixedColor /> switched on. Ask
                it anything. No account needed.
              </p>
              <Link href="/tour" className="mk-btn mk-proof-cta mt-6 md:mt-7">
                Take the tour
                <ChevronRight size={16} strokeWidth={2.6} aria-hidden style={{ color: 'var(--mk-electric)' }} />
              </Link>
            </div>
          </MkCard>

          <MkCard className="mk-proof-card mk-proof-quote">
            <figure className="m-0 flex w-full flex-col justify-between gap-7 md:gap-8">
              <div>
                <div aria-hidden="true" className="mk-proof-mark">
                  “
                </div>
                <blockquote
                  className="m-0 mt-3.5 text-[20px] font-medium leading-[1.4] tracking-[-0.015em] text-[var(--mk-ink)] md:text-[23px] md:leading-[1.38]"
                  style={{ fontFamily: 'var(--mk-font-display)' }}
                >
                  As a fractional CISO, I can’t ask clients to trust yet another vendor with their files. firmä keeps everything in our
                  own Drive, gives each client a clean view of their engagement, and shows me exactly who can see what.{' '}
                  <Brio fixedColor /> tells me which client needs me first.
                </blockquote>
              </div>
              <figcaption className="flex items-center gap-3.5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full text-[16px] font-bold text-[var(--mk-on-electric)]"
                  style={{ background: 'linear-gradient(140deg, #7DFF77, #00C49A)', fontFamily: 'var(--mk-font-display)' }}
                >
                  DG
                </span>
                <span>
                  <span className="block text-[16px] font-bold text-[var(--mk-ink)]">Dharita Gada</span>
                  <span className="mt-0.5 block text-[14.5px] text-[var(--mk-muted)]">Founder, DataSentry · Fractional CISO</span>
                </span>
              </figcaption>
            </figure>
          </MkCard>
        </div>
      </div>
    </Band>
  );
}
