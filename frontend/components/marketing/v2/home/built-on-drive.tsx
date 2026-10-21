/**
 * 6 · Built on your Drive (security). White band. The non-custodial promise as a three-part diagram,
 * your storage → the delivery layer → your client, then three plain guarantees and the Trust Center link.
 */
import { Brio } from '@/components/ui/brio';
import { BRAND_NAME } from '@/config/brand';
import { Band, ChevronLink, Eyebrow } from '../primitives';
import './built-on-drive.css';

const POINTS = [
  { title: 'No stored copy of your files', body: `${BRAND_NAME} keeps metadata only: names, statuses, permissions, the audit log.` },
  { title: 'Access follows the engagement', body: 'Grant it per deliverable and review it at any time in Audit.' },
  { title: 'Cancel anytime', body: 'Your folders stay exactly where they are in your Drive.' },
];

function NodeList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="mt-3.5 flex flex-col gap-1.5 text-[14.5px]" style={{ color }}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Connector({ label, note }: { label: string; note: string }) {
  return (
    <div className="mk-built-on-drive-link">
      <span>{label}</span>
      <i aria-hidden="true" className="mk-built-on-drive-line" />
      <span>{note}</span>
    </div>
  );
}

export function BuiltOnDriveSection() {
  return (
    <Band surface="white" id="drive" aria-labelledby="mk-built-on-drive-title" className="py-20 md:py-[clamp(96px,8.9vw,128px)]">
      <div className="mk-rail leading-[normal]">
        <Eyebrow>SECURITY</Eyebrow>
        {/* Spacing sits on wrappers: the type classes reset their own margins and load after Tailwind. */}
        <div className="mt-4 md:mt-5">
          <h2 id="mk-built-on-drive-title" className="mk-section max-w-[760px] text-[var(--mk-bottle)]">
            Your files never leave your Drive.
          </h2>
        </div>
        <p className="mt-4 max-w-[640px] text-[17px] leading-[1.6] text-[var(--mk-body)] md:mt-[22px] md:text-[19px]">
          {BRAND_NAME} is non-custodial. It stores the structure (engagements, statuses, permissions and the audit log) and leaves your
          documents where they are.
        </p>

        <div className="mk-built-on-drive-flow mt-10 md:mt-14">
          <div className="mk-built-on-drive-node mk-built-on-drive-node--light">
            <div className="text-[13px] font-semibold text-[var(--mk-bottle-dark)]">Your storage</div>
            <div className="mt-1.5 text-[20px] font-bold">Google Drive or OneDrive</div>
            <NodeList items={['Files and folders', 'Your sharing settings', 'Your ownership, always']} color="var(--mk-body)" />
          </div>

          <Connector label="OAuth" note="no copy" />

          <div className="mk-built-on-drive-node mk-built-on-drive-node--rim">
            <div>
              <div className="text-[13px] font-semibold text-[var(--mk-electric)]">The delivery layer</div>
              <div className="mt-1.5 text-[20px] font-bold" style={{ fontFamily: 'var(--mk-font-display)' }}>
                {BRAND_NAME} + <Brio iconClassName="text-[#7DFF77]" />
              </div>
              <NodeList items={['Engagements and the Board', 'Status, comments, reminders', 'Access and the audit log']} color="#C9DBD3" />
            </div>
          </div>

          <Connector label="your brand" note="shared only" />

          <div className="mk-built-on-drive-node mk-built-on-drive-node--light">
            <div className="text-[13px] font-semibold text-[var(--mk-bottle-dark)]">Your client</div>
            <div className="mt-1.5 text-[20px] font-bold">A branded view</div>
            <NodeList items={['Sees only what you share', 'Comments and approves', 'No new tool to learn']} color="var(--mk-body)" />
          </div>
        </div>

        <div className="mk-built-on-drive-points mt-11 md:mt-[52px]">
          {POINTS.map((p) => (
            <div key={p.title} className="min-w-0">
              <h3 className="m-0 text-[18px] font-bold">{p.title}</h3>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-[var(--mk-body)]">{p.body}</p>
            </div>
          ))}
        </div>

        <ChevronLink href="/resources/trust-center" className="mt-10 text-[16px]">
          Visit the Trust Center
        </ChevronLink>
      </div>
    </Band>
  );
}
