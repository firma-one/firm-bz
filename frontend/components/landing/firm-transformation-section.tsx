"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { ComponentType } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { animate, motion, useMotionValue, useTransform } from "framer-motion"
import type { MotionValue } from "framer-motion"
import {
  Archive,
  ClipboardList,
  Container,
  Copy,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Handshake,
  Image as ImageIcon,
  ExternalLink,
  Link2,
  Mail,
  Paperclip,
  PieChart,
  Presentation,
  ScrollText,
  Slack,
  SquareX,
  Table2,
  User,
} from "lucide-react"
import { BRAND_NAME } from "@/config/brand"
import { BrandName } from "@/components/brand/BrandName"
import { GoogleDriveProductMark } from "@/components/ui/google-drive-icon"
import { RealityCheckSection } from "@/components/landing/reality-check-section"
import { TrustArchitectureSection } from "@/components/landing/trust-architecture-section"
import type { LandingSkin } from "@/components/landing/landing-theme"
import { KineticSectionIntro } from "@/components/kinetic/kinetic-section-intro"
import {
  INFRASTRUCTURE_EVOLUTION_SECTION_ID,
  MARKETING_PAGE_SHELL,
  targetAudienceScrollMarginClass,
} from "@/lib/marketing/target-audience-nav"
import { cn } from "@/lib/utils"
import {
  markRealityCheckViewedFromTransformationModal,
  markTrustArchitectureViewedFromTransformationModal,
} from "@/lib/marketing/landing-section-dismissals"

function WhatsAppCarrierIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <title>WhatsApp</title>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c0 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

/**
 * Reality Check modal close: same footprint as header “Get started” (`Header.tsx`);
 * fill / label / icon accent match hero “Book a Demo” (`landing-page.tsx`).
 */
const REALITY_MODAL_CLOSE_BUTTON_CLASS = cn(
  "[font-family:var(--font-header-label),system-ui,sans-serif]",
  "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-xs font-bold uppercase tracking-widest sm:px-6",
  "border border-transparent bg-[#141c2a] text-white",
  "transition-all duration-200",
  "hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)]",
  "active:translate-y-0 active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#E1E1E1]",
)

/** CTA matches header “Get started” sizing + lift/shadow (see `Header.tsx`). */
const REALITY_CHECK_CTA_CLASS = cn(
  "mt-5 inline-flex items-center justify-center gap-2 self-start",
  "rounded bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white",
  "shadow-[0_1px_0_rgba(127,29,29,0.45)]",
  "transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_10px_24px_-12px_rgba(220,38,38,0.55)]",
  "active:translate-y-0 active:scale-95 sm:px-6",
  "[font-family:var(--font-header-label),system-ui,sans-serif]",
)

/** AFTER card — opens Trust Architecture modal (kinetic lime + dark copy, matches hero primary CTAs). */
const TRUST_ARCHITECTURE_MODAL_CTA_CLASS = cn(
  "mt-5 inline-flex items-center justify-center gap-2 self-start",
  "rounded bg-[#72ff70] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#002203]",
  "shadow-[0_1px_0_rgba(0,34,3,0.28)]",
  "transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#72ff70] hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)]",
  "active:translate-y-0 active:scale-95 sm:px-6",
  "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
)

const TRUST_MODAL_CLOSE_BUTTON_CLASS = cn(
  REALITY_MODAL_CLOSE_BUTTON_CLASS,
  "focus-visible:ring-offset-[#f6f3f4]",
)

function useViewportMaxMd() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const mq = window.matchMedia("(max-width: 767px)")
      mq.addEventListener("change", onStoreChange)
      return () => mq.removeEventListener("change", onStoreChange)
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false),
    () => false,
  )
}

/** BEFORE row: fixed lane so chaos streams stay clipped inside `ChaosCenter`. */
const TRANSFORM_VISUAL_MD_BOX = "md:h-[19rem] md:min-h-[19rem] md:max-h-[19rem] md:overflow-x-hidden md:overflow-y-clip"

