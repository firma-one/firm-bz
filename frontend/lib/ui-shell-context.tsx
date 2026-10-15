"use client"

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import { applyUiShell, type UiShell } from '@/lib/ui-shell'

type UiShellContextValue = { shell: UiShell; sidebarCollapsed: boolean }

const UiShellContext = createContext<UiShellContextValue>({ shell: 'v1', sidebarCollapsed: false })

/**
 * Provides the signed-in user's UI shell to the `/d` tree and keeps <html data-ui> plus the mirror
 * cookie in step with the server value. Clears the attribute when the `/d` tree unmounts, so a
 * client-side navigation out to marketing pages never carries v2 tokens with it.
 */
export function UiShellProvider({
    shell,
    sidebarCollapsed = false,
    children,
}: {
    shell: UiShell
    /** Server value of uiPrefs.sidebarCollapsed — the New UI sidebar's initial state. */
    sidebarCollapsed?: boolean
    children: ReactNode
}) {
    useLayoutEffect(() => {
        applyUiShell(shell)
        return () => {
            delete document.documentElement.dataset.ui
        }
    }, [shell])

    return <UiShellContext.Provider value={{ shell, sidebarCollapsed }}>{children}</UiShellContext.Provider>
}

/** Defaults to `v1` outside the `/d` tree. */
export function useUiShell(): UiShell {
    return useContext(UiShellContext).shell
}

/** Server-side UI preferences for the New UI shell. */
export function useUiPrefs(): UiShellContextValue {
    return useContext(UiShellContext)
}
