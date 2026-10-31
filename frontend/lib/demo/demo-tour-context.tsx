'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_TOUR_MODE, NARRATION_PARAM, isTourNodeId, parseModeParam, type TourMode, type TourNodeId } from '@/lib/demo/tour-chapters'
import { NARRATION_STORAGE_KEY } from '@/lib/demo/tour-narration'

const TOUR_KEY = 'fm_demo_tour'
const NEVER_SHOW_KEY = 'fm_demo_tour_never_show'
const MODE_KEY = 'fm_demo_tour_mode'

/** The mode the visitor last picked, or Autoplay. */
function loadMode(): TourMode {
    if (typeof window === 'undefined') return DEFAULT_TOUR_MODE
    try {
        return parseModeParam(window.localStorage.getItem(MODE_KEY)) ?? DEFAULT_TOUR_MODE
    } catch {
        return DEFAULT_TOUR_MODE
    }
}

/** Where an unfinished run stopped: its scope (a chapter or section; null for the whole tour) and its step in that run. */
export interface TourResume {
    scope: TourNodeId | null
    step: number
}

/** What's kept in localStorage. An older `stepIndex` field indexed the flat tour before chapters and is ignored. */
interface TourState {
    resume?: TourResume
    /** The chapters and sections whose own steps were all seen, in any kind of run. */
    completed?: TourNodeId[]
}

export function hasOptedOutOfTour(): boolean {
    if (typeof window === 'undefined') return false
    try {
        return window.localStorage.getItem(NEVER_SHOW_KEY) === '1'
    } catch {
        return false
    }
}

function setNeverShowAgain(): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(NEVER_SHOW_KEY, '1')
    } catch {
        /* ignore */
    }
}

function readTourState(): TourState {
    if (typeof window === 'undefined') return {}
    try {
        const raw = window.localStorage.getItem(TOUR_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return {}
        const { resume, completed } = parsed as Record<string, unknown>
        const state: TourState = {}
        if (resume && typeof resume === 'object') {
            const { scope, step } = resume as Record<string, unknown>
            if ((scope === null || isTourNodeId(scope)) && typeof step === 'number') state.resume = { scope, step }
        }
        if (Array.isArray(completed)) state.completed = completed.filter(isTourNodeId)
        return state
    } catch {
        return {}
    }
}

function writeTourState(patch: Partial<TourState>): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(TOUR_KEY, JSON.stringify({ ...readTourState(), ...patch }))
    } catch {
        /* ignore */
    }
}

/** A saved position worth offering: past the first step of its run. */
function loadResume(): TourResume | null {
    const { resume } = readTourState()
    return resume && resume.step > 0 ? resume : null
}

interface DemoTourContextValue {
    /** Autopilot, Guided or Explore (lib/demo/tour-chapters.ts). */
    mode: TourMode
    /** Switches mode, mid-run too: into Explore the step card goes; out of it, the run shows from where the visitor is. */
    setMode: (mode: TourMode) => void
    /** Autoplay held on the current step. */
    paused: boolean
    setPaused: (paused: boolean) => void
    /** The step cards read aloud in Brio's voice (lib/demo/tour-narration.ts): off until the visitor turns it on, then remembered. */
    narration: boolean
    setNarration: (on: boolean) => void
    run: boolean
    stepIndex: number
    /** The run's chapter or section, or null for the whole tour. */
    scope: TourNodeId | null
    /** True from a run's start to its end, including while it navigates between steps, and while exploring: the outline pane shows. */
    active: boolean
    /** Bumped each time a run starts, resumes or jumps: the tour navigates to the step's page, then runs. */
    launch: number
    showIntroModal: boolean
    showOutroModal: boolean
    /** The chapter or section just finished, while the panel shows its ending. */
    finishedNode: TourNodeId | null
    /** True once the visitor has finished the whole tour at least once — drives the topbar Sign Up CTA once the panel's ending is dismissed. */
    hasCompletedTour: boolean
    completedNodes: TourNodeId[]
    /** Non-null when there's a saved mid-run position the visitor can resume, persisted in localStorage. */
    resumable: TourResume | null
    openIntroModal: () => void
    closeIntroModal: (neverShowAgain?: boolean) => void
    /** The whole tour, from its first step, with nothing marked seen. */
    startTour: () => void
    /** One chapter or section, from its first step; in a mode of its own when a deep link names one. */
    startNode: (id: TourNodeId, mode?: TourMode) => void
    /** The same run, from another of its steps (the outline pane). */
    jumpToStep: (step: number) => void
    /** Resume from the saved position. */
    resumeTour: () => void
    restartTour: () => void
    /** Replay from the end of the whole tour: the start again, with nothing marked seen, so the panel's rings fill afresh on the second pass. */
    replayTour: () => void
    endTour: (completed?: boolean) => void
    closeNodeEnd: () => void
    markNodeDone: (id: TourNodeId) => void
    setStepIndex: (i: number) => void
    setRun: (v: boolean) => void
    /** Persist the current step so the run can be resumed if abandoned mid-way. */
    saveProgress: (stepIndex: number) => void
}

const DemoTourContext = createContext<DemoTourContextValue | null>(null)

/** The guided tour's state (.claude/plans/tour-chapters.md) — local React state, with an unfinished
 * run's position and the finished chapters and sections persisted to localStorage, so a visitor who
 * navigates away or closes the tour can resume from the intro modal next time. */
