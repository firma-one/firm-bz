/**
 * 7 · Who it's for. Gray band. Three audience cards, each a link to its landing page, with a peek at the
 * part of the product that audience lives in. The peeks reveal row by row on the card's first scroll-in
 * (CSS `mk-reveal`, driven by MkCard's `data-revealed`), and the cards carry the hover kit.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Brio } from '@/components/ui/brio';
import { MkCard } from '../motion';
import { Band } from '../primitives';
import './who-its-for.css';

/** The pastel product-panel mesh (the board's `panel()`), with its four tints placed per card. */
const TINTS = ['#E9FFB0', '#C4F6EA', '#A9F2C8', '#D9FFD4'];
const panel = (...at: string[]) => at.map((a, i) => `radial-gradient(at ${a}, ${TINTS[i]} 0px, transparent 55%)`).join(', ');

/** Reveal delay for a peek row (server-safe twin of motion's `revealDelay`). */
const delay = (ms: number) => ({ ['--mk-delay' as string]: `${ms}ms` }) as CSSProperties;

const CHIP = {
  active: { background: '#E3EDFB', color: '#1F5FAF' },
  behind: { background: '#FBE4D6', color: '#9A4A16' },
  slightly: { background: '#FBF0D9', color: '#8A5A00' },
  published: { background: '#E2F2E7', color: '#2F7A46' },
} satisfies Record<string, CSSProperties>;

function Peek({ children }: { children: ReactNode }) {
  return <div className="mk-who-its-for-peek mk-card-lift">{children}</div>;
}

/** Agencies: the Clients list. */
function ClientsPeek() {
  const rows = [
    { initials: 'AR', name: 'Acme Robotics', count: '2 engagements' },
    { initials: 'HF', name: 'Horizon FinTech', count: '2 engagements' },
    { initials: 'NS', name: 'Northwind Studio', count: '1 engagement' },
  ];
  return (
    <Peek>
      <div className="mk-who-its-for-head">
        Clients <span className="font-normal text-[#8D8B86]">8</span>
        <span className="ml-auto rounded-[4px] px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: '#047857' }}>
          + New client
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name} className="mk-who-its-for-row mk-reveal" style={delay(420 + i * 170)}>
          <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-[5px] bg-[#EFEFED] text-[9px] font-semibold text-[#55534E]">
            {r.initials}
          </span>
          <span className="mk-who-its-for-clip">
            <span className="font-medium">{r.name}</span> <span className="text-[#8D8B86]">· {r.count}</span>
          </span>
          <span className="mk-who-its-for-chip" style={CHIP.active}>
            ● Active
          </span>
        </div>
      ))}
    </Peek>
  );
}

/** Fractional executives: My engagements, across clients. */
function EngagementsPeek() {
  const rows = [
    { name: 'Q2 – Product Launch Campaign', client: 'Horizon FinTech', status: 'Behind pace', chip: CHIP.behind },
    { name: 'Q4 – Brand Refresh & Visual Identity', client: 'Acme Robotics', status: 'Slightly behind', chip: CHIP.slightly },
  ];
  return (
    <Peek>
      <div className="mk-who-its-for-head">
        My engagements <span className="ml-auto font-normal text-[#8D8B86]">3 clients</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name} className="mk-who-its-for-row mk-reveal" style={delay(420 + i * 170)}>
          <span className="min-w-0">
            <span className="mk-who-its-for-clip block font-medium">{r.name}</span>
            <span className="mk-who-its-for-clip block text-[#8D8B86]">{r.client}</span>
          </span>
          <span className="mk-who-its-for-chip" style={r.chip}>
            {r.status}
          </span>
        </div>
      ))}
    </Peek>
  );
}

