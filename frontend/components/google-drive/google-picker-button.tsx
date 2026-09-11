import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { SquarePlus } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/toast'
import useDrivePicker from 'react-google-drive-picker'
import { logger } from '@/lib/logger'
import { config } from "@/lib/config"

// MODULE-LEVEL SINGLETON, deliberately outside React state (2026-08-22).
//
// react-google-drive-picker's useDrivePicker() hook tracks Google's `gapi.load('picker', ...)`
// module-load completion as LOCAL per-hook-instance React state (`pickerApiLoaded`). Confirmed via
// live testing: when two GooglePickerButton instances exist close together in time (including
// React Strict Mode's dev-only double-invoke of a component's render function, which creates two
// competing useDrivePicker() calls for what is logically "one" button), Google's own `gapi.load`
// loader does not reliably re-invoke a fresh completion callback for the second concurrent
// request for the same module — so that instance's `pickerApiLoaded` never becomes true, and the
// library's openPicker() then silently no-ops forever for it (no error, no throw — confirmed via
// direct reading of the library's dist/index.js gate: `if (config.token && loaded && !error &&
// pickerApiLoaded) return createPicker(config)`).
//
// `window.google.picker` itself (the actual browser-global namespace, not this library's React
// state) IS a reliable, single, shared-across-all-instances signal once Google's script has
// genuinely finished loading the picker module — confirmed live (`hasGooglePicker: true`
// consistently once loaded). This singleton polls for that real signal exactly once per page load
// and caches the result, so every GooglePickerButton instance — regardless of how many mount,
// concurrently or otherwise — waits on the SAME shared promise instead of each depending on its
// own, individually-racy `pickerApiLoaded` state. See .claude/plans/connector-microsoft-impl.md,
// item 22.
let gapiPickerReadyPromise: Promise<void> | null = null
function waitForGapiPickerReady(timeoutMs = 15_000): Promise<void> {
    if (gapiPickerReadyPromise) return gapiPickerReadyPromise
    gapiPickerReadyPromise = new Promise((resolve, reject) => {
        const start = Date.now()
        const poll = () => {
            const win = typeof window !== 'undefined' ? window : null
            const ready = !!(win as unknown as { google?: { picker?: unknown } } | null)?.google?.picker
            if (ready) {
                resolve()
                return
            }
            if (Date.now() - start > timeoutMs) {
                gapiPickerReadyPromise = null // allow a future caller to retry from scratch
                reject(new Error('gapi_picker_load_timeout'))
                return
            }
            setTimeout(poll, 150)
        }
        poll()
    })
    return gapiPickerReadyPromise
}

/**
 * Builds and shows the Google Picker DIRECTLY via `google.picker.PickerBuilder`, bypassing
 * react-google-drive-picker's `openPicker()` wrapper entirely for this call. Deliberately
 * duplicates that library's own internal `createPicker` logic (read from its dist/index.js) rather
 * than depending on it, because `openPicker()`'s gate (`config.token && loaded && !error &&
 * pickerApiLoaded`) depends on `pickerApiLoaded`, LOCAL per-hook-instance React state set via a
 * `gapi.load('picker', {callback})` completion callback — and Google's own gapi loader does not
 * reliably re-invoke a fresh callback for a second/later concurrent request for the same module
 * (confirmed live: with two GooglePickerButton instances mounting close together — including React
 * Strict Mode's dev-only double-invoke of a component's render — one instance's `pickerApiLoaded`
 * can simply never become true, and `openPicker()` then silently no-ops forever for it, no error,
 * no throw). `window.google.picker` (the real global namespace, checked by
 * `waitForGapiPickerReady`) is the one reliable, actually-shared-across-instances signal — once
 * that's true, this function only ever touches genuine Google Picker API calls, none of the
 * library's own per-instance state, so it can't hit the same race. Used ONLY for `autoOpen`; the
 * manual-click path still goes through the library's normal `openPicker()` (its gate reliably
 * settles true given the extra real-world delay before a user actually clicks, per every previous
 * manual test in this investigation succeeding). See .claude/plans/connector-microsoft-impl.md,
 * item 22.
 */
