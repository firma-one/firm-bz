/**
 * Trust Center, v2 (`/resources/trust-center`). A top-level page on the green system; no board, so it
 * is built from the home page's pieces:
 *
 * 1. White hero: chip, the `mk-page` headline and lede, then the systems map (trust-map.tsx): an
 *    interactive diagram laid out by elkjs on the server and drawn by React Flow, with a side panel.
 * 2. Gray band: the five trust pillars as MkCards. 01–03 are copy; 04 and 05 carry a product peek
 *    (the audit log, the access list) on a pastel panel.
 * 3. White band: how firmä touches your data, as four spec cards along the request path.
 * 4. Gray band: "Want the full security story?", then the dark final CTA over the same gray.
 *
 * Server component: the systems map and MkCard (hover rim, touch press, scroll reveal) are the client pieces.
 */
import type { ReactNode } from 'react';
import { BRAND_NAME } from '@/config/brand';
import { DEMO_BOOKING_URL } from '../config';
import { MkCard } from '../motion';
import { Band, Eyebrow, PillLink, revealDelay } from '../primitives';
import { ReadingFinalCta } from '../reading/closing';
import { IconAccess, IconConfidential, IconOwnership, IconPortal, IconSecurityTalk, IconViews } from './trust-icons';
import { TrustMap } from './trust-map';
import { trustMapNodes } from './trust-map-data';
import { layoutTrustMap } from './trust-map-layout';
import './trust.css';

/* ── 1 · Hero ─────────────────────────────────────────────────────────────────────────────────── */

/** The systems map: elkjs lays it out here, on the server (at build time for this static page). */
async function SystemsMap() {
  const nodes = trustMapNodes(BRAND_NAME);
  const [right, down] = await Promise.all([layoutTrustMap(nodes, 'RIGHT'), layoutTrustMap(nodes, 'DOWN')]);
  return <TrustMap nodes={nodes} layouts={{ RIGHT: right, DOWN: down }} />;
}

function TrustHero() {
  return (
    <Band surface="white" className="mk-trust-hero" aria-labelledby="mk-trust-title">
      <div className="mk-rail">
        <p className="mk-trust-chip">
          <span className="mk-trust-chip-badge">TRUST CENTER</span>
          Non-custodial by design
        </p>
        <h1 id="mk-trust-title" className="mk-page mk-trust-title">
          <span className="mk-trust-title-line">Your business. Your Drive.</span>{' '}
          <span className="mk-trust-title-line">
            Your asset. <span className="text-[var(--mk-bottle)]">Your control.</span>
          </span>
        </h1>
        <p className="mk-lede mk-trust-lede">
          Organize your files without holding them hostage. {BRAND_NAME} is non-custodial: if you leave, your folders stay
          exactly as they are.
        </p>
        <SystemsMap />
      </div>
    </Band>
  );
}

/* ── 2 · Trust architecture ───────────────────────────────────────────────────────────────────── */

const PEOPLE = {
  AJ: { name: 'Alex Jordan', bg: '#E3EDFB', fg: '#2C4A9A' },
  SR: { name: 'Sam Rivera', bg: '#E2F2E7', fg: '#2F7A46' },
  MC: { name: 'Megan Carter', bg: '#FBE4D6', fg: '#9A4A16' },
} as const;

function Avatar({ who }: { who: keyof typeof PEOPLE }) {
  const p = PEOPLE[who];
  return (
    <span className="mk-trust-av" style={{ background: p.bg, color: p.fg }}>
      {who}
    </span>
  );
}

const VIEWS: { action: string; file: string; time: string }[] = [
  { action: 'opened', file: 'Q2 Launch Strategy.pdf', time: '9:12 AM' },
  { action: 'downloaded', file: 'Landing Page Copy.docx', time: '9:14 AM' },
  { action: 'opened', file: 'Creative Assets v4.zip', time: 'Yesterday' },
];

/** 04 · The audit log, filtered to what the client opened and downloaded. */
function ViewsPeek() {
  return (
    <div className="mk-trust-ui">
      <div className="mk-trust-ui-bar">
        <span className="mk-trust-ui-strong">Audit log</span>
        <span className="mk-trust-ui-muted">Q2 – Product Launch</span>
      </div>
      {VIEWS.map((v, i) => (
        <div key={v.file} className="mk-trust-ui-row mk-reveal" style={revealDelay(250 + i * 140)}>
          <Avatar who="MC" />
          <span className="mk-trust-ui-text">
            <span className="mk-trust-ui-strong">Megan Carter</span> {v.action} {v.file}
          </span>
          <span className="mk-trust-ui-muted mk-trust-ui-time">{v.time}</span>
        </div>
      ))}
    </div>
  );
}

