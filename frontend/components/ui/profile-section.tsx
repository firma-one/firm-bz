"use client"

import { useState, useRef, useLayoutEffect, useEffect } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { LogOut, ChevronDown, ChevronUp, Building2, CreditCard, UserCircle, LifeBuoy, Plug, MonitorCheck } from "lucide-react"
import { ProfileBubble, ProfileBubblePopupContent } from "@/components/ui/profile-bubble-popup"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BrandMarkIcon } from "@/components/brand/BrandMarkIcon"
import { BrandName } from "@/components/brand/BrandName"

interface ProfileSectionProps {
  user: {
    email?: string
    user_metadata?: {
      full_name?: string
      name?: string
      avatar_url?: string
      picture?: string
    }
  } | null
  signOut: () => void
  isCollapsed?: boolean
  /** Firm scope `can_manage` (e.g. Firm Administrator). When false, Billing is hidden. */
  showBillingLink?: boolean
  /** Link to workspace billing (plans, checkout, Polar portal). Defaults to `/d/billing` with safe returnTo. */
  billingHref?: string
  /**
   * When set (including `null`), replaces the email line under the user name with plan / workspace billing info.
   * Omit entirely (e.g. onboarding) to keep showing the email.
   */
  planSubtitle?: string | null
  planSubtitleLoading?: boolean
  /** Link to Connectors page (firm-scoped). Only shown for Firm Administrators (canManageFirm). */
  connectorsHref?: string
  /** Link to the Support page (firm-scoped). When provided, shows a Support item in the menu. */
  supportHref?: string
  /** When true, shows an Administration link to /system (SYS_ADMIN only). */
  isSystemAdmin?: boolean
}

