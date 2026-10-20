'use client';

/**
 * The plan matrix, from `PRICING_COMPARISON`. From 768 px: one table, a column per plan (Free first,
 * Standard tinted). Phones: pick a plan, then read its column as a list, so nothing scrolls sideways.
 * Rows with an explanation in the config get an info button.
 */
import { Check } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Brio } from '@/components/ui/brio';
import { ENGAGEMENT_PERSONA_TOOLTIP_ROWS, ENGAGEMENT_PERSONAS_TOOLTIP_FOOTER } from '@/config/pricing';
import { persistCheckoutIntent, readCheckoutIntent } from '@/lib/marketing/checkout-intent';
import { COMPARE_CATEGORIES, COMPARE_COLUMNS, cellView, checkoutPlanName, type RowView } from './pricing-data';
import { InfoTip } from './info-tip';

function Cell({ value }: { value: RowView['values'][string] | undefined }) {
  const v = cellView(value);
  if (v.kind === 'check') {
    return (
      <span role="img" aria-label="Included" className="inline-flex">
        <Check size={18} strokeWidth={3} aria-hidden className="mk-pricing-check" />
      </span>
    );
  }
  if (v.kind === 'dash') {
    return (
      <span role="img" aria-label="Not included" className="mk-pricing-dash">
        —
      </span>
    );
  }
  if (v.kind === 'beta') return <span className="mk-pricing-beta">Beta</span>;
  return (
    <span className="mk-pricing-cell-text">
      {v.lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
    </span>
  );
}

function TipBody({ row }: { row: RowView }) {
  if (row.personas) {
    return (
      <div className="mk-pricing-tip-personas">
        {ENGAGEMENT_PERSONA_TOOLTIP_ROWS.map((p) => (
          <p key={p.role}>
            <strong>{p.role}</strong> {p.body}
          </p>
        ))}
        <p className="mk-pricing-tip-foot">{ENGAGEMENT_PERSONAS_TOOLTIP_FOOTER}</p>
      </div>
    );
  }
  return <p className="mk-pricing-tip-text">{row.tooltip}</p>;
}

function RowLabel({ row }: { row: RowView }) {
  return (
    <span className="mk-pricing-row-label">
      <span>
        {row.brio && (
          <>
            <Brio fixedColor />{' '}
          </>
        )}
        {row.label}
      </span>
      {(row.tooltip || row.personas) && (
        <InfoTip label={row.plain}>
          <TipBody row={row} />
        </InfoTip>
      )}
    </span>
  );
}

function DesktopTable() {
  return (
    <div className="mk-pricing-table-card">
      <table className="mk-pricing-table">
        <caption className="sr-only">Plan comparison</caption>
        <colgroup>
          <col className="mk-pricing-col-feature" />
          {COMPARE_COLUMNS.map((c) => (
            <col key={c.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="mk-pricing-th-feature">
              Feature
            </th>
            {COMPARE_COLUMNS.map((c) => (
              <th key={c.id} scope="col" className="mk-pricing-th-plan" data-hi={c.highlight || undefined}>
                <span className="mk-pricing-th-name">{c.title}</span>
                <span className="mk-pricing-th-note">{c.note}</span>
              </th>
            ))}
          </tr>
        </thead>
        {COMPARE_CATEGORIES.map((cat) => (
          <tbody key={cat.key}>
            <tr className="mk-pricing-cat">
              <th scope="rowgroup" colSpan={COMPARE_COLUMNS.length + 1}>
                {cat.name}
              </th>
            </tr>
            {cat.rows.map((row) => (
              <tr key={row.key} className="mk-pricing-row">
                <th scope="row">
                  <RowLabel row={row} />
                </th>
                {COMPARE_COLUMNS.map((c) => (
                  <td key={c.id} data-hi={c.highlight || undefined}>
                    <Cell value={row.values[c.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function PhonePlanView() {
  const initial = COMPARE_COLUMNS.find((c) => c.highlight)?.id ?? COMPARE_COLUMNS[0].id;
  const [planId, setPlanIdState] = useState(initial);
  // Picking a plan to compare moves the checkout intent to it, as the previous pricing page did.
  const setPlanId = (id: string) => {
    setPlanIdState(id);
    persistCheckoutIntent({ plan: checkoutPlanName(id), interval: readCheckoutIntent()?.interval ?? 'annual' });
  };
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const column = COMPARE_COLUMNS.find((c) => c.id === planId) ?? COMPARE_COLUMNS[0];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = COMPARE_COLUMNS.findIndex((c) => c.id === planId);
    const last = COMPARE_COLUMNS.length - 1;
    const next =
      e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    setPlanId(COMPARE_COLUMNS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <div className="mk-pricing-phone-compare">
      <div role="tablist" aria-label="Plan to compare" className="mk-pricing-tabs" onKeyDown={onKeyDown}>
        {COMPARE_COLUMNS.map((c, i) => (
          <button
            key={c.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`mk-pricing-tab-${c.id}`}
            aria-selected={c.id === planId}
            aria-controls="mk-pricing-tabpanel"
            tabIndex={c.id === planId ? 0 : -1}
            className="mk-pricing-tab"
            onClick={() => setPlanId(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div
        key={column.id}
        role="tabpanel"
        id="mk-pricing-tabpanel"
        aria-labelledby={`mk-pricing-tab-${column.id}`}
        className="mk-pricing-panel"
      >
        <div className="mk-pricing-panel-head" data-hi={column.highlight || undefined}>
          <span className="mk-pricing-panel-name">{column.title}</span>
          {column.note && <span className="mk-pricing-th-note">{column.note}</span>}
        </div>
        {COMPARE_CATEGORIES.map((cat) => (
          <section key={cat.key} aria-label={cat.name}>
            <h3 className="mk-pricing-pcat">{cat.name}</h3>
            <dl className="mk-pricing-plist">
              {cat.rows.map((row) => (
                <div key={row.key} className="mk-pricing-prow">
                  <dt>
                    <RowLabel row={row} />
                  </dt>
                  <dd>
                    <Cell value={row.values[column.id]} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

export function PricingCompareMatrix() {
  return (
    <>
      <DesktopTable />
      <PhonePlanView />
    </>
  );
}
