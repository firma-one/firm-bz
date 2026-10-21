'use client';

/**
 * The Insights docs page's two live previews, restyled on the green system: the summary cards with the
 * storage bar, and the Activity Hub with its four tabs. Same mock data as the legacy previews
 * (`components/docs/insights/*`), which stay until the legacy sweep; relative times are fixed labels
 * here so server and client render the same text.
 */
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Archive, BarChart, ChevronDown, Clock, ExternalLink, FileWarning, Filter, HardDrive, TrendingUp, Users } from 'lucide-react';
import './docs-insights.css';

/* ── Summary cards and storage ────────────────────────────────────────────────────────────────── */

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="mk-docs-metric">
      <span className="mk-docs-metric-icon">{icon}</span>
      <span>
        <span className="mk-docs-metric-value">{value}</span>
        <span className="mk-docs-metric-label">{label}</span>
      </span>
    </div>
  );
}

const STORAGE = [
  { label: 'Videos', size: '858 GB', pct: '41.65%', width: 45, color: '#009669' },
  { label: 'Images', size: '477 GB', pct: '23.16%', width: 25, color: '#00C49A' },
  { label: 'Documents', size: '286 GB', pct: '13.88%', width: 15, color: '#2EE6C5' },
  { label: 'Audio', size: '191 GB', pct: '9.27%', width: 10, color: '#7DFF77' },
  { label: 'Other', size: '97.5 GB', pct: '4.73%', width: 5, color: '#C9DBD3' },
];

export function SummaryStoragePreview() {
  const ICON = { size: 20, strokeWidth: 2.1, 'aria-hidden': true } as const;
  return (
    <div className="mk-docs-preview-stack" role="group" aria-label="Insights preview: summary cards and storage usage">
      <div className="mk-docs-metrics">
        <MetricCard icon={<Archive {...ICON} />} label="Stale Documents" value="12" />
        <MetricCard icon={<BarChart {...ICON} />} label="Large Files" value="5" />
        <MetricCard icon={<FileWarning {...ICON} />} label="Sensitive Content" value="4" />
        <MetricCard icon={<Users {...ICON} />} label="Risky Shares" value="3" />
      </div>

      <div className="mk-docs-storage">
        <div className="mk-docs-storage-head">
          <div>
            <p className="mk-docs-storage-title">Storage Usage</p>
            <p className="mk-docs-storage-sub">
              1.85 TB (89.81%) used of 2.06 TB <span aria-hidden="true">·</span> Updated just now
            </p>
          </div>
          <div className="mk-docs-storage-actions" aria-hidden="true">
            <span className="mk-docs-fakebtn">
              <Filter size={12} strokeWidth={2.4} />
              Filter
              <ChevronDown size={12} strokeWidth={2.4} />
            </span>
            <span className="mk-docs-fakelink">
              Manage Storage
              <ExternalLink size={13} strokeWidth={2.4} />
            </span>
          </div>
        </div>
        <div className="mk-docs-storage-bar" aria-hidden="true">
          {STORAGE.map((s) => (
            <span key={s.label} style={{ width: `${s.width}%`, background: s.color }} />
          ))}
        </div>
        <ul className="mk-docs-storage-legend">
          {STORAGE.map((s) => (
            <li key={s.label}>
              <span aria-hidden="true" className="mk-docs-dot" style={{ background: s.color }} />
              <span className="mk-docs-legend-label">{s.label}</span>
              <span className="mk-docs-legend-size">
                {s.size} ({s.pct})
              </span>
            </li>
          ))}
          <li>
            <span aria-hidden="true" className="mk-docs-dot mk-docs-dot--free" />
            <span className="mk-docs-legend-label">Free</span>
            <span className="mk-docs-legend-size">210 GB (10.19%)</span>
          </li>
        </ul>
      </div>

      <p className="mk-docs-preview-note">Data in this preview is for demonstration purposes.</p>
    </div>
  );
}

/* ── Activity Hub ─────────────────────────────────────────────────────────────────────────────── */

type Badge = { type: 'risk' | 'attention' | 'stale'; text: string };
type Row = { kind: string; name: string; owner: string; when: string; size?: string; action?: string; count?: string; badges?: Badge[] };

const TABS = ['recent', 'trending', 'storage', 'sharing'] as const;
type Tab = (typeof TABS)[number];

