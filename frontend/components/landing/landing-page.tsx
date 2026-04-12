"use client"

import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShieldCheck,
  Check,
  LockKeyhole,
  PlayCircle,
  ArrowRight,
  UsersRound,
  Users,
  ChevronDown,
  ChevronRight,
  FileText,
  Cloud,
  Search,
  ArrowUpRight,
  Database,
  ScrollText,
  ClipboardList,
  Zap,
  BriefcaseBusiness,
  Gem,
  FolderLock,
  UserCheck,
  FileCheck,
  Clock,
  Cable,
  Network,
  Target,
  Handshake,
  Gavel,
  Lightbulb,
  Calendar,
  Repeat,
  Palette,
  LineChart,
  SquareFunction,
} from "lucide-react"
import { GoogleDriveProductMark } from "@/components/ui/google-drive-icon"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { FAQModal } from "@/components/ui/faq-modal"
import { BRAND_NAME } from "@/config/brand"
import { Modal } from "@/components/ui/modal"
import { PrivacyPolicy } from "@/components/legal/privacy-policy"
import { CookiePolicy } from "@/components/legal/cookie-policy"
import { TermsOfService } from "@/components/legal/terms-of-service"
import { Support } from "@/components/legal/support"
import { cn } from "@/lib/utils"
import {
  KINETIC_LANDING_HERO_BADGE,
  MARKETING_PAGE_SHELL,
  audienceRoles,
  TARGET_AUDIENCE_SECTION_ID,
  TRUST_CENTER_PATH,
  USE_CASES_SECTION_ID,
  targetAudienceScrollMarginClass,
  useCaseBlocks,
  type UseCaseBlock,
} from "@/lib/marketing/target-audience-nav"
import { TrustArchitectureSection } from "@/components/landing/trust-architecture-section"
import { FirmTransformationSection } from "@/components/landing/firm-transformation-section"
import { RealityCheckSection } from "@/components/landing/reality-check-section"
import { landingTheme, type LandingSkin } from "@/components/landing/landing-theme"
import { KineticBentoSection } from "@/components/kinetic/KineticBentoSection"
import { KineticHeroSection } from "@/components/kinetic/KineticHeroSection"
import { KineticMarketingBadge, KineticSectionIntro } from "@/components/kinetic/kinetic-section-intro"
import { LegacyHeroScreenMock } from "@/components/landing/LegacyHeroScreenMock"
import { LandingHeroPrimaryCtas } from "@/components/marketing/landing-hero-primary-ctas"
import {
  LANDING_REALITY_MODAL_VIEWED_EVENT,
  LANDING_TRUST_ARCH_MODAL_VIEWED_EVENT,
  readHideRealityCheckSectionAfterModal,
  readHideTrustArchitectureSectionAfterModal,
} from "@/lib/marketing/landing-section-dismissals"

