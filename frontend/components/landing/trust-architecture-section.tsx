"use client"

import Link from "next/link"
import { ShieldCheck, ArrowRight } from "lucide-react"

import { GoogleDriveProductMark } from "@/components/ui/google-drive-icon"
import { BRAND_NAME } from "@/config/brand"
import { KineticMarketingBadge } from "@/components/kinetic/kinetic-section-intro"
import { TrustArchitectureBento } from "@/components/landing/trust-architecture-bento"
import type { LandingSkin } from "@/components/landing/landing-theme"
import { landingTheme } from "@/components/landing/landing-theme"
import { MARKETING_PAGE_SHELL, TRUST_CENTER_PATH } from "@/lib/marketing/target-audience-nav"
import { cn } from "@/lib/utils"

function OneDriveMark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M10.0612 10.0071C4.63381 10.0072 0.576899 14.4499 0.271484 19.3991C0.46055 20.4655 1.08197 22.5713 2.05512 22.4632C3.27156 22.328 6.33519 22.4632 8.94828 17.7326C10.8571 14.2769 14.7838 10.007 10.0612 10.0071Z"
        fill="url(#paint0_radial_onedrive_trust)"
      />
      <path
        d="M8.80561 11.8538C6.98126 14.7423 4.52553 18.8811 3.69671 20.1836C2.71151 21.7317 0.102357 21.074 0.318506 18.8549C0.297198 19.0351 0.280832 19.2167 0.269548 19.3995C-0.0873823 25.173 4.49016 29.9676 10.1863 29.9676C16.4643 29.9676 31.4367 22.1455 29.9215 14.3081C28.3245 9.70109 23.8357 6.39673 18.7486 6.39673C13.6615 6.39673 10.4012 9.32752 8.80561 11.8538Z"
        fill="url(#paint1_radial_onedrive_trust)"
      />
      <path
        d="M10.0947 29.9703C10.0947 29.9703 25.0847 29.9998 27.6273 29.9998C32.2416 29.9998 35.75 26.2326 35.75 21.8368C35.75 17.4409 32.1712 13.6965 27.6274 13.6965C23.0835 13.6965 20.4668 17.0959 18.5015 20.8065C16.1984 25.1546 13.2606 29.9182 10.0947 29.9703Z"
        fill="url(#paint6_linear_onedrive_trust)"
      />
      <defs>
        <radialGradient
          id="paint0_radial_onedrive_trust"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(7.1693 8.5904 -11.9745 14.6167 0.944588 11.3042)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4894FE" />
          <stop offset="0.695072" stopColor="#0934B3" />
        </radialGradient>
        <radialGradient
          id="paint1_radial_onedrive_trust"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(-31.5168 36.3542 -27.7778 -22.3863 30.9814 -1.57881)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.165327" stopColor="#23C0FE" />
          <stop offset="0.534" stopColor="#1C91FF" />
        </radialGradient>
        <linearGradient id="paint6_linear_onedrive_trust" x1="22.9303" y1="29.9833" x2="22.9303" y2="13.8899" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0086FF" />
          <stop offset="0.49" stopColor="#00BBFF" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export type TrustArchitectureSectionProps = {
  skin?: LandingSkin
  /** Marketing home section vs scrollable modal body (e.g. Infrastructure AFTER card). */
  variant?: "page" | "modal"
  id?: string
  className?: string
}

/**
 * Trust Architecture hero + bento — shared by the marketing landing page and the Infrastructure AFTER modal.
 */
