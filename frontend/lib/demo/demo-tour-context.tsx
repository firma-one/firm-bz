'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

const TOUR_KEY = 'fm_demo_tour'

interface TourState {
    stepIndex?: number
}

function readTourState(): TourState {
    if (typeof window === 'undefined') return {}
    try {
        const raw = window.localStorage.getItem(TOUR_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
        return {}
    }
}

function writeTourState(patch: Partial<TourState>): void {
    if (typeof window === 'undefined') return
    try {
        const current = readTourState()
        window.localStorage.setItem(TOUR_KEY, JSON.stringify({ ...current, ...patch }))
    } catch {
        /* ignore */
    }
}

function saveTourProgress(stepIndex: number): void {
    writeTourState({ stepIndex })
}

function loadTourProgress(): number | null {
    const { stepIndex } = readTourState()
    return typeof stepIndex === 'number' && stepIndex > 0 ? stepIndex : null
}

function clearTourProgress(): void {
    writeTourState({ stepIndex: undefined })
}

interface DemoTourContextValue {
    run: boolean
    stepIndex: number
    showIntroModal: boolean
    showOutroModal: boolean
    /** True once the visitor has finished the tour at least once — drives the topbar Sign Up CTA after the outro modal is dismissed. */
    hasCompletedTour: boolean
    /** Non-null when there's a saved mid-tour position the visitor can resume, persisted in localStorage. */
    resumableStepIndex: number | null
    openIntroModal: () => void
    closeIntroModal: () => void
    startTour: () => void
    /** Resume from the saved step index. */
    resumeTour: () => void
    restartTour: () => void
    endTour: (completed?: boolean) => void
    setStepIndex: (i: number) => void
    setRun: (v: boolean) => void
    /** Persist the current step so the tour can be resumed if abandoned mid-way. */
    saveProgress: (stepIndex: number) => void
}

const DemoTourContext = createContext<DemoTourContextValue | null>(null)

/** Lightweight counterpart to lib/demo-tour-context.tsx — local React state, with mid-tour
 * progress persisted to localStorage (same key/shape convention) so a visitor who navigates
 * away or closes the tour can resume from the intro modal next time, matching the real app. */
export function DemoTourProvider({ children }: { children: ReactNode }) {
    const [run, setRun] = useState(false)
    const [stepIndex, setStepIndex] = useState(0)
    const [showIntroModal, setShowIntroModal] = useState(false)
    const [showOutroModal, setShowOutroModal] = useState(false)
    const [hasCompletedTour, setHasCompletedTour] = useState(false)
    const [resumableStepIndex, setResumableStepIndex] = useState<number | null>(null)

    const openIntroModal = () => {
        setResumableStepIndex(loadTourProgress())
        setShowIntroModal(true)
    }
    const closeIntroModal = () => setShowIntroModal(false)

    const startTour = () => {
        setShowIntroModal(false)
        setStepIndex(0)
        clearTourProgress()
        setResumableStepIndex(null)
        setRun(true)
    }

    const resumeTour = () => {
        if (resumableStepIndex === null) return
        setShowIntroModal(false)
        setStepIndex(resumableStepIndex)
        setResumableStepIndex(null)
        setRun(true)
    }

    const restartTour = () => {
        setRun(false)
        setShowOutroModal(false)
        openIntroModal()
    }

    const endTour = (completed?: boolean) => {
        setRun(false)
        setShowOutroModal(!!completed)
        if (completed) {
            setHasCompletedTour(true)
            clearTourProgress()
            setResumableStepIndex(null)
        }
    }

    const saveProgress = (i: number) => saveTourProgress(i)

    return (
        <DemoTourContext.Provider
            value={{
                run, stepIndex, showIntroModal, showOutroModal, hasCompletedTour, resumableStepIndex,
                openIntroModal, closeIntroModal, startTour, resumeTour, restartTour, endTour, setStepIndex, setRun, saveProgress,
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
