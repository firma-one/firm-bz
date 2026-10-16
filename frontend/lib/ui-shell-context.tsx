"use client"

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import { applyNewUi, clearNewUi } from '@/lib/ui-shell'

type UiPrefsContextValue = { sidebarCollapsed: boolean }

const UiPrefsContext = createContext<UiPrefsContextValue>({ sidebarCollapsed: false })

/**
 * Marks <html> as New UI while the `/d` tree is mounted (see lib/ui-shell.ts) and provides the
 * signed-in user's server-side UI preferences to it.
 */
export function UiShellProvider({
    sidebarCollapsed = false,
    children,
}: {
    /** Server value of uiPrefs.sidebarCollapsed — the sidebar's initial state. */
    sidebarCollapsed?: boolean
    children: ReactNode
}) {
    useLayoutEffect(() => {
        applyNewUi()
        return clearNewUi
    }, [])

    return <UiPrefsContext.Provider value={{ sidebarCollapsed }}>{children}</UiPrefsContext.Provider>
}

/** Server-side UI preferences for the shell. */
export function useUiPrefs(): UiPrefsContextValue {
    return useContext(UiPrefsContext)
}
