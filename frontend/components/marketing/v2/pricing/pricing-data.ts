/**
 * /pricing view model. Every price, limit and plan state on the page is read from `config/pricing.ts`
 * (the same source as billing), so the page cannot drift from the plans. What lives here is copy: the
 * board's shorter row labels and the one-line highlights under each plan, keyed by the config's own ids
 * and feature names, each falling back to the config text when a key is missing.
 */
import {
  PRICING_COMPARISON,
  PRICING_PLANS,
  PRICING_SANDBOX_COLUMN_ID,
  type PlanValue,
  type PricingComparisonRow,
  type PricingPlan,
} from '@/config/pricing';
import { ASSISTANT } from '@/lib/ai/assistant';
import type { CheckoutPlanName } from '@/lib/marketing/checkout-intent';

export type BillingPeriod = 'annual' | 'monthly';

/** Order of the price values handed to `RollSwap`: annual first (the default), then monthly. */
export const PERIOD_INDEX: Record<BillingPeriod, number> = { annual: 0, monthly: 1 };

export const FREE_COLUMN_ID = PRICING_SANDBOX_COLUMN_ID;

// ── Prices ────────────────────────────────────────────────────────────────────────────────────

/** Per-month price in dollars for the billing period, or null for a plan priced by quote. */
export function monthlyPrice(plan: PricingPlan, period: BillingPeriod): number | null {
  if (!plan.price.trim().startsWith('$')) return null;
  const list = parseInt(plan.price.replace(/[^0-9]/g, ''), 10);
  if (Number.isNaN(list)) return null;
  if (period === 'monthly') return list;
  // Same fallback as the previous page when a plan has no explicit annual price.
  return plan.priceBilledAnnually ?? Math.round(list * 0.84);
}

export const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const num = (n: number) => n.toLocaleString('en-US');

/** "Save 20%": the featured plan's annual discount, rounded. */
export function annualSavingsPercent(): number | null {
  const plan = PRICING_PLANS.find((p) => p.popular) ?? PRICING_PLANS[0];
  if (!plan) return null;
  const m = monthlyPrice(plan, 'monthly');
  const a = monthlyPrice(plan, 'annual');
  if (!m || !a || a >= m) return null;
  return Math.round((1 - a / m) * 100);
}

export function checkoutPlanName(planId: string): CheckoutPlanName {
  if (planId === 'Standard' || planId === 'Pro' || planId === 'Business' || planId === 'Enterprise') return planId;
  return 'Standard';
}

// ── Comparison rows the cards also read ───────────────────────────────────────────────────────

const ALL_ROWS = PRICING_COMPARISON.flatMap((c) => c.rows);
const icons = (row: PricingComparisonRow) => (Array.isArray(row.featureIcon) ? row.featureIcon : row.featureIcon ? [row.featureIcon] : []);

/** Rows are found by their structural markers (tooltip layout, the AI icon), not by label text. */
const ROW = {
  clients: ALL_ROWS.find((r) => r.tooltipLayout === 'hierarchy-sample'),
  users: ALL_ROWS.find((r) => r.tooltipLayout === 'engagement-personas'),
  credits: ALL_ROWS.find((r) => icons(r).includes('ai') && /credit/i.test(r.feature)),
  comments: ALL_ROWS.find((r) => /comment/i.test(r.feature)),
  health: ALL_ROWS.find((r) => /health/i.test(r.feature)),
  supportPortal: ALL_ROWS.find((r) => /support portal/i.test(r.feature)),
};

