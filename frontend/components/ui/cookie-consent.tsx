"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  BarChart3,
  Check,
  ChevronRight,
  Cookie,
  Lock,
  Shield,
  X,
} from "lucide-react"
import {
  dispatchCookieConsentUpdated,
  OPEN_COOKIE_SETTINGS_EVENT,
  FM_COOKIE_CONSENT_KEY,
  preferencesFromStorageOrDefaults,
  type CookieConsentUIPreferences,
} from "@/lib/cookie-consent-storage"
import { cn } from "@/lib/utils"

const DEFAULT_PREFERENCES: CookieConsentUIPreferences = {
  necessary: true,
  analytics: false,
}

/*
 * Visuals follow the marketing site's green system (components/marketing/v2/marketing-v2.css). Literal
 * values rather than the `.mk` tokens: this banner renders on every route, inside or outside that scope.
 */
const displayFont = "[font-family:var(--font-header-label),'Space_Grotesk',system-ui,sans-serif]"
const bodyFont = "[font-family:var(--font-inter),Inter,system-ui,sans-serif]"
const pill =
  "inline-flex h-11 items-center justify-center rounded-full px-5 text-[14.5px] font-semibold leading-none transition-[transform,box-shadow,background-color] duration-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009669] focus-visible:ring-offset-2"
const pillPrimary = cn(
  pill,
  "bg-[#7DFF77] font-bold text-[#03281B] shadow-[inset_0_0_0_1px_rgba(3,40,27,0.16),0_12px_26px_-12px_rgba(0,150,105,0.7)] hover:shadow-[inset_0_0_0_1px_rgba(3,40,27,0.16),0_14px_30px_-10px_rgba(0,150,105,0.85),0_0_0_4px_rgba(125,255,119,0.25)]",
)
const pillSecondary = cn(pill, "bg-white text-[#05271C] shadow-[0_0_0_1px_rgba(5,39,28,0.14)] hover:bg-[#F6FAF8]")

