'use client';

/**
 * "Cookie settings" in a legal links row. Opens the site-wide cookie preferences dialog in place
 * (`CookieConsent` listens for the event), which is what the saved-preferences toast promises:
 * "Change them anytime from Cookie settings in the footer."
 */
import { requestOpenCookieSettings } from '@/lib/cookie-consent-storage';

export function CookieSettingsLink({ className }: { className: string }) {
  return (
    <button type="button" className={className} aria-haspopup="dialog" onClick={() => requestOpenCookieSettings()}>
      Cookie settings
    </button>
  );
}