const ACCESS: { who: keyof typeof PEOPLE; org: string; role: string; external?: boolean }[] = [
  { who: 'AJ', org: 'Your team', role: 'Owner' },
  { who: 'SR', org: 'Your team', role: 'Contributor' },
  { who: 'MC', org: 'Horizon FinTech', role: 'Reviewer · view only', external: true },
];

/** 05 · Who can see one deliverable, and the one-step revoke. */
function AccessPeek() {
  return (
    <div className="mk-trust-ui">
      <div className="mk-trust-ui-bar">
        <span className="mk-trust-ui-strong">Access</span>
        <span className="mk-trust-ui-muted mk-trust-ui-file">Landing Page Copy.docx</span>
      </div>
      {ACCESS.map((a, i) => (
        <div key={a.who} className="mk-trust-ui-row mk-reveal" style={revealDelay(250 + i * 140)}>
          <Avatar who={a.who} />
          <span className="mk-trust-ui-text">
            <span className="mk-trust-ui-strong">{PEOPLE[a.who].name}</span>
            <span className="mk-trust-ui-muted"> · {a.org}</span>
          </span>
          <span className={`mk-trust-ui-role${a.external ? ' mk-trust-ui-role--ext' : ''}`}>{a.role}</span>
        </div>
      ))}
      <div className="mk-trust-ui-foot mk-reveal" style={revealDelay(700)}>
        <span className="mk-trust-ui-revoke">Revoke external access</span>
      </div>
    </div>
  );
}