function ConsentSwitch({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  id?: string
  label: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009669] focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed bg-[#009669]/45" : checked ? "bg-[#009669]" : "bg-[#D9E3DE]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(3,40,27,0.25)] transition-transform duration-300 ease-out",
          checked ? "translate-x-5" : "translate-x-0",
        )}
        aria-hidden
      >
        {disabled ? <Lock className="h-2.5 w-2.5 text-[#007A55]" strokeWidth={2.6} /> : null}
      </span>
    </button>
  )
}

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [showSavedToast, setShowSavedToast] = useState(false)
  const openedViaFooterRef = useRef(false)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearToastTimer = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    const consent = localStorage.getItem(FM_COOKIE_CONSENT_KEY)
    if (!consent) {
      // If the banner was already pending before an auth redirect, show immediately.
      if (sessionStorage.getItem('fm_consent_due')) {
        setShowBanner(true)
        return
      }
      // Shorter delay on app routes (user is engaged); gentle delay on marketing pages.
      const isAppRoute = window.location.pathname.startsWith('/d')
      const delay = isAppRoute ? 0 : 500
      const t = setTimeout(() => {
        sessionStorage.setItem('fm_consent_due', '1')
        setShowBanner(true)
      }, delay)
      return () => clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    const openSettings = () => {
      openedViaFooterRef.current = true
      setPreferences(preferencesFromStorageOrDefaults())
      setShowDetails(true)
      setShowBanner(true)
    }
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings)
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openSettings)
  }, [])

  useEffect(() => () => clearToastTimer(), [clearToastTimer])

  const dismissBanner = () => {
    openedViaFooterRef.current = false
    setShowBanner(false)
    setShowDetails(false)
  }

  const triggerSavedToast = () => {
    clearToastTimer()
    setShowSavedToast(true)
    toastTimeoutRef.current = setTimeout(() => {
      setShowSavedToast(false)
      toastTimeoutRef.current = null
    }, 5200)
  }

  const persistAndClose = (consentData: Record<string, unknown>) => {
    localStorage.setItem(FM_COOKIE_CONSENT_KEY, JSON.stringify(consentData))
    sessionStorage.removeItem('fm_consent_due')
    dispatchCookieConsentUpdated()
    triggerSavedToast()
    dismissBanner()
  }

  const handleAcceptAll = () => {
    persistAndClose({
      necessary: true,
      analytics: true,
      timestamp: new Date().toISOString(),
    })
  }

  const handleRejectNonEssential = () => {
    persistAndClose({
      necessary: true,
      analytics: false,
      timestamp: new Date().toISOString(),
    })
  }

  const handleSavePreferences = () => {
    persistAndClose({
      ...preferences,
      timestamp: new Date().toISOString(),
    })
  }

  const handleCustomize = () => {
    openedViaFooterRef.current = false
    setPreferences(preferencesFromStorageOrDefaults())
    setShowDetails(true)
  }

  const handleBackFromDetails = () => {
    if (openedViaFooterRef.current) {
      dismissBanner()
    } else {
      setShowDetails(false)
    }
  }

  const handleModalBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      handleBackFromDetails()
    }
  }

  if (!showBanner && !showSavedToast) return null

  return (
    <>
      {/* Light scrim while the banner shows (the page stays usable) */}
      {showBanner && !showDetails ? (
        <div className="pointer-events-none fixed inset-0 z-[60] bg-[rgba(4,22,15,0.16)] backdrop-blur-[2px]" aria-hidden />
      ) : null}

      {/* Cookie settings */}
      {showBanner && showDetails ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(4,22,15,0.55)] p-4 backdrop-blur-sm"
          onPointerDown={handleModalBackdropPointerDown}
          role="presentation"
        >
          <div
            className={cn(
              "relative w-full max-w-[520px] overflow-hidden rounded-[18px] bg-white text-[#05271C] shadow-[0_0_0_1px_rgba(5,39,28,0.08),0_40px_90px_-30px_rgba(3,40,27,0.55)]",
              bodyFont,
            )}
            onPointerDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            aria-describedby="cookie-settings-desc"
          >
            <button
              type="button"
              onClick={handleBackFromDetails}
              className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4F625B] transition-colors hover:bg-[#F6FAF8] hover:text-[#05271C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009669]"
              aria-label="Close cookie settings"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>

            <div className="px-7 pb-2 pr-16 pt-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFFFF1] shadow-[inset_0_0_0_1px_rgba(0,150,105,0.18)]">
                  <Cookie className="h-5 w-5 text-[#009669]" strokeWidth={2} aria-hidden />
                </span>
                <h2 id="cookie-settings-title" className={cn("text-[24px] font-bold leading-tight tracking-[-0.02em]", displayFont)}>
                  Cookie settings
                </h2>
              </div>
              <p id="cookie-settings-desc" className="mt-3 text-[15px] leading-relaxed text-[#3F5650]">
                We use cookies to optimize your experience on firmä. Manage your preferences below.
              </p>
            </div>

            <div className="px-7">
              <div className="flex items-center justify-between gap-4 border-b border-[#E3EBE7] py-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[17px] font-bold tracking-[-0.01em]", displayFont)}>Necessary</span>
                    <span className="rounded-full bg-[#F6FAF8] px-2.5 py-0.5 text-[12px] font-semibold text-[#4F625B] shadow-[inset_0_0_0_1px_rgba(5,39,28,0.08)]">
                      Always on
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] text-[#3F5650]">Required for basic functionality.</p>
                </div>
                <ConsentSwitch checked disabled onCheckedChange={() => {}} label="Necessary cookies, always on" />
              </div>

              <div className="flex items-center justify-between gap-4 py-5">
                <div className="flex min-w-0 items-start gap-3">
                  <BarChart3 className="mt-1 h-5 w-5 shrink-0 text-[#009669]" strokeWidth={2} aria-hidden />
                  <div>
                    <span className={cn("text-[17px] font-bold tracking-[-0.01em]", displayFont)}>Analytics</span>
                    <p className="mt-1 text-[14px] text-[#3F5650]">Used to improve our platform performance.</p>
                  </div>
                </div>
                <ConsentSwitch
                  checked={preferences.analytics}
                  onCheckedChange={(v) => setPreferences((p) => ({ ...p, analytics: v }))}
                  label="Analytics cookies"
                />
              </div>

              <div className="pb-6">
                <Link href="/privacy" className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#007A55] hover:underline">
                  Read the privacy policy
                  <ChevronRight className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                </Link>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2.5 bg-[#F6FAF8] px-7 py-5 shadow-[inset_0_1px_0_#E3EBE7] sm:flex-row sm:justify-end">
              <button type="button" onClick={handleBackFromDetails} className={pillSecondary}>
                Back
              </button>
              <button type="button" onClick={handleSavePreferences} className={cn(pillPrimary, "px-6")}>
                Save settings
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Banner */}
      {showBanner && !showDetails ? (
        <div className="pointer-events-auto fixed bottom-6 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[880px] -translate-x-1/2">
          <div
            className={cn(
              "flex flex-col gap-5 rounded-[18px] bg-white p-5 text-[#05271C] shadow-[0_0_0_1px_rgba(5,39,28,0.08),0_30px_70px_-24px_rgba(3,40,27,0.45)] md:flex-row md:items-center md:gap-8 md:p-6",
              bodyFont,
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFFFF1] shadow-[inset_0_0_0_1px_rgba(0,150,105,0.18)]">
                <Shield className="h-[18px] w-[18px] text-[#009669]" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className={cn("text-[18px] font-bold leading-tight tracking-[-0.015em]", displayFont)}>Your privacy</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#3F5650]">
                  We use cookies that the site needs to work and, with your consent, analytics to understand our traffic. See
                  our{" "}
                  <Link href="/privacy" className="font-semibold text-[#007A55] underline underline-offset-2 hover:text-[#05271C]">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="flex w-full shrink-0 flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
              <button
                type="button"
                onClick={handleRejectNonEssential}
                className={cn(pill, "px-4 text-[#3F5650] hover:bg-[#F6FAF8] hover:text-[#05271C]")}
              >
                Reject non-essential
              </button>
              <button type="button" onClick={handleCustomize} className={pillSecondary}>
                Customize
              </button>
              <button type="button" onClick={handleAcceptAll} className={cn(pillPrimary, "px-6")}>
                Accept all
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Saved */}
      {showSavedToast ? (
        <div
          className="animate-in fade-in slide-in-from-bottom-4 fixed bottom-8 left-1/2 z-[100] flex w-[calc(100vw-2rem)] -translate-x-1/2 duration-500 sm:w-auto sm:max-w-[min(100vw-2rem,36rem)]"
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[#05271C] shadow-[0_0_0_1px_rgba(5,39,28,0.08),0_20px_44px_-18px_rgba(3,40,27,0.45)] sm:rounded-full sm:px-5",
              bodyFont,
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7DFF77]">
              <Check className="h-3.5 w-3.5 text-[#03281B]" strokeWidth={3} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[14px]">
              <strong className="font-semibold">Preferences saved.</strong>{" "}
              <span className="text-[#3F5650]">Change them anytime from Cookie settings in the footer.</span>
            </span>
            <button
              type="button"
              onClick={() => {
                clearToastTimer()
                setShowSavedToast(false)
              }}
              className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#4F625B] transition-colors hover:bg-[#F6FAF8]"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
