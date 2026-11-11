'use client'

import { createContext, useContext } from 'react'
import type { AnalyticsMode } from '@/lib/analytics-zone'

/**
 * The visitor's analytics zone, decided once on the server from their country (lib/analytics-zone.ts)
 * and read by the cookie banner, the GA loader and the tour. Defaults to the opt-in banner, so
 * anything rendered outside the provider keeps today's behavior.
 */
const AnalyticsModeContext = createContext<AnalyticsMode>('consent')

export function AnalyticsModeProvider({ mode, children }: { mode: AnalyticsMode; children: React.ReactNode }) {
    return <AnalyticsModeContext.Provider value={mode}>{children}</AnalyticsModeContext.Provider>
}

export function useAnalyticsMode(): AnalyticsMode {
    return useContext(AnalyticsModeContext)
}