// Module-level (not per-instance) guard against opening more than one Picker overlay at once.
// Confirmed live 2026-08-22: React Strict Mode's dev-only double-invoke of a component's render
// creates TWO independent autoOpen retry loops for what is logically one button — each loop
// resolving `waitForGapiPickerReady()` on its own and calling buildAndShowPickerDirect
// independently, which has no dedup of its own (each call unconditionally builds a fresh overlay)
// — stacking multiple real Picker windows on screen simultaneously. This flag is checked/set at
// the module level specifically because the bug is cross-instance, not just cross-call within one
// instance — a per-component ref would not have caught the second Strict-Mode instance's separate
// call. See .claude/plans/connector-microsoft-impl.md, item 22.
let pickerCurrentlyOpen = false
function buildAndShowPickerDirect(opts: {
    token: string
    appId: string
    customViews: unknown[] | undefined
    disableDefaultView: boolean
    multiselect: boolean
    supportDrives: boolean
    callbackFunction: (data: any) => void
}): boolean {
    if (pickerCurrentlyOpen) return false
    pickerCurrentlyOpen = true
    const wrappedCallback = (data: any) => {
        if (data.action === 'cancel' || data.action === 'picked') {
            pickerCurrentlyOpen = false
        }
        opts.callbackFunction(data)
    }
    const g = (window as unknown as { google: { picker: any } }).google.picker
    const builder = new g.PickerBuilder()
        .setAppId(opts.appId)
        .setOAuthToken(opts.token)
        .setDeveloperKey('')
        .setLocale('en')
        .setCallback(wrappedCallback)
    if (!opts.disableDefaultView) {
        builder.addView(new g.DocsView(g.ViewId.DOCS))
    }
    if (opts.customViews) {
        opts.customViews.forEach((view) => builder.addView(view))
    }
    if (opts.multiselect) {
        builder.enableFeature(g.Feature.MULTISELECT_ENABLED)
    }
    if (opts.supportDrives) {
        builder.enableFeature(g.Feature.SUPPORT_DRIVES)
    }
    builder.build().setVisible(true)
    return true
}

export interface GooglePickerButtonProps {
    connectionId: string
    onImport?: (files: any[]) => void
    children?: React.ReactNode
    triggerLabel?: string
    showSuccessToast?: boolean
    mode?: 'import' | 'select-folder'
    query?: string
    driveType?: 'My Drive' | 'Shared Drive'
    /** Called when the picker is successfully opened — lets parent show a loading state immediately. */
    onPickerOpen?: () => void
    /** Called when the picker is cancelled without a selection. */
    onPickerCancel?: () => void
    /** Opens the Picker immediately on mount instead of waiting for a click on the trigger button.
     *  Safe to do without a direct user gesture: the Picker is Google's own in-page iframe overlay
     *  (`setVisible(true)`), not a `window.open()` popup — confirmed via Google's own docs to not
     *  be subject to browser popup-blocker gesture requirements, unlike a real new-tab/window open
     *  elsewhere in this app. Used to skip an intermediate "click here to open the picker" screen
     *  when the picker-worthy choice was already confirmed by a real prior click (or an
     *  auto-advance timer following one). See .claude/plans/connector-microsoft-impl.md, item 21. */
    autoOpen?: boolean
}