export function TrustArchitectureSection({
  skin = "legacy",
  variant = "page",
  id = "how-it-works",
  className,
}: TrustArchitectureSectionProps) {
  const t = landingTheme(skin)
  const isEditorial = skin !== "legacy"

  const gridBg =
    "opacity-40 bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"

  const inner = (
    <>
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          isEditorial ? t.sectionTrustGrid : gridBg,
        )}
      />

      <div className={cn(MARKETING_PAGE_SHELL, "relative z-10")}>
        <div className="mb-6 flex flex-col gap-4 lg:mb-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end md:gap-8">
            <div className="min-w-0 flex-1 text-left">
              {isEditorial ? (
                <div className={t.realityBadge}>
                  <ShieldCheck className={cn("h-3.5 w-3.5 shrink-0", t.rotatingBadgeIcon)} />
                  Trust Architecture
                </div>
              ) : (
                <KineticMarketingBadge
                  variant="lime"
                  icon={<ShieldCheck className="ds-badge-kinetic__icon stroke-2" aria-hidden />}
                  className="mb-4 uppercase"
                  tracking="widest"
                >
                  Trust Architecture
                </KineticMarketingBadge>
              )}
              <h2 className={cn(t.displayXL, "mb-3 text-left !mx-0")}>
                Your Business.{" "}
                <span className="inline-flex items-center gap-2">
                  <GoogleDriveProductMark className="h-7 w-7 shrink-0" />
                  Your Drive.
                </span>
                <br />
                Your Asset.{" "}
                <span
                  className={cn(
                    isEditorial ? t.chaosGradient : "bg-gradient-to-r from-[#000000] to-[#006e16] bg-clip-text text-transparent",
                  )}
                >
                  Your Control.
                </span>
              </h2>
              <p
                className={cn(
                  "mb-1.5 max-w-none text-pretty text-lg leading-tight md:text-xl md:leading-tight",
                  t.textBody,
                  isEditorial ? "font-normal" : "font-medium",
                )}
              >
                Organize your files without holding them hostage.
              </p>
              <p
                className={cn(
                  "max-w-none text-pretty text-base leading-tight sm:text-[1.0625rem] sm:leading-tight md:text-lg md:leading-tight lg:text-[1.0625rem] lg:leading-tight xl:text-lg xl:leading-tight",
                  t.textBody,
                  isEditorial ? "font-normal" : "font-medium",
                )}
              >
                <span
                  className={cn(
                    "font-bold underline decoration-2 underline-offset-2",
                    t.textPrimary,
                    isEditorial
                      ? skin === "kinetic"
                        ? "decoration-[#006e16]/45"
                        : "decoration-[#0060a9]/45"
                      : "decoration-[#006e16]/40",
                  )}
                >
                  Non-Custodial Design
                </span>{" "}
                means if you leave {BRAND_NAME}, your folders stay exactly as they are.
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-5xl font-bold leading-none select-none pointer-events-none sm:text-6xl md:text-7xl",
                "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
                "text-[#1b1b1d]/[0.05]",
              )}
            >
              OWNERSHIP
            </span>
          </div>
          <div className="flex w-full max-w-none flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-nowrap sm:items-stretch sm:gap-4">
              <div
                className={cn(
                  "inline-flex min-h-[3.25rem] w-full shrink-0 items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-center text-sm font-semibold leading-snug sm:h-14 sm:w-auto sm:px-5 sm:text-base",
                  isEditorial
                    ? "border border-black/[0.1] bg-white text-[#041627]"
                    : "border border-slate-200 bg-white text-slate-900 shadow-sm",
                )}
              >
                <GoogleDriveProductMark className="h-6 w-6 shrink-0" />
                <span className="text-pretty">Google Drive Integration</span>
              </div>
              <div
                className={cn(
                  "inline-flex min-h-[3.25rem] w-full shrink-0 items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-center text-sm font-medium leading-snug sm:h-14 sm:w-auto sm:px-5 sm:text-base",
                  isEditorial
                    ? "border border-dashed border-black/15 bg-white/80 text-[#44474c]"
                    : "border border-dashed border-slate-300 bg-white/90 text-slate-600",
                )}
              >
                <OneDriveMark className="h-6 w-6 shrink-0" />
                <span className="text-pretty">OneDrive integration Coming Soon</span>
              </div>
            </div>
            <Link
              href={TRUST_CENTER_PATH}
              className={cn(
                "group inline-flex h-14 w-full shrink-0 cursor-pointer items-center justify-center self-stretch rounded-md border border-transparent bg-[#141c2a] px-8 text-base font-bold tracking-widest text-white transition-all duration-200 sm:w-auto sm:self-center",
                "hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95",
                "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
              )}
            >
              <ShieldCheck
                className="mr-2 h-5 w-5 shrink-0 stroke-[1.5] text-[#72ff70] opacity-90 transition-transform group-hover:scale-110"
                aria-hidden
              />
              Visit Trust Center
              <ArrowRight className="ml-2 h-4 w-4 text-white/80 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="mb-6 lg:mb-8">
          <TrustArchitectureBento skin={skin} />
        </div>
      </div>
    </>
  )

  if (variant === "modal") {
    return (
      <div
        role="region"
        aria-label="Trust architecture"
        className={cn(
          "relative overflow-hidden bg-[#f6f3f4] pb-10 pt-8 md:pb-14 md:pt-10",
          className,
        )}
      >
        {inner}
      </div>
    )
  }

  return (
    <section
      id={id}
      className={cn(
        "relative overflow-hidden",
        !isEditorial
          ? "border-y border-black/[0.06] bg-[#f6f3f4] pb-16 pt-24 md:pt-28 lg:pb-20 lg:pt-32"
          : t.sectionTrust,
        className,
      )}
    >
      {inner}
    </section>
  )
}
