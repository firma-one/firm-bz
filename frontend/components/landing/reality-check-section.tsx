"use client"

import { useEffect, useState, type ComponentType, type ReactNode } from "react"
import CountUp from "react-countup"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Archive,
  Briefcase,
  DollarSign,
  History,
  Hourglass,
  Link2,
  LockKeyhole,
  Package,
  Receipt,
  Scale,
  ScanEye,
  ShieldAlert,
  Timer,
  TrendingDown,
  TriangleAlert,
  UserX,
} from "lucide-react"
import {
  MARKETING_PAGE_SHELL,
  MARKETING_SURFACE_DEPTH_HOVER,
} from "@/lib/marketing/target-audience-nav"
import { cn } from "@/lib/utils"

/** Numeric + suffix for scroll-triggered CountUp; display matches marketing copy. */
const stats = [
  {
    end: 50,
    suffix: "%",
    label: "Trust Erosion",
    desc: "Clients associate disorganized file sharing with amateur business practices.",
  },
  {
    end: 23,
    suffix: "%",
    label: "Zombie Links",
    desc: "Shared links remain active 1yr post-contract.",
  },
  {
    end: 65,
    suffix: "%",
    label: "Unpaid Usage",
    desc: "of consulting IP is reused without ongoing payment.",
  },
  {
    end: 31,
    suffix: "%",
    label: "Data Leakage",
    desc: "Client files are reshared to unauthorized emails.",
  },
  {
    end: 8,
    suffix: "h",
    label: "Lost Productivity",
    desc: "per week spent searching across email threads.",
  },
  {
    end: 0,
    suffix: "",
    label: "Audit Trail",
    desc: "visibility into who is accessing your files right now.",
  },
] as const

type CardDef = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  desc: string
}

type SlideDef = {
  id: string
  badge: string
  BadgeIcon: ComponentType<{ className?: string; strokeWidth?: number }>
  headline: ReactNode
  body: string
  cards: readonly CardDef[]
}

const slides: readonly SlideDef[] = [
  {
    id: "brand-risk",
    badge: "Brand Risk",
    BadgeIcon: AlertTriangle,
    headline: (
      <>
        Delivering Premium Strategy in a{" "}
        <span className="text-[#1b1b1d]/30">&quot;New Folder (2)&quot;</span> Feels Wrong.
      </>
    ),
    body: "High-ticket clients expect a high-ticket experience. Stop sending messy Drive links and start delivering a professional portal that honors your expertise and your brand.",
    cards: [
      {
        icon: Package,
        title: "The 'Zip File' Dump",
        desc: "Overwhelms clients and looks amateur. Dilutes your value instantly.",
      },
      {
        icon: History,
        title: "Version Chaos",
        desc: "Using 'Strategy_Final_v2_EDIT.pdf'. High risk for execution errors.",
      },
      {
        icon: Briefcase,
        title: "Broken Experience",
        desc: "Commanding high-ticket fees with low-budget delivery mechanisms.",
      },
    ],
  },
  {
    id: "revenue-leak",
    badge: "Revenue Leak",
    BadgeIcon: DollarSign,
    headline: (
      <>
        Your Frameworks Keep Working—<span className="text-[#1b1b1d]/40">But the Invoice Stopped.</span>
      </>
    ),
    body: "Consulting IP is reused internally as playbooks and templates long after the SOW ends—often with no renewal, license fee, or clear commercial tie-back to your firm.",
    cards: [
      {
        icon: Receipt,
        title: "Silent IP reuse",
        desc: "Deliverables circulate as 'how we do it here' with no ongoing payment or attribution.",
      },
      {
        icon: Hourglass,
        title: "Scope bleed via attachments",
        desc: "Loose folders blur what's in contract; you absorb rework you never priced.",
      },
      {
        icon: TrendingDown,
        title: "Renewals you don't capture",
        desc: "Clients stay sticky to your artifacts while you're left chasing the next engagement.",
      },
    ],
  },
  {
    id: "security-gap",
    badge: "Security Gap",
    BadgeIcon: ShieldAlert,
    headline: (
      <>
        You Shared a Folder. <span className="text-[#1b1b1d]/35">You Lost the Map.</span>
      </>
    ),
    body: "Links outlive contracts, permissions drift, and when compliance asks who had access—spreadsheets and memory are not an audit trail.",
    cards: [
      {
        icon: Link2,
        title: "Zombie links",
        desc: "Shared links remain active a year after the contract—still pointing at your IP.",
      },
      {
        icon: UserX,
        title: "Shadow recipients",
        desc: "Files get forwarded to addresses that never signed your NDA or MSA.",
      },
      {
        icon: ScanEye,
        title: "Zero live audit",
        desc: "No single view of who opened what, when—only hope and inbox archaeology.",
      },
    ],
  },
  {
    id: "intellectual-property",
    badge: "Intellectual Property",
    BadgeIcon: Scale,
    headline: (
      <>
        Your Methodology Shouldn&apos;t <span className="text-[#1b1b1d]/35">Outlive the Engagement.</span>
      </>
    ),
    body: "When projects wrap, frameworks and decks should retire on your terms—not as stray copies in someone else's Drive tree.",
    cards: [
      {
        icon: LockKeyhole,
        title: "Internal-only guardrails",
        desc: "Tag models and templates so they never ship in client bundles by accident.",
      },
      {
        icon: Timer,
        title: "Time-bomb shares",
        desc: "Default expiring links so dead deals don't keep a live pipe to your IP.",
      },
      {
        icon: Archive,
        title: "One-click Wrap",
        desc: "Lock folders to view-only and package what was actually delivered—clean handoff.",
      },
    ],
  },
] as const

