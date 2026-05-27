"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw, Play, Pause } from "lucide-react"
import { AppFrame } from "./AppFrame"
import { CarouselCursor } from "./CarouselCursor"
import { SceneFirmBranding } from "./scenes/SceneFirmBranding"
import { SceneCreateClient } from "./scenes/SceneCreateClient"
import { SceneCreateContact } from "./scenes/SceneCreateContact"
import { SceneEngagementAndShare } from "./scenes/SceneEngagementAndShare"
import { SceneAnalytics } from "./scenes/SceneAnalytics"

const SCENES = [
  {
    id: "branding",
    label: "Set up your firm",
    nav: "Settings" as const,
    url: "d/f/axiom/settings/branding",
    phases: [
      { durationMs: 700,  cursor: { x: 340, y: 22, clicking: false }, palettePhase: 0 },
      { durationMs: 900,  cursor: { x: 340, y: 22, clicking: true  }, palettePhase: 1 },
      { durationMs: 1200, cursor: { x: 340, y: 320, clicking: false }, palettePhase: 2 },
      { durationMs: 600,  cursor: { x: 340, y: 320, clicking: true  }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 220, y: 148, clicking: true  }, palettePhase: 0 },
      { durationMs: 1000, cursor: { x: 310, y: 248, clicking: true  }, palettePhase: 0 },
      { durationMs: 800,  cursor: { x: 260, y: 310, clicking: true  }, palettePhase: 0 },
      { durationMs: 1200, cursor: { x: 500, y: 380, clicking: false }, palettePhase: 0 },
    ],
  },
  {
    id: "client",
    label: "Deliver a premium client experience",
    nav: "Clients" as const,
    url: "d/f/axiom/clients",
    phases: [
      { durationMs: 700, cursor: { x: 340, y: 60, clicking: false } },
      { durationMs: 600, cursor: { x: 365, y: 60, clicking: true } },
      { durationMs: 800, cursor: { x: 260, y: 200, clicking: false } },
      { durationMs: 2000, cursor: { x: 260, y: 216, clicking: true } },
      { durationMs: 600, cursor: { x: 280, y: 290, clicking: true } },
      { durationMs: 1200, cursor: { x: 530, y: 250, clicking: false } },
    ],
  },
  {
    id: "contact",
    label: "Protect your intellectual property",
    nav: "Clients" as const,
    url: "d/f/axiom/clients/meridian/q3-review",
    phases: [
      { durationMs: 900, cursor: { x: 280, y: 160, clicking: false } },
      { durationMs: 700, cursor: { x: 310, y: 185, clicking: true } },
      { durationMs: 900, cursor: { x: 340, y: 215, clicking: true } },
      { durationMs: 1200, cursor: { x: 420, y: 185, clicking: true } },
      { durationMs: 1000, cursor: { x: 480, y: 185, clicking: false } },
    ],
  },
  {
    id: "engagement",
    label: "Know exactly who's seen what",
    nav: "Audit Log" as const,
    url: "d/f/axiom/audit",
    phases: [
      { durationMs: 700, cursor: { x: 300, y: 100, clicking: false } },
      { durationMs: 1200, cursor: { x: 300, y: 180, clicking: false } },
      { durationMs: 1300, cursor: { x: 300, y: 260, clicking: false } },
      { durationMs: 1200, cursor: { x: 300, y: 320, clicking: false } },
    ],
  },
  {
    id: "analytics",
    label: "Track everything",
    nav: "Analytics" as const,
    url: "d/f/axiom/analytics",
    phases: [
      { durationMs: 800, cursor: { x: 280, y: 80, clicking: false } },
      { durationMs: 1400, cursor: { x: 200, y: 180, clicking: false } },
      { durationMs: 1500, cursor: { x: 300, y: 260, clicking: false } },
      { durationMs: 1300, cursor: { x: 260, y: 360, clicking: false } },
    ],
  },
]

// Pre-compute scene durations and cumulative boundaries
const SCENE_DURATIONS = SCENES.map((s) => s.phases.reduce((acc, p) => acc + p.durationMs, 0) + 400)
const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0)
const SCENE_BOUNDARIES = SCENE_DURATIONS.reduce<number[]>((acc, dur, i) => {
  if (i === 0) return [0]
  acc.push(acc[i - 1] + (SCENE_DURATIONS[i - 1] / TOTAL_DURATION) * 100)
  return acc
}, [])

