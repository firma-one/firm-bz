'use client';

/**
 * Opens the cookie preferences dialog (the site-wide `CookieConsent`) from the privacy policy's
 * cookie section. The footer's "Cookie settings" opens the same dialog (`cookie-settings-link.tsx`).
 */
import { SlidersHorizontal } from 'lucide-react';
import { requestOpenCookieSettings } from '@/lib/cookie-consent-storage';

export function CookieSettingsButton() {
  return (
    <div className="mk-doc-cookie-row">
      <button
        type="button"
        className="mk-btn mk-btn--secondary mk-btn--sm mk-doc-cookie-btn"
        aria-haspopup="dialog"
        onClick={() => requestOpenCookieSettings()}
      >
        <SlidersHorizontal size={15} strokeWidth={2.4} aria-hidden />
        Cookie settings
      </button>
    </div>
  );
}
