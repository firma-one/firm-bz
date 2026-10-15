"use client"

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import { applyUiShell, type UiShell } from '@/lib/ui-shell'

const UiShellContext = createContext<UiShell>('v1')

/**
 * Provides the signed-in user's UI shell to the `/d` tree and keeps <html data-ui> plus the mirror
 * cookie in step with the server value. Clears the attribute when the `/d` tree unmounts, so a
 * client-side navigation out to marketing pages never carries v2 tokens with it.
 */
export function UiShellProvider({ shell, children }: { shell: UiShell; children: ReactNode }) {
    useLayoutEffect(() => {
        applyUiShell(shell)
        return () => {
            delete document.documentElement.dataset.ui
        }
    }, [shell])

    return <UiShellContext.Provider value={shell}>{children}</UiShellContext.Provider>
}

/** Defaults to `v1` outside the `/d` tree. */
export function useUiShell(): UiShell {
    return useContext(UiShellContext)
}