const ROWS: Record<Tab, Row[]> = {
  recent: [
    { kind: 'PDF', name: 'Project_Alpha_Q3_Report.pdf', owner: 'alice@example.com', when: '30 min ago', size: '2.4 MB', action: 'Edited' },
    { kind: 'XLS', name: 'Budget_FY24.xlsx', owner: 'me@example.com', when: '2 hours ago', size: '1.1 MB', action: 'Viewed', badges: [{ type: 'attention', text: 'External Share' }] },
    { kind: 'DIR', name: 'Marketing_Assets', owner: 'marketing@example.com', when: '1 day ago', action: 'Renamed' },
  ],
  trending: [
    { kind: 'PPT', name: 'Q4_All_Hands.pptx', owner: 'ceo@example.com', when: 'Today', size: '15 MB', count: '124 actions', badges: [{ type: 'risk', text: 'Public Link' }] },
    { kind: 'DOC', name: 'Onboarding_Guide.docx', owner: 'hr@example.com', when: 'Today', size: '500 KB', count: '45 actions' },
  ],
  storage: [
    { kind: 'MOV', name: 'Raw_Footage_Campaign_A.mov', owner: 'creative@example.com', when: '100 days ago', size: '2.5 GB', badges: [{ type: 'stale', text: 'Stale Document' }] },
    { kind: 'ZIP', name: 'Archive_2023.zip', owner: 'sysadmin@example.com', when: '200 days ago', size: '5 GB', badges: [{ type: 'stale', text: 'Stale Document' }] },
  ],
  sharing: [
    { kind: 'XLS', name: 'Quarterly_Budget_Overview.xlsx', owner: 'finance@example.com', when: '20 hours ago', size: '29.48 KB', action: 'Shared By You', badges: [{ type: 'risk', text: 'RISK' }] },
    { kind: 'ZIP', name: 'Logo_Assets_Final.zip', owner: 'agency@creative.com', when: '2 hours ago', size: '154 MB', action: 'Shared With You' },
  ],
};

const TIMEFRAMES: Record<Tab, { options: string[]; active: string }> = {
  recent: { options: ['24h', '1w', '2w'], active: '24h' },
  trending: { options: ['24h', '1w', '1m'], active: '1w' },
  storage: { options: ['4w', 'All'], active: '4w' },
  sharing: { options: ['4w', 'All Time'], active: 'All Time' },
};

const FILTERS: Record<Tab, string[]> = {
  recent: ['Type'],
  trending: ['Type'],
  storage: ['Size: 1GB+', 'Oldest First'],
  sharing: ['Type', 'Risk', 'All Shared'],
};

const SUMMARY: Record<Tab, { icon: ReactNode; text: string }> = {
  recent: { icon: <Clock size={12} strokeWidth={2.4} />, text: '3 modified' },
  trending: { icon: <TrendingUp size={12} strokeWidth={2.4} />, text: '169 actions' },
  storage: { icon: <HardDrive size={12} strokeWidth={2.4} />, text: '2 large file(s)' },
  sharing: { icon: <Users size={12} strokeWidth={2.4} />, text: '2 shared file(s)' },
};

function FileRow({ row }: { row: Row }) {
  return (
    <li className="mk-docs-hub-row">
      <span className={`mk-docs-hub-kind mk-docs-hub-kind--${row.kind.toLowerCase()}`} aria-hidden="true">
        {row.kind}
      </span>
      <span className="mk-docs-hub-main">
        <span className="mk-docs-hub-name">{row.name}</span>
        <span className="mk-docs-hub-meta">
          {row.owner} · {row.when}
          {row.size ? ` · ${row.size}` : ''}
          {row.count ? ` · ${row.count}` : ''}
        </span>
      </span>
      <span className="mk-docs-hub-tags">
        {row.badges?.map((b) => (
          <span key={b.text} className={`mk-docs-hub-badge mk-docs-hub-badge--${b.type}`}>
            {b.text}
          </span>
        ))}
        {row.action ? <span className="mk-docs-hub-action">{row.action}</span> : null}
      </span>
    </li>
  );
}

export function ActivityHubPreview() {
  const [tab, setTab] = useState<Tab>('sharing');
  const base = useId();
  const tf = TIMEFRAMES[tab];

  // Arrow keys move between tabs (roving tabindex).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]);
    document.getElementById(`${base}-tab-${TABS[next]}`)?.focus();
  };

  return (
    <div className="mk-docs-hub" role="group" aria-label="Activity Hub preview">
      <div className="mk-docs-hub-head">
        <div className="mk-docs-hub-toprow">
          <div role="tablist" aria-label="Activity Hub tabs" className="mk-docs-hub-tabs" onKeyDown={onKeyDown}>
            {TABS.map((t) => (
              <button
                key={t}
                id={`${base}-tab-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`${base}-panel`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
                className="mk-docs-hub-tab"
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mk-docs-hub-timeframe" aria-hidden="true">
            {tf.options.map((o) => (
              <span key={o} data-active={o === tf.active ? '' : undefined}>
                {o}
              </span>
            ))}
          </div>
        </div>
        <div className="mk-docs-hub-filterrow" aria-hidden="true">
          <span className="mk-docs-hub-filters">
            <Filter size={15} strokeWidth={2.2} className="mk-docs-hub-filter-icon" />
            {FILTERS[tab].map((f, i) => (
              <span key={f} className="mk-docs-fakebtn">
                {f}
                {tab === 'sharing' && i === 0 ? <span className="mk-docs-hub-dot" /> : null}
                <ChevronDown size={12} strokeWidth={2.4} />
              </span>
            ))}
          </span>
          <span className="mk-docs-hub-summary">
            {SUMMARY[tab].icon}
            {SUMMARY[tab].text}
          </span>
        </div>
      </div>

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab}`} className="mk-docs-hub-panel">
        <ul key={tab} className="mk-docs-hub-list">
          {ROWS[tab].map((row) => (
            <FileRow key={row.name} row={row} />
          ))}
        </ul>
      </div>

      <p className="mk-docs-preview-note mk-docs-preview-note--foot">Data in this preview is for demonstration purposes.</p>
    </div>
  );
}
