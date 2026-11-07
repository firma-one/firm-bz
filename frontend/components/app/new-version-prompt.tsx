'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/toast'

/** The build this page's JavaScript came from; inlined by `npm run build`. Unset in `next dev`. */
const LOADED_VERSION = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP

/** How often an open tab asks, besides whenever it comes back into view. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000

/** "Failed to find Server Action", Next's error when old JavaScript calls a newer server. */
const isStaleActionError = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
    return /server action/i.test(message) && /not found|failed to find/i.test(message)
}

/**
 * Offers a reload when a new version is deployed while this tab is open. A deploy no longer signs
 * anyone out, so a tab can outlive its code; its calls to the new server may fail until it reloads.
 * Asks GET /api/version when the tab comes back into view, every 10 minutes, and at once when a
 * call fails the way stale code does. Shows the prompt once per new version.
 */
export function NewVersionPrompt() {
    const { addToast } = useToast()
    const promptedForRef = useRef<string | null>(null)

    useEffect(() => {
        if (!LOADED_VERSION) return
        let checking = false

        const check = async () => {
            if (checking || document.visibilityState !== 'visible') return
            checking = true
            try {
                const res = await fetch('/api/version', { cache: 'no-store' })
                if (!res.ok) return
                const { version } = (await res.json()) as { version: string | null }
                if (!version || version === LOADED_VERSION || promptedForRef.current === version) return
                promptedForRef.current = version
                addToast({
                    type: 'info',
                    title: 'A new version of firmä is available',
                    message: 'Reload to get the latest. You stay signed in.',
                    duration: 24 * 60 * 60 * 1000,
                    action: { label: 'Reload', onClick: () => window.location.reload() },
                })
            } catch {
                // Offline or mid-deploy: the next check tries again.
            } finally {
                checking = false
            }
        }

        const onVisible = () => { void check() }
        const onRejection = (e: PromiseRejectionEvent) => { if (isStaleActionError(e.reason)) void check() }
        const onError = (e: ErrorEvent) => { if (isStaleActionError(e.error ?? e.message)) void check() }

        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('unhandledrejection', onRejection)
        window.addEventListener('error', onError)
        const timer = window.setInterval(onVisible, CHECK_INTERVAL_MS)
        return () => {
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('unhandledrejection', onRejection)
            window.removeEventListener('error', onError)
            window.clearInterval(timer)
        }
    }, [addToast])

    return null
}