export function GooglePickerButton({
    connectionId,
    onImport,
    children,
    triggerLabel = "Link Files",
    showSuccessToast = true,
    mode = 'import',
    query,
    driveType,
    onPickerOpen,
    onPickerCancel,
    autoOpen = false,
}: GooglePickerButtonProps) {
    const [loading, setLoading] = useState(false)
    const { addToast } = useToast()
    const [openPicker] = useDrivePicker()

    const handleValues = useCallback((ids: string[], token: string) => {
        // Process the selected files
        setLoading(true)
        fetch('/api/connectors/google-drive/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, fileIds: ids })
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('Import failed')
                const data = await res.json()

                if (showSuccessToast) {
                    addToast({
                        title: 'Import Successful',
                        message: `Imported ${data.count} file(s).`,
                        type: 'success'
                    })
                }

                if (onImport) onImport(ids)
            })
            .catch((err) => {
                logger.error('Import process failed', err as Error)
                addToast({
                    title: 'Import Failed',
                    message: 'Could not import selected files.',
                    type: 'error'
                })
            })
            .finally(() => setLoading(false))

    }, [connectionId, onImport, addToast, showSuccessToast])

    const createPicker = useCallback(async (opts?: { useDirect?: boolean }) => {
        if (!connectionId) return

        setLoading(true)
        try {
            if (opts?.useDirect) {
                await waitForGapiPickerReady()
            }
            // 1. Get Access Token and Client ID from backend (picker OAuth client must match authorized client)
            const res = await fetch(`/api/connectors/google-drive/token?connectionId=${encodeURIComponent(connectionId)}`)
            const raw = await res.text()
            let payload: { accessToken?: string; clientId?: string; error?: string; code?: string } = {}
            try {
                payload = raw ? JSON.parse(raw) : {}
            } catch {
                payload = { error: raw || res.statusText || 'Unknown error' }
            }

            if (!res.ok) {
                const code = payload.code
                const msg =
                    code === 'REVOKED'
                        ? (payload.error ?? 'Reconnect Google Drive to use the file picker.')
                        : code === 'MISSING_CLIENT_ID'
                          ? (payload.error ?? 'Google Drive is not configured on the server.')
                          : code === 'TOKEN_UNAVAILABLE'
                            ? (payload.error ?? 'Sign in to Google again (reconnect) to open the picker.')
                            : payload.error ?? `Could not prepare Google Drive (${res.status}).`
                throw new Error(msg)
            }

            const { accessToken, clientId } = payload
            if (!accessToken?.trim()) throw new Error('Invalid access token from server.')
            if (!clientId?.trim()) throw new Error('Google client ID missing — check GOOGLE_DRIVE_CLIENT_ID.')

            // Two tabs: "My Drive" (root + LIST) and "Shared Drives" (LIST)
            const win = typeof window !== 'undefined' ? window : null
            const pickerApi = win && (win as unknown as { google?: { picker?: unknown } }).google?.picker
            const customViews = pickerApi
                ? (() => {
                    const g = (win as unknown as {
                        google: {
                            picker: {
                                DocsView: new (id: string) => unknown
                                ViewId: { DOCS: string }
                                DocsViewMode: { LIST: string }
                            }
                        }
                    }).google.picker
                    type ViewLike = {
                        setParent?: (p: string) => ViewLike
                        setIncludeFolders: (v: boolean) => ViewLike
                        setMode: (m: string) => ViewLike
                        setLabel?: (l: string) => ViewLike
                        setEnableDrives?: (v: boolean) => ViewLike
                        setMimeTypes?: (m: string) => ViewLike
                        setSelectFolderEnabled?: (v: boolean) => ViewLike
                        setQuery?: (q: string) => ViewLike
                    }
                    const views = []

                    if (!driveType || driveType === 'My Drive') {
                        const myDriveView = new g.DocsView(g.ViewId.DOCS) as ViewLike
                        myDriveView.setParent!('root')
                        myDriveView.setIncludeFolders(true)
                        if (mode === 'select-folder' && myDriveView.setSelectFolderEnabled) myDriveView.setSelectFolderEnabled(true)
                        myDriveView.setMode(g.DocsViewMode.LIST)
                        if (mode === 'select-folder' && myDriveView.setMimeTypes) myDriveView.setMimeTypes('application/vnd.google-apps.folder')
                        if (query && myDriveView.setQuery) myDriveView.setQuery(query)
                        if (myDriveView.setLabel) myDriveView.setLabel('My Drive')
                        views.push(myDriveView)
                    }

                    if (!driveType || driveType === 'Shared Drive') {
                        // In 'select-folder' mode this view selects a PARENT LOCATION, not a
                        // pre-created target — the app creates `_firma`/the workspace folder
                        // itself inside whatever the user picks here (see
                        // GoogleDriveWorkspaceRoot's handleFolderPicked/createWorkspaceUnder).
                        const sharedDrivesView = new g.DocsView(g.ViewId.DOCS) as ViewLike
                        sharedDrivesView.setIncludeFolders(true)
                        if (mode === 'select-folder' && sharedDrivesView.setSelectFolderEnabled) sharedDrivesView.setSelectFolderEnabled(true)
                        sharedDrivesView.setMode(g.DocsViewMode.LIST)
                        if (mode === 'select-folder' && sharedDrivesView.setMimeTypes) sharedDrivesView.setMimeTypes('application/vnd.google-apps.folder')
                        // Only pre-fill search on Shared drives when that tab is the sole target (unique name flow).
                        // Dual-tab import (no driveType) must not set query here — it mixed My Drive hits into this tab.
                        if (query && driveType === 'Shared Drive' && sharedDrivesView.setQuery) {
                            sharedDrivesView.setQuery(query)
                        }
                        if (sharedDrivesView.setEnableDrives) sharedDrivesView.setEnableDrives(true)
                        if (sharedDrivesView.setLabel) sharedDrivesView.setLabel('Shared drives')
                        views.push(sharedDrivesView)
                    }

                    return views
                })()
                : undefined

            // 2. Build Picker
            const pickerCallback = (data: any) => {
                if (data.action === 'cancel') {
                    setLoading(false)
                    onPickerCancel?.()
                }
                if (data.action === 'picked') {
                    const files = data.docs
                    if (mode === 'select-folder') {
                        if (onImport) onImport(files.map((f: any) => ({ id: f.id, name: f.name ?? f.id })))
                        setLoading(false)
                        return
                    }
                    const ids = files.map((f: any) => f.id)
                    handleValues(ids, accessToken)
                }
            }

            let opened: boolean | undefined
            if (opts?.useDirect) {
                // Bypasses react-google-drive-picker's openPicker()/pickerApiLoaded gate entirely
                // — see buildAndShowPickerDirect's doc comment for why. window.google.picker is
                // already confirmed present at this point (awaited above), so this call is safe.
                // Its own return value reflects the module-level pickerCurrentlyOpen guard — false
                // means another overlay is already open (e.g. a duplicate Strict-Mode instance's
                // own retry loop got there first), which the caller should treat as a real success
                // (something opened, this attempt just wasn't the one that did it) rather than
                // retrying and stacking a second overlay.
                const builtHere = buildAndShowPickerDirect({
                    token: accessToken,
                    appId: config.googleDrive.appId || "",
                    customViews,
                    disableDefaultView: true,
                    multiselect: mode !== 'select-folder',
                    supportDrives: true,
                    callbackFunction: pickerCallback,
                })
                opened = builtHere || pickerCurrentlyOpen
            } else {
                // @ts-ignore
                // openPicker's return value is the ONLY reliable signal that the picker actually
                // opened — it silently returns undefined (no error, no throw) if the underlying
                // Google Picker script hasn't finished loading yet. See
                // .claude/plans/connector-microsoft-impl.md, item 22.
                opened = openPicker({
                    clientId: clientId,
                    developerKey: "", // Keep empty for localhost
                    appId: config.googleDrive.appId || "",
                    token: accessToken,
                    showUploadView: false,
                    showUploadFolders: true,
                    setIncludeFolders: true,
                    setSelectFolderEnabled: true,
                    supportDrives: true,
                    multiselect: mode !== 'select-folder', // Multiselect for files, single select for root folder
                    customViews: customViews,
                    disableDefaultView: true,
                    callbackFunction: pickerCallback,
                })
            }

            if (opened) {
                onPickerOpen?.()
            } else {
                // Silent library no-op (picker script not ready yet) — not a thrown error, so the
                // catch block below never sees it. Reset loading so a manual retry (or autoOpen's
                // own retry loop) isn't stuck showing a spinner for a call that never actually did
                // anything.
                setLoading(false)
            }
            return opened
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to launch picker.'
            logger.error('Failed to launch picker', error as Error)
            addToast({ title: 'Google Drive picker', message, type: 'error' })
            setLoading(false)
        }
    }, [connectionId, handleValues, addToast, mode, openPicker, driveType, query, onPickerOpen, onPickerCancel])

    // Ref-guarded so this only fires once per mount, not on every re-render/dependency change.
    //
    // KNOWN GAP IN react-google-drive-picker (confirmed by reading its dist/index.js): openPicker()
    // silently no-ops — no error, no retry, no thrown exception — if the underlying Google Picker
    // script (gapi.load('picker', ...)) hasn't finished loading yet at call time (its internal
    // `pickerApiLoaded` state gate). The library only auto-retries after its own OAuth token flow
    // completes (`openAfterAuth` effect), which never applies here since this component always
    // supplies its own pre-fetched `token`, bypassing that code path entirely.
    //
    // First fix attempt polled `window.google.picker` before calling createPicker() — still didn't
    // work live (confirmed 2026-08-21, no error toast fired either, meaning the poll itself never
    // resolved to "not ready" nor timed out — most likely `window.google.picker` (the namespace)
    // exists as soon as the outer api.js script tag loads, BEFORE gapi.load('picker', ...)'s own
    // async callback actually finishes — so the poll's readiness check was checking the wrong
    // signal and resolved true too early, then silently hit the exact same internal library gate).
    // Rather than keep guessing at Google's internal loading sequence, this instead retries
    // createPicker() itself directly — a no-op call is harmless (the library's internal gate just
    // returns without doing anything), so polling by literally re-attempting the real call until
    // the picker visibly opens is the only signal that's actually authoritative — createPicker()
    // now returns whether openPicker() genuinely succeeded (see its own doc comment above), so the
    // retry loop awaits that directly instead of relying on a side-channel callback. See
    // .claude/plans/connector-microsoft-impl.md, item 22.
    // BUG FOUND (2026-08-22): a ref guard that's set to `true` synchronously and never reset in
    // cleanup is exactly wrong under React Strict Mode's dev-only double-invoke (mount → cleanup →
    // mount again, synchronously, before any async work resolves). The guard blocked the SECOND
    // (real) invocation from ever starting a new retry loop, while the FIRST (cancelled) run's
    // already-in-flight async createPicker() call kept running in the background and logged a
    // now-irrelevant result — confirmed live via a cleanup-logging diagnostic showing CLEANUP
    // fired mid-flight, before the first attempt's fetch even resolved, and no second attempt ever
    // starting. Fix: reset the ref in cleanup, so Strict Mode's second invocation isn't blocked by
    // state left over from the first (deliberately-thrown-away) one. See
    // .claude/plans/connector-microsoft-impl.md, item 22.
    const autoOpenedRef = useRef(false)
    useEffect(() => {
        if (!autoOpen || autoOpenedRef.current) return
        autoOpenedRef.current = true

        let cancelled = false
        let attempt = 0
        const start = Date.now()
        const AUTO_OPEN_TIMEOUT_MS = 10_000
        const RETRY_INTERVAL_MS = 300
        const retry = async () => {
            if (cancelled) return
            attempt += 1
            const opened = await createPicker({ useDirect: true })
            if (cancelled || opened) return
            if (Date.now() - start > AUTO_OPEN_TIMEOUT_MS) {
                logger.error('GooglePickerButton: autoOpen gave up retrying createPicker()', new Error('picker_autoopen_exhausted'), 'GoogleDrivePicker', { attempts: attempt })
                addToast({ title: 'Google Drive picker', message: 'Could not open the Google Drive picker automatically. Use the button below.', type: 'error' })
                return
            }
            setTimeout(() => { void retry() }, RETRY_INTERVAL_MS)
        }
        void retry()
        return () => {
            cancelled = true
            autoOpenedRef.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen])

    return (
        <>
            {children && React.isValidElement(children) ? (
                // Clone the child to attach the onClick handler directly
                React.cloneElement(children as React.ReactElement<any>, {
                    onClick: (e: React.MouseEvent) => {
                        if (!loading) {
                            createPicker()
                            if ((children as React.ReactElement<any>).props.onClick) {
                                (children as React.ReactElement<any>).props.onClick(e)
                            }
                        }
                    },
                    disabled: loading || (children as React.ReactElement<any>).props.disabled,
                    className: `${(children as React.ReactElement<any>).props.className || ''} ${!loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`
                })
            ) : (
                <Button onClick={() => createPicker()} disabled={loading} variant="outline" className="gap-2">
                    {loading ? <LoadingSpinner size="sm" /> : <SquarePlus className="h-4 w-4" />}
                    {triggerLabel}
                </Button>
            )}
        </>
    )
}
