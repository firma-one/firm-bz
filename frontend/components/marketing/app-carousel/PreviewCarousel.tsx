"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return isMobile
}
import { AppFrame } from "./AppFrame"
import { CarouselCursor } from "./CarouselCursor"
import { SceneFirmBranding } from "./scenes/SceneFirmBranding"
import { SceneCreateClient } from "./scenes/SceneCreateClient"
import { SceneCreateContact } from "./scenes/SceneCreateContact"
import { SceneEngagementAndShare } from "./scenes/SceneEngagementAndShare"
import { SceneWrapEngagement } from "./scenes/SceneWrapEngagement"
import { SceneAnalytics } from "./scenes/SceneAnalytics"

// ── SceneCommandPalette ──────────────────────────────────────────────────────

const PALETTE_CLIENTS = [
  { abbr: "MF", color: "#5a78ff", name: "Meridian Finance", tag: "Active", events: "8 events" },
  { abbr: "HG", color: "#069668", name: "Hartwell Group",   tag: "Active", events: "3 events" },
  { abbr: "VP", color: "#f59e0b", name: "Vantage Partners", tag: "Active", events: "5 events" },
]

function SceneCommandPalette({ phase }: { phase: number }) {
  return (
    <div
      style={{
        height: "100%",
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2
            style={{
              fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
              fontSize: 17,
              fontWeight: 600,
              color: "#1b1b1d",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Clients
          </h2>
          <p
            style={{
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 12,
              color: "#6b7280",
              margin: "3px 0 0",
            }}
          >
            3 active workspaces
          </p>
        </div>
        <div
          style={{
            background: "#f3f4f6",
            borderRadius: 4,
            padding: "6px 12px",
            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
            fontSize: 11,
            fontWeight: 600,
            color: "#6b7280",
            cursor: "default",
          }}
        >
          + New client
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 4,
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid #f3f4f6",
            display: "flex",
            gap: 8,
            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
            fontSize: 10,
            fontWeight: 600,
            color: "#9ca3af",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span style={{ flex: 1 }}>Client</span>
          <span style={{ width: 80 }}>Activity</span>
          <span style={{ width: 60 }}>Status</span>
        </div>

        {PALETTE_CLIENTS.map((client, i) => (
          <div
            key={client.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderBottom: i < PALETTE_CLIENTS.length - 1 ? "1px solid #f9f9fb" : "none",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 4,
                background: client.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                }}
              >
                {client.abbr}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#1b1b1d",
                }}
              >
                {client.name}
              </div>
            </div>
            <div
              style={{
                width: 80,
                fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                fontSize: 11,
                color: "#9ca3af",
              }}
            >
              {client.events}
            </div>
            <div style={{ width: 60, display: "flex" }}>
              <div
                style={{
                  background: "#f0fdf4",
                  color: "#15803d",
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                  fontSize: 10,
                  fontWeight: 600,
                  border: "1px solid #bbf7d0",
                  whiteSpace: "nowrap",
                }}
              >
                {client.tag}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Scene config ─────────────────────────────────────────────────────────────

const SCENES = [
  {
    id: "palette",
    label: "Quick navigation",
    nav: "Clients" as const,
    url: "app/firm/axiom/client",
    phases: [
      { durationMs: 500,  cursor: { x: 340, y: 22, clicking: false }, palettePhase: 0 },
      { durationMs: 900,  cursor: { x: 340, y: 22, clicking: true  }, palettePhase: 1 },
      { durationMs: 1400, cursor: { x: 340, y: 340, clicking: false }, palettePhase: 2 },
      { durationMs: 700,  cursor: { x: 340, y: 340, clicking: true  }, palettePhase: 0 },
      { durationMs: 700,  cursor: { x: 90,  y: 155, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "branding",
    label: "Brand setup",
    nav: "Settings" as const,
    url: "app/firm/axiom/settings/branding",
    phases: [
      { durationMs: 600,  cursor: { x: 220, y: 148, clicking: false }, palettePhase: 0 },
      { durationMs: 2000, cursor: { x: 220, y: 148, clicking: true  }, palettePhase: 0 },
      { durationMs: 700,  cursor: { x: 310, y: 248, clicking: true  }, palettePhase: 0 },
      { durationMs: 800,  cursor: { x: 260, y: 310, clicking: true  }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 500, y: 380, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "client",
    label: "Client portal",
    nav: "Clients" as const,
    url: "app/firm/axiom/client",
    phases: [
      { durationMs: 700,  cursor: { x: 340, y: 60,  clicking: false }, palettePhase: 0 },
      { durationMs: 600,  cursor: { x: 365, y: 60,  clicking: true  }, palettePhase: 0 },
      { durationMs: 800,  cursor: { x: 260, y: 200, clicking: false }, palettePhase: 0 },
      { durationMs: 2000, cursor: { x: 260, y: 216, clicking: true  }, palettePhase: 0 },
      { durationMs: 600,  cursor: { x: 280, y: 290, clicking: true  }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 530, y: 250, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "contact",
    label: "Protect IP",
    nav: "Clients" as const,
    url: "app/firm/axiom/client/meridian/q3-review",
    phases: [
      { durationMs: 900,  cursor: { x: 280, y: 160, clicking: false }, palettePhase: 0 },
      { durationMs: 700,  cursor: { x: 310, y: 185, clicking: true  }, palettePhase: 0 },
      { durationMs: 900,  cursor: { x: 340, y: 215, clicking: true  }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 420, y: 185, clicking: true  }, palettePhase: 0 },
      { durationMs: 1000, cursor: { x: 480, y: 185, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "engagement",
    label: "Audit trail",
    nav: "Audit Log" as const,
    url: "app/firm/axiom/audit",
    phases: [
      { durationMs: 700,  cursor: { x: 300, y: 100, clicking: false }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 300, y: 180, clicking: false }, palettePhase: 0 },
      { durationMs: 1300, cursor: { x: 300, y: 260, clicking: false }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 300, y: 320, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "wrap",
    label: "Full control",
    nav: "Clients" as const,
    url: "app/firm/axiom/client/meridian/q3-review",
    phases: [
      { durationMs: 800,  cursor: { x: 480, y: 55,  clicking: false }, palettePhase: 0 },
      { durationMs: 600,  cursor: { x: 480, y: 55,  clicking: true  }, palettePhase: 0 },
      { durationMs: 1000, cursor: { x: 340, y: 355, clicking: false }, palettePhase: 0 },
      { durationMs: 700,  cursor: { x: 340, y: 355, clicking: true  }, palettePhase: 0 },
      { durationMs: 1500, cursor: { x: 420, y: 220, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    nav: "Analytics" as const,
    url: "app/firm/axiom/analytics",
    phases: [
      { durationMs: 800,  cursor: { x: 280, y: 80,  clicking: false }, palettePhase: 0 },
      { durationMs: 1400, cursor: { x: 200, y: 180, clicking: false }, palettePhase: 0 },
      { durationMs: 1500, cursor: { x: 300, y: 260, clicking: false }, palettePhase: 0 },
      { durationMs: 1300, cursor: { x: 260, y: 360, clicking: false }, palettePhase: 0 },
    ],
  },
]

const SCENE_DURATIONS = SCENES.map((s) => s.phases.reduce((acc, p) => acc + p.durationMs, 0) + 400)

type CursorState = { x: number; y: number; clicking: boolean }

const SECTION_BG = "#EDE6E2"
const SHELL = "max-w-[min(100%,92rem)] mx-auto px-3 sm:px-3 md:px-4 lg:px-3 xl:px-5 2xl:px-6"
const NOTCH_H = 52

// ── PreviewCarousel ───────────────────────────────────────────────────────────

export function PreviewCarousel() {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [phase, setPhase] = useState(0)
  const [cursor, setCursor] = useState<CursorState>({ x: 200, y: 100, clicking: false })
  const [palettePhase, setPalettePhase] = useState(0)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const sceneIndexRef = useRef(0)
  const isMobile = useIsMobile()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const stripRef = useRef<HTMLDivElement>(null)

  // On mobile: slide the tab strip so the active tab is centered in the concave
  useEffect(() => {
    if (!isMobile) {
      if (stripRef.current) stripRef.current.style.transform = ""
      return
    }
    const strip = stripRef.current
    const activeEl = tabRefs.current[sceneIndex]
    if (!strip || !activeEl) return
    const parentW = (strip.parentElement?.offsetWidth ?? 0)
    const translateX = parentW / 2 - activeEl.offsetLeft - activeEl.offsetWidth / 2
    strip.style.transform = `translateX(${translateX}px)`
  }, [sceneIndex, isMobile])

  useEffect(() => { sceneIndexRef.current = sceneIndex }, [sceneIndex])

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }, [])

  const scheduleScene = useCallback(
    (sIdx: number) => {
      clearAllTimeouts()
      const scene = SCENES[sIdx]
      setPhase(0)
      setCursor(scene.phases[0].cursor)
      setPalettePhase(scene.phases[0].palettePhase)

      let cumulative = 0
      scene.phases.forEach((p, i) => {
        if (i === 0) return
        cumulative += scene.phases[i - 1].durationMs
        const t = setTimeout(() => {
          setPhase(i)
          setCursor(p.cursor)
          setPalettePhase(p.palettePhase)
        }, cumulative)
        timeoutsRef.current.push(t)
      })

      const totalDuration = scene.phases.reduce((acc, p) => acc + p.durationMs, 0)
      const tAdvance = setTimeout(() => {
        setSceneIndex((prev) => (prev + 1) % SCENES.length)
      }, totalDuration + 400)
      timeoutsRef.current.push(tAdvance)
    },
    [clearAllTimeouts]
  )

  useEffect(() => {
    scheduleScene(sceneIndex)
    return () => { clearAllTimeouts() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex])

  const scene = SCENES[sceneIndex]
  const logoColor = scene.id === "branding" && phase < 2 ? "#64748b" : "#069668"

  const renderScene = () => {
    switch (scene.id) {
      case "palette":    return <SceneCommandPalette phase={phase} />
      case "branding":   return <SceneFirmBranding phase={phase} />
      case "client":     return <SceneCreateClient phase={phase} />
      case "contact":    return <SceneCreateContact phase={phase} />
      case "engagement": return <SceneEngagementAndShare phase={phase} />
      case "wrap":       return <SceneWrapEngagement phase={phase} />
      case "analytics":  return <SceneAnalytics phase={phase} />
      default:           return null
    }
  }

  return (
    <>
      {/* ── CONCAVE TOP NOTCH ───────────────────────────────────────────────────
          SVG draws two EDE6E2 shoulders (0–30% and 70–100%) with smooth bezier
          curves at their inner edges. The center 30–70% is open, showing the
          page background — the tab pill sits in that carved-out space.
      ─────────────────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: NOTCH_H }}>
        <svg
          width="100%"
          height={NOTCH_H}
          viewBox="0 0 1000 52"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, display: "block", pointerEvents: "none" }}
          aria-hidden
        >
          <path d="M0,0 L238,0 Q250,0 250,12 Q250,52 274,52 L0,52 Z" fill={SECTION_BG} />
          <path d="M1000,0 L762,0 Q750,0 750,12 Q750,52 726,52 L1000,52 Z" fill={SECTION_BG} />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: 16,
            zIndex: 1,
          }}
        >
          {/* Tab strip — on mobile slides so active tab stays centered in concave */}
          <div
            style={{
              width: "100%",
              overflow: "hidden",
              padding: "6px 0 0",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              ref={stripRef}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: isMobile ? "flex-start" : "space-evenly",
                width: isMobile ? "max-content" : "100%",
                transition: "transform 0.45s cubic-bezier(0.22,1,0.36,1)",
                willChange: "transform",
              }}
            >
              {SCENES.map((s, i) => {
                const isActive = i === sceneIndex
                return (
                  <button
                    key={s.id}
                    ref={(el) => { tabRefs.current[i] = el }}
                    onClick={() => {
                      if (i === sceneIndex) scheduleScene(i)
                      else setSceneIndex(i)
                    }}
                    style={{
                      position: "relative",
                      borderRadius: 999,
                      padding: isMobile ? "9px 16px" : "9px 28px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: isActive ? "#1a1a1a" : (isMobile ? "rgba(0,0,0,0.35)" : "#71717a"),
                      fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                      fontSize: isMobile ? 13 : 14,
                      fontWeight: isActive ? 500 : 400,
                      whiteSpace: "nowrap",
                      letterSpacing: "0em",
                      lineHeight: 1.4,
                      opacity: isMobile && !isActive ? 0.4 : 1,
                      transition: "color 0.3s ease, opacity 0.3s ease",
                      flexShrink: 0,
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="tab-pill"
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "#EFEFEF",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 35 }}
                      >
                        <div
                          key={sceneIndex}
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "#C8C0BC",
                            borderRadius: 999,
                            transformOrigin: "left center",
                            animationName: "tab-fill-progress",
                            animationDuration: `${SCENE_DURATIONS[sceneIndex]}ms`,
                            animationTimingFunction: "linear",
                            animationFillMode: "forwards",
                          }}
                        />
                      </motion.div>
                    )}
                    <span style={{ position: "relative", zIndex: 1 }}>{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTAINER ─────────────────────────────────────────────────────
          Full-width EDE6E2 band. Browser frame constrained to shell width.
      ─────────────────────────────────────────────────────────────────────── */}
      <div style={{ width: "100%", background: SECTION_BG, paddingTop: 56, paddingBottom: 56 }}>
        <div className={SHELL}>
          {/* Stacked-card 3D effect: ghost layers behind the main browser */}
          <div style={{ position: "relative", width: "100%", height: 540 }}>
            {/* Ghost card 2 — furthest back */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              background: "rgba(255,255,255,0.45)",
              border: "1px solid rgba(0,0,0,0.07)",
              transform: "translate(-24px, -24px)",
              zIndex: 0,
            }} />
            {/* Ghost card 1 — middle */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              background: "rgba(255,255,255,0.65)",
              border: "1px solid rgba(0,0,0,0.08)",
              transform: "translate(-12px, -12px)",
              zIndex: 1,
            }} />
          {/* Gradient border wrapper: gradient bg shows through as the 2px border ring */}
          <div style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            height: 540,
            borderRadius: 14,
            padding: 2,
            background: "rgba(255,255,255,0.75)",
            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.04)) drop-shadow(0 12px 32px rgba(0,0,0,0.10)) drop-shadow(0 32px 64px rgba(0,0,0,0.07))",
          }}>
            <div style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }}>
            <AppFrame
              activeNav={scene.nav}
              activeUrl={scene.url}
              logoColor={logoColor}
              palettePhase={palettePhase}
            >
              <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={scene.id}
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -40, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: "100%", position: "absolute", inset: 0 }}
                  >
                    {renderScene()}
                  </motion.div>
                </AnimatePresence>
                <CarouselCursor x={cursor.x} y={cursor.y} clicking={cursor.clicking} />
              </div>
            </AppFrame>
            </div>
          </div>
          </div>{/* end stacked-card wrapper */}
        </div>
      </div>
      <style>{`
        @keyframes tab-fill-progress {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </>
  )
}