/** AFTER row: on lg+ match BEFORE fixed lane height; below lg stack naturally (no forced crop). */
const TRANSFORM_VISUAL_MD_BOX_AFTER =
  "md:min-h-0 md:overflow-x-visible md:overflow-y-visible lg:h-[19rem] lg:min-h-[19rem] lg:max-h-[19rem]"

const PRO = {
  role: "Service Professional",
  name: "Jordan Lee, Fractional CMO",
  /** Label on dotted firm frame */
  firm: "NorthStar Agency",
}

const CLIENT = {
  role: "Client Contact",
  name: "Avery Stone, Ops Director",
  firm: "Acme Group",
}

function PersonaCard({
  kind,
  tone,
}: {
  kind: "pro" | "client"
  tone: "before" | "after"
}) {
  const p = kind === "pro" ? PRO : CLIENT
  const after = tone === "after"
  return (
    <div
      className={cn(
        "relative w-[168px] shrink-0 min-h-[188px] border border-dashed border-[#94a3b8] bg-white/90 px-3 pb-4 pt-9 text-center shadow-sm sm:w-[188px] sm:min-h-[200px] sm:pb-5 sm:pt-10",
        after && kind === "pro" && "border-[#5a78ff]/55 bg-white",
        after && kind === "client" && "border-[#4aba5e]/80 bg-white"
      )}
    >
      <div
        className={cn(
          "absolute -top-2.5 left-1/2 z-[1] max-w-[calc(100%-4px)] -translate-x-1/2 border border-dashed px-2 py-1 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
          !after && "border-[#94a3b8] bg-white text-[#475569]",
          after && kind === "pro" && "border-[#5a78ff]/45 bg-white text-[#5a78ff]",
          after && kind === "client" && "border-[#4aba5e]/60 bg-white text-[#2d6d3a]"
        )}
      >
        <span className="inline-flex max-w-full items-center justify-center gap-1.5 text-[9px] font-bold leading-tight tracking-tight">
          <Handshake className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
          <span className="line-clamp-2 text-center">{p.firm}</span>
        </span>
      </div>
      <div className="flex flex-col items-center gap-2.5 pt-1">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-sm sm:h-[3.25rem] sm:w-[3.25rem]",
            !after && "border-[#c6c6cc]",
            after && kind === "pro" && "border-[#5a78ff]/35",
            after && kind === "client" && "border-[#4aba5e]/50"
          )}
        >
          <User
            className={cn(
              "h-6 w-6 sm:h-7 sm:w-7 stroke-[1.5]",
              !after && "text-[#64748b]",
              after && kind === "pro" && "text-[#5a78ff]",
              after && kind === "client" && "text-[#2d6d3a]"
            )}
            aria-hidden
          />
        </div>
        <span
          className={cn(
            "text-[9px] font-bold uppercase tracking-widest [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
            !after && "text-[#64748b]",
            after && kind === "pro" && "text-[#5a78ff]",
            after && kind === "client" && "text-[#2d6d3a]"
          )}
        >
          {p.role}
        </span>
        <span className="text-[10px] leading-snug text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
          {p.name}
        </span>
      </div>
    </div>
  )
}

const DOC_STYLES: {
  icon: ComponentType<{ className?: string }>
  border: string
  iconClass: string
}[] = [
  { icon: FileText, border: "border-red-500/35", iconClass: "text-red-600" },
  { icon: Paperclip, border: "border-[#64748b]/40", iconClass: "text-[#64748b]" },
  { icon: File, border: "border-[#001256]/30", iconClass: "text-[#001256]" },
  { icon: Copy, border: "border-amber-500/35", iconClass: "text-amber-700" },
  { icon: Link2, border: "border-[#64748b]/40", iconClass: "text-[#64748b]" },
  { icon: ImageIcon, border: "border-[#001256]/25", iconClass: "text-[#001256]" },
  { icon: FileText, border: "border-red-500/30", iconClass: "text-red-600" },
  { icon: Paperclip, border: "border-amber-500/30", iconClass: "text-amber-800" },
]

/** u ∈ [0,1] = progress along one crossing; matches `useChaosProgress` t. */
function yOnPath(lane: number, ampPct: number, cycles: number, u: number): number {
  const y = lane + ampPct * Math.sin(2 * Math.PI * cycles * u)
  return Math.min(93, Math.max(7, y))
}