function PillarCard({
  num,
  label,
  icon,
  title,
  tags,
  peek,
  className = '',
  children,
}: {
  num: string;
  label: string;
  icon: ReactNode;
  title: string;
  tags?: string[];
  /** A decorative product peek on a pastel panel at the bottom of the card. */
  peek?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <MkCard as="li" className={`mk-trust-card ${className}`}>
      <div className="mk-trust-card-head">
        <div className="mk-card-title-wrap">
          <div className="mk-trust-card-top">
            {icon}
            <span className="mk-trust-card-label">
              {num} · {label}
            </span>
          </div>
          <h3 className="mk-card-title mk-trust-card-title">{title}</h3>
        </div>
        <p className="mk-trust-card-copy">{children}</p>
        {tags ? (
          <ul className="mk-trust-tags" aria-label="In short">
            {tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {peek ? (
        <div aria-hidden="true" className="mk-trust-panel">
          <div className="mk-card-lift mk-trust-panel-lift">{peek}</div>
        </div>
      ) : null}
    </MkCard>
  );
}

function TrustArchitecture() {
  return (
    <Band surface="gray" className="mk-trust-band" aria-labelledby="mk-trust-pillars-title">
      <div className="mk-rail">
        <Eyebrow>TRUST ARCHITECTURE</Eyebrow>
        <div className="mt-4 md:mt-5">
          <h2 id="mk-trust-pillars-title" className="mk-section mk-trust-h2">
            Trust, built into every engagement.
          </h2>
        </div>
        <p className="mk-trust-sublede">
          Five things you can count on, from the first folder you connect to the last deliverable you share.
        </p>

        <ul className="mk-trust-pillars">
          <PillarCard num="01" label="Non-custody" icon={<IconOwnership />} title="You own the asset" tags={['Your Drive · your files']}>
            {BRAND_NAME} takes a non-custodial role. Files stay in your Drive, and if you leave, you keep everything exactly as it
            is.
          </PillarCard>
          <PillarCard
            num="02"
            label="Client experience"
            icon={<IconPortal />}
            title="An enterprise-grade image"
            tags={['Branded portal', 'Controlled access']}
          >
            Look like a major firm with secure, managed data practices. Clients get a branded portal that shows only what you
            share: no more “oops, wrong file” moments.
          </PillarCard>
          <PillarCard
            num="03"
            label="IP and confidentiality"
            icon={<IconConfidential />}
            title="NDA-ready security"
            tags={['Never Share', 'Structure, not bytes']}
            className="mk-trust-card--wide-tablet"
          >
            Confidentiality is your currency. Tag internal docs and frameworks as Never Share, so they can never reach a client by
            accident. {BRAND_NAME} keeps the structure (metadata) apart from your content, so file contents are never stored on
            our servers.
          </PillarCard>
          <PillarCard
            num="04"
            label="Analytics"
            icon={<IconViews />}
            title="See what clients open"
            peek={<ViewsPeek />}
            className="mk-trust-card--peek"
          >
            Track views and downloads across your portal. Every open and download is recorded in the audit log, deliverable by
            deliverable.
          </PillarCard>
          <PillarCard
            num="05"
            label="Permissions"
            icon={<IconAccess />}
            title="Ease of governance"
            peek={<AccessPeek />}
            className="mk-trust-card--peek"
          >
            Grant access per deliverable, keep reviewers view-only, and revoke external access in one step. When an engagement
            ends, everything you explicitly shared with that client is revoked. Fewer zombie links, clearer IP boundaries.
          </PillarCard>
        </ul>
      </div>
    </Band>
  );
}

/* ── 3 · How firmä touches your data ──────────────────────────────────────────────────────────── */

const SPECS: { tag: string; where: string; title: string; body: string }[] = [
  {
    tag: 'TLS 1.3',
    where: `Browser ↔ ${BRAND_NAME} ↔ Drive`,
    title: 'Encrypted in transit',
    body: `Every request between your browser, ${BRAND_NAME} and your Drive travels over HTTPS.`,
  },
  {
    tag: 'OIDC',
    where: 'At sign-in',
    title: 'Standard sign-in',
    body: 'Sign-in runs through a dedicated auth service on OpenID Connect, with a one-time email code or your Google account. No password to leak.',
  },
  {
    tag: 'AES-256',
    where: 'In our metadata database',
    title: 'Encrypted at rest',
    body: 'Sensitive metadata (client and engagement names, contact details, comments and storage tokens) is encrypted with AES-256-GCM before it’s stored.',
  },
  {
    tag: 'OAuth 2.0',
    where: `${BRAND_NAME} ↔ your Drive`,
    title: 'Drive access you can revoke',
    body: `${BRAND_NAME} reaches your Drive through OAuth 2.0 and keeps no copy of your files. You can revoke that access from your Google or Microsoft account at any time.`,
  },
];

function DataFlow() {
  return (
    <Band surface="white" className="mk-trust-band" aria-labelledby="mk-trust-flow-title">
      <div className="mk-rail">
        <Eyebrow>TRANSPARENT FLOW</Eyebrow>
        <div className="mt-4 md:mt-5">
          <h2 id="mk-trust-flow-title" className="mk-section mk-trust-h2">
            How {BRAND_NAME} touches your data
          </h2>
        </div>
        <p className="mk-trust-sublede">
          Logic runs on our servers; files stay in your Drive. Here is how a request moves from your browser to your Drive,
          without {BRAND_NAME} taking custody of your content.
        </p>

        <ol className="mk-trust-specs">
          {SPECS.map((s, i) => (
            <MkCard as="li" key={s.tag} className="mk-trust-spec">
              <div className="mk-trust-spec-inner">
                <div className="mk-trust-spec-top">
                  <span className="mk-trust-spec-step" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="mk-trust-spec-where">{s.where}</span>
                </div>
                <p className="mk-trust-spec-tag">{s.tag}</p>
                <div className="mk-card-title-wrap">
                  <h3 className="mk-trust-spec-title">{s.title}</h3>
                </div>
                <p className="mk-trust-spec-body">{s.body}</p>
              </div>
            </MkCard>
          ))}
        </ol>
      </div>
    </Band>
  );
}

/* ── 4 · Talk to the team, then the final CTA ─────────────────────────────────────────────────── */

function TalkToTeam() {
  return (
    <Band surface="gray" className="mk-trust-talk" aria-labelledby="mk-trust-talk-title">
      <div className="mk-rail">
        <MkCard className="mk-trust-talk-card">
          <div className="mk-trust-talk-inner">
            <div className="mk-trust-talk-copy">
              <IconSecurityTalk />
              <h2 id="mk-trust-talk-title" className="mk-sub mk-trust-talk-title">
                Want the full security story? <span className="text-[var(--mk-bottle)]">Talk to our team.</span>
              </h2>
              <p className="mk-trust-talk-text">
                We can walk through architecture, compliance posture, and how metadata stays separate from your file bytes in
                Drive.
              </p>
            </div>
            <div className="mk-trust-talk-actions">
              <PillLink href="/contact" block>
                Contact us
              </PillLink>
              <PillLink href={DEMO_BOOKING_URL} variant="secondary" block>
                Book a demo
              </PillLink>
            </div>
          </div>
        </MkCard>
      </div>
    </Band>
  );
}

export function TrustCenterPage() {
  return (
    <>
      <TrustHero />
      <TrustArchitecture />
      <DataFlow />
      <TalkToTeam />
      <ReadingFinalCta />
    </>
  );
}