const CAROUSEL_MS = 6500

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
}

function RealityStatCard({
  end,
  suffix,
  label,
  desc,
}: {
  end: number
  suffix: string
  label: string
  desc: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-none border border-black/[0.06] bg-white p-0 shadow-sm",
        "transition-[box-shadow] duration-200 ease-out",
        "hover:z-[1] hover:shadow-[0_14px_32px_-10px_rgba(27,27,29,0.22)]",
      )}
    >
      <div className="rounded-none bg-[#FEF2F2] px-3 py-2 md:px-4 md:py-2">
        <span className="block text-2xl font-bold tabular-nums tracking-tighter text-[#E14C4C] md:text-3xl [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
          <CountUp
            end={end}
            duration={2.25}
            suffix={suffix}
            enableScrollSpy
            scrollSpyOnce
            scrollSpyDelay={80}
          />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2 md:px-4 md:py-2.5">
        <p className="text-[11px] leading-[1.3] text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
          {desc}
        </p>
      </div>
      {/* ~1.5-line title band; faint pink wash (slightly stronger than 12% for legibility). */}
      <div className="flex min-h-[2.125rem] items-center rounded-none bg-[color-mix(in_srgb,#FEF2F2_22%,white)] px-3 py-1.5 md:min-h-[2.25rem] md:px-4 md:py-1.5">
        <span className="block text-[10px] font-bold uppercase leading-snug tracking-[0.18em] text-[#E14C4C] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
          {label}
        </span>
      </div>
    </div>
  )
}

/**
 * Marketing “Reality Check” band: stat grid, rotating narrative + right-rail cards (Brand Risk, Revenue Leak, Security Gap, IP).
 *
 * @param fillViewportBelowHeader — On large screens, set min-height to fill the viewport below the fixed marketing header (`lg:pt-28` ≈ 7rem). Use on the home page only; omit inside modals.
 */