function useChaosProgress(duration: number, delay: number) {
  const progress = useMotionValue(0)
  useEffect(() => {
    const ctrl = animate(0, 1, {
      duration,
      repeat: Infinity,
      ease: "linear",
      delay,
      onUpdate: (v) => progress.set(v),
    })
    return () => ctrl.stop()
  }, [duration, delay, progress])
  return progress
}

type ChaosStream = {
  lane: number
  dir: "lr" | "rl"
  duration: number
  delay: number
  ampPct: number
  cycles: number
  rotBase: number
  style: (typeof DOC_STYLES)[number]
  i: number
}

function ChaosDocChip({
  s,
  progress,
  layoutVertical,
}: {
  s: ChaosStream
  progress: MotionValue<number>
  layoutVertical: boolean
}) {
  const horizontalSweep = useTransform(progress, (t) => {
    const pct = s.dir === "lr" ? -8 + 116 * t : 108 - 116 * t
    return `${pct}%`
  })
  const verticalSweep = useTransform(progress, (t) => {
    const pct = s.dir === "lr" ? -6 + 112 * t : 106 - 112 * t
    return `${pct}%`
  })
  const crossAxisWiggle = useTransform(progress, (t) => `${yOnPath(s.lane, s.ampPct, s.cycles, t).toFixed(3)}%`)
  const left = layoutVertical ? crossAxisWiggle : horizontalSweep
  const top = layoutVertical ? verticalSweep : crossAxisWiggle
  const rotate = useTransform(progress, (t) => s.rotBase + 7 * Math.sin(2 * Math.PI * s.cycles * 1.08 * t))
  const Icon = s.style.icon
  return (
    <motion.div
      className="absolute z-[26] -translate-x-1/2 -translate-y-1/2 will-change-[transform]"
      style={{ left, top }}
    >
      <motion.div
        className={cn(
          "flex items-center justify-center rounded-none border bg-white p-2 shadow-md sm:p-2.5",
          s.style.border
        )}
        style={{ rotate }}
      >
        <Icon className={cn("h-4 w-4 sm:h-[18px] sm:w-[18px] shrink-0", s.style.iconClass)} />
      </motion.div>
    </motion.div>
  )
}

/** One `t` timeline per document chip (no dotted trails — carriers implied by bottom icon row). */
function ChaosStreamLayer({ s, layoutVertical }: { s: ChaosStream; layoutVertical: boolean }) {
  const progress = useChaosProgress(s.duration, s.delay)
  return <ChaosDocChip s={s} progress={progress} layoutVertical={layoutVertical} />
}

