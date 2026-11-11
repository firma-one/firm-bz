'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import {
  analyticsAllowed,
  COOKIE_CONSENT_UPDATED_EVENT,
  FM_COOKIE_CONSENT_KEY,
  globalPrivacyControlOn,
  readCookieConsentFromStorage,
} from '@/lib/cookie-consent-storage'
import { revokeGoogleAnalyticsClientSide } from '@/lib/google-analytics-revoke'
import { useAnalyticsMode } from '@/components/analytics/analytics-mode-context'

/** `window`, indexed by Google's per-ID opt-out key (`ga-disable-<id>`). */
type GaWindow = Record<string, unknown>

/**
 * Loads gtag only where `analyticsAllowed` says so (lib/cookie-consent-storage.ts): a saved Accept
 * anywhere, or, with no saved choice, the public pages of a visitor in the notice zone
 * (.claude/plans/campaign-visit-counts.md). Checked again on every page change, so moving from a
 * public page into the app without a saved choice turns GA off.
 * Subscribes to consent updates and the storage event (other tabs).
 * When GA isn't allowed, sets Google's own opt-out flag (`ga-disable-<id>`), removes our gtag scripts
 * and clears GA first-party cookies.
 */
export function ConsentAwareGoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID
  const isDevelopment = process.env.NODE_ENV === 'development'
  const mode = useAnalyticsMode()
  const pathname = usePathname()
  const [allow, setAllow] = useState(false)

  const refresh = useCallback(() => {
    setAllow(
      analyticsAllowed({
        mode,
        stored: readCookieConsentFromStorage(),
        gpc: globalPrivacyControlOn(),
        pathname,
      }),
    )
  }, [mode, pathname])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onUpdated = () => refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === FM_COOKIE_CONSENT_KEY) refresh()
    }
    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, onUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, onUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  useEffect(() => {
    if (!gaId || isDevelopment) return
    const w = window as unknown as GaWindow
    // Google's documented opt-out: while set, gtag sends nothing for this ID, including the page views
    // it would otherwise send on in-app navigation after its scripts are removed.
    const disableKey = `ga-disable-${gaId}`

    if (!allow) {
      w[disableKey] = true
      revokeGoogleAnalyticsClientSide(gaId)
      return
    }

    w[disableKey] = false

    const alreadyLoaded = Array.from(
      document.querySelectorAll('script[data-fm-ga="loader"]'),
    ).some((el) => el.getAttribute('data-fm-ga-id') === gaId)
    if (alreadyLoaded) return

    const src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`
    const s1 = document.createElement('script')
    s1.async = true
    s1.src = src
    s1.setAttribute('data-fm-ga', 'loader')
    s1.setAttribute('data-fm-ga-id', gaId)

    // Google signals and ad personalization stay off in code as well as in GA's admin settings, which
    // the UK's statistics exception relies on (GA may act only as our processor).
    s1.onload = () => {
      const s2 = document.createElement('script')
      s2.setAttribute('data-fm-ga', 'inline')
      s2.setAttribute('data-fm-ga-id', gaId)
      s2.textContent = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('consent', 'default', {
          analytics_storage: 'granted',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
        gtag('consent', 'update', { analytics_storage: 'granted' });
        gtag('js', new Date());
        gtag('config', ${JSON.stringify(gaId)}, {
          allow_google_signals: false,
          allow_ad_personalization_signals: false
        });
      `
      document.head.appendChild(s2)
    }

    document.head.appendChild(s1)

    return () => {
      w[disableKey] = true
      revokeGoogleAnalyticsClientSide(gaId)
    }
  }, [gaId, isDevelopment, allow])

  return null
}