export function ProfileSection({
  user,
  signOut,
  isCollapsed = false,
  showBillingLink = false,
  billingHref = '/d/billing?returnTo=%2Fd%2Fprofile',
  connectorsHref,
  planSubtitle,
  planSubtitleLoading = false,
  supportHref,
  isSystemAdmin = false,
}: ProfileSectionProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; width?: number } | null>(null)

  const getUserDisplayName = () => {
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name
    if (user?.user_metadata?.name) return user.user_metadata.name
    if (user?.email) return user.email.split('@')[0]
    return 'User'
  }

  const getUserEmail = () => user?.email || 'user@example.com'

  const secondaryLine = () => {
    if (!showBillingLink) return getUserEmail()
    if (planSubtitleLoading) return 'Loading…'
    if (planSubtitle !== undefined) return planSubtitle || '—'
    return getUserEmail()
  }

  const updatePopupPosition = () => {
    if (!profileRef.current) return
    const rect = profileRef.current.getBoundingClientRect()
    const popupWidth = 192 // min-w-[12rem]
    let left = isCollapsed ? rect.left + rect.width / 2 - popupWidth / 2 : rect.left
    // Clamp so popup is never cut off on the left (or right) of the viewport
    const padding = 12
    left = Math.max(padding, Math.min(left, typeof window !== 'undefined' ? window.innerWidth - popupWidth - padding : left))
    const width = isCollapsed ? undefined : rect.width
    setPopupPosition({ top: rect.top - 8, left, width })
  }

  // Position profile popup in portal (avoids clipping in collapsed mode)
  useLayoutEffect(() => {
    if (!isProfileOpen || !profileRef.current) {
      setPopupPosition(null)
      return
    }
    updatePopupPosition()
  }, [isProfileOpen, isCollapsed])

  useEffect(() => {
    if (!isProfileOpen) return
    const onScrollOrResize = () => updatePopupPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [isProfileOpen, isCollapsed])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const el = target as Element
      const insidePopup = el.closest?.('[data-profile-popup]')
      if (profileRef.current && !profileRef.current.contains(target) && !insidePopup) {
        setIsProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className={`shrink-0 border-t border-[#e5e7eb] ${isCollapsed ? 'py-2 px-3' : 'py-2 pl-2 pr-3'}`} ref={profileRef}>
      <div className="relative w-full flex justify-center">
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-checkout-hint-profile="trigger"
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex w-full min-w-0 max-w-full items-center justify-center rounded px-0 py-2 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
              >
                <ProfileBubble
                  name={getUserDisplayName()}
                  avatarUrl={(user?.user_metadata?.avatar_url as string | null | undefined) ?? ((user?.user_metadata as Record<string, unknown>)?.picture as string | null | undefined) ?? null}
                  size="default"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p className="font-medium text-slate-900">{getUserDisplayName()}</p>
              <p className="text-xs text-slate-500">{secondaryLine()}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            data-checkout-hint-profile="trigger"
            aria-expanded={isProfileOpen}
            aria-haspopup="menu"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-[#f3f4f6] transition-colors text-left"
          >
            <ProfileBubble
              name={getUserDisplayName()}
              avatarUrl={(user?.user_metadata?.avatar_url as string | null | undefined) ?? ((user?.user_metadata as Record<string, unknown>)?.picture as string | null | undefined) ?? null}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1b1b1d] truncate">
                {getUserDisplayName()}
              </p>
              <p className="text-xs text-[#45474c] truncate" title={secondaryLine()}>
                {secondaryLine()}
              </p>
            </div>
            {isProfileOpen ? (
              <ChevronDown className="h-4 w-4 text-[#45474c] shrink-0" aria-hidden />
            ) : (
              <ChevronUp className="h-4 w-4 text-[#45474c] shrink-0" aria-hidden />
            )}
          </button>
        )}

        {/* Profile popup: rendered in portal when open so it is not clipped in collapsed mode */}
        {isProfileOpen && popupPosition && typeof document !== 'undefined' && createPortal(
          <div
            data-profile-popup=""
            className="d-app fixed bg-white rounded shadow-lg border border-[#e5e7eb] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-[200]"
            style={{
              top: popupPosition.top,
              left: popupPosition.left,
              width: popupPosition.width,
              minWidth: popupPosition.width ? undefined : '12rem',
              transform: 'translateY(-100%)',
            }}
          >
            <ProfileBubblePopupContent
              name={getUserDisplayName()}
              email={getUserEmail()}
              menuPlanLine={
                showBillingLink && planSubtitle !== undefined
                  ? planSubtitleLoading
                    ? 'Loading…'
                    : planSubtitle || '—'
                  : undefined
              }
              bubbleSize={isCollapsed ? 'default' : 'lg'}
              avatarUrl={(user?.user_metadata?.avatar_url as string | null | undefined) ?? ((user?.user_metadata as Record<string, unknown>)?.picture as string | null | undefined) ?? null}
              footer={
                <div className="space-y-1">
                  <Link
                    href="/d/u/profile"
                    onClick={() => setIsProfileOpen(false)}
                    className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
                  >
                    <UserCircle className="h-4 w-4 shrink-0" />
                    Profile
                  </Link>
                  {connectorsHref && (
                    <Link
                      href={connectorsHref}
                      onClick={() => setIsProfileOpen(false)}
                      className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
                    >
                      <Plug className="h-4 w-4 shrink-0" />
                      Connectors
                    </Link>
                  )}
                  {showBillingLink && (
                    <Link
                      href={billingHref}
                      onClick={() => setIsProfileOpen(false)}
                      className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      Billing
                    </Link>
                  )}
                  {supportHref && (
                    <Link
                      href={supportHref}
                      onClick={() => setIsProfileOpen(false)}
                      className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
                    >
                      <LifeBuoy className="h-4 w-4 shrink-0" />
                      Support
                    </Link>
                  )}
                  {isSystemAdmin && (
                    <Link
                      href="/system"
                      onClick={() => setIsProfileOpen(false)}
                      className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
                    >
                      <MonitorCheck className="h-4 w-4 shrink-0" />
                      Sys Admin
                    </Link>
                  )}
                  <Link
                    href="/d/onboarding"
                    onClick={() => setIsProfileOpen(false)}
                    className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-[#45474c] transition-colors hover:bg-[#f3f4f6] hover:text-[#1b1b1d]"
                  >
                    <Building2 className="h-4 w-4 shrink-0" aria-hidden />
                    Switch Workspace
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="d-sidebar-nav flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-red-600 transition-colors hover:bg-[#f3f4f6] hover:text-red-700"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Sign Out
                  </button>
                  <div className="-mx-3 mt-2 border-t border-[#e5e7eb]" />
                  <div className="flex flex-col items-start gap-1.5 pt-3 pb-1">
                    <span className="text-[10px] text-[#9a9ba0] tracking-wide uppercase">Powered by</span>
                    <a href="https://www.firma.bz" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="group inline-flex items-center gap-2">
                      <BrandMarkIcon className="h-7 w-7 shrink-0" />
                      <div className="flex flex-col justify-center gap-0.5">
                        <BrandName className="text-sm leading-none" />
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium leading-tight tracking-wide text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                          <span>Organize</span>
                          <span aria-hidden className="inline-block h-1 w-1 shrink-0 rounded-full bg-[#72ff70]" />
                          <span>Protect</span>
                          <span aria-hidden className="inline-block h-1 w-1 shrink-0 rounded-full bg-[#72ff70]" />
                          <span>Deliver</span>
                        </span>
                      </div>
                    </a>
                  </div>
                </div>
              }
            />
          </div>,
          document.body
        )}
      </div>
    </div>
  )
}