/** In-house leaders: a published status update, shared with leadership. */
function StatusUpdatePeek() {
  const avatars = [
    { t: 'CE', bg: '#E3EDFB', fg: '#1F5FAF' },
    { t: 'CF', bg: '#FBF0D9', fg: '#8A5A00' },
    { t: '+3', bg: '#EFEFED', fg: '#55534E' },
  ];
  return (
    <Peek>
      <div className="mk-who-its-for-head">
        <span className="mk-who-its-for-clip">
          Status update <span className="font-normal text-[#8D8B86]">· Q4 – Brand Refresh</span>
        </span>
        <span className="mk-who-its-for-chip" style={CHIP.published}>
          ✓ Published
        </span>
      </div>
      <div className="mk-who-its-for-row mk-reveal !gap-1.5 text-[#8D8B86]" style={delay(420)}>
        Shared with
        <span className="ml-0.5 inline-flex">
          {avatars.map((a, i) => (
            <span
              key={a.t}
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[8.5px] font-semibold"
              style={{ background: a.bg, color: a.fg, marginLeft: i ? -4 : 0, boxShadow: '0 0 0 2px #FFFFFF' }}
            >
              {a.t}
            </span>
          ))}
        </span>
        <span className="text-[#37352F]">Leadership</span>
      </div>
      <div className="mk-reveal border-t border-[rgba(55,53,47,0.07)] pt-[7px] leading-[1.5]" style={delay(700)}>
        1 of 4 deliverables approved, slightly behind pace with 60 days left.
      </div>
      <div className="mk-reveal mt-[7px] text-[11.5px] text-[var(--mk-bottle-dark)]" style={delay(1000)}>
        Drafted by <Brio fixedColor /> · published by you
      </div>
    </Peek>
  );
}

const AUDIENCES = [
  {
    href: '/landing/marketing-agencies',
    title: 'Consultancies and agencies',
    tags: ['Marketing agencies', 'Strategy and advisory', 'Management consulting'],
    body: 'Run retainers and projects for many clients, without one folder per email thread.',
    link: 'For agencies',
    art: panel('0% 0%', '100% 10%', '90% 100%', '0% 100%'),
    Peek: ClientsPeek,
  },
  {
    href: '/landing/fractional-execs',
    title: 'Fractional executives',
    tags: ['CMO', 'CFO', 'COO', 'CAIO', 'CISO'],
    body: 'One calm workspace per client you lead: the deliverables, the approvals and the monthly report in one place.',
    link: 'For fractional execs',
    art: panel('0% 100%', '100% 100%', '100% 0%', '0% 0%'),
    Peek: EngagementsPeek,
  },
  {
    href: '/landing/fulltime-cmos',
    title: 'In-house marketing leaders',
    tags: ['Full-time CMO', 'Marketing team'],
    body: 'Strategy, agency deliverables and results in one workspace, so leadership sees the work and its impact.',
    link: 'For in-house CMOs',
    art: panel('50% 0%', '100% 70%', '0% 60%', '60% 100%'),
    Peek: StatusUpdatePeek,
  },
];

export function WhoItsForSection() {
  return (
    <Band surface="gray" id="who-its-for" aria-labelledby="mk-who-its-for-title" className="py-[72px] md:py-[clamp(88px,7.78vw,112px)]">
      <div className="mk-rail leading-[normal]">
        <h2 id="mk-who-its-for-title" className="mk-section max-w-[760px] text-[var(--mk-bottle)]">
          Built for people who deliver their value in documents.
        </h2>
        <ul role="list" className="mk-who-its-for-grid mt-9 md:mt-12">
          {AUDIENCES.map(({ href, title, tags, body, link, art, Peek: Art }) => (
            <MkCard key={href} as="li" className="mk-who-its-for-card">
              <div aria-hidden="true" className="mk-who-its-for-art" style={{ backgroundImage: art }}>
                <Art />
              </div>
              <div className="mk-who-its-for-body">
                <div className="mk-card-title-wrap">
                  <h3 className="m-0 text-[20px] font-bold md:text-[21px]">{title}</h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <span key={t} className="mk-who-its-for-tag">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-3.5 text-[15.5px] leading-[1.6] text-[var(--mk-body)]">{body}</p>
                <div className="mt-auto pt-5 text-[15px] font-bold text-[var(--mk-bottle-dark)]">
                  <Link href={href} className="mk-who-its-for-link">
                    <span className="mk-card-nudge">
                      {link}
                      <span aria-hidden="true"> ›</span>
                    </span>
                  </Link>
                </div>
              </div>
            </MkCard>
          ))}
        </ul>
      </div>
    </Band>
  );
}