export function RealityCheckSection({
  fillViewportBelowHeader = false,
}: {
  fillViewportBelowHeader?: boolean
} = {}) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, CAROUSEL_MS)
    return () => clearInterval(t)
  }, [])

  const slide = slides[index]
  const BadgeIcon = slide.BadgeIcon

  return (
    <section
      className={cn(
        "relative overflow-hidden bg-[#E1E1E1] pb-8 pt-16 md:pb-9 md:pt-20",
        fillViewportBelowHeader &&
          "lg:flex lg:min-h-[calc(100dvh-7rem)] lg:flex-col lg:pb-8 lg:pt-20",
      )}
    >
      <div
        className={cn(
          MARKETING_PAGE_SHELL,
          "w-full",
          fillViewportBelowHeader && "flex min-h-0 flex-1 flex-col lg:min-h-0",
        )}
      >
        <div className="mb-5 shrink-0 text-left md:mb-6 lg:mb-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-sm bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 opacity-95" aria-hidden strokeWidth={2} />
            Reality Check
          </div>
          <h2
            className={cn(
              "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-4xl font-bold leading-[1.05] tracking-tighter md:text-6xl lg:text-6xl xl:text-7xl",
              "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
            )}
          >
            The Hidden Cost of{" "}
            <span className="inline-block rounded-none bg-black px-3 py-1 text-[#00FF41] md:px-4 md:py-1">Document Chaos</span>
          </h2>
          <p className="max-w-3xl text-lg leading-snug text-[#45474c] md:text-xl [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
            Inefficient document workflows are quietly draining your margins and exposing your firm to unnecessary risk.
          </p>
        </div>

        <div
          className={cn(
            "grid grid-cols-1 items-stretch gap-0 overflow-hidden rounded-none border border-black/[0.08] lg:grid-cols-12",
            fillViewportBelowHeader && "min-h-0 lg:flex-1 lg:grid-rows-1",
          )}
        >
          {/* Left: stats 2×3 */}
          <div className="flex flex-col justify-center bg-white/40 p-5 lg:col-span-3 lg:h-full lg:min-h-0 lg:p-6">
            <div className="grid h-full min-h-0 grid-cols-2 gap-3 md:gap-4">
              {stats.map((s) => (
                <RealityStatCard key={s.label} end={s.end} suffix={s.suffix} label={s.label} desc={s.desc} />
              ))}
            </div>
          </div>

          {/* Center + right: synced carousel (display:contents so both are grid cells on lg) */}
          <div className="contents">
            <div className="flex min-h-0 flex-col justify-between border-black/[0.08] bg-white p-6 lg:col-span-6 lg:h-full lg:min-h-0 lg:border-x lg:p-8 xl:p-9">
              <div className="relative min-h-[min(32vh,16rem)] flex-1 lg:min-h-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={slide.id}
                    initial={fade.initial}
                    animate={fade.animate}
                    exit={fade.exit}
                    transition={fade.transition}
                    className="absolute inset-0 flex flex-col"
                  >
                    <div
                      className={cn(
                        "mb-4 inline-flex w-max max-w-full items-center gap-2 self-start rounded-sm",
                        slide.id === "intellectual-property"
                          ? "ds-badge-kinetic uppercase tracking-[0.2em]"
                          : "bg-red-600 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
                      )}
                    >
                      <BadgeIcon
                        className={cn(
                          slide.id === "intellectual-property" ? "ds-badge-kinetic__icon" : "h-3.5 w-3.5 shrink-0",
                        )}
                        aria-hidden
                        strokeWidth={2}
                      />
                      {slide.badge}
                    </div>
                    <h3
                      className={cn(
                        "mb-4 text-3xl font-bold leading-[1.08] tracking-tight md:text-5xl lg:text-5xl xl:text-6xl",
                        "[font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
                      )}
                    >
                      {slide.headline}
                    </h3>
                    <p className="max-w-xl text-lg leading-relaxed text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]">
                      {slide.body}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="mt-6 flex shrink-0 items-center gap-2" role="tablist" aria-label="Reality check topics">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Show ${s.badge}`}
                    className={cn(
                      "h-1 rounded-none transition-all duration-300",
                      i === index ? "w-8 bg-[#1b1b1d]" : "w-2 bg-[#c6c6cc] hover:bg-[#a1a1aa]",
                    )}
                    onClick={() => setIndex(i)}
                  />
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-col bg-white/40 p-5 lg:col-span-3 lg:h-full lg:min-h-0 lg:p-6">
              <div className="relative min-h-[min(40vh,20rem)] flex-1 lg:min-h-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={slide.id}
                    initial={fade.initial}
                    animate={fade.animate}
                    exit={fade.exit}
                    transition={fade.transition}
                    className="absolute inset-0 flex h-full flex-col gap-3 md:gap-3.5"
                  >
                    {slide.cards.map(({ icon: Icon, title, desc }) => (
                      <div
                        key={title}
                        className={cn(
                          "flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-none border border-black/[0.06] bg-white shadow-sm",
                          MARKETING_SURFACE_DEPTH_HOVER,
                        )}
                      >
                        <div
                          className={cn(
                            "flex w-[3.25rem] shrink-0 items-center justify-center self-stretch md:w-14",
                            slide.id === "intellectual-property" ? "bg-[#E5FFE4]" : "bg-[#fef2f2]",
                          )}
                        >
                          <Icon className="h-5 w-5 text-slate-600" strokeWidth={1.75} aria-hidden />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-4 md:px-5 md:py-4">
                          <h4 className="mb-1.5 text-sm font-bold text-slate-900 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                            {title}
                          </h4>
                          <p className="text-[13px] leading-snug text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif] md:text-[14px] md:leading-snug">
                            {desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
