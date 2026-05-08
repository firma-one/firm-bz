import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { SquarePlus } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/toast'
import useDrivePicker from 'react-google-drive-picker'
import { logger } from '@/lib/logger'
import { config } from "@/lib/config"

export interface GooglePickerButtonProps {
    connectionId: string
    onImport?: (files: any[]) => void
    children?: React.ReactNode
    triggerLabel?: string
    showSuccessToast?: boolean
    mode?: 'import' | 'select-folder'
    query?: string
    driveType?: 'My Drive' | 'Shared Drive'
}

export function GooglePickerButton({
    connectionId,
    onImport,
    children,
    triggerLabel = "Link Files",
    showSuccessToast = true,
    mode = 'import',
    query,
    driveType
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

    const createPicker = useCallback(async () => {
        if (!connectionId) return

        setLoading(true)
        try {
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
            // @ts-ignore
            openPicker({
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
                callbackFunction: (data: any) => {
                    if (data.action === 'cancel') {
                        setLoading(false)
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
            })

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to launch picker.'
            logger.error('Failed to launch picker', error as Error)
            addToast({ title: 'Google Drive picker', message, type: 'error' })
            setLoading(false)
        }
    }, [connectionId, handleValues, addToast, mode, openPicker, driveType, query])

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
                <Button onClick={createPicker} disabled={loading} variant="outline" className="gap-2">
                    {loading ? <LoadingSpinner size="sm" /> : <SquarePlus className="h-4 w-4" />}
                    {triggerLabel}
                </Button>
            )}
        </>
    )
}
