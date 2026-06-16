"use client"

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react"

const TOUR_KEY = "fm_demo_tour"

interface TourState {
  seen: boolean
  stepIndex?: number
  firmSlug?: string
}

function readTourState(): TourState {
  if (typeof window === "undefined") return { seen: false }
  try {
    const raw = window.localStorage.getItem(TOUR_KEY)
    if (!raw) return { seen: false }
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? parsed : { seen: false }
  } catch { return { seen: false } }
}

function writeTourState(patch: Partial<TourState>): void {
  if (typeof window === "undefined") return
  try {
    const current = readTourState()
    window.localStorage.setItem(TOUR_KEY, JSON.stringify({ ...current, ...patch }))
  } catch { /* ignore */ }
}

export function saveTourProgress(stepIndex: number, firmSlug: string): void {
  writeTourState({ stepIndex, firmSlug })
}

export function loadTourProgress(): { stepIndex: number; firmSlug: string } | null {
  const state = readTourState()
  if (typeof state.stepIndex === "number" && state.stepIndex > 0 && typeof state.firmSlug === "string") {
    return { stepIndex: state.stepIndex, firmSlug: state.firmSlug }
  }
  return null
}

export function clearTourProgress(): void {
  writeTourState({ stepIndex: undefined, firmSlug: undefined })
}

export function readDemoTourSeen(): boolean {
  if (typeof window === "undefined") return true
  return readTourState().seen === true
}

export function markDemoTourSeen(): void {
  writeTourState({ seen: true })
}

export function clearDemoTourSeen(): void {
  writeTourState({ seen: false })
}

export interface DemoTourSlugs {
  firmSlug: string
  clientSlug: string | null
  engagementSlug: string | null
}

interface DemoTourContextValue {
  run: boolean
  stepIndex: number
  slugs: DemoTourSlugs | null
  showIntroModal: boolean
  showOutroModal: boolean
  /** Non-null when there is a saved mid-tour position the user can resume */
  resumableTourProgress: { stepIndex: number; firmSlug: string } | null
  setRun: (v: boolean) => void
  setStepIndex: (v: number) => void
  /** Open intro modal — resolves slugs from the current demo firm */
  openIntroModal: (firmSlug: string) => Promise<void>
  closeIntroModal: () => void
  closeOutroModal: () => void
  /** Called by the "Start Tour" button in the intro modal */
  startTour: () => void
  /** Resume from a previously saved step index */
  resumeTour: (stepIndex: number) => void
  /** Called by the floating restart button */
  restartTour: (firmSlug: string) => Promise<void>
  endTour: (completed?: boolean) => void
}

const DemoTourContext = createContext<DemoTourContextValue | null>(null)

export function useDemoTour() {
  const ctx = useContext(DemoTourContext)
  if (!ctx) throw new Error("useDemoTour must be used inside DemoTourProvider")
  return ctx
}

async function resolveFirstClientAndEngagement(firmSlug: string): Promise<{ clientSlug: string | null; engagementSlug: string | null }> {
  try {
    const res = await fetch(`/api/hierarchy?firmSlug=${encodeURIComponent(firmSlug)}`)
    if (!res.ok) return { clientSlug: null, engagementSlug: null }
    const data = await res.json()
    const clients: Array<{ slug: string; engagements: Array<{ slug: string }> }> = data.clients ?? []
    const firstClient = clients[0] ?? null
    const firstEngagement = firstClient?.engagements?.[0] ?? null
    return { clientSlug: firstClient?.slug ?? null, engagementSlug: firstEngagement?.slug ?? null }
  } catch {
    return { clientSlug: null, engagementSlug: null }
  }
}

export function DemoTourProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndexState] = useState(0)
  const [slugs, setSlugs] = useState<DemoTourSlugs | null>(null)
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [showOutroModal, setShowOutroModal] = useState(false)
  const [resumableTourProgress, setResumableTourProgress] = useState<{ stepIndex: number; firmSlug: string } | null>(() => loadTourProgress())
  const resolvingRef = useRef(false)

  const setStepIndex = useCallback((v: number) => {
    setStepIndexState(v)
  }, [])

  const openIntroModal = useCallback(async (firmSlug: string) => {
    if (resolvingRef.current) return
    resolvingRef.current = true
    try {
      const { clientSlug, engagementSlug } = await resolveFirstClientAndEngagement(firmSlug)
      setSlugs({ firmSlug, clientSlug, engagementSlug })
      setShowIntroModal(true)
    } finally {
      resolvingRef.current = false
    }
  }, [])

  const closeIntroModal = useCallback(() => {
    setShowIntroModal(false)
  }, [])

  const closeOutroModal = useCallback(() => {
    setShowOutroModal(false)
  }, [])

  const startTour = useCallback(() => {
    setShowIntroModal(false)
    setStepIndexState(0)
    clearTourProgress()
    setResumableTourProgress(null)
    setRun(true)
    if (typeof window !== "undefined") {
      ;(window as any).__demoTourActive = true
    }
  }, [])

  const resumeTour = useCallback((fromStepIndex: number) => {
    setShowIntroModal(false)
    setStepIndexState(fromStepIndex)
    setResumableTourProgress(null)
    setRun(true)
    if (typeof window !== "undefined") {
      ;(window as any).__demoTourActive = true
    }
  }, [])

  const restartTour = useCallback(async (firmSlug: string) => {
    setRun(false)
    clearTourProgress()
    setResumableTourProgress(null)
    await openIntroModal(firmSlug)
  }, [openIntroModal])

  const endTour = useCallback((completed = false) => {
    setRun(false)
    markDemoTourSeen()
    clearTourProgress()
    setResumableTourProgress(null)
    if (typeof window !== "undefined") {
      ;(window as any).__demoTourActive = false
    }
    if (completed) setShowOutroModal(true)
  }, [])

  return (
    <DemoTourContext.Provider value={{ run, stepIndex, slugs, showIntroModal, showOutroModal, resumableTourProgress, setRun, setStepIndex, openIntroModal, closeIntroModal, closeOutroModal, startTour, resumeTour, restartTour, endTour }}>
      {children}
    </DemoTourContext.Provider>
  )
}
