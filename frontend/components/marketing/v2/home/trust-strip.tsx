/** 2 · Trust strip: the storage firmä runs on, and the three promises that come with it. White. */
import { CheckDot, PageGuides } from '../primitives';

const STORAGE_ICON = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#4F625B', strokeWidth: 1.8, 'aria-hidden': true } as const;

export function TrustStrip() {
  return (
    <section aria-label="Built on your storage" className="mk-band mk-band--white">
      <PageGuides />
      <div className="mk-rail relative flex flex-wrap items-center gap-x-12 gap-y-6 pb-10 pt-1 md:pb-14 md:pt-2">
        <div className="min-w-0 flex-[1_1_300px]">
          <div className="text-[13.5px] text-[var(--mk-muted)] md:text-[14px]">Built on the storage your firm already uses</div>
          <div
            className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2.5 text-[17px] font-bold tracking-[-0.01em] text-[var(--mk-ink)] md:text-[19px]"
            style={{ fontFamily: 'var(--mk-font-display)' }}
          >
            <span className="inline-flex items-center gap-2">
              <svg {...STORAGE_ICON} strokeLinejoin="round">
                <path d="M8 3h8l6 11-4 7H6l-4-7z" />
              </svg>
              Google Drive
            </span>
            <span className="inline-flex items-center gap-2">
              <svg {...STORAGE_ICON} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
              </svg>
              OneDrive
            </span>
            <span className="inline-flex items-center gap-2">
              <svg {...STORAGE_ICON} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a14 14 0 0 1 0 18" />
              </svg>
              SharePoint
              <span
                className="rounded-full bg-[var(--mk-electric)] px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] text-[var(--mk-on-electric)]"
                style={{ fontFamily: 'var(--mk-font-body)' }}
              >
                BETA
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3.5 text-[14.5px] font-medium text-[var(--mk-ink)] md:text-[15px]">
          {['Files stay in your Drive', 'No migration', 'Leave anytime, folders stay put'].map((t) => (
            <span key={t} className="inline-flex items-center gap-2">
              <CheckDot />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