export function DemoTourProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<TourMode>(DEFAULT_TOUR_MODE)
    const [paused, setPaused] = useState(false)
    const [run, setRun] = useState(false)
    const [stepIndex, setStepIndex] = useState(0)
    const [scope, setScope] = useState<TourNodeId | null>(null)
    const [active, setActive] = useState(false)
    const [launch, setLaunch] = useState(0)
    const [showIntroModal, setShowIntroModal] = useState(false)
    const [showOutroModal, setShowOutroModal] = useState(false)
    const [finishedNode, setFinishedNode] = useState<TourNodeId | null>(null)
    const [hasCompletedTour, setHasCompletedTour] = useState(false)
    const [completedNodes, setCompletedNodes] = useState<TourNodeId[]>([])
    const [resumable, setResumable] = useState<TourResume | null>(null)
    const [narration, setNarrationState] = useState(false)

    // The saved mode and narration after mount, so the server and the visitor's first render agree.
    // A link that asks for narration (Hear Brio's "Take the tour") turns it on, and it's remembered.
    useEffect(() => {
        setModeState(loadMode())
        if (new URLSearchParams(window.location.search).get(NARRATION_PARAM) === 'on') {
            setNarration(true)
            return
        }
        try {
            setNarrationState(window.localStorage.getItem(NARRATION_STORAGE_KEY) === 'on')
        } catch {
            /* storage blocked: narration stays off */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setNarration = (on: boolean) => {
        setNarrationState(on)
        try {
            window.localStorage.setItem(NARRATION_STORAGE_KEY, on ? 'on' : 'off')
        } catch {
            /* ignore */
        }
    }

    const saveMode = (next: TourMode) => {
        setModeState(next)
        try {
            window.localStorage.setItem(MODE_KEY, next)
        } catch {
            /* ignore */
        }
    }

    const openIntroModal = () => {
        setResumable(loadResume())
        setCompletedNodes(readTourState().completed ?? [])
        setShowIntroModal(true)
    }
    const closeIntroModal = (neverShowAgain?: boolean) => {
        if (neverShowAgain) setNeverShowAgain()
        setShowIntroModal(false)
    }

    /** Starts a run; the tour (demo-tour.tsx) takes it to the step's page before it shows. */
    const begin = (next: TourNodeId | null, step: number) => {
        setRun(false)
        setShowIntroModal(false)
        setShowOutroModal(false)
        setFinishedNode(null)
        setCompletedNodes(readTourState().completed ?? [])
        setScope(next)
        setStepIndex(step)
        setActive(true)
        setPaused(false)
        setLaunch((n) => n + 1)
    }

    const setMode = (next: TourMode) => {
        if (next === mode) return
        saveMode(next)
        setPaused(false)
        if (!active) return
        // Into Explore the step card goes; out of it, the run shows again where the visitor is.
        if (next === 'explore') setRun(false)
        else if (mode === 'explore') begin(scope, stepIndex)
    }

    // The whole tour from its first step is a fresh pass, however it's started: nothing marked seen,
    // so the panel's rings fill again as it goes. Resume and a single chapter keep what's been seen.
    const startTour = () => {
        writeTourState({ resume: undefined, completed: [] })
        setResumable(null)
        begin(null, 0)
    }

    const startNode = (id: TourNodeId, linkMode?: TourMode) => {
        if (linkMode) saveMode(linkMode)
        writeTourState({ resume: undefined })
        setResumable(null)
        begin(id, 0)
    }

    const jumpToStep = (step: number) => begin(scope, step)

    const resumeTour = () => {
        if (resumable === null) return
        setResumable(null)
        begin(resumable.scope, resumable.step)
    }

    const restartTour = () => {
        setRun(false)
        setActive(false)
        setShowOutroModal(false)
        setFinishedNode(null)
        openIntroModal()
    }

    // "All chapters" and coming back keep what's been seen, to show what's left; Replay starts over,
    // its start panel already clear before the whole tour plays again.
    const replayTour = () => {
        writeTourState({ completed: [] })
        setCompletedNodes([])
        restartTour()
    }

    const markNodeDone = (id: TourNodeId) => {
        const done = readTourState().completed ?? []
        if (done.includes(id)) return
        const next = [...done, id]
        writeTourState({ completed: next })
        setCompletedNodes(next)
    }

    /** Completed: the panel shows the ending, of a chapter or section, or of the whole tour. */
    const endTour = (completed?: boolean) => {
        setRun(false)
        setActive(false)
        if (!completed) {
            setShowOutroModal(false)
            setFinishedNode(null)
            return
        }
        writeTourState({ resume: undefined })
        setResumable(null)
        if (scope) {
            setFinishedNode(scope)
        } else {
            setHasCompletedTour(true)
            setShowOutroModal(true)
        }
    }

    const closeNodeEnd = () => setFinishedNode(null)

    const saveProgress = (i: number) => writeTourState({ resume: { scope, step: i } })

    return (
        <DemoTourContext.Provider
            value={{
                mode, setMode, paused, setPaused, narration, setNarration, run, stepIndex, scope, active, launch, showIntroModal, showOutroModal, finishedNode, hasCompletedTour, completedNodes, resumable,
                openIntroModal, closeIntroModal, startTour, startNode, jumpToStep, resumeTour, restartTour, replayTour, endTour, closeNodeEnd, markNodeDone,
                setStepIndex, setRun, saveProgress,
            }}
        >
            {children}
        </DemoTourContext.Provider>
    )
}

export function useDemoTour(): DemoTourContextValue {
    const ctx = useContext(DemoTourContext)
    if (!ctx) throw new Error('useDemoTour must be used within DemoTourProvider')
    return ctx
}
