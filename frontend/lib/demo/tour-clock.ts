'use client'

import { useSyncExternalStore } from 'react'

/**
 * Autoplay's clock for the current step, as a fraction from 0 to 1, shared outside React state:
 * the step card (demo-tour.tsx) sets it as the step's time runs, and only what reads it re-renders
 * (the tour panel's progress ring), not the tour, whose steps feed Joyride. 0 outside Autoplay.
 */
let stepProgress = 0
const listeners = new Set<() => void>()

export function setStepProgress(next: number): void {
    if (next === stepProgress) return
    stepProgress = next
    listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useStepProgress(): number {
    return useSyncExternalStore(subscribe, () => stepProgress, () => 0)
}