function ChaosCenter() {
  /**
   * Documents + trail share the same param t ∈ [0,1]: left/right sweep matches path x,
   * top uses the same sine as the SVG (yOnPath). Separate useChaosProgress per subcomponent
   * uses identical duration/delay so they stay aligned.
   */
  const layoutVertical = useViewportMaxMd()

  const streams = useMemo(() => {
    const count = 30
    return Array.from({ length: count }, (_, i) => {
      const t = i / Math.max(1, count - 1)
      const lane = 6 + t * 82 + (i % 7) * 0.35
      const dir: "lr" | "rl" = i % 2 === 0 ? "lr" : "rl"
      const duration = 2.4 + (i % 19) * 0.12
      const delay = ((i * 0.18) % duration) * 0.9
      const waveDur = 0.42 + (i % 8) * 0.055
      const ampPct = 1.2 + (i % 9) * 0.42
      const rotBase = -14 + (i % 15) * 2.2
      const style = DOC_STYLES[i % DOC_STYLES.length]
      const cycles = Math.min(14, Math.max(2.2, duration / waveDur))
      return { lane, dir, duration, delay, ampPct, cycles, rotBase, style, i }
    })
  }, [])

  return (
    <div className="relative flex h-full w-full min-h-[180px] flex-1 flex-col items-center justify-center gap-2 overflow-hidden bg-[#f1f5f9]/40 py-1 sm:min-h-[200px] md:min-h-0 md:gap-1.5 md:py-0">
      <div className="relative mx-auto h-[min(11rem,30vh)] w-full min-h-[7.5rem] max-h-[11rem] max-w-[min(100%,26rem)] shrink-0 sm:h-[11.5rem] sm:max-h-[11.5rem] md:h-[10.25rem] md:max-h-[10.25rem]">
        {streams.map((s) => (
          <ChaosStreamLayer key={s.i} s={s} layoutVertical={layoutVertical} />
        ))}
      </div>
      <div
        className="relative z-20 flex w-full max-w-[min(100%,26rem)] shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-[#cbd5e1]/60 px-2 pt-2 sm:gap-x-6 md:pt-1.5"
        aria-label="Channels spreading documents"
      >
        <span className="hidden w-full text-center text-[8px] font-bold uppercase tracking-widest text-[#64748b] sm:block sm:w-auto [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
          Multiple carriers
        </span>
        <GoogleDriveProductMark
          className="h-[22px] w-[22px] shrink-0 opacity-95"
          alt=""
          aria-hidden
        />
        <Mail className="h-[22px] w-[22px] shrink-0 text-[#EA4335]" strokeWidth={2} aria-hidden />
        <Slack className="h-[22px] w-[22px] shrink-0 text-[#4A154B]" aria-hidden />
        <WhatsAppCarrierIcon className="h-[22px] w-[22px] shrink-0 text-[#25D366]" />
      </div>
    </div>
  )
}

/** 4×4 vault: 16 distinct file / doc metaphors, scrambled order (not row-wise symmetry). */
const VAULT_CELLS_SHUFFLED: { icon: ComponentType<{ className?: string }>; iconClass: string }[] = [
  { icon: Presentation, iconClass: "text-orange-600" },
  { icon: FileSpreadsheet, iconClass: "text-emerald-700" },
  { icon: FileVideo, iconClass: "text-violet-600" },
  { icon: Folder, iconClass: "text-teal-600" },
  { icon: FileText, iconClass: "text-red-600" },
  { icon: ImageIcon, iconClass: "text-sky-600" },
  { icon: ClipboardList, iconClass: "text-amber-700" },
  { icon: FileCode, iconClass: "text-indigo-600" },
  { icon: Archive, iconClass: "text-stone-600" },
  { icon: Table2, iconClass: "text-lime-700" },
  { icon: File, iconClass: "text-[#001256]" },
  { icon: Paperclip, iconClass: "text-slate-600" },
  { icon: Link2, iconClass: "text-cyan-700" },
  { icon: PieChart, iconClass: "text-rose-600" },
  { icon: ScrollText, iconClass: "text-blue-700" },
  { icon: Copy, iconClass: "text-amber-600" },
]

/** Transmission dot along pro→vault (blue) or client→vault (green); MotionValues match `ChaosDocChip`. */
function AfterTrailBubble({
  side,
  duration,
  delay,
}: {
  side: "left" | "right"
  duration: number
  delay: number
}) {
  const progress = useChaosProgress(duration, delay)
  const left = useTransform(progress, (t) =>
    side === "left"
      ? `${(6 + 88 * t).toFixed(3)}%`
      : `${(94 - 88 * t).toFixed(3)}%`
  )
  const opacity = useTransform(progress, (t) => {
    if (t < 0.1) return t / 0.1
    if (t > 0.9) return (1 - t) / 0.1
    return 1
  })
  return (
    <motion.div
      className={cn(
        "pointer-events-none absolute top-1/2 z-[12] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform",
        side === "left"
          ? "bg-[#5a78ff] shadow-[0_0_10px_rgba(90,120,255,0.65)]"
          : "bg-[#4aba5e] shadow-[0_0_12px_rgba(74,186,94,0.72)]"
      )}
      style={{ left, opacity }}
    />
  )
}

