/** 2 · Trust strip: the storage firmä runs on, and the three promises that come with it. White. */
import { CheckDot, PageGuides } from '../primitives';
import { GoogleDriveIcon, OneDriveIcon, SharePointIcon } from '../storage-icons';

const ICON = { size: 18, color: '#4F625B' } as const;

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
              <GoogleDriveIcon {...ICON} />
              Google Drive
            </span>
            <span className="inline-flex items-center gap-2">
              <OneDriveIcon {...ICON} />
              OneDrive
            </span>
            <span className="inline-flex items-center gap-2">
              <SharePointIcon {...ICON} />
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