type CursorState = { x: number; y: number; clicking: boolean }

export function AppCarousel() {
  const [sceneIndex, setSceneIndex] = useState(0)
  const [phase, setPhase] = useState(0)
  const [cursor, setCursor] = useState<CursorState>({ x: 200, y: 100, clicking: false })
  const [palettePhase, setPalettePhase] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Refs for stale-closure-safe reads inside callbacks
  const elapsedMsRef = useRef(0)
  const sceneIndexRef = useRef(0)
  const playingRef = useRef(true)

  // Keep refs in sync
  useEffect(() => { sceneIndexRef.current = sceneIndex }, [sceneIndex])
  useEffect(() => { playingRef.current = playing }, [playing])

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }, [])

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }, [])

  const startTick = useCallback(() => {
    stopTick()
    tickRef.current = setInterval(() => {
      elapsedMsRef.current += 100
      setElapsedMs(elapsedMsRef.current)
    }, 100)
  }, [stopTick])

  /** Start a scene fresh from phase 0 */
  const scheduleScene = useCallback(
    (sIdx: number) => {
      clearAllTimeouts()
      elapsedMsRef.current = 0
      setElapsedMs(0)
      const scene = SCENES[sIdx]
      setPhase(0)
      setCursor(scene.phases[0].cursor)
      setPalettePhase((scene.phases[0] as any).palettePhase ?? 0)

      startTick()
      let cumulative = 0
      scene.phases.forEach((p, i) => {
        if (i === 0) return
        cumulative += scene.phases[i - 1].durationMs
        const t = setTimeout(() => {
          setPhase(i)
          setCursor(p.cursor)
          setPalettePhase((p as any).palettePhase ?? 0)
        }, cumulative)
        timeoutsRef.current.push(t)
      })

      const totalDuration = scene.phases.reduce((acc, p) => acc + p.durationMs, 0)
      const tAdvance = setTimeout(() => {
        setSceneIndex((prev) => (prev + 1) % SCENES.length)
      }, totalDuration + 400)
      timeoutsRef.current.push(tAdvance)
    },
    [clearAllTimeouts, startTick]
  )

  /** Resume current scene from wherever elapsedMs currently is */
  const resumeScene = useCallback(() => {
    clearAllTimeouts()
    const sIdx = sceneIndexRef.current
    const fromMs = elapsedMsRef.current
    const scene = SCENES[sIdx]

    // Build phase start-time timeline
    const phaseTimes: number[] = []
    let acc = 0
    scene.phases.forEach((p) => { phaseTimes.push(acc); acc += p.durationMs })

    // Schedule only the transitions that haven't happened yet
    scene.phases.forEach((p, i) => {
      if (i === 0) return
      const delay = phaseTimes[i] - fromMs
      if (delay <= 0) return
      const t = setTimeout(() => {
        setPhase(i)
        setCursor(p.cursor)
        setPalettePhase((p as any).palettePhase ?? 0)
      }, delay)
      timeoutsRef.current.push(t)
    })

    // Scene-advance at the remaining time
    const totalDuration = scene.phases.reduce((a, p) => a + p.durationMs, 0)
    const remaining = totalDuration + 400 - fromMs
    if (remaining > 0) {
      const tAdvance = setTimeout(() => {
        setSceneIndex((prev) => (prev + 1) % SCENES.length)
      }, remaining)
      timeoutsRef.current.push(tAdvance)
    }

    startTick()
  }, [clearAllTimeouts, startTick])

  // Scene change → always start fresh
  useEffect(() => {
    scheduleScene(sceneIndex)
    return () => { clearAllTimeouts(); stopTick() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneIndex])

  // Play/pause toggle — resume from current position, never restart
  const isFirstPlayRender = useRef(true)
  useEffect(() => {
    if (isFirstPlayRender.current) { isFirstPlayRender.current = false; return }
    if (playing) {
      resumeScene()
    } else {
      clearAllTimeouts()
      stopTick()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const scene = SCENES[sceneIndex]

  // Smooth progress percentage
  const completedMs = SCENE_DURATIONS.slice(0, sceneIndex).reduce((a, b) => a + b, 0)
  const sceneDur = SCENE_DURATIONS[sceneIndex]
  const sceneProgress = Math.min(elapsedMs / sceneDur, 1)
  const progress = ((completedMs + sceneProgress * sceneDur) / TOTAL_DURATION) * 100

  const logoColor =
    sceneIndex === 0 && phase >= 4 ? "#069668" : sceneIndex === 0 && phase < 4 ? "#64748b" : "#069668"

  const renderScene = () => {
    switch (scene.id) {
      case "branding":   return <SceneFirmBranding phase={phase} />
      case "client":     return <SceneCreateClient phase={phase} />
      case "contact":    return <SceneCreateContact phase={phase} />
      case "engagement": return <SceneEngagementAndShare phase={phase} />
      case "analytics":  return <SceneAnalytics phase={phase} />
      default:           return null
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {/* Browser frame */}
      <div
        style={{
          width: "100%",
          height: 560,
          position: "relative",
          borderRadius: "12px 12px 0 0",
          boxShadow: "0 24px 60px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid rgba(0,0,0,0.07)",
          borderBottom: "none",
        }}
      >
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

      {/* Video player bar */}
      <div
        style={{
          width: "100%",
          background: "#36383d",
          borderRadius: "0 0 12px 12px",
          border: "1px solid rgba(0,0,0,0.07)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "0 14px",
          height: 38,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* Restart */}
        <button
          onClick={() => {
            setPlaying(true)
            playingRef.current = true
            if (sceneIndex === 0) {
              scheduleScene(0)
            } else {
              setSceneIndex(0)
            }
          }}
          style={{ background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex", alignItems: "center", color: "rgba(255,255,255,0.5)", borderRadius: 2, flexShrink: 0 }}
        >
          <RotateCcw size={12} strokeWidth={2} />
        </button>

        {/* Play / Pause */}
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{ background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex", alignItems: "center", color: "rgba(255,255,255,0.9)", borderRadius: 2, flexShrink: 0 }}
        >
          {playing ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>

        {/* Progress track */}
        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2, position: "relative", cursor: "pointer" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            const targetMs = pct * TOTAL_DURATION
            let acc = 0
            for (let i = 0; i < SCENE_DURATIONS.length; i++) {
              if (acc + SCENE_DURATIONS[i] > targetMs) {
                setPlaying(true)
                playingRef.current = true
                if (i === sceneIndex) {
                  scheduleScene(i)
                } else {
                  setSceneIndex(i)
                }
                return
              }
              acc += SCENE_DURATIONS[i]
            }
          }}
        >
          {/* Scene boundary ticks */}
          {SCENE_BOUNDARIES.slice(1).map((pct, i) => (
            <div
              key={i}
              style={{
                position: "absolute", left: `${pct}%`, top: -2,
                width: 1, height: 7, background: "rgba(255,255,255,0.25)",
                transform: "translateX(-0.5px)",
              }}
            />
          ))}
          {/* Fill */}
          <div
            style={{
              height: "100%", background: "#069668", borderRadius: 2,
              width: `${progress}%`,
              transition: "width 0.1s linear",
            }}
          />
          {/* Playhead dot */}
          <div
            style={{
              position: "absolute", top: "50%", left: `${progress}%`,
              width: 9, height: 9, borderRadius: "50%",
              background: "#ffffff",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 4px rgba(0,0,0,0.4)",
              transition: "left 0.1s linear",
            }}
          />
        </div>

        {/* Scene label */}
        <AnimatePresence mode="wait">
          <motion.span
            key={scene.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            style={{
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 11, color: "rgba(255,255,255,0.55)",
              whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
              flexShrink: 0,
            }}
          >
            {scene.label}
          </motion.span>
        </AnimatePresence>

        {/* Counter */}
        <span
          style={{
            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
            fontSize: 10, color: "rgba(255,255,255,0.3)",
            whiteSpace: "nowrap", flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sceneIndex + 1} / {SCENES.length}
        </span>
      </div>
    </div>
  )
}