/** Horizontal data trail between persona card and vault (full row width, not vault-only). */
function AfterTransmissionTrail({ side }: { side: "left" | "right" }) {
  const left = side === "left"
  return (
    <div
      className={cn(
        "relative hidden min-h-[1px] min-w-[1.25rem] flex-1 self-stretch md:flex",
        "pointer-events-none items-center justify-center",
      )}
      aria-hidden
    >
      <div className="relative z-[10] h-px w-full max-w-full overflow-visible">
        <motion.div
          className={cn(
            "h-px w-full",
            left
              ? "bg-gradient-to-r from-[#5a78ff]/80 via-[#5a78ff]/35 to-transparent"
              : "bg-gradient-to-l from-[#4aba5e]/85 via-[#2d6d3a]/35 to-transparent",
          )}
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: left ? 0 : 0.35,
          }}
        />
        {left
          ? [0, 1, 2].map((i) => (
              <AfterTrailBubble key={`trail-l-${i}`} side="left" duration={3.1} delay={i * 0.55} />
            ))
          : [0, 1].map((i) => (
              <AfterTrailBubble key={`trail-r-${i}`} side="right" duration={3.3} delay={0.25 + i * 0.65} />
            ))}
      </div>
    </div>
  )
}

/** Mobile-only: dots move top → bottom along pro→vault (blue) or client→vault (green). */
function AfterTrailBubbleVertical({
  side,
  duration,
  delay,
}: {
  side: "left" | "right"
  duration: number
  delay: number
}) {
  const progress = useChaosProgress(duration, delay)
  const top = useTransform(progress, (t) =>
    side === "left" ? `${(8 + 82 * t).toFixed(3)}%` : `${(90 - 82 * t).toFixed(3)}%`,
  )
  const opacity = useTransform(progress, (t) => {
    if (t < 0.1) return t / 0.1
    if (t > 0.9) return (1 - t) / 0.1
    return 1
  })
  return (
    <motion.div
      className={cn(
        "pointer-events-none absolute left-1/2 z-[12] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full will-change-transform",
        side === "left"
          ? "bg-[#5a78ff] shadow-[0_0_10px_rgba(90,120,255,0.65)]"
          : "bg-[#4aba5e] shadow-[0_0_12px_rgba(74,186,94,0.72)]",
      )}
      style={{ top, left: "50%", opacity }}
    />
  )
}

/** Mobile-only vertical “transmission” between persona row and vault. */
function AfterVerticalMobileSpine({ side }: { side: "left" | "right" }) {
  const proSide = side === "left"
  return (
    <div
      className={cn(
        "relative mx-auto flex h-12 w-full max-w-[3rem] shrink-0 flex-col items-center justify-center md:hidden",
      )}
      aria-hidden
    >
      <div className="absolute inset-y-0.5 left-1/2 w-px -translate-x-1/2 overflow-visible">
        <motion.div
          className={cn(
            "h-full w-px",
            proSide
              ? "bg-gradient-to-b from-transparent via-[#5a78ff]/75 to-transparent"
              : "bg-gradient-to-b from-transparent via-[#4aba5e]/80 to-transparent",
          )}
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: proSide ? 0 : 0.35,
          }}
        />
        {proSide
          ? [0, 1, 2].map((i) => (
              <AfterTrailBubbleVertical key={`trail-v-l-${i}`} side="left" duration={3.1} delay={i * 0.55} />
            ))
          : [0, 1].map((i) => (
              <AfterTrailBubbleVertical key={`trail-v-r-${i}`} side="right" duration={3.3} delay={0.25 + i * 0.65} />
            ))}
      </div>
    </div>
  )
}

