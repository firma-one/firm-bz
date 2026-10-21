/**
 * 9 · Pricing teaser. Gray band. Free and Standard side by side, then the way to the full table.
 * Standard's numbers come from `config/pricing.ts`, the same source as /pricing and billing, so the
 * teaser cannot drift from the plan. The free tier is not a billable plan there, so its line is copy.
 */
import type { ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { PRICING_PLANS } from '@/config/pricing';
import { Band, ChevronLink, Eyebrow, PillLink } from '../primitives';
import './pricing-teaser.css';

const plan = PRICING_PLANS.find((p) => p.id === 'Standard');
const STANDARD = {
  price: plan?.price ?? '$49',
  annual: plan?.priceBilledAnnually ?? 39,
  clients: plan?.entitlements?.clients ?? 3,
  credits: plan?.entitlements?.aiCredits ?? 500,
  auditDays: plan?.entitlements?.auditDays ?? 30,
};

const BrioMark = () => <Brio fixedColor />;

function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mk-pricing-teaser-list mk-pricing-teaser-desk">
      {items.map((item, i) => (
        <li key={i}>
          <span aria-hidden="true">✓ </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PricingTeaserSection() {
  return (
    <Band surface="gray" id="pricing" aria-labelledby="mk-pricing-teaser-title" className="mk-pricing-teaser py-[52px] md:py-[clamp(88px,8.33vw,120px)]">
      <div className="mk-rail leading-[normal]">
        <Eyebrow>PRICING</Eyebrow>
        <div className="mt-4 md:mt-5">
          <h2 id="mk-pricing-teaser-title" className="mk-section max-w-[760px] text-[var(--mk-bottle)]">
            Start free. Upgrade when the second client signs.
          </h2>
        </div>

        <div className="mk-pricing-teaser-grid mt-6 md:mt-12">
          <div className="mk-pricing-teaser-card">
            <div className="mk-pricing-teaser-head">
              <h3 className="m-0 text-[17px] font-bold md:text-[19px]">Free</h3>
              <div className="flex items-baseline gap-2 md:mt-3.5">
                <span className="mk-pricing-teaser-amount">$0</span>
                <span className="mk-pricing-teaser-desk text-[var(--mk-muted)]">forever</span>
              </div>
            </div>
            <Checklist
              items={[
                '1 client and 2 users',
                <>
                  25 <BrioMark /> credits a month
                </>,
                'Google Drive or OneDrive',
                'No credit card',
              ]}
            />
            <p className="mk-pricing-teaser-phone mt-2 text-[14.5px] leading-[1.55] text-[var(--mk-body)]">
              1 client, 2 users, 25 <BrioMark /> credits a month. No credit card.
            </p>
            <PillLink href="/signup" variant="secondary" className="mk-pricing-teaser-cta mk-pricing-teaser-desk">
              Start free
            </PillLink>
          </div>

          <div className="mk-pricing-teaser-rim">
            <div className="mk-pricing-teaser-card">
              <div className="mk-pricing-teaser-head">
                <div className="flex items-center gap-2 md:gap-2.5">
                  <h3 className="m-0 text-[17px] font-bold md:text-[19px]">Standard</h3>
                  <span className="mk-pricing-teaser-badge">MOST FIRMS</span>
                </div>
                <div className="flex items-baseline gap-2 md:mt-3.5">
                  <span className="mk-pricing-teaser-amount mk-pricing-teaser-amount--green">{STANDARD.price}</span>
                  <span className="mk-pricing-teaser-desk text-[var(--mk-muted)]">per month, or ${STANDARD.annual} billed annually</span>
                  <span className="mk-pricing-teaser-phone -ml-1 text-[13px] text-[var(--mk-muted)]">/mo</span>
                </div>
              </div>
              <Checklist
                items={[
                  `${STANDARD.clients} clients, unlimited users`,
                  <>
                    {STANDARD.credits} <BrioMark /> credits a month
                  </>,
                  'Comments, approvals and reminders',
                  `${STANDARD.auditDays} days of audit history`,
                ]}
              />
              <p className="mk-pricing-teaser-phone mt-2 text-[14.5px] leading-[1.55] text-[var(--mk-body)]">
                {STANDARD.clients} clients, unlimited users, {STANDARD.credits} <BrioMark /> credits a month. ${STANDARD.annual}/mo billed
                annually.
              </p>
              <PillLink href="/signup" className="mk-pricing-teaser-cta mk-pricing-teaser-desk">
                Start free, upgrade later
              </PillLink>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[15px] text-[var(--mk-muted)] md:mt-[26px]">
          <span className="mk-pricing-teaser-desk">Pro and Business are coming soon. </span>
          <ChevronLink href="/pricing" className="min-h-[44px] md:min-h-0">
            Compare all plans
          </ChevronLink>
        </p>
      </div>
    </Band>
  );
}