function TargetAudienceUseCaseCard({ block }: { block: UseCaseBlock }) {
  const shell = cn(targetAudienceScrollMarginClass, "w-full min-w-0 break-words", block.cardShellClass)

  switch (block.variant) {
    case "partnership":
      return (
        <div id={block.id} className={shell}>
          <div className="absolute top-0 right-0 p-8 opacity-10 transition-opacity group-hover:opacity-20">
            <Handshake className="h-20 w-20 text-[#22c55e]" />
          </div>
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.eyebrow}
          </span>
          <h3 className="mb-4 max-w-lg text-3xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.headline}
          </h3>
          <div className="mt-6 flex flex-wrap gap-4">
            <span className="flex items-center gap-2 text-[10px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" /> MONTHLY SESSIONS
            </span>
            <span className="flex items-center gap-2 text-[10px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" /> PERFORMANCE REVIEWS
            </span>
          </div>
        </div>
      )
    case "consultation":
      return (
        <div id={block.id} className={shell}>
          <div className="absolute -bottom-4 -right-4 opacity-10">
            <Lightbulb className="h-24 w-24 rotate-12 text-white" />
          </div>
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#72ff70] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.eyebrow}
          </span>
          <h3 className="mb-6 text-3xl font-bold leading-tight text-white [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.headline}
          </h3>
          {block.body ? (
            <p className="text-sm text-[#7c8496] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
              {block.body}
            </p>
          ) : null}
        </div>
      )
    case "project":
      return (
        <div id={block.id} className={shell}>
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.eyebrow}
          </span>
          <h3 className="mb-6 text-3xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.headline}
          </h3>
          {block.body ? (
            <p className="text-sm text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
              {block.body}
            </p>
          ) : null}
          <div className="mt-auto flex gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-ds-kinetic-lime/20 text-ds-kinetic-lime-icon">
              <BriefcaseBusiness className="h-4 w-4" aria-hidden />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#5a78ff]/10 text-[#5a78ff]">
              <Repeat className="h-4 w-4" aria-hidden />
            </div>
          </div>
        </div>
      )
    case "caseManagement":
      return (
        <div id={block.id} className={shell}>
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.eyebrow}
          </span>
          <h3 className="mb-4 text-3xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.headline}
          </h3>
          {block.body ? (
            <p className="max-w-md text-sm text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
              {block.body}
            </p>
          ) : null}
          <div className="mt-8 flex gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-ds-kinetic-lime/20 text-ds-kinetic-lime-icon">
              <Gavel className="h-4 w-4" aria-hidden />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded bg-[#5a78ff]/10 text-[#5a78ff]">
              <LockKeyhole className="h-4 w-4" aria-hidden />
            </div>
          </div>
        </div>
      )
    case "auditReview":
      return (
        <div id={block.id} className={shell}>
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.eyebrow}
          </span>
          <h3 className="mb-4 text-3xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.headline}
          </h3>
          {block.body ? (
            <p className="max-w-md text-sm text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
              {block.body}
            </p>
          ) : null}
          <div className="absolute bottom-0 right-0 p-6">
            <ClipboardList className="h-14 w-14 text-[#22c55e] opacity-15" />
          </div>
        </div>
      )
    case "training":
      return (
        <div id={block.id} className={shell}>
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-[#5a78ff] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.eyebrow}
          </span>
          <h3 className="mb-4 text-2xl font-bold text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            {block.headline}
          </h3>
          {block.body ? (
            <p className="mb-6 text-xs text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
              {block.body}
            </p>
          ) : null}
          <div className="absolute top-0 right-0 p-8 opacity-5 transition-opacity group-hover:opacity-20">
            <UsersRound className="h-12 w-12 text-[#22c55e]" />
          </div>
          <span className="mt-auto flex items-center gap-2 text-[10px] font-bold text-[#45474c] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" /> ENTERPRISE ACCESS
          </span>
        </div>
      )
    default:
      return null
  }
}

