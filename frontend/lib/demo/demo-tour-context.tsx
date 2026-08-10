'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface DemoTourContextValue {
    run: boolean
    stepIndex: number
    showIntroModal: boolean
    showOutroModal: boolean
    openIntroModal: () => void
    closeIntroModal: () => void
    startTour: () => void
    restartTour: () => void
    endTour: (completed?: boolean) => void
    setStepIndex: (i: number) => void
    setRun: (v: boolean) => void
}

const DemoTourContext = createContext<DemoTourContextValue | null>(null)

/** Lightweight counterpart to lib/demo-tour-context.tsx — local React state only, no localStorage
 * persistence or slug resolution needed since the demo firm/route tree is fixed and static. */
export function DemoTourProvider({ children }: { children: ReactNode }) {
    const [run, setRun] = useState(false)
    const [stepIndex, setStepIndex] = useState(0)
    const [showIntroModal, setShowIntroModal] = useState(false)
    const [showOutroModal, setShowOutroModal] = useState(false)

    const openIntroModal = () => setShowIntroModal(true)
    const closeIntroModal = () => setShowIntroModal(false)

    const startTour = () => {
        setShowIntroModal(false)
        setStepIndex(0)
        setRun(true)
    }

    const restartTour = () => {
        setRun(false)
        setShowOutroModal(false)
        setShowIntroModal(true)
    }

    const endTour = (completed?: boolean) => {
        setRun(false)
        setShowOutroModal(!!completed)
    }

    return (
        <DemoTourContext.Provider
            value={{ run, stepIndex, showIntroModal, showOutroModal, openIntroModal, closeIntroModal, startTour, restartTour, endTour, setStepIndex, setRun }}
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
