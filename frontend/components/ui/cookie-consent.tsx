"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import {
  BarChart3,
  Check,
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

const headlineFont = "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
const bodyFont = "[font-family:var(--font-kinetic-body),system-ui,sans-serif]"
const labelFont = "[font-family:var(--font-header-label),system-ui,sans-serif]"

function KineticSwitch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-12 shrink-0 items-center rounded-full transition-colors duration-300",
        disabled && "cursor-not-allowed opacity-90",
        !disabled && checked && "bg-[#72ff70]",
        !disabled && !checked && "bg-[#eae7e9]",
        disabled && "bg-[#72ff70]/40",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-1 inline-block h-4 w-4 rounded-sm bg-white shadow-sm transition-transform duration-300 ease-out",
          checked ? "translate-x-6" : "translate-x-0",
        )}
        aria-hidden
      />
      {disabled ? (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm">
          <Lock className="h-3 w-3 text-[#1b1b1d]" aria-hidden strokeWidth={2} />
        </span>
      ) : null}
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
      const t = setTimeout(() => setShowBanner(true), 1500)
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
      {/* Light scrim when only banner (page stays usable) — v4 initial banner */}
      {showBanner && !showDetails ? (
        <div
          className="pointer-events-none fixed inset-0 z-[60] bg-[#0B1321]/20 backdrop-blur-[2px]"
          aria-hidden
        />
      ) : null}

      {/* Cookie settings modal — v4 customization modal */}
      {showBanner && showDetails ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1321]/60 p-4 backdrop-blur-sm"
          onPointerDown={handleModalBackdropPointerDown}
          role="presentation"
        >
          <div
            className={cn(
              "relative w-full max-w-lg overflow-hidden rounded-lg border border-[#c6c6cc]/15 bg-white shadow-[0_25px_80px_-12px_rgba(27,27,29,0.25)]",
              headlineFont,
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
              className={cn(
                "absolute right-6 top-6 rounded-md text-[#45474c] transition-colors hover:text-[#1b1b1d]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5a78ff]/40 focus-visible:ring-offset-2",
              )}
              aria-label="Close cookie settings"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>

            <div className="p-8 pb-4 pr-14">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#141c2a]">
                  <Cookie className="h-5 w-5 text-white" strokeWidth={2} />
                </div>
                <h2
                  id="cookie-settings-title"
                  className="text-2xl font-bold tracking-tight text-[#1b1b1d]"
                >
                  Cookie Settings
                </h2>
              </div>
              <p
                id="cookie-settings-desc"
                className={cn("text-sm leading-relaxed text-[#45474c]", bodyFont)}
              >
                We use cookies to optimize your experience on firmä. Manage your preferences below.
              </p>
            </div>

            <div className="px-8 py-2">
              <div className="flex flex-col gap-0">
                {/* Necessary */}
                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="min-w-0 pr-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold tracking-tight text-[#1b1b1d]">Necessary</span>
                      <span
                        className={cn(
                          "rounded-full bg-[#eae7e9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#45474c]",
                          labelFont,
                        )}
                      >
                        Required
                      </span>
                    </div>
                    <p className={cn("text-sm text-[#45474c]/80", bodyFont)}>Required for basic functionality.</p>
                  </div>
                  <div className="relative flex shrink-0 items-center pt-1">
                    <KineticSwitch checked disabled onCheckedChange={() => {}} />
                  </div>
                </div>

                <div className="h-px bg-[#c6c6cc]/10" aria-hidden />

                {/* Analytics */}
                <div className="flex items-center justify-between gap-4 py-5">
                  <div className="flex min-w-0 items-start gap-3 pr-2">
                    <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-[#5a78ff]" strokeWidth={2} />
                    <div>
                      <span className="text-lg font-bold tracking-tight text-[#1b1b1d]">Analytics</span>
                      <p className={cn("mt-1 text-sm text-[#45474c]/80", bodyFont)}>
                        Used to improve our platform performance.
                      </p>
                    </div>
                  </div>
                  <KineticSwitch
                    checked={preferences.analytics}
                    onCheckedChange={(v) => setPreferences((p) => ({ ...p, analytics: v }))}
                  />
                </div>

                <div className="py-3">
                  <Link
                    href="/privacy"
                    className={cn(
                      "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#45474c] transition-colors hover:text-[#006e16]",
                      labelFont,
                    )}
                  >
                    Read full privacy policy
                    <span className="text-[10px] font-bold" aria-hidden>
                      ↗
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 bg-[#f6f3f4] p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleBackFromDetails}
                className={cn(
                  "order-2 rounded-lg border border-[#c6c6cc]/30 bg-white px-6 py-3 text-sm font-bold text-[#1b1b1d] transition-colors hover:bg-[#f6f3f4] sm:order-1",
                  labelFont,
                  "uppercase tracking-widest",
                )}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSavePreferences}
                className={cn(
                  "order-1 rounded px-8 py-3 text-sm font-bold uppercase tracking-widest text-[#002203] shadow-lg shadow-[#72ff70]/25 transition-all duration-200 sm:order-2",
                  "bg-[#72ff70] hover:brightness-105 active:scale-[0.98]",
                  labelFont,
                )}
              >
                Save settings
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Main banner — v4 kinetic institution */}
      {showBanner && !showDetails ? (
        <div className="pointer-events-auto fixed bottom-8 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2">
          <div
            className={cn(
              "relative flex overflow-hidden rounded-lg border border-[#c6c6cc]/15 bg-white/70 shadow-[0_40px_100px_-20px_rgba(27,27,29,0.12)] backdrop-blur-[20px]",
            )}
          >
            <div className="w-1 shrink-0 bg-[#72ff70] md:w-2" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 md:flex-row md:items-center md:gap-8 md:p-8">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 shrink-0 text-[#006e16]" strokeWidth={2} aria-hidden />
                  <h3
                    className={cn(
                      "text-lg font-bold uppercase tracking-tight text-[#1b1b1d]",
                      headlineFont,
                    )}
                  >
                    Privacy architecture
                  </h3>
                </div>
                <p className={cn("text-sm leading-relaxed text-[#45474c]", bodyFont)}>
                  We value your privacy. We use cookies to enhance your experience and analyze our traffic. Our
                  system treats data with institutional precision and kinetic speed. See our{" "}
                  <Link href="/privacy" className="font-semibold text-[#006e16] underline underline-offset-2 hover:text-[#00530e]">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end md:w-auto md:flex-none">
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className={cn(
                    "px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#1b1b1d]/60 transition-colors hover:text-[#1b1b1d]",
                    labelFont,
                  )}
                >
                  Reject non-essential
                </button>
                <button
                  type="button"
                  onClick={handleCustomize}
                  className={cn(
                    "w-full rounded-lg border border-[#c6c6cc] px-6 py-3 text-xs font-bold uppercase tracking-widest text-[#1b1b1d] transition-all hover:bg-[#eae7e9] sm:w-auto",
                    labelFont,
                  )}
                >
                  Customize settings
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className={cn(
                    "w-full rounded-lg bg-[#72ff70] px-8 py-3 text-xs font-bold uppercase tracking-widest text-[#002203] shadow-[0_10px_20px_-10px_rgba(114,255,112,0.45)] transition-all hover:brightness-110 sm:w-auto",
                    labelFont,
                  )}
                >
                  Accept all
                </button>
              </div>
            </div>
            <div className="pointer-events-none absolute right-0 top-0 hidden p-1 lg:block" aria-hidden>
              <div className="h-8 w-8 border-r border-t border-[#c6c6cc]/30" />
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirmation toast — v4 confirmation state */}
      {showSavedToast ? (
        <div
          className="animate-in fade-in slide-in-from-bottom-4 fixed bottom-10 left-1/2 z-[100] flex w-[calc(100vw-2rem)] max-w-none -translate-x-1/2 duration-500 sm:w-auto sm:max-w-[min(100vw-2rem,36rem)]"
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border border-[#c6c6cc]/15 bg-white/90 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:gap-4 sm:rounded-full sm:px-5",
            )}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#00f93f]/90">
              <Check className="h-3.5 w-3.5 text-[#006e16]" strokeWidth={3} aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:flex-row sm:items-center sm:gap-2 sm:text-left">
              <span className={cn("text-sm font-bold tracking-tight text-[#1b1b1d]", headlineFont)}>
                Preferences saved.
              </span>
              <span className={cn("text-xs text-[#45474c]", bodyFont)}>Your experience is now optimized.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                clearToastTimer()
                setShowSavedToast(false)
              }}
              className="ml-1 rounded-full p-1 text-[#45474c] transition-colors hover:bg-[#eae7e9]"
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
