'use client';

/**
 * The billing toggle and the plan cards (Free, each launched plan, and one "Larger firms" card for the
 * plans that are launching later). Annual is the default. Prices and the billing note roll when the
 * period changes; nothing around them moves.
 *
 * The checkout intent (plan in focus + billing interval) is persisted on load, on every toggle and when
 * a plan is chosen, exactly as the previous pricing page did: the signup and billing screens read it to
 * preselect the plan and interval. Focus starts on Standard; the Free card keeps the old mapping
 * (anything that isn't a paid plan id means Standard).
 */
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brio } from '@/components/ui/brio';
import { CONTACT_HREF_SALES_INQUIRY } from '@/lib/marketing/contact-inquiry';
import { persistCheckoutIntent, type CheckoutPlanName } from '@/lib/marketing/checkout-intent';
import type { PricingPlan } from '@/config/pricing';
import {
  LATER_PLANS,
  LAUNCHED_PLANS,
  PERIOD_INDEX,
  annualSavingsPercent,
  cardDescription,
  checkoutPlanName,
  freePlanBullets,
  laterPlanLine,
  listJoin,
  monthlyPrice,
  paidPlanBullets,
  usd,
  type BillingPeriod,
  type Bullet,
} from './pricing-data';
import { PricingPhoneRibbon } from './pricing-ribbon';
import { RollSwap } from './roll-swap';

const SAVE = annualSavingsPercent();

function BillingToggle({ period, onChange }: { period: BillingPeriod; onChange: (p: BillingPeriod) => void }) {
  return (
    <div role="group" aria-label="Billing period" className="mk-pricing-toggle">
      <button type="button" aria-pressed={period === 'monthly'} onClick={() => onChange('monthly')} className="mk-pricing-toggle-btn">
        Monthly
      </button>
      <button
        type="button"
        aria-pressed={period === 'annual'}
        onClick={() => onChange('annual')}
        className="mk-pricing-toggle-btn mk-pricing-toggle-btn--annual"
      >
        Annually
        {SAVE !== null && <span className="mk-pricing-save">Save {SAVE}%</span>}
      </button>
    </div>
  );
}

