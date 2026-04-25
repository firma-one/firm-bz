'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  analyticsConsentGranted,
  COOKIE_CONSENT_UPDATED_EVENT,
  FM_COOKIE_CONSENT_KEY,
} from '@/lib/cookie-consent-storage'
import { revokeGoogleAnalyticsClientSide } from '@/lib/google-analytics-revoke'

/**
 * Loads gtag only when analytics consent is present in localStorage.
 * Subscribes to consent updates and the storage event (other tabs).
 * When consent is withdrawn, removes our gtag scripts and clears GA first-party cookies.
 */
export function ConsentAwareGoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID
  const isDevelopment = process.env.NODE_ENV === 'development'
  const [allow, setAllow] = useState(false)

  const refresh = useCallback(() => {
    setAllow(analyticsConsentGranted())
  }, [])

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

    if (!allow) {
      revokeGoogleAnalyticsClientSide(gaId)
      return
    }

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
        gtag('js', new Date());
        gtag('config', ${JSON.stringify(gaId)});
      `
      document.head.appendChild(s2)
    }

    document.head.appendChild(s1)

    return () => {
      revokeGoogleAnalyticsClientSide(gaId)
    }
  }, [gaId, isDevelopment, allow])

  return null
}