function AfterVault() {
  const vaultShellW = "w-[11.5rem] sm:w-[12.5rem]"

  return (
    <div
      className={cn(
        "relative z-[6] mx-auto flex shrink-0 flex-col items-center justify-center gap-1 overflow-visible py-1 sm:min-h-[180px] md:min-h-0 md:max-h-[17.5rem] md:gap-0.5 md:py-0 lg:self-center",
        vaultShellW,
      )}
    >
      {/*
        Visual stack: firmä portal chrome → bridge copy → nested Google Drive (4×4 grid unchanged).
        Outer frame: blue left (NorthStar / pro) · green right (Acme / client).
      */}
      <div
        className={cn(
          "relative z-10 rounded-sm border-y border-y-black/[0.08] border-l-[3px] border-l-[#5a78ff] border-r-[3px] border-r-[#4aba5e] bg-gradient-to-b from-[#f6f8ff]/90 via-[#f0fdf4]/85 to-white p-[3px] shadow-[0_12px_36px_-10px_rgba(90,120,255,0.18)]",
          vaultShellW,
        )}
      >
        <div className="flex flex-col gap-1 border border-[#c6c6cc] bg-white p-1.5 shadow-inner shadow-black/[0.04] sm:gap-1.5 sm:p-2 md:gap-1 md:p-1.5">
          <div
            className="relative flex min-h-0 shrink-0 items-center justify-center border-b border-[#4aba5e]/25 py-1.5 sm:min-h-[2.25rem] sm:py-2 md:py-1"
            title={`${BRAND_NAME} atop Google Drive — your files stay in Drive`}
          >
            <div className="pointer-events-none absolute left-0 top-1/2 flex -translate-y-1/2 gap-1">
              <div className="h-2 w-2 rounded-full bg-[#4aba5e]" />
              <div className="h-2 w-2 rounded-full bg-[#4aba5e]/50" />
            </div>
            <BrandName className="text-[12px] leading-none sm:text-[14px] md:text-[12px]" gradient />
          </div>
          <div className="flex flex-col items-center gap-0.5 px-0.5 py-0 text-center [font-family:var(--font-kinetic-headline),system-ui,sans-serif] md:py-0">
            <span className="text-[8px] font-bold uppercase leading-tight tracking-[0.12em] text-[#15803d] sm:text-[9px] md:text-[7.5px]">
              Client portal
            </span>
            <span className="flex flex-wrap items-center justify-center gap-0.5 text-[8px] font-bold uppercase leading-tight tracking-[0.1em] text-[#15803d] sm:text-[9px] md:text-[7.5px]">
              <span>Atop your</span>
              <GoogleDriveProductMark className="h-2.5 w-2.5 shrink-0 opacity-95 sm:h-3 sm:w-3 md:h-2.5 md:w-2.5" alt="" aria-hidden />
              <span>Drive</span>
            </span>
          </div>
          <div
            className="rounded-sm border border-[#bdc1c6] bg-gradient-to-b from-[#f8f9fa] to-[#eceff1] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-1.5 md:p-0.5"
            title="Your files remain in Google Drive"
          >
            <div className="grid shrink-0 grid-cols-4 gap-0.5 sm:gap-1 md:gap-0.5">
              {VAULT_CELLS_SHUFFLED.map(({ icon: Icon, iconClass }, idx) => (
                <div
                  key={`vault-${idx}`}
                  className="flex aspect-square items-center justify-center border border-black/[0.08] bg-[#f6f3f4]"
                >
                  <Icon className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-3 md:w-3", iconClass)} />
                </div>
              ))}
            </div>
            <div className="mt-0.5 flex min-h-0 shrink-0 items-center justify-center gap-1 border-t border-[#dadce0] py-1 sm:min-h-[2rem] sm:gap-1.5 sm:py-1.5 md:min-h-[1.5rem] md:py-1">
              <GoogleDriveProductMark className="h-3 w-3 shrink-0 opacity-95 sm:h-3.5 sm:w-3.5 md:h-3 md:w-3" alt="" aria-hidden />
              <span className="text-[7px] font-semibold uppercase tracking-wide text-[#5f6368] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] sm:text-[8px] md:text-[7px]">
                GOOGLE DRIVE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FirmTransformationSection({ skin = "kinetic" as LandingSkin }: { skin?: LandingSkin }) {
  const [realityModalOpen, setRealityModalOpen] = useState(false)
  const [trustArchitectureModalOpen, setTrustArchitectureModalOpen] = useState(false)

  const onRealityModalOpenChange = useCallback((open: boolean) => {
    setRealityModalOpen(open)
    if (open) markRealityCheckViewedFromTransformationModal()
  }, [])

  const onTrustModalOpenChange = useCallback((open: boolean) => {
    setTrustArchitectureModalOpen(open)
    if (open) markTrustArchitectureViewedFromTransformationModal()
  }, [])

  return (
    <section className="relative overflow-hidden border-y border-black/[0.06] bg-white pb-10 pt-6 md:pb-12 md:pt-8 lg:pb-16 lg:pt-10">
      <DialogPrimitive.Root open={realityModalOpen} onOpenChange={onRealityModalOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-x-0 bottom-0 z-[72] bg-black/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "top-16 lg:top-[4.25rem]",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-[73] flex flex-col overflow-hidden border-0 bg-[#E1E1E1] p-0 shadow-none outline-none",
              "top-16 lg:top-[4.25rem]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">Reality check</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Statistics and narrative on document chaos, revenue leak, security, and intellectual property.
            </DialogPrimitive.Description>
            <DialogPrimitive.Close
              type="button"
              className={cn(
                "absolute right-4 top-4 z-20 sm:right-6 sm:top-6",
                REALITY_MODAL_CLOSE_BUTTON_CLASS,
                "max-md:gap-0 max-md:px-3 max-md:py-2",
              )}
              aria-label="Close reality check"
            >
              <SquareX className="h-4 w-4 shrink-0 text-[#72ff70]" aria-hidden strokeWidth={2} />
              <span className="hidden md:inline">Close</span>
            </DialogPrimitive.Close>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <RealityCheckSection />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root open={trustArchitectureModalOpen} onOpenChange={onTrustModalOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-x-0 bottom-0 z-[72] bg-black/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "top-16 lg:top-[4.25rem]",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-[73] flex flex-col overflow-hidden border-0 bg-[#f6f3f4] p-0 shadow-none outline-none",
              "top-16 lg:top-[4.25rem]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">Trust architecture</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Non-custodial design, integrations, and trust pillars for {BRAND_NAME}.
            </DialogPrimitive.Description>
            <DialogPrimitive.Close
              type="button"
              className={cn(
                "absolute right-4 top-4 z-20 sm:right-6 sm:top-6",
                TRUST_MODAL_CLOSE_BUTTON_CLASS,
                "max-md:gap-0 max-md:px-3 max-md:py-2",
              )}
              aria-label="Close trust architecture"
            >
              <SquareX className="h-4 w-4 shrink-0 text-[#72ff70]" aria-hidden strokeWidth={2} />
              <span className="hidden md:inline">Close</span>
            </DialogPrimitive.Close>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <TrustArchitectureSection variant="modal" skin={skin} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className={cn(MARKETING_PAGE_SHELL, "relative z-10")}>
        <motion.div
          id={INFRASTRUCTURE_EVOLUTION_SECTION_ID}
          className={cn("mb-5 text-left md:mb-6", targetAudienceScrollMarginClass)}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
        >
          <KineticSectionIntro
            badge={{
              variant: "lime",
              icon: <Container className="ds-badge-kinetic__icon" aria-hidden />,
              label: "INFRASTRUCTURE EVOLUTION",
              className: "mb-6",
            }}
            title={
              <>
                The <span className="text-[#7c8496]">{BRAND_NAME}</span> Transformation
              </>
            }
            titleClassName="text-4xl md:text-6xl !mb-0"
          />
        </motion.div>

        <div className="space-y-5 md:space-y-6">
          {/* BEFORE */}
          <motion.div
            className="group overflow-x-hidden overflow-y-visible rounded-none border border-[#c6c6cc]/30 bg-[#f9f9fb] shadow-sm transition-shadow duration-500 hover:shadow-md"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
          >
            <div className="grid grid-cols-1 items-stretch md:grid-cols-12">
              <div
                className={cn(
                  "relative flex min-h-[240px] items-center border-b border-[#c6c6cc]/15 bg-[#f1f5f9] px-4 pb-5 pt-6 md:col-span-8 md:border-b-0 md:border-r md:px-5 md:pb-6 md:pt-7",
                  TRANSFORM_VISUAL_MD_BOX,
                )}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-30"
                  style={{
                    backgroundImage: "radial-gradient(#cbd5e1 0.75px, transparent 0.75px)",
                    backgroundSize: "16px 16px",
                  }}
                />
                <div className="relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 md:flex-row md:items-stretch md:gap-4 lg:gap-6">
                  <PersonaCard kind="pro" tone="before" />
                  <ChaosCenter />
                  <PersonaCard kind="client" tone="before" />
                </div>
              </div>
              <div className="flex flex-col justify-center p-5 md:col-span-4 md:p-6 lg:p-7">
                <div className="mb-3 flex items-center gap-2">
                  <motion.div
                    className="h-2 w-2 rounded-full bg-[#ba1a1a]"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-xs font-bold tracking-[0.2em] text-[#64748b] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                    BEFORE
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-[#1b1b1d] md:text-2xl [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                  Document Chaos
                </h3>
                <p className="text-sm leading-snug text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif] md:text-[15px] md:leading-relaxed">
                  Inefficient, manual document sharing creates security gaps and friction.
                </p>
                <button
                  type="button"
                  className={REALITY_CHECK_CTA_CLASS}
                  onClick={() => setRealityModalOpen(true)}
                >
                  Reality check
                  <ExternalLink className="h-4 w-4 shrink-0 opacity-95" aria-hidden strokeWidth={2} />
                </button>
              </div>
            </div>
          </motion.div>

          {/* AFTER — design3: visual first in DOM; on md text left (order-1), visual right (order-2) */}
          <motion.div
            className="group overflow-x-visible overflow-y-visible rounded-none border border-[#c6c6cc]/30 bg-white shadow-sm transition-shadow duration-500 hover:shadow-xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.05 }}
          >
            <div className="grid grid-cols-1 items-stretch md:grid-cols-12">
              <div
                className={cn(
                  "relative order-1 flex min-h-[240px] items-center border-b border-[#c6c6cc]/15 bg-[#f6f3f4] px-4 pb-5 pt-6 md:order-2 md:col-span-8 md:border-b-0 md:border-l md:border-[#c6c6cc]/15 md:px-4 md:pb-6 md:pt-6",
                  TRANSFORM_VISUAL_MD_BOX_AFTER,
                )}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: "radial-gradient(#cbd5e1 0.75px, transparent 0.75px)",
                    backgroundSize: "16px 16px",
                  }}
                />
                <div className="relative z-10 flex w-full min-h-0 min-w-0 flex-col items-center justify-center gap-4 md:flex-row md:items-stretch md:justify-center md:gap-1 lg:gap-2">
                  <div className="relative z-[7] flex shrink-0 items-center justify-center">
                    <PersonaCard kind="pro" tone="after" />
                  </div>
                  <AfterVerticalMobileSpine side="left" />
                  <AfterTransmissionTrail side="left" />
                  <AfterVault />
                  <AfterVerticalMobileSpine side="right" />
                  <AfterTransmissionTrail side="right" />
                  <div className="relative z-[7] flex shrink-0 items-center justify-center">
                    <PersonaCard kind="client" tone="after" />
                  </div>
                </div>
              </div>
              <div className="order-2 flex flex-col justify-center border-b border-[#c6c6cc]/15 p-5 md:order-1 md:col-span-4 md:border-b-0 md:border-r md:border-[#c6c6cc]/15 md:p-6 lg:p-7">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.55)]" />
                  <span className="text-xs font-bold tracking-[0.2em] text-[#001256] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                    AFTER
                  </span>
                </div>
                <h3 className="mb-2 text-xl font-bold tracking-tight text-[#1b1b1d] md:text-2xl [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                  The {BRAND_NAME} Calm
                </h3>
                <p className="text-sm leading-snug text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif] md:text-[15px] md:leading-relaxed">
                  {BRAND_NAME} centralizes document management, allowing information to flow securely and seamlessly.
                </p>
                <button
                  type="button"
                  className={TRUST_ARCHITECTURE_MODAL_CTA_CLASS}
                  onClick={() => setTrustArchitectureModalOpen(true)}
                >
                  Trust architecture
                  <ExternalLink className="h-4 w-4 shrink-0 text-[#002203] opacity-90" aria-hidden strokeWidth={2} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