// --- SCROLL ANIMATION WRAPPER ---
function FadeIn({
  children,
  delay = 0,
  className,
  direction = "up"
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  direction?: "up" | "down" | "none"
}) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.1, rootMargin: "50px" }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const translations = {
    up: "translate-y-8",
    down: "-translate-y-8",
    none: ""
  }

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-1000 ease-out",
        isVisible ? "opacity-100 translate-y-0 transform-none" : `opacity-0 ${translations[direction]}`,
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function LandingPage({
  skin = "legacy",
  activeModal: activeModalProp,
  onActiveModalChange,
}: {
  skin?: LandingSkin
  /** When set (e.g. Stitch layout footer), modals are controlled by the parent. */
  activeModal?: string | null
  onActiveModalChange?: (id: string | null) => void
}) {
  const t = landingTheme(skin)
  const isEditorial = skin !== "legacy"
  const isKinetic = skin === "kinetic"
  /** Accent for icon + micro-labels in editorial skins (kinetic = emerald, stitch = blue). */
  const edAccent = skin === "kinetic" ? "text-[#006e16]" : "text-[#0060a9]"

  const [activeModalInternal, setActiveModalInternal] = useState<string | null>(null)
  const controlled = activeModalProp !== undefined && onActiveModalChange !== undefined
  const activeModal = controlled ? activeModalProp! : activeModalInternal
  const setActiveModal = controlled ? onActiveModalChange! : setActiveModalInternal
  const [currentSlide, setCurrentSlide] = useState(0)

  const hideTrustSectionAfterModal = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const notify = () => onStoreChange()
      window.addEventListener(LANDING_TRUST_ARCH_MODAL_VIEWED_EVENT, notify)
      window.addEventListener("storage", notify)
      return () => {
        window.removeEventListener(LANDING_TRUST_ARCH_MODAL_VIEWED_EVENT, notify)
        window.removeEventListener("storage", notify)
      }
    },
    readHideTrustArchitectureSectionAfterModal,
    () => false,
  )

  const hideRealitySectionAfterModal = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const notify = () => onStoreChange()
      window.addEventListener(LANDING_REALITY_MODAL_VIEWED_EVENT, notify)
      window.addEventListener("storage", notify)
      return () => {
        window.removeEventListener(LANDING_REALITY_MODAL_VIEWED_EVENT, notify)
        window.removeEventListener("storage", notify)
      }
    },
    readHideRealityCheckSectionAfterModal,
    () => false,
  )

  const editorialStitchSlides = [
    {
      id: "link" as const,
      label: "Link",
      icon: Cable,
      colorClass: "bg-white border-black/[0.12] text-[#041627]",
      subtitle: "Connect & Select",
      desc: "Connect your specific Google Drive folders. Import existing client documents directly into structured engagements.",
    },
    {
      id: "setup" as const,
      label: "Setup",
      icon: Network,
      colorClass: "bg-white border-black/[0.1] text-[#0060a9]",
      subtitle: "Project Context",
      desc: "Turn loose files into a professional Project. Map your messy drive folders to a clean Client → Project hierarchy.",
    },
    {
      id: "protect" as const,
      label: "Protect",
      icon: ShieldCheck,
      colorClass: "bg-white border-black/[0.12] text-[#041627]",
      subtitle: "Intellectual Property Shield",
      desc: "Share sensitive Intellectual Property with self-destruct timers. Tag internal frameworks as 'Never Share' to prevent accidental leaks.",
    },
    {
      id: "deliver" as const,
      label: "Deliver",
      icon: Gem,
      colorClass: "bg-[#d2e4fb]/50 border-[#0060a9]/25 text-[#0060a9]",
      subtitle: "White Glove",
      desc: "Deliver a branded, professional experience. No more 'Untitled Folder' links. Impress clients with a secure portal view.",
    },
    {
      id: "wrap" as const,
      label: "Wrap",
      icon: Check,
      colorClass: "bg-emerald-50 border-emerald-100 text-emerald-600",
      subtitle: "Project Close",
      desc: "One-click to lock a client folder to 'View Only'. Automatically package final deliverables and revoke access to drafts.",
    },
    {
      id: "audit" as const,
      label: "Audit",
      icon: UserCheck,
      colorClass: "bg-white border-black/[0.1] text-[#44474c]",
      subtitle: "The Mirror",
      desc: "Instantly see every external email that has access to your proprietary folders. Find stale links and orphaned files.",
    },
  ]

  const editorialKineticSlides = [
    {
      id: "link" as const,
      label: "Link",
      icon: Cable,
      colorClass: "bg-white border-black/[0.12] text-[#1b1b1d]",
      subtitle: "Connect & Select",
      desc: "Connect your specific Google Drive folders. Import existing client documents directly into structured engagements.",
    },
    {
      id: "setup" as const,
      label: "Setup",
      icon: Network,
      colorClass: "bg-[#72ff70]/30 border-[#006e16]/25 text-[#002203]",
      subtitle: "Project Context",
      desc: "Turn loose files into a professional Project. Map your messy drive folders to a clean Client → Project hierarchy.",
    },
    {
      id: "protect" as const,
      label: "Protect",
      icon: ShieldCheck,
      colorClass: "bg-[#5a78ff]/12 border-[#5a78ff]/25 text-[#001256]",
      subtitle: "Intellectual Property Shield",
      desc: "Share sensitive Intellectual Property with self-destruct timers. Tag internal frameworks as 'Never Share' to prevent accidental leaks.",
    },
    {
      id: "deliver" as const,
      label: "Deliver",
      icon: Gem,
      colorClass: "bg-white border-[#006e16]/30 text-[#006e16]",
      subtitle: "White Glove",
      desc: "Deliver a branded, professional experience. No more 'Untitled Folder' links. Impress clients with a secure portal view.",
    },
    {
      id: "wrap" as const,
      label: "Wrap",
      icon: Check,
      colorClass: "bg-emerald-50 border-emerald-100 text-emerald-600",
      subtitle: "Project Close",
      desc: "One-click to lock a client folder to 'View Only'. Automatically package final deliverables and revoke access to drafts.",
    },
    {
      id: "audit" as const,
      label: "Audit",
      icon: UserCheck,
      colorClass: "bg-white border-black/[0.1] text-[#45474c]",
      subtitle: "The Mirror",
      desc: "Instantly see every external email that has access to your proprietary folders. Find stale links and orphaned files.",
    },
  ]

  const legacySlides = [
    {
      id: "link" as const,
      label: "Link",
      icon: Cable,
      colorClass: "bg-[#FFF7F2] border-[#ECC0AA]/35 text-[#7a5343]",
      subtitle: "Connect & Select",
      desc: "Connect your specific Google Drive folders. Import existing client documents directly into structured engagements.",
    },
    {
      id: "setup" as const,
      label: "Setup",
      icon: Network,
      colorClass: "bg-[#ECC0AA]/18 border-[#ECC0AA]/35 text-[#B07D62]",
      subtitle: "Project Context",
      desc: "Turn loose files into a professional Project. Map your messy drive folders to a clean Client → Project hierarchy.",
    },
    {
      id: "protect" as const,
      label: "Protect",
      icon: ShieldCheck,
      colorClass: "bg-[#ECC0AA]/18 border-[#ECC0AA]/40 text-[#7a5343]",
      subtitle: "Intellectual Property Shield",
      desc: "Share sensitive Intellectual Property with self-destruct timers. Tag internal frameworks as 'Never Share' to prevent accidental leaks.",
    },
    {
      id: "deliver" as const,
      label: "Deliver",
      icon: Gem,
      colorClass: "bg-[#FFF0E6] border-[#d4a892]/50 text-[#B07D62]",
      subtitle: "White Glove",
      desc: "Deliver a branded, professional experience. No more 'Untitled Folder' links. Impress clients with a secure portal view.",
    },
    {
      id: "wrap" as const,
      label: "Wrap",
      icon: Check,
      colorClass: "bg-emerald-50 border-emerald-100 text-emerald-600",
      subtitle: "Project Close",
      desc: "One-click to lock a client folder to 'View Only'. Automatically package final deliverables and revoke access to drafts.",
    },
    {
      id: "audit" as const,
      label: "Audit",
      icon: UserCheck,
      colorClass: "bg-slate-50 border-slate-100 text-slate-600",
      subtitle: "The Mirror",
      desc: "Instantly see every external email that has access to your proprietary folders. Find stale links and orphaned files.",
    },
  ]

  const slides = useMemo(() => {
    if (!isEditorial) return legacySlides
    if (isKinetic) return editorialKineticSlides
    return editorialStitchSlides
  }, [isEditorial, isKinetic])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [slides.length])

  const handleSlideChange = (index: number) => {
    setCurrentSlide(index)
  }

  const openModal = (modalName: string) => setActiveModal(modalName)
  const closeModal = () => setActiveModal(null)

  const landingBody = (
    <>
      {/* --- HERO SECTION --- */}
      <section className={t.heroSection}>
        {!isEditorial && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full text-center pointer-events-none select-none z-0">
            <h1 className={t.heroGiant}>PROFESSIONAL</h1>
        </div>
        )}

        <div
          className={cn(
            MARKETING_PAGE_SHELL,
            "relative z-10 flex min-h-0 flex-1 flex-col lg:justify-center",
          )}
        >
          {isKinetic ? (
            <KineticHeroSection />
          ) : isEditorial ? (
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 xl:gap-20 items-start mb-16 lg:mb-20">
              <div className="lg:col-span-7 text-left space-y-6">
            <FadeIn delay={0}>
                  <div className={cn(t.heroBadge, "mb-0")}>
                    <BriefcaseBusiness className={t.heroBadgeIcon} />
                For Strategic Advisors & Process Consultants
              </div>
            </FadeIn>

                <FadeIn delay={80}>
                  <h2 className={t.heroTitle}>
                Turn Your{" "}
                <span className="inline-flex items-center gap-3 align-bottom">
                  <GoogleDriveProductMark className="mb-2 h-10 w-10 shrink-0 md:h-14 md:w-14" />
                  Google Drive
                </span>{" "}
                <br />
                into a Professional <br />
                    <span className={t.heroGradient}>Client Portal.</span>
              </h2>
            </FadeIn>

                <FadeIn delay={120}>
                  <div className="mt-6 mb-2 text-lg md:text-2xl font-bold tracking-tight flex items-center justify-start gap-1 sm:gap-2 flex-wrap">
                    <span className={t.heroTaglineAccent}>Consumer-Grade Ease</span>
                    <span className={t.heroTaglinePipe}>|</span>
                    <span className={t.heroTaglineStrong}>Institutional Trust</span>
                    <span className={t.heroTaglinePipe}>|</span>
                    <span className={t.heroTaglineMuted}>Frictionless Delivery</span>
              </div>
            </FadeIn>

                <FadeIn delay={160}>
                  <p className={cn(t.heroLead, "max-w-2xl mx-0")}>
                    Stop sending raw Drive links. Deliver work with a <span className={t.heroLeadStrong}> white-glove experience </span> that protects
                    your Intellectual Property. Instantly revoke access when the engagement is completed.
              </p>
            </FadeIn>

                <FadeIn delay={200}>
                  <div className="flex flex-col sm:flex-row gap-4 justify-start pt-4">
                <Link href="/contact" className="w-full sm:w-auto">
                      <Button
                        variant="ghost"
                        className={cn(
                          "group inline-flex items-center gap-2 rounded bg-[#72ff70] px-8 py-3 text-base font-bold tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
                        )}
                      >
                    Build Your Portal
                        <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
                  </Button>
                </Link>
                <Link href={TRUST_CENTER_PATH} className="w-full sm:w-auto">
                      <div className="group h-14 px-8 rounded-md bg-[#141c2a] text-white text-base font-bold tracking-widest border border-transparent flex items-center justify-center cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                        <ShieldCheck className={cn("w-5 h-5 mr-2 stroke-[1.5]", t.heroSecondaryIconHover)} />
                    View Solution
                  </div>
                </Link>
              </div>
            </FadeIn>

                <FadeIn delay={240} className="pt-4 space-y-3">
                  <p className={t.heroFootnote}>Trusted by modern firms worldwide</p>
                  <div className="flex flex-wrap gap-2">
                    {["AXIOM", "STRATOS", "CORE", "VANGUARD", "EQUINOX"].map((name) => (
                      <span
                        key={name}
                        className="px-4 py-2 rounded-lg text-[11px] font-semibold tracking-wide text-[#041627] bg-white border border-black/[0.1] [font-family:var(--font-stitch-label),system-ui,sans-serif]"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className={cn("text-xs uppercase tracking-widest pt-2", t.textMuted)}>
                    Built for strategic advisors, fractional executives & process consultants
              </p>
            </FadeIn>
          </div>

              <FadeIn delay={180} direction="up" className="lg:col-span-5 w-full">
                <div className={t.secureVaultCard}>
                  <div className="flex items-start gap-3 rounded-xl bg-white border border-black/[0.08] p-4 mb-6">
                    <span className={cn(t.stitchVaultFeatureIcon, "bg-[#d3e4ff]/50 text-[#0060a9]")}>
                      <Cloud className="h-5 w-5 stroke-[1.5]" />
                    </span>
                      <div>
                      <div className={t.stitchVaultDriveRow}>Drive connected</div>
                      <p className={cn("text-xs uppercase tracking-widest mt-1", t.textMuted)}>Real-time sync active</p>
                      </div>
                    </div>
                  <p className="text-lg font-semibold text-[#181c1c] leading-snug mb-6 [font-family:var(--font-stitch-display),serif]">
                    A calmer surface for high-stakes delivery.
                  </p>
                  <ul className="space-y-5">
                    <li className="flex gap-4">
                      <span className={t.stitchVaultFeatureIcon}>
                        <LockKeyhole className="h-5 w-5 stroke-[1.5]" />
                      </span>
                      <div>
                        <h4 className={cn("font-semibold text-[#181c1c] [font-family:var(--font-stitch-display),serif]")}>Seamless access</h4>
                        <p className={cn("text-sm mt-1 leading-relaxed", t.textBody)}>
                          Clients reach sensitive documents with biometrics or magic links — fewer forgotten passwords.
                    </p>
                  </div>
                    </li>
                    <li className="flex gap-4">
                      <span className={t.stitchVaultFeatureIcon}>
                        <Palette className="h-5 w-5 stroke-[1.5]" />
                      </span>
                      <div>
                        <h4 className={cn("font-semibold text-[#181c1c] [font-family:var(--font-stitch-display),serif]")}>White-labeled</h4>
                        <p className={cn("text-sm mt-1 leading-relaxed", t.textBody)}>
                          Your brand and domain lead; the product stays quietly in the background.
                        </p>
            </div>
                    </li>
                    <li className="flex gap-4">
                      <span className={t.stitchVaultFeatureIcon}>
                        <LineChart className="h-5 w-5 stroke-[1.5]" />
                      </span>
                      <div>
                        <h4 className={cn("font-semibold text-[#181c1c] [font-family:var(--font-stitch-display),serif]")}>Insights</h4>
                        <p className={cn("text-sm mt-1 leading-relaxed", t.textBody)}>
                          See when documents are opened and maintain an audit trail that holds up to scrutiny.
                        </p>
                    </div>
                    </li>
                  </ul>
                    </div>
              </FadeIn>
              </div>
          ) : (
            <div className="mb-12 grid grid-cols-1 items-start gap-10 lg:mb-0 lg:grid-cols-12 lg:gap-10 xl:gap-12">
              <div className="lg:col-span-7 min-w-0 text-left space-y-6">
                <FadeIn delay={0}>
                  <KineticMarketingBadge
                    variant="lime"
                    className="mb-6"
                    icon={<SquareFunction className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />}
                  >
                    {KINETIC_LANDING_HERO_BADGE}
                  </KineticMarketingBadge>
                </FadeIn>

                <FadeIn delay={80}>
                  <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-[4.2rem] font-bold leading-[0.92] tracking-tighter text-[#1b1b1d] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                    Turn Your{" "}
                    <span className="inline-flex items-center gap-2 align-bottom">
                      <GoogleDriveProductMark className="mb-1 h-10 w-10 shrink-0 md:h-12 md:w-12" />
                      <span className="text-[#5a78ff]">Google Drive</span>
                    </span>{" "}
                    into a Professional Client Portal
                  </h2>
                </FadeIn>

                <FadeIn delay={150}>
                  <div className="text-lg md:text-2xl font-bold tracking-tight flex items-center justify-start gap-1 sm:gap-2 flex-wrap [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                    <span className="text-[#006e16]">Consumer-Grade Ease</span>
                    <span className="text-[#c6c6cc] font-light px-1 sm:px-2">|</span>
                    <span className="text-[#1b1b1d]">Institutional Trust</span>
                    <span className="text-[#c6c6cc] font-light px-1 sm:px-2">|</span>
                    <span className="text-[#45474c]">Frictionless Delivery</span>
                  </div>
                </FadeIn>

                <FadeIn delay={200}>
                  <p className="text-lg md:text-xl text-[#45474c] max-w-2xl leading-relaxed [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                    Stop sending raw Drive links. Deliver work with a <span className="font-semibold text-[#1b1b1d]"> white-glove experience </span> that protects
                    your Intellectual Property. Instantly revoke access when the engagement is completed.
                  </p>
                </FadeIn>

                <FadeIn delay={300}>
                  <LandingHeroPrimaryCtas className="pt-4" />
                </FadeIn>

                <FadeIn delay={400} className="mt-2">
                  <p className="text-xs text-[#45474c] font-bold tracking-widest uppercase [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                    Built for strategic advisors, fractional executives & process consultants
                  </p>
                </FadeIn>
              </div>

              <div className="hidden lg:block lg:col-span-5 min-w-0 lg:sticky lg:top-28 self-start">
                <LegacyHeroScreenMock
                  currentSlide={currentSlide}
                  t={t}
                  isEditorial={isEditorial}
                  edAccent={edAccent}
                  slides={slides}
                  onSlideChange={handleSlideChange}
                  motionInstanceKey="hero"
                />
              </div>
            </div>
          )}

          {isKinetic && <KineticBentoSection />}

          {/* Central Floating Dashboard Visual (Carousel) — mobile: same mock as desktop hero, compact nav */}
          <FadeIn delay={isEditorial ? 280 : 500} direction="up" className="relative w-full">
            <div className="md:hidden">
              <LegacyHeroScreenMock
                currentSlide={currentSlide}
                t={t}
                isEditorial={isEditorial}
                edAccent={edAccent}
                slides={slides}
                onSlideChange={handleSlideChange}
                compactSlideNav
                slideViewportHeightClass="h-[260px]"
                motionInstanceKey="marketing"
              />
            </div>
          </FadeIn>

        </div>

        {!isEditorial && (
        <div className="absolute inset-x-0 bottom-0 h-full w-full overflow-hidden pointer-events-none select-none z-0">
            <svg
              className="absolute -bottom-1 left-0 z-0 w-full h-[64%] text-[#ede7e3] fill-current"
            preserveAspectRatio="none"
            viewBox="0 0 1440 320"
            xmlns="http://www.w3.org/2000/svg"
          >
              <path d="M0,128L80,138.7C160,149,320,171,480,165.3C640,160,800,128,960,122.7C1120,117,1280,139,1360,149.3L1440,160L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z" />
          </svg>
          <svg
              className="absolute -bottom-2 left-0 z-10 w-full h-[30%] text-[#5a78ff]/[0.08] fill-current"
            preserveAspectRatio="none"
            viewBox="0 0 1440 320"
            xmlns="http://www.w3.org/2000/svg"
          >
              <path d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,250.7C960,235,1056,181,1152,165.3C1248,149,1344,171,1392,181.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>
        )}
      </section>

      <FirmTransformationSection skin={skin} />

      {/* --- TARGET AUDIENCE (Design2) --- */}
      <section
        id={TARGET_AUDIENCE_SECTION_ID}
        className={cn(
          "relative bg-[#f9f9fb] pb-28 pt-24 lg:pb-36 lg:pt-32",
          targetAudienceScrollMarginClass,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_0.75px,transparent_0.75px)] bg-[size:16px_16px] opacity-45" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-[#f9f9fb]/60 to-[#72ff70]/[0.05]" />
        <div className={cn(MARKETING_PAGE_SHELL, "relative z-10")}>
          <FadeIn className="mb-16 text-left">
            <KineticSectionIntro
              badge={{
                variant: "lime",
                icon: <Users className="ds-badge-kinetic__icon" aria-hidden />,
                label: "TARGET AUDIENCE",
                className: "mb-6",
                tracking: "widest",
              }}
              title={
                <>
                  Who Is <span className="text-[#7c8496]">{BRAND_NAME}</span> For?
                </>
              }
              titleClassName="!mb-6 text-4xl md:text-6xl"
              description={
                <p className="max-w-3xl text-xl leading-relaxed text-[#45474c] md:text-2xl [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                  Built for marketing-led firms and leaders—fractional executives, marketing agencies, strategic consultants,
                  and advisory partners—who run campaigns, retainers, and approvals on top of real deliverables. Same for
                  audit, training, and other high-touch teams: you don’t just work in documents —{" "}
                  <span className="font-bold text-[#1b1b1d]">you deliver your value through them.</span>
                </p>
              }
              descriptionClassName=""
            />
          </FadeIn>

          <div className="mb-16 flex flex-wrap gap-3">
            {audienceRoles.map((role) => (
              <Link
                key={role.id}
                href={`/#${role.id}`}
                className={cn(
                  targetAudienceScrollMarginClass,
                  "inline-flex rounded-none border border-[#c6c6cc] bg-white px-5 py-2 text-[10px] font-medium uppercase tracking-widest text-[#1b1b1d] transition-colors [font-family:var(--font-kinetic-headline),system-ui,sans-serif] hover:border-ds-kinetic-lime hover:text-ds-kinetic-lime-icon",
                )}
                id={role.id}
              >
                {role.label}
              </Link>
            ))}
          </div>

          <div
            id={USE_CASES_SECTION_ID}
            className={cn(
              targetAudienceScrollMarginClass,
              "grid grid-cols-1 items-start gap-6 md:grid-cols-[repeat(12,minmax(0,1fr))]",
            )}
          >
            {useCaseBlocks.map((block) => (
              <FadeIn
                key={block.id}
                delay={block.delay}
                className={cn(block.colClass, "min-w-0 w-full")}
              >
                <TargetAudienceUseCaseCard block={block} />
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {!hideTrustSectionAfterModal ? (
        <FadeIn>
          <TrustArchitectureSection skin={skin} variant="page" />
        </FadeIn>
      ) : null}

      {!hideRealitySectionAfterModal ? <RealityCheckSection fillViewportBelowHeader /> : null}

    </>
  )

  return (
    <>
      {isEditorial ? (
        landingBody
      ) : (
        <>
          {/* Background + gradients: `app/(marketing)/layout.tsx` (kinetic marketing shell) */}
          <Header />
          {landingBody}
      <Footer onOpenModal={openModal} />
        </>
      )}

      <FAQModal isOpen={activeModal === "faqs"} onClose={closeModal} />
      <Modal isOpen={activeModal === "privacy"} onClose={closeModal} title="Privacy Policy">
        <PrivacyPolicy />
      </Modal>
      <Modal isOpen={activeModal === "cookies"} onClose={closeModal} title="Cookie Policy">
        <CookiePolicy />
      </Modal>
      <Modal isOpen={activeModal === "terms"} onClose={closeModal} title="Terms of Service">
        <TermsOfService />
      </Modal>
      <Modal isOpen={activeModal === "support"} onClose={closeModal} title="Support">
        <Support />
      </Modal>
    </>
  )
}