const valueOf = (row: PricingComparisonRow | undefined, columnId: string): PlanValue | undefined => row?.values[columnId];
const text = (v: PlanValue | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const leadingNumber = (v: PlanValue | undefined) => {
  const m = text(v)?.match(/^[\d,]+/);
  return m ? m[0] : null;
};

// ── Plan cards ────────────────────────────────────────────────────────────────────────────────

/** A checklist line; `brio` puts Brio's lockup between `before` and `after`. */
export type Bullet = { before: string; brio?: boolean; after?: string };

/** The free tier is not a billable plan in the config; its numbers are the comparison's Sandbox column. */
export function freePlanBullets(): Bullet[] {
  const clients = text(valueOf(ROW.clients, FREE_COLUMN_ID));
  const users = text(valueOf(ROW.users, FREE_COLUMN_ID));
  const credits = leadingNumber(valueOf(ROW.credits, FREE_COLUMN_ID));
  const comments = text(valueOf(ROW.comments, FREE_COLUMN_ID));
  const out: Bullet[] = [];
  if (clients && users) out.push({ before: `${clients} and ${users}` });
  if (credits) out.push({ before: `${credits} `, brio: true, after: ' credits a month' });
  out.push({ before: 'Google Drive, or OneDrive (Beta)' });
  out.push({ before: 'Branded client portal and Deliverable Board' });
  if (comments) out.push({ before: `${comments} of comment history` });
  return out;
}

/** Board copy for a plan's card description, by plan id (falls back to the config's description). */
const CARD_DESCRIPTION: Record<string, string> = {
  Standard: 'Take off the training wheels: the full client portal on your existing Drive.',
};

/** Feature lines after the four limits on a full plan card, by plan id. */
const CARD_EXTRAS: Record<string, (plan: PricingPlan) => string[]> = {
  Standard: (plan) => [
    ...(valueOf(ROW.health, plan.id) ? ['Engagement health as a PDF'] : []),
    ...(valueOf(ROW.supportPortal, plan.id) === true ? ['Support portal'] : []),
  ],
};

export const cardDescription = (plan: PricingPlan) => CARD_DESCRIPTION[plan.id] ?? plan.description;

/** Checklist for a full (launched) paid plan card, from its published entitlements. */
export function paidPlanBullets(plan: PricingPlan): Bullet[] {
  const e = plan.entitlements;
  const out: Bullet[] = [];
  if (e) {
    const users = text(valueOf(ROW.users, plan.id));
    const members = !users || /^unlimited$/i.test(users) ? 'unlimited members' : users;
    out.push({ before: `${e.clients === null ? 'Unlimited clients' : `${num(e.clients)} client${e.clients === 1 ? '' : 's'}`}, ${members}` });
    if (e.aiCredits !== undefined) {
      out.push(
        e.aiCredits === null
          ? { before: 'Unlimited ', brio: true, after: ' credits' }
          : { before: `${num(e.aiCredits)} `, brio: true, after: ' credits a month' },
      );
    }
    if (e.auditDays === null) out.push({ before: 'Unlimited audit trail and version history' });
    else if (e.auditDays) out.push({ before: `${e.auditDays}-day audit trail and version history` });
    if (e.commentHistoryDays === null) out.push({ before: 'Unlimited comment history' });
    else if (e.commentHistoryDays !== undefined) out.push({ before: `${e.commentHistoryDays} days of comment history` });
  }
  for (const line of CARD_EXTRAS[plan.id]?.(plan) ?? []) out.push({ before: line });
  return out;
}

/** Board copy: what each launching-later plan adds, by plan id. */
const PLAN_HIGHLIGHTS: Record<string, string> = {
  Pro: 'templates, versioning, custom subdomain, calendar',
  Business: 'priority rollups',
  Enterprise: 'SSO, custom domain, SLA support',
};

/** "10 clients · 1,000 credits · 90-day audit · templates, …" for the Larger firms card. */
export function laterPlanLine(plan: PricingPlan): string {
  const e = plan.entitlements;
  const parts: string[] = [];
  if (e) {
    parts.push(e.clients === null ? 'Unlimited clients' : `${num(e.clients)} client${e.clients === 1 ? '' : 's'}`);
    if (e.aiCredits !== undefined) parts.push(e.aiCredits === null ? 'Unlimited credits' : `${num(e.aiCredits)} credits`);
    if (typeof e.auditDays === 'number' && e.auditDays > 0) parts.push(`${e.auditDays}-day audit`);
  }
  if (PLAN_HIGHLIGHTS[plan.id]) parts.push(PLAN_HIGHLIGHTS[plan.id]);
  return parts.join(' · ');
}

/** "Pro, Business and Enterprise". */
export function listJoin(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const LAUNCHED_PLANS = PRICING_PLANS.filter((p) => !p.launchingLater);
export const LATER_PLANS = PRICING_PLANS.filter((p) => p.launchingLater);

// ── Comparison matrix ─────────────────────────────────────────────────────────────────────────

export type CompareColumn = { id: string; title: string; note: string; highlight: boolean };

export const COMPARE_COLUMNS: CompareColumn[] = [
  { id: FREE_COLUMN_ID, title: 'Free', note: '', highlight: false },
  ...PRICING_PLANS.map((p) => ({
    id: p.id,
    title: p.title,
    note: p.popular ? 'Most firms' : p.launchingLater ? 'Coming soon' : '',
    highlight: !!p.popular,
  })),
];

/** The board's shorter labels, keyed by the config's feature text. Unknown rows keep the config label. */
const ROW_LABELS: Record<string, string> = {
  'Firm → Client → Engagement → Deliverable → Document hierarchy': 'Clients',
  'Credits included': 'credits a month',
  'Users & Access Control': 'Users',
  'Bring your own OneDrive / SharePoint': 'Bring your own OneDrive or SharePoint',
  'Custom branded client portal': 'Branded client portal',
  'Scheduled follow-ups & reminders': 'Scheduled follow-ups and reminders',
  'Full Audit Trail': 'Audit trail',
  'In-app messaging (Deliverable comment thread) history.': 'Comment thread history',
  'Firm / Engagement summaries & AI assistant': 'summaries and answers',
  'Tracking Calendar': 'Tracking calendar',
  'Engagement Health Dashboard': 'Engagement health dashboard',
  'Engagement & Document templates': 'Engagement and document templates',
  'Dedicated Support Portal': 'Support portal',
  'SLA-based Priority support': 'SLA priority support',
};

/** Board wording for a few cell values (same meaning, shorter). */
const VALUE_COPY: Record<string, string> = {
  '+ Email notifications': '+ Email alerts',
  'Incl. all features in Business': 'Everything in Business',
};

/** Board wording for category names ("DELIVERY & OVERSIGHT" → "Delivery and oversight"). */
export const categoryLabel = (name: string) => {
  const s = name.replace(/\s*&\s*/g, ' and ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export type RowView = {
  key: string;
  /** Label after Brio's lockup when `brio`, else the whole label. */
  label: string;
  brio: boolean;
  /** The label as plain text (aria-labels). */
  plain: string;
  tooltip?: string;
  personas: boolean;
  values: Record<string, PlanValue>;
};

export function rowView(row: PricingComparisonRow): RowView {
  const brio = icons(row).includes('ai');
  const label = ROW_LABELS[row.feature] ?? row.feature;
  return {
    key: row.feature,
    label,
    brio,
    plain: brio ? `${ASSISTANT.name} ${label}` : label,
    tooltip: row.tooltip,
    personas: row.tooltipLayout === 'engagement-personas',
    values: row.values,
  };
}

export const COMPARE_CATEGORIES = PRICING_COMPARISON.map((c) => ({
  key: c.name,
  name: categoryLabel(c.name),
  rows: c.rows.map(rowView),
}));

export type CellView = { kind: 'check' } | { kind: 'dash' } | { kind: 'beta' } | { kind: 'text'; lines: string[] };

/**
 * One matrix cell. The usage rows carry their unit in the label ("Clients", "Brio credits a month"), so
 * "3 clients" and "500 / month" show as their number, as on the board; anything else shows as written.
 */
export function cellView(value: PlanValue | undefined): CellView {
  if (value === true) return { kind: 'check' };
  if (value === false || value === undefined) return { kind: 'dash' };
  const v = value.trim();
  if (!v) return { kind: 'dash' };
  if (/^beta$/i.test(v)) return { kind: 'beta' };
  const unitless = v.match(/^([\d,]+)\s*(?:clients?|users?|\/\s*month)$/i);
  const shown = unitless ? unitless[1] : (VALUE_COPY[v] ?? v);
  return { kind: 'text', lines: shown.split('\n') };
}