function Checklist({ items }: { items: Bullet[] }) {
  return (
    <ul className="mk-pricing-list">
      {items.map((b, i) => (
        <li key={i}>
          <Check size={16} strokeWidth={3} aria-hidden className="mk-pricing-check" />
          <span>
            {b.before}
            {b.brio && <Brio fixedColor />}
            {b.after}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CardCta({
  href,
  variant,
  onClick,
  children,
}: {
  href: string;
  variant: 'primary' | 'secondary';
  onClick?: () => void;
  children: string;
}) {
  return (
    <Link href={href} onClick={onClick} className={`mk-btn mk-btn--${variant} mk-pricing-cta mk-pricing-cta--${variant}`}>
      {children}
      <ChevronRight size={14} strokeWidth={2.6} aria-hidden />
    </Link>
  );
}

/** The period's price (rolls on change), or the plan's quote label. */
function Price({ plan, period, size }: { plan: PricingPlan; period: BillingPeriod; size: 'lg' | 'sm' }) {
  const annual = monthlyPrice(plan, 'annual');
  const monthly = monthlyPrice(plan, 'monthly');
  const green = size === 'lg' && plan.popular;
  if (annual === null || monthly === null) {
    return <span className={`mk-pricing-amount mk-pricing-amount--${size}`}>Custom</span>;
  }
  return (
    <>
      <span className={`mk-pricing-amount mk-pricing-amount--${size}${green ? ' mk-pricing-amount--green' : ''}`}>
        <RollSwap values={[usd(annual), usd(monthly)]} index={PERIOD_INDEX[period]} />
      </span>
      <span className={size === 'lg' ? 'mk-pricing-per' : 'mk-pricing-per mk-pricing-per--sm'}>{plan.duration || '/month'}</span>
    </>
  );
}

function FreeCard({ choose }: { choose: (plan: CheckoutPlanName) => void }) {
  return (
    <div className="mk-pricing-card">
      <div className="mk-pricing-card-head">
        <h3 className="mk-pricing-card-name">Free</h3>
      </div>
      <p className="mk-pricing-card-desc">For your first client, with everything you need to deliver.</p>
      <div className="mk-pricing-price">
        <span className="mk-pricing-amount mk-pricing-amount--lg">$0</span>
        <span className="mk-pricing-per">forever</span>
      </div>
      <p className="mk-pricing-note">No credit card</p>
      <div className="mk-pricing-cta-wrap">
        <CardCta href="/signup" variant="secondary" onClick={() => choose('Standard')}>
          Start free
        </CardCta>
      </div>
      <Checklist items={freePlanBullets()} />
    </div>
  );
}

function PlanCard({ plan, period, choose }: { plan: PricingPlan; period: BillingPeriod; choose: (plan: CheckoutPlanName) => void }) {
  const annual = monthlyPrice(plan, 'annual');
  const href =
    plan.id === 'Standard'
      ? `/signup?intent=standard&interval=${period}&paid_plan=true`
      : (plan.href ?? '/contact') === '/contact'
        ? CONTACT_HREF_SALES_INQUIRY
        : (plan.href ?? '/contact');
  return (
    <div className={`mk-pricing-card${plan.popular ? ' mk-pricing-card--featured' : ''}`}>
      <div className="mk-pricing-card-head">
        <h3 className="mk-pricing-card-name">{plan.title}</h3>
        {plan.popular && <span className="mk-pricing-badge">MOST FIRMS</span>}
      </div>
      <p className="mk-pricing-card-desc">{cardDescription(plan)}</p>
      <div className="mk-pricing-price">
        <Price plan={plan} period={period} size="lg" />
      </div>
      <p className="mk-pricing-note">
        {annual !== null ? (
          <RollSwap
            block
            index={PERIOD_INDEX[period]}
            values={[`per month, billed annually (${usd(annual * 12)} a year)`, 'per month, billed monthly']}
          />
        ) : null}
      </p>
      <div className="mk-pricing-cta-wrap">
        <CardCta href={href} variant={plan.popular ? 'primary' : 'secondary'} onClick={() => choose(checkoutPlanName(plan.id))}>
          {plan.cta ?? `Get ${plan.title}`}
        </CardCta>
      </div>
      <Checklist items={paidPlanBullets(plan)} />
    </div>
  );
}

function LaterCard({ period }: { period: BillingPeriod }) {
  return (
    <div className="mk-pricing-card mk-pricing-card--later">
      <div className="mk-pricing-card-head">
        <h3 className="mk-pricing-card-name">Larger firms</h3>
        <span className="mk-pricing-badge mk-pricing-badge--soon">COMING SOON</span>
      </div>
      <p className="mk-pricing-card-desc">
        {listJoin(LATER_PLANS.map((p) => p.title))} {LATER_PLANS.length === 1 ? 'is' : 'are'} launching later. Talk to us if you need{' '}
        {LATER_PLANS.length === 1 ? 'it' : 'one'} sooner.
      </p>
      <ul className="mk-pricing-later">
        {LATER_PLANS.map((plan) => (
          <li key={plan.id} className="mk-pricing-later-row">
            <div className="mk-pricing-later-head">
              <span className="mk-pricing-later-name">{plan.title}</span>
              <span>
                <Price plan={plan} period={period} size="sm" />
              </span>
            </div>
            <p className="mk-pricing-later-line">{laterPlanLine(plan)}</p>
          </li>
        ))}
      </ul>
      <div className="mk-pricing-later-cta">
        <CardCta href={CONTACT_HREF_SALES_INQUIRY} variant="secondary">
          Talk to us
        </CardCta>
      </div>
    </div>
  );
}

export function PricingPlans() {
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [focus, setFocus] = useState<CheckoutPlanName>('Standard');
  useEffect(() => {
    persistCheckoutIntent({ plan: focus, interval: period });
  }, [focus, period]);
  // Persist right away too: the button navigates before the effect would run.
  const choose = (plan: CheckoutPlanName) => {
    setFocus(plan);
    persistCheckoutIntent({ plan, interval: period });
  };
  const count = 1 + LAUNCHED_PLANS.length + (LATER_PLANS.length ? 1 : 0);

  return (
    <>
      <div className="mk-rail mk-pricing-hero-head">
        <BillingToggle period={period} onChange={setPeriod} />
        <PricingPhoneRibbon />
      </div>
      <div className="mk-rail mk-pricing-cards-rail">
        <h2 className="sr-only">Plans</h2>
        <div className="mk-pricing-cards" style={{ ['--mk-pricing-cols' as string]: count }}>
          <FreeCard choose={choose} />
          {LAUNCHED_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} period={period} choose={choose} />
          ))}
          {LATER_PLANS.length > 0 && <LaterCard period={period} />}
        </div>
      </div>
    </>
  );
}
