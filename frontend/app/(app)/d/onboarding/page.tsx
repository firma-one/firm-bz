"use client"

import { useState, useEffect, Suspense, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle2, ArrowRight, ArrowLeft, Building2, LogIn, Lock, AlertCircle, Users, Briefcase, HardDrive, FolderOpen, Folder, SquarePlus, Info, Copy, Check, Loader2, Cloud } from "lucide-react"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { GoogleSharedDriveIcon } from "@/components/ui/google-shared-drive-icon"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    joinOrganizationByDomain,
    type DomainOnboardingOptions,
    type DomainOrgOption
} from "@/lib/actions/domain-onboarding"
import { useOnboarding } from "@/lib/onboarding-context"
import { SANDBOX_HIERARCHY, SANDBOX_FIRM_NAME_FALLBACK } from "@/lib/services/sample-file-service"
import { buildDefaultSandboxFirmName } from "@/lib/onboarding/sandbox-firm-name"
import { BRAND_NAME } from "@/config/brand"
import { logger } from '@/lib/logger'
import { buildUserSettingsPlus } from '@/lib/actions/user-settings'
import { getUserFirms } from '@/lib/actions/firms'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { supabase } from "@/lib/supabase"
import { GooglePickerButton } from "@/components/google-drive/google-picker-button"
import {
    initiateGoogleDriveOAuthPopup,
    startGoogleDriveOAuthPopup,
    googleDriveOAuthPopupFailureMessage,
} from '@/lib/google-drive-popup-oauth'
import { BillingPageClient } from '@/components/billing/billing-page-client'

const ONBOARDING_CREATING_STORAGE_KEY = 'firm_onboarding_creating'

function readOnboardingCreatingSession(): string | null {
    if (typeof window === 'undefined') return null
    try {
        return sessionStorage.getItem(ONBOARDING_CREATING_STORAGE_KEY)
    } catch {
        return null
    }
}

function clearOnboardingCreatingSession(): void {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.removeItem(ONBOARDING_CREATING_STORAGE_KEY)
    } catch {
        /* private mode / quota */
    }
}

/**
 * Get current access token.
 * Calls getUser() first (server-side verification) to satisfy Supabase's security recommendation,
 * then reads the session token. Each API call also verifies the token server-side.
 */
/** Progress indicator for org tree: todo = rounded empty circle, completed = tick mark in rounded circle, in progress = spinner. */
function OrgTreeProgressCheck({ status, size = 'md' }: { status: 'completed' | 'inProgress' | 'pending'; size?: 'sm' | 'md' | 'lg' }) {
    const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
    const iconClass = size === 'sm' ? 'h-2 w-2' : size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5'
    if (status === 'completed') {
        return (
            <div className={`${sizeClass} rounded-full border-2 border-slate-900 flex items-center justify-center flex-shrink-0`}>
                <Check className={`${iconClass} text-slate-900`} strokeWidth={2.5} />
            </div>
        )
    }
    if (status === 'inProgress') {
        return (
            <div className={`${sizeClass} rounded-full border-2 border-slate-300 bg-amber-50 flex items-center justify-center flex-shrink-0`}>
                <Loader2 className={`${iconClass} text-amber-600 animate-spin`} strokeWidth={2.5} />
            </div>
        )
    }
    return (
        <div className={`${sizeClass} rounded-full border-2 border-slate-300 flex-shrink-0`} />
    )
}

/** Sample hierarchy rows; `nodeStatus` maps synthetic step indices used only for this preview. */
function SandboxHierarchyPreview({
    sandboxFirmName,
    nodeStatus,
}: {
    sandboxFirmName: string
    nodeStatus: (stepIndex: number) => 'completed' | 'inProgress' | 'pending'
}) {
    const FIRM_STEP = 2
    const getClientStepIndex = (ci: number) =>
        3 + SANDBOX_HIERARCHY.slice(0, ci).reduce((s, c) => s + 1 + c.engagements.length, 0)
    const getEngagementStepIndex = (ci: number, ei: number) => getClientStepIndex(ci) + 1 + ei

    return (
        <>
            <div className="flex items-center gap-3 mb-3">
                <OrgTreeProgressCheck status={nodeStatus(FIRM_STEP)} size="lg" />
                <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-900">{sandboxFirmName}</span>
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Firm</span>
            </div>
            <div className="pl-6 border-l-2 border-slate-200 ml-2.5 space-y-4">
                {SANDBOX_HIERARCHY.map((client, ci) => {
                    const clientStep = getClientStepIndex(ci)
                    return (
                        <div key={ci}>
                            <div className="flex items-center gap-3 mb-2">
                                <OrgTreeProgressCheck status={nodeStatus(clientStep)} size="md" />
                                <Users className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-slate-700">{client.clientName}</span>
                                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Client</span>
                            </div>
                            <div className="pl-6 border-l-2 border-slate-100 ml-2.5 space-y-1.5">
                                {client.engagements.map((engagement, ei) => (
                                    <div key={ei} className="flex items-center gap-3">
                                        <OrgTreeProgressCheck status={nodeStatus(getEngagementStepIndex(ci, ei))} size="sm" />
                                        <Briefcase className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                                        <span className="text-xs text-slate-500 italic">{engagement.name}</span>
                                        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded-full">Engagement</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}

function buildFinalizeTerminalSteps(firmName: string): string[] {
    return [
        'Queueing workspace build (runs in the background)…',
        'Preparing sandbox folder structure on your Drive…',
        `Creating sandbox firm: ${firmName}…`,
        ...SANDBOX_HIERARCHY.flatMap((client) => [
            `Setting up client: ${client.clientName}…`,
            ...client.engagements.map((e) => `Creating engagement: ${e.name}…`),
        ]),
        'Finalizing folder structure and indexing…',
    ]
}

/** One monospace line under the tree: current provisioning step (typing animation). */
const FinalizeProvisioningLine = ({ steps, activeStepIndex }: { steps: string[]; activeStepIndex: number }) => {
    const [currentText, setCurrentText] = useState('')
    const [isTyping, setIsTyping] = useState(false)

    useEffect(() => {
        if (activeStepIndex < 0 || activeStepIndex >= steps.length) return

        const fullText = steps[activeStepIndex]
        setCurrentText('')
        setIsTyping(true)

        let i = 0
        const typingSpeed = Math.random() * 25 + 12
        const timer = setInterval(() => {
            setCurrentText(fullText.slice(0, i + 1))
            i++
            if (i >= fullText.length) {
                clearInterval(timer)
                setIsTyping(false)
            }
        }, typingSpeed)

        return () => clearInterval(timer)
    }, [activeStepIndex, steps])

    if (steps.length === 0) return null

    const label = steps[Math.min(activeStepIndex, steps.length - 1)] ?? ''
    const showCaret = isTyping && currentText.length < label.length

    return (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2.5 font-mono text-[12px] leading-snug text-slate-800 shadow-sm">
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 animate-spin" aria-hidden />
            <p className="min-w-0 flex-1">
                {isTyping ? (
                    <>
                        {currentText}
                        {showCaret ? (
                            <span className="inline-block h-3.5 w-1.5 translate-y-0.5 bg-slate-500 ml-0.5 animate-[blink_1s_infinite] align-middle" />
                        ) : null}
                    </>
                ) : (
                    label
                )}
            </p>
        </div>
    )
}

function StepRequirementBadge({ kind }: { kind: 'mandatory' | 'optional' }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                kind === 'mandatory'
                    ? 'bg-slate-200 text-slate-800'
                    : 'border border-slate-200 bg-slate-100 text-slate-700'
            }`}
        >
            {kind === 'mandatory' ? 'Mandatory' : 'Optional'}
        </span>
    )
}

async function getAccessToken(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
}

/** Shown when the user lands on /d/onboarding but has already completed it. Auto-redirects after 3s. */
const AlreadyCompletedScreen = ({ onGoToDashboard }: { onGoToDashboard: () => void }) => {
    const [countdown, setCountdown] = useState(3)
    useEffect(() => {
        const t = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(t)
                    // Defer navigation to avoid "Cannot update Router while rendering AlreadyCompletedScreen"
                    setTimeout(() => onGoToDashboard(), 0)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(t)
    }, [onGoToDashboard])

    return (
        <div className="animate-in fade-in duration-500 text-center py-16">
            <div className="h-20 w-20 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center mb-6 mx-auto">
                <CheckCircle2 className="h-10 w-10 text-purple-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">You're all set!</h1>
            <p className="text-slate-500 mb-2">
                Onboarding has already been completed for your account.
            </p>
            <p className="text-sm text-slate-400 mb-8">
                Redirecting to your dashboard in <span className="font-semibold text-slate-600">{countdown}s</span>…
            </p>
            <button
                onClick={onGoToDashboard}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
            >
                Go to Dashboard <ArrowRight className="h-4 w-4" />
            </button>
        </div>
    )
}

const OnboardingContent = () => {
    const { session, user } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const { setOnboarding, markStepSkipped } = useOnboarding()
    const { addToast } = useToast()

    // Refs to prevent duplicate calls
    const initialCheckDoneRef = useRef(false)
    const popupRef = useRef<Window | null>(null)
    const driveProvisionStartedRef = useRef(false)
    const finalizeAutoNavIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // State
    const [step, setStep] = useState<number | null>(null) // Start null to show loader
    const [isLoading, setIsLoading] = useState(true) // Global loading for initial check
    const [isSubmitting, setIsSubmitting] = useState(false) // For form submission
    const [error, setError] = useState<string | null>(null)
    const [rootFolderId, setRootFolderId] = useState('')

    // Step 0: Domain Choice
    const [domainOptions, setDomainOptions] = useState<DomainOnboardingOptions | null>(null)
    const [domainJoiningId, setDomainJoiningId] = useState<string | null>(null)
    const [domainError, setDomainError] = useState<string | null>(null)
    const [selectionMode, setSelectionMode] = useState<'whole' | 'specific'>('specific')

    // Step 3: Google Drive connection (mandatory)
    const [authUrl, setAuthUrl] = useState<string | null>(null)
    const [oauthNonce, setOauthNonce] = useState<string | null>(null)
    const [isFetchingAuthUrl, setIsFetchingAuthUrl] = useState(false)
    const [isConnectingDrive, setIsConnectingDrive] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const [connectionDetails, setConnectionDetails] = useState<{ accessToken?: string, connectionId?: string, clientId?: string } | null>(null)
    const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
    const [hasOpenedPopup, setHasOpenedPopup] = useState(false)
    const [previewDrive, setPreviewDrive] = useState<'My Drive' | 'Shared Drive' | null>(null)
    const [hasCopied, setHasCopied] = useState(false)
    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)

    // Step 1: anchor firm (silent). Step 2: subscribe (optional). Step 3: Drive (mandatory).
    const [sandboxFirmName, setSandboxFirmName] = useState(SANDBOX_FIRM_NAME_FALLBACK)
    const [creatingSandbox, setCreatingSandbox] = useState(false)
    const [finalizeTerminalSteps, setFinalizeTerminalSteps] = useState<string[]>([])
    const [finalizeTerminalActiveIndex, setFinalizeTerminalActiveIndex] = useState(-1)
    /** Countdown seconds on Step 4 CTA before auto-navigation (after last progress step). */
    const [finalizeAutoNavSeconds, setFinalizeAutoNavSeconds] = useState<number | null>(null)
    const shellPrepareInFlightRef = useRef(false)

    useEffect(() => {
        if (!user) return
        setSandboxFirmName((prev) =>
            prev === SANDBOX_FIRM_NAME_FALLBACK
                ? buildDefaultSandboxFirmName(
                      (user.user_metadata as Record<string, unknown> | undefined)?.first_name as
                          | string
                          | undefined,
                      SANDBOX_FIRM_NAME_FALLBACK
                  )
                : prev
        )
    }, [user?.id])

    // Step 3: Subscribe (import removed)
    const [orgName, setOrgName] = useState("")
    const [newOrgCreated, setNewOrgCreated] = useState(false)
    const [newOrgSlug, setNewOrgSlug] = useState("")
    const [defaultOrgSlug, setDefaultOrgSlug] = useState("")
    const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

    // Arrow animation styles
    const arrowAnimationStyle = `
        @keyframes arrow-bounce {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(3px); }
        }
        .cta-hover-arrow:hover .animate-arrow {
            animation: arrow-bounce 1s infinite;
        }
    `

    // General
    const [existingOrg, setExistingOrg] = useState<any>(null)
    const [isFinalizing, setIsFinalizing] = useState(false)

    const resolvePostOnboardingPath = useCallback(async (): Promise<string> => {
        // Prefer already-known slugs from onboarding flow to avoid an extra /d -> /d/f/* redirect hop.
        const preferredSlug = defaultOrgSlug || newOrgSlug || existingOrg?.slug
        if (preferredSlug) {
            return `/d/f/${preferredSlug}`
        }
        // Freshly created org membership can be briefly stale. Retry a few times before falling back.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const firms = await getUserFirms()
                const fallbackSlug = firms.find((o) => o.isDefault)?.slug ?? firms[0]?.slug
                if (fallbackSlug) {
                    return `/d/f/${fallbackSlug}`
                }
            } catch {
                // Ignore and retry
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        return '/d'
    }, [defaultOrgSlug, newOrgSlug, existingOrg?.slug])

    const handleFinish = useCallback(async () => {
        if (finalizeAutoNavIntervalRef.current) {
            clearInterval(finalizeAutoNavIntervalRef.current)
            finalizeAutoNavIntervalRef.current = null
        }
        setFinalizeAutoNavSeconds(null)
        const targetPath = await resolvePostOnboardingPath()
        router.replace(targetPath)
    }, [resolvePostOnboardingPath, router])

    const handleConnectDrive = useCallback(async (e?: any) => {
        e?.preventDefault()
        e?.stopPropagation()
        if (!authUrl) return

        setIsConnectingDrive(true)

        logger.debug('ONBOARDING_OAUTH_CONNECT_CLICK', {
            hasAuthUrl: !!authUrl,
            appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
        })

        const applyPopupSuccess = async () => {
            setError(null)
            try {
                const token = await getAccessToken()
                if (token) {
                    const statusRes = await fetch('/api/connectors/google-drive?action=status', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    if (statusRes.ok) {
                        const statusData = await statusRes.json()
                        const fetchedRootId = statusData.connector?.rootFolderId
                        if (statusData.connector?.id) {
                            setConnectionDetails(prev => ({ ...prev, connectionId: statusData.connector.id }))
                        }
                        if (statusData.connector?.name) setConnectedEmail(statusData.connector.name)
                        if (fetchedRootId) setRootFolderId(fetchedRootId)
                        // Drive is step 3; provisioning runs via effect when root + connection exist.
                    }
                }
            } catch (err) {
                logger.warn('Failed to fetch connector status after popup OAuth', err as Error)
            }
        }

        startGoogleDriveOAuthPopup(
            authUrl,
            oauthNonce,
            {
                getAccessToken,
                async onMessageSuccess({ connectionId, email }) {
                    setIsConnected(true)
                    if (email) setConnectedEmail(email)
                    if (connectionId) {
                        setConnectionDetails(prev => ({ ...prev, connectionId }))
                    }
                    await applyPopupSuccess()
                },
                async onPollSuccess(_connector: { id: string; name?: string | null }) {
                    setIsConnected(true)
                    await applyPopupSuccess()
                },
                onMessageFailure(code) {
                    setError(googleDriveOAuthPopupFailureMessage(code))
                },
                onTimeout() {
                    setError('Timed out waiting for Google sign-in. Please try again.')
                },
                onFlowEnd() {
                    setIsConnectingDrive(false)
                },
            },
            { logLabel: 'onboarding' }
        )

        setError(null)
    }, [authUrl, oauthNonce, user?.id, existingOrg?.id, rootFolderId])

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        setHasCopied(true)
        addToast({
            title: "Copied!",
            message: `"${text}" copied to clipboard.`,
            type: "success"
        })
    }

    const handleOpenDrivePopup = () => {
        if (!connectedEmail) return

        const width = 1000
        const height = 750
        const left = window.screenX + (window.outerWidth - width) / 2
        const top = window.screenY + (window.outerHeight - height) / 2

        const driveSlug = previewDrive === 'My Drive' ? 'my-drive' : 'shared-drives'
        const driveUrl = `https://drive.google.com/drive/${driveSlug}`

        // Use AccountChooser to nudge towards the connected email
        const url = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(connectedEmail)}&continue=${encodeURIComponent(driveUrl)}`

        const popup = window.open(url, 'FirmDriveSetup',
            `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,location=no,noopener,noreferrer`
        )
        popupRef.current = popup
        setHasOpenedPopup(true)
    }

    const handleFinalStepClick = () => {
        logger.debug("Onboarding: handleFinalStepClick - closing Drive popup if open")
        if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close()
            popupRef.current = null
        }
    }

    const handleRootFolderSelected = async (ids: string[]) => {
        if (ids && ids.length > 0) {
            const selectedId = ids[0]
            setRootFolderId(selectedId)
            // Call API to update root folder
            try {
                const token = await getAccessToken()
                if (connectionDetails?.connectionId) {
                    await fetch('/api/connectors/google-drive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            action: 'update-root-folder',
                            connectionId: connectionDetails.connectionId,
                            rootFolderId: selectedId
                        })
                    })
                    // After successfully selecting a root folder, continue Connect stage (step 3)
                    setStep(3)
                }
            } catch (e) {
                logger.error("Failed to update root folder", e as Error)
            }
        }
    }

    /**
     * Stage 1 — sync API only (anchor firm + member + settings + auth metadata). No Inngest.
     * Advances to optional Subscribe (step 2). Inngest runs only after Drive (step 3).
     */
    const handlePrepareSandboxShell = useCallback(async () => {
        if (shellPrepareInFlightRef.current) return
        shellPrepareInFlightRef.current = true
        setCreatingSandbox(true)
        setError(null)

        const firmNameForSession = sandboxFirmName || SANDBOX_FIRM_NAME_FALLBACK
        sessionStorage.setItem(ONBOARDING_CREATING_STORAGE_KEY, JSON.stringify({
            type: 'sandbox',
            firmName: firmNameForSession,
            startedAt: Date.now()
        }))

        try {
            const token = await getAccessToken()
            if (!token) {
                clearOnboardingCreatingSession()
                setError('Session expired. Please sign in again.')
                return
            }

            const res = await fetch('/api/onboarding/create-sandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ sandboxFirmName: firmNameForSession }),
            })

            clearOnboardingCreatingSession()

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || 'Failed to create sandbox workspace')
            }

            setStep(2)

            supabase.auth.refreshSession().catch((err) => logger.warn('Session refresh after sandbox shell', err))
            buildUserSettingsPlus().catch((err) => logger.warn('Cache rebuild after sandbox shell', err))
        } catch (err: unknown) {
            clearOnboardingCreatingSession()
            const msg = err instanceof Error ? err.message : 'Error creating sandbox workspace'
            const isNetworkError = /failed to fetch|network error|load failed/i.test(msg)
            setError(
                isNetworkError
                    ? 'Connection error. Please ensure the database is running (e.g. supabase start for local dev) and try again.'
                    : msg
            )
            logger.error('Error preparing sandbox shell during onboarding', err as Error)
        } finally {
            shellPrepareInFlightRef.current = false
            setCreatingSandbox(false)
        }
    }, [sandboxFirmName])

    const skipSubscribeGoToDrive = useCallback(async () => {
        try {
            const token = await getAccessToken()
            if (!token) {
                setError('Session expired. Please sign in again.')
                return
            }
            const res = await fetch('/api/onboarding/ui-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'skip_subscribe' }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error((err as { error?: string }).error || 'Failed to save progress')
            }
            markStepSkipped(2)
            setError(null)
            setStep(3)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to continue')
        }
    }, [markStepSkipped])

    const afterCheckoutParam = searchParams.get('after_checkout')
    /** Strip `after_checkout` from the URL once the initial status check has finished (persist runs inside that check). */
    useEffect(() => {
        if (isLoading) return
        if (afterCheckoutParam !== '1') return
        router.replace('/d/onboarding', { scroll: false })
    }, [isLoading, afterCheckoutParam, router])

    // Auto-run shell creation when onboarding lands on step 1 (no countdown / no progress substeps).
    useEffect(() => {
        if (isLoading || step !== 1) return
        if (!sandboxFirmName?.trim()) return
        void handlePrepareSandboxShell()
    }, [isLoading, step, sandboxFirmName, handlePrepareSandboxShell])

    /** Stage 1b — after Drive: attach connector, enqueue Inngest (clients, engagements, Drive tree, documents). */
    const handleAttachConnectorAndProvisionSandbox = useCallback(async () => {
        const connectionId = connectionDetails?.connectionId
        if (!connectionId) {
            driveProvisionStartedRef.current = false
            return
        }

        setCreatingSandbox(true)
        setError(null)

        const firmNameForSession = sandboxFirmName || SANDBOX_FIRM_NAME_FALLBACK
        sessionStorage.setItem(ONBOARDING_CREATING_STORAGE_KEY, JSON.stringify({
            type: 'sandbox',
            firmName: firmNameForSession,
            startedAt: Date.now()
        }))

        try {
            const token = await getAccessToken()
            if (!token) {
                clearOnboardingCreatingSession()
                setError('Session expired. Please sign in again.')
                setCreatingSandbox(false)
                driveProvisionStartedRef.current = false
                return
            }

            const res = await fetch('/api/onboarding/create-sandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    connectionId,
                    sandboxFirmName: firmNameForSession,
                }),
            })

            clearOnboardingCreatingSession()

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.error || 'Failed to start sandbox provisioning')
            }

            setCreatingSandbox(false)
            setFinalizeTerminalSteps(buildFinalizeTerminalSteps(firmNameForSession))
            setFinalizeTerminalActiveIndex(0)
            setStep(4)

            supabase.auth.refreshSession().catch((err) => logger.warn('Session refresh after sandbox provision', err))
            buildUserSettingsPlus().catch((err) => logger.warn('Cache rebuild after sandbox provision', err))
        } catch (err: unknown) {
            clearOnboardingCreatingSession()
            driveProvisionStartedRef.current = false
            const msg = err instanceof Error ? err.message : 'Error starting sandbox provisioning'
            const isNetworkError = /failed to fetch|network error|load failed/i.test(msg)
            setError(
                isNetworkError
                    ? 'Connection error. Please ensure the database is running (e.g. supabase start for local dev) and try again.'
                    : msg
            )
            logger.error('Error attaching connector / provisioning sandbox', err as Error)
        } finally {
            setCreatingSandbox(false)
        }
    }, [connectionDetails?.connectionId, sandboxFirmName])

    // Sync progress when returning to page: if creation was in progress (user navigated away), check if org exists and redirect
    const syncCreationProgress = useCallback(async () => {
        const raw = readOnboardingCreatingSession()
        if (!raw) return
        let storedFirmName: string | undefined
        let startedAt: number | undefined
        try {
            const parsed = JSON.parse(raw) as { firmName?: string; orgName?: string; startedAt?: number }
            storedFirmName = parsed.firmName ?? parsed.orgName
            startedAt = parsed.startedAt
        } catch {
            clearOnboardingCreatingSession()
            return
        }
        if (!storedFirmName || startedAt == null || Date.now() - startedAt > 10 * 60 * 1000) {
            clearOnboardingCreatingSession()
            return
        }
        try {
            const orgs = await getUserFirms()
            const match = orgs.find(o => o.name.toLowerCase() === storedFirmName!.toLowerCase())
            if (match) {
                clearOnboardingCreatingSession()
            }
        } catch {
            // Ignore — user may not be signed in yet
        }
    }, [])

    useEffect(() => {
        syncCreationProgress()
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') syncCreationProgress()
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [syncCreationProgress])

    // When tab becomes visible during creation, re-check if org exists (handles browser throttling of setInterval in background)
    const syncCreatingStateOnVisible = useCallback(async () => {
        if (document.visibilityState !== 'visible') return
        if (!creatingSandbox) return
        // Anchor creation on step 1 only: if the firm row appears while the tab was backgrounded, advance to Subscribe.
        if (step !== 1) return

        const firmNameToCheck = sandboxFirmName || SANDBOX_FIRM_NAME_FALLBACK
        if (!firmNameToCheck) return

        try {
            const orgs = await getUserFirms()
            const match = orgs.find(o => o.name.toLowerCase() === firmNameToCheck.toLowerCase())
            if (match) {
                clearOnboardingCreatingSession()
                setCreatingSandbox(false)
                setStep(2)
            }
        } catch {
            // Ignore — user may not be signed in yet
        }
    }, [creatingSandbox, sandboxFirmName, step])

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') syncCreatingStateOnVisible()
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [syncCreatingStateOnVisible])

    // Initial check: Params & Existing Org (use getSession() so token is valid right after OTP redirect)
    useEffect(() => {
        // Prevent duplicate in-flight bootstrap; if deps re-run (e.g. markStepSkipped), still re-assert layout mode.
        if (initialCheckDoneRef.current) {
            setOnboarding(true)
            return
        }
        initialCheckDoneRef.current = true

        const checkStatus = async () => {
            try {
                const token = await getAccessToken()
                if (!token) {
                    setStep(1) // New users start at Step 1 (sandbox shell)
                    return
                }

                // Extract connection details from URL if present
                const success = searchParams.get('success')
                const connId = searchParams.get('connectionId')
                const email = searchParams.get('email')
                const errorParam = searchParams?.get('error')

                if (success === 'google_drive_connected') {
                    setIsConnected(true)
                    if (email) setConnectedEmail(email)
                    if (connId) {
                        setConnectionDetails(prev => ({ ...prev, connectionId: connId }))
                    }
                    // Fetch connector details so connectionId is available for Steps 2 & 3
                    const statusRes = await fetch('/api/connectors/google-drive?action=status', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    if (statusRes.ok) {
                        const statusData = await statusRes.json()
                        const fetchedRootId = statusData.connector?.rootFolderId
                        if (statusData.connector?.id) {
                            setConnectionDetails(prev => ({ ...prev, connectionId: statusData.connector.id }))
                        }
                        if (fetchedRootId) {
                            setRootFolderId(fetchedRootId)
                        }

                        // OAuth return: connector is saved — Finalize (Stage 4) runs sandbox DB/Drive work.
                        setStep(4)
                    }
                } else if (errorParam) {
                    setStep(3)
                    setError(googleDriveOAuthPopupFailureMessage(errorParam))
                } else {
                    // 2. Normal load: Fetch connector status first so we have rootFolderId even when no org yet
                    // (callback ensures default workspace root in My Drive — see DEFAULT_WORKSPACE_FOLDER_NAME in google-drive-connector.ts — and sets rootFolderId; we must not show "My Drive vs Shared Drive")
                    let normalLoadRootId = ''
                    try {
                        const statusRes = await fetch('/api/connectors/google-drive?action=status', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        })
                        if (statusRes.ok) {
                            const statusData = await statusRes.json()
                            setIsConnected(statusData.isConnected)
                            if (statusData.connector?.id) {
                                setConnectionDetails({ connectionId: statusData.connector.id })
                                if (statusData.connector.name) setConnectedEmail(statusData.connector.name)
                            }
                            if (statusData.connector?.rootFolderId) {
                                normalLoadRootId = statusData.connector.rootFolderId
                                setRootFolderId(normalLoadRootId)
                            }
                        }
                    } catch (err) {
                        logger.warn('Failed to fetch connector status on normal load', err as Error)
                    }

                    try {
                        const res = await fetch('/api/firm', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        })
                        if (res.ok) {
                            const data = await res.json()
                            logger.debug("Onboarding: Fetched Org Data:", data)

                            const org = data.firm ?? data.organization

                            // If no org found, ensure one is created before proceeding
                            let resolvedOrg = org
                            if (!resolvedOrg?.id) {
                                try {
                                    logger.debug("Onboarding: No org found, calling ensure-org...")
                                    const ensureRes = await fetch('/api/onboarding/ensure-org', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    })
                                    if (ensureRes.ok) {
                                        resolvedOrg = await ensureRes.json()
                                        logger.debug("Onboarding: ensure-org returned:", resolvedOrg)
                                    }
                                } catch (err) {
                                    logger.error("ensure-org failed", err as Error)
                                }
                            }

                            if (resolvedOrg && resolvedOrg.id) {
                                // Invited members (non-owners) should never see the onboarding flow —
                                // redirect them straight to their org workspace.
                                const { data: { user: currentUser } } = await supabase.auth.getUser()
                                const userMembership = resolvedOrg.members?.find((m: any) => m.userId === currentUser?.id)
                                const isOwner = userMembership?.role === 'firm_admin'

                                if (!isOwner && resolvedOrg.slug) {
                                    router.replace(`/d/f/${resolvedOrg.slug}`)
                                    return
                                }

                                setExistingOrg(resolvedOrg)
                                setOrgName(resolvedOrg.name || "")
                                setNewOrgSlug(resolvedOrg.slug)
                                setDefaultOrgSlug(resolvedOrg.slug)

                                const settings = (resolvedOrg as any).settings as any
                                let onboarding = settings?.onboarding
                                /** Use connector root from this run (state may not have flushed yet). */
                                let fetchedRootId = normalLoadRootId
                                /** OAuth persisted connector row (may exist before firm.connectorId is linked). */
                                let statusConnectorId: string | null = null
                                let connectorOnboarding: { isComplete?: boolean; currentStep?: number } | null = null

                                // Fetch connector status first — onboarding state lives in connector settings, not org
                                try {
                                    const statusRes = await fetch('/api/connectors/google-drive?action=status', {
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    })
                                    if (statusRes.ok) {
                                        const statusData = await statusRes.json()
                                        setIsConnected(statusData.isConnected)
                                        if (statusData.connector?.id) {
                                            statusConnectorId = statusData.connector.id
                                            setConnectionDetails({ connectionId: statusData.connector.id })
                                            if (statusData.connector.name) setConnectedEmail(statusData.connector.name)
                                        }
                                        connectorOnboarding = statusData.connector?.onboarding ?? null
                                        if (statusData.connector?.rootFolderId) {
                                            fetchedRootId = statusData.connector.rootFolderId
                                            setRootFolderId(fetchedRootId)
                                        }
                                    }
                                } catch (err) {
                                    logger.warn('Failed to fetch connector status during normal load', err as Error)
                                }

                                // Prefer connector onboarding (source of truth) over org settings
                                if (connectorOnboarding) {
                                    onboarding = { ...(onboarding || {}), ...connectorOnboarding }
                                }

                                let workspaceReady = false
                                try {
                                    const slugRes = await fetch('/api/firms/default-slug', {
                                        headers: { Authorization: `Bearer ${token}` },
                                    })
                                    if (slugRes.ok) {
                                        const j = await slugRes.json()
                                        workspaceReady = j.onboardingComplete === true
                                    }
                                } catch {
                                    // ignore
                                }

                                // If onboarding is complete, show domain choice (Step 0) to continue or create new
                                if (onboarding?.isComplete || workspaceReady) {
                                    try {
                                        const domainRes = await fetch('/api/onboarding/domain-options', {
                                            headers: { 'Authorization': `Bearer ${token}` }
                                        })
                                        if (domainRes.ok) {
                                            const opts = await domainRes.json()
                                            if (
                                                opts &&
                                                ((opts.orgsToJoin?.length ?? 0) > 0 ||
                                                    (opts.orgsAlreadyIn?.length ?? 0) > 0)
                                            ) {
                                                setDomainOptions(opts)
                                                setStep(0) // Show domain choice screen
                                                setOnboarding(true, 0)
                                            } else {
                                                // Onboarding complete, no domain options → show completed screen then redirect
                                                setStep(-1)
                                            }
                                        } else {
                                            // Can't load domain options → still completed
                                            setStep(-1)
                                        }
                                    } catch (err) {
                                        logger.error('Failed to load domain options', err as Error)
                                        setStep(-1)
                                    }
                                } else {
                                    const firmOb = (onboarding || {}) as Record<string, unknown>
                                    const flowV = Number(firmOb.onboardingFlowVersion) || 2
                                    const firmConnectorId = (resolvedOrg as { connectorId?: string | null }).connectorId
                                    /** Stage 3 ends once OAuth has persisted a connector; root folder can lag. */
                                    const driveConnected = Boolean(firmConnectorId || statusConnectorId)
                                    let stage = String(firmOb.stage || '')
                                    const subscribeSkipped = firmOb.subscribeSkipped === true
                                    const afterCheckoutReturn = searchParams.get('after_checkout') === '1'

                                    if (subscribeSkipped) {
                                        markStepSkipped(2)
                                    }

                                    // Polar success URL lands here while firm.settings may still say awaiting_subscribe.
                                    // Persist past billing before choosing the step so we never flash the billing UI.
                                    if (
                                        afterCheckoutReturn &&
                                        flowV >= 3 &&
                                        !subscribeSkipped &&
                                        stage === 'awaiting_subscribe'
                                    ) {
                                        try {
                                            const persistRes = await fetch('/api/onboarding/ui-progress', {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    Authorization: `Bearer ${token}`,
                                                },
                                                body: JSON.stringify({ action: 'continue_to_connect' }),
                                            })
                                            if (persistRes.ok) {
                                                stage = 'awaiting_drive'
                                            } else {
                                                const err = await persistRes.json().catch(() => ({}))
                                                logger.warn('Onboarding: after_checkout ui-progress failed', err)
                                            }
                                        } catch (e) {
                                            logger.warn('Onboarding: after_checkout ui-progress error', e as Error)
                                        }
                                    }

                                    if (flowV >= 3) {
                                        if (!subscribeSkipped && stage === 'awaiting_subscribe') {
                                            setStep(2)
                                        } else if (!driveConnected) {
                                            setStep(3)
                                        } else if (stage === 'provisioning') {
                                            const nm = String(resolvedOrg.name || SANDBOX_FIRM_NAME_FALLBACK)
                                            setFinalizeTerminalSteps(buildFinalizeTerminalSteps(nm))
                                            setFinalizeTerminalActiveIndex(0)
                                            setStep(4)
                                            driveProvisionStartedRef.current = true
                                        } else {
                                            // Drive OAuth done; sandbox DB/Drive work runs in Stage 4 only.
                                            setStep(4)
                                        }
                                    } else {
                                        if (!firmConnectorId || !fetchedRootId) {
                                            setStep(3)
                                        } else {
                                            setStep(2)
                                        }
                                    }
                                }
                            } else {
                                // Could not create/find org — anchor first; if connector already has root, go straight to Connect
                                setStep(normalLoadRootId ? 3 : 1)
                            }
                        } else {
                            setStep(normalLoadRootId ? 3 : 1)
                        }
                    } catch (err) {
                        logger.error("Failed to check org status", err as Error)
                        setStep(normalLoadRootId ? 3 : 1)
                    }
                }
            } catch (err) {
                logger.error("Error in checkStatus", err as Error)
                setStep(1)
            } finally {
                setIsLoading(false)
            }
        }

        checkStatus()
        // Set onboarding mode in layout context
        setOnboarding(true)
        return () => setOnboarding(false)
    }, [markStepSkipped])

    // Sync local step → OnboardingContext so the sidebar highlights the correct step
    useEffect(() => {
        if (step !== null) {
            setOnboarding(true, step)
        }
    }, [step])

    // Step 3–4: poll until backend exposes root folder id (callback may finish after navigation; not required to leave Stage 3)
    useEffect(() => {
        if (step !== 3 || !isConnected || rootFolderId) return
        const RECOVERY_POLL_MS = 2000
        let cancelled = false
        const poll = async () => {
            try {
                const token = await getAccessToken()
                if (!token || cancelled) return
                const res = await fetch('/api/connectors/google-drive?action=status', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok || cancelled) return
                const data = await res.json()
                const fetchedRootId = data.connector?.rootFolderId
                if (fetchedRootId && !cancelled) {
                    setRootFolderId(fetchedRootId)
                    if (data.connector?.id) setConnectionDetails(prev => ({ ...prev, connectionId: data.connector.id }))
                    if (data.connector?.name) setConnectedEmail(data.connector.name)
                    return
                }
            } catch {
                // ignore
            }
            if (!cancelled) id = window.setTimeout(poll, RECOVERY_POLL_MS)
        }
        let id = window.setTimeout(poll, 0)
        return () => {
            cancelled = true
            if (id) window.clearTimeout(id)
        }
    }, [step, isConnected, rootFolderId])

    // Fetch Domain Options when step is 0
    useEffect(() => {
        if (step === 0 && !domainOptions) {
            const fetchOptions = async () => {
                try {
                    const token = await getAccessToken()
                    if (!token) {
                        setDomainOptions(null)
                        return
                    }
                    const res = await fetch('/api/onboarding/domain-options', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    if (res.ok) {
                        const opts = await res.json()
                        setDomainOptions(opts || null)
                    } else {
                        setDomainOptions(null)
                    }
                } catch (err) {
                    logger.error("Failed to fetch domain options", err as Error)
                    setDomainOptions(null)
                }
            }
            fetchOptions()
        }
    }, [step, domainOptions])

    useEffect(() => {
        if (step === 1 || step === 2) {
            driveProvisionStartedRef.current = false
        }
    }, [step])

    useEffect(() => {
        if (step === 1 || step === 2) {
            setFinalizeTerminalSteps([])
            setFinalizeTerminalActiveIndex(-1)
        }
    }, [step])

    useEffect(() => {
        if (step !== 4 || finalizeTerminalSteps.length === 0) return
        const total = finalizeTerminalSteps.length
        const progressCap = total - 1
        const progressInterval = window.setInterval(() => {
            setFinalizeTerminalActiveIndex((prev) => (prev < progressCap ? prev + 1 : prev))
        }, Math.max(1500, 20000 / total))
        return () => clearInterval(progressInterval)
    }, [step, finalizeTerminalSteps])

    /** When the simulated progress reaches the final step, auto-continue after 5s (timer shown on CTA). */
    useEffect(() => {
        if (step !== 4 || finalizeTerminalSteps.length === 0) {
            setFinalizeAutoNavSeconds(null)
            if (finalizeAutoNavIntervalRef.current) {
                clearInterval(finalizeAutoNavIntervalRef.current)
                finalizeAutoNavIntervalRef.current = null
            }
            return
        }
        const lastIdx = finalizeTerminalSteps.length - 1
        if (finalizeTerminalActiveIndex !== lastIdx) {
            setFinalizeAutoNavSeconds(null)
            if (finalizeAutoNavIntervalRef.current) {
                clearInterval(finalizeAutoNavIntervalRef.current)
                finalizeAutoNavIntervalRef.current = null
            }
            return
        }

        if (finalizeAutoNavIntervalRef.current) {
            clearInterval(finalizeAutoNavIntervalRef.current)
            finalizeAutoNavIntervalRef.current = null
        }

        let remaining = 5
        setFinalizeAutoNavSeconds(5)
        finalizeAutoNavIntervalRef.current = setInterval(() => {
            remaining -= 1
            setFinalizeAutoNavSeconds(remaining > 0 ? remaining : 0)
            if (remaining <= 0) {
                if (finalizeAutoNavIntervalRef.current) {
                    clearInterval(finalizeAutoNavIntervalRef.current)
                    finalizeAutoNavIntervalRef.current = null
                }
                void handleFinish()
            }
        }, 1000)

        return () => {
            if (finalizeAutoNavIntervalRef.current) {
                clearInterval(finalizeAutoNavIntervalRef.current)
                finalizeAutoNavIntervalRef.current = null
            }
        }
    }, [step, finalizeTerminalSteps, finalizeTerminalActiveIndex, handleFinish])

    // Stage 4 only: link sandbox firm ↔ connector + enqueue Inngest (DB + Drive hierarchy). Not gated on root folder.
    useEffect(() => {
        if (step !== 4 || !isConnected || !connectionDetails?.connectionId) return
        if (driveProvisionStartedRef.current) return
        driveProvisionStartedRef.current = true
        void handleAttachConnectorAndProvisionSandbox()
    }, [step, isConnected, connectionDetails?.connectionId, handleAttachConnectorAndProvisionSandbox])

    /** Stage 3 ends when OAuth has stored the connector; advance to Finalize (sandbox work is Stage 4). */
    useEffect(() => {
        if (step !== 3 || !isConnected || !connectionDetails?.connectionId) return
        setStep(4)
    }, [step, isConnected, connectionDetails?.connectionId])

    // Fetch authUrl when step is 3 (Google Drive connection). Not static: button stays disabled until this completes.
    useEffect(() => {
        if (step === 3 && !isConnected && user?.id) {
            setIsFetchingAuthUrl(true)
            const fetchAuthUrl = async () => {
                try {
                    const token = await getAccessToken()
                    if (!token) {
                        setError('Session expired. Please sign in again.')
                        setIsFetchingAuthUrl(false)
                        return
                    }

                    // Check if user already has an active connector — if so, reuse it (skip OAuth)
                    try {
                        const statusRes = await fetch('/api/connectors/google-drive?action=status', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        })
                        if (statusRes.ok) {
                            const statusData = await statusRes.json()
                            if (statusData.isConnected && statusData.connector?.id) {
                                logger.debug("Onboarding Step 3: Existing connector found, reusing", statusData.connector)
                                setIsConnected(true)
                                setConnectionDetails({ connectionId: statusData.connector.id })
                                if (statusData.connector.name) {
                                    setConnectedEmail(statusData.connector.name)
                                }
                                // Ensure org is linked to this connector
                                if (existingOrg?.id && statusData.connector.id) {
                                    await fetch('/api/onboarding/ensure-org', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${token}` }
                                    })
                                }
                                setIsFetchingAuthUrl(false)
                                return
                            }
                        }
                    } catch (err) {
                        logger.warn("Failed to check connector status", err as Error)
                    }

                    // Fetch user's default organization to pass in OAuth state
                    let organizationId: string | undefined = existingOrg?.id
                    if (!organizationId) {
                        try {
                            const orgRes = await fetch('/api/firm', {
                                headers: { 'Authorization': `Bearer ${token}` }
                            })
                            if (orgRes.ok) {
                                const orgData = await orgRes.json()
                                organizationId = orgData.firm?.id ?? orgData.organization?.id
                            }
                        } catch (err) {
                            logger.warn("Failed to fetch default organization", err as Error)
                        }
                    }

                    try {
                        const out = await initiateGoogleDriveOAuthPopup({
                            userId: user.id,
                            organizationId,
                            rootFolderId: rootFolderId || null,
                            headers: { Authorization: `Bearer ${token}` },
                        })
                        setAuthUrl(out.authUrl)
                        setOauthNonce(out.nonce ?? null)
                    } catch (initErr: any) {
                        setError(initErr?.message || 'Failed to initiate Google Drive connection')
                    }
                } catch (err: any) {
                    setError(err.message || 'Failed to connect to Google Drive')
                    logger.error("Error fetching auth URL", err as Error)
                } finally {
                    setIsFetchingAuthUrl(false)
                }
            }
            fetchAuthUrl()
        } else {
            setIsFetchingAuthUrl(false)
        }
    }, [step, isConnected, user?.id, existingOrg?.id, rootFolderId])

    // Fetch connection details on component mount (to resume from URL redirect)
    useEffect(() => {
        const fetchConnectionDetails = async () => {
            const token = await getAccessToken()
            if (!token || !user?.id) return

            const code = searchParams?.get('code')
            const connectionId = searchParams?.get('connectionId')

            if (code && connectionId && step === 3 && !isConnected) {
                try {
                    setIsSubmitting(true)
                    const res = await fetch('/api/connectors/google-drive', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            action: 'finalize',
                            connectionId,
                            parentFolderId: 'root'
                        })
                    })

                    if (res.ok) {
                        const data = await res.json()
                        setConnectionDetails(data)
                        setConnectedEmail(data.email)
                        setIsConnected(true)
                    } else {
                        const err = await res.json()
                        setError(err.error || 'Failed to finalize connection')
                    }
                } catch (err: any) {
                    setError(err.message || 'An error occurred while connecting')
                    logger.error("Error finalizing connection", err as Error)
                } finally {
                    setIsSubmitting(false)
                }
            }
        }

        fetchConnectionDetails()
    }, [searchParams, step, user?.id, isConnected])


    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: arrowAnimationStyle }} />
            {isLoading ? (
                <div className="min-h-screen flex items-center justify-center">
                    <LoadingSpinner message="Setting up your workspace..." showDots={true} size="lg" />
                </div>
            ) : (
                <div className="w-full h-full overflow-y-auto px-8 pt-6 pb-8 flex justify-center">
                    <div className={`w-full ${step === 2 ? 'max-w-5xl' : 'max-w-2xl'}`}>
                        {/* Onboarding Already Completed — redirect guard */}
                        {step === -1 && (
                            <AlreadyCompletedScreen onGoToDashboard={() => void handleFinish()} />
                        )}

                        {/* Domain Choice Screen (Step 0) */}
                        {step === 0 && domainOptions && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-4">
                                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Choose your workspace</h1>
                                    <p className="text-lg text-slate-600">
                                        Your email is part of an organization that uses {BRAND_NAME}
                                    </p>
                                </div>

                                {user?.email && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-8 flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-slate-800 font-bold">
                                            {user.email.charAt(0).toUpperCase()}
                                        </div>
                                        <p className="text-sm font-medium text-slate-900">{user.email}</p>
                                    </div>
                                )}

                                <div className="space-y-3 mb-6">
                                    {domainOptions.orgsAlreadyIn.map((org: DomainOrgOption) => (
                                        <button
                                            key={org.id}
                                            type="button"
                                            className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-left transition-colors group"
                                            onClick={() => router.push(`/d/f/${org.slug}`)}
                                        >
                                            <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200">
                                                <Building2 className="h-5 w-5 text-slate-700" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-semibold text-slate-900">Continue to {org.name}</p>
                                                <p className="text-xs text-slate-500">You're already a member</p>
                                            </div>
                                            <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
                                        </button>
                                    ))}
                                </div>

                                {domainOptions.orgsToJoin.length > 0 && (
                                    <>
                                        <div className="relative mb-6">
                                            <div className="absolute inset-0 flex items-center">
                                                <div className="w-full border-t border-slate-200" />
                                            </div>
                                            <div className="relative flex justify-center text-xs">
                                                <span className="px-2 bg-white text-slate-500">or</span>
                                            </div>
                                        </div>

                                        <div className="space-y-3 mb-6">
                                            {domainOptions.orgsToJoin.map((org: DomainOrgOption) => (
                                                <button
                                                    key={org.id}
                                                    type="button"
                                                    disabled={domainJoiningId !== null}
                                                    className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-left transition-colors disabled:opacity-50 group"
                                                    onClick={async () => {
                                                        setDomainJoiningId(org.id)
                                                        setDomainError(null)
                                                        const result = await joinOrganizationByDomain(org.id)
                                                        if (result.ok) {
                                                            router.push(`/d/f/${result.slug}`)
                                                        } else {
                                                            setDomainError(result.error)
                                                            setDomainJoiningId(null)
                                                        }
                                                    }}
                                                >
                                                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-200">
                                                        {domainJoiningId === org.id ? (
                                                            <LoadingSpinner size="sm" />
                                                        ) : (
                                                            <LogIn className="h-5 w-5 text-slate-700" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-slate-900">Join {org.name}</p>
                                                        <p className="text-xs text-slate-500">Request access</p>
                                                    </div>
                                                    <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600" />
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                <button
                                    type="button"
                                    disabled={domainJoiningId !== null}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition-colors disabled:opacity-50"
                                    onClick={() => setStep(1)}
                                >
                                    <SquarePlus className="h-4 w-4" />
                                    Create a new workspace
                                </button>

                                {domainError && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                        {domainError}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Connect Cloud Storage — mandatory; Inngest runs after link + root. */}
                        {step === 3 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-4 flex items-center justify-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                        <Cloud className="h-5 w-5 text-slate-600" strokeWidth={2} aria-hidden />
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bring your Cloud Drive</h1>
                                            <StepRequirementBadge kind="mandatory" />
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            Non-custodial by design—your files stay in the Google Drive you already own. We connect to organize, share, and deliver a client portal on top of your storage.
                                        </p>
                                    </div>
                                </div>

                                {isConnected ? (
                                    <div className="space-y-4 text-left border-t border-slate-100 pt-4">
                                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                                                    <GoogleDriveIcon size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">Google Drive Connected</p>
                                                    {connectedEmail && (
                                                        <p className="text-xs text-slate-500">{connectedEmail}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Verified
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-center gap-3 py-4 text-slate-600">
                                            <LoadingSpinner size="sm" />
                                            <span className="text-sm font-medium">
                                                Continuing to Finalize workspace…
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg">
                                            <h3 className="font-semibold text-slate-900 mb-4">Your Drive. Your data. Our layer on top.</h3>
                                            <ul className="space-y-3 text-sm text-slate-600">
                                                <li className="flex items-start gap-3">
                                                    <GoogleDriveIcon size={20} className="flex-shrink-0 mt-0.5" />
                                                    <span>
                                                        <strong className="font-semibold text-slate-800">Bring your own Drive.</strong>{' '}
                                                        Plug in the Google account you already use—no migration, no duplicate file warehouse.
                                                    </span>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <Lock className="h-5 w-5 text-slate-700 flex-shrink-0 mt-0.5" />
                                                    <span>
                                                        <strong className="font-semibold text-slate-800">Non-custodial storage.</strong>{' '}
                                                        {BRAND_NAME} never takes custody of your documents; we orchestrate folders, access, and a polished client experience while the files remain yours.
                                                    </span>
                                                </li>
                                                <li className="flex items-start gap-3">
                                                    <HardDrive className="h-5 w-5 text-slate-700 flex-shrink-0 mt-0.5" />
                                                    <span>
                                                        <strong className="font-semibold text-slate-800">Stored on your Drive.</strong>{' '}
                                                        Your content lives in your Google workspace under your policies, retention, and controls—not copied onto ours.
                                                    </span>
                                                </li>
                                            </ul>
                                        </div>

                                        {error && (
                                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                                <div className="flex items-start gap-3">
                                                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                                    <span>{error}</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            <Button
                                                type="button"
                                                onClick={(e) => handleConnectDrive(e)}
                                                disabled={!authUrl || isSubmitting || isFetchingAuthUrl || isConnectingDrive}
                                                className="w-full h-12 flex items-center justify-center bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cta-hover-arrow"
                                            >
                                                {isConnectingDrive ? (
                                                    <>
                                                        <LoadingSpinner size="sm" className="mr-2" />
                                                        Connecting…
                                                    </>
                                                ) : isSubmitting ? (
                                                    <>
                                                        <LoadingSpinner size="sm" className="mr-2" />
                                                        Connecting...
                                                    </>
                                                ) : isFetchingAuthUrl ? (
                                                    <>
                                                        <LoadingSpinner size="sm" className="mr-2" />
                                                        Preparing…
                                                    </>
                                                ) : (
                                                    <>
                                                        Connect your Google Drive
                                                        <ArrowRight className="inline-block ml-2 h-4 w-4 animate-arrow" />
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 1: Anchor firm (mandatory, silent — auto-runs; no full-screen form). */}
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col items-center justify-center min-h-[280px] text-center px-4">
                                <div className="flex items-center justify-center gap-2 mb-3">
                                    <StepRequirementBadge kind="mandatory" />
                                </div>
                                <LoadingSpinner size="lg" className="mb-4" />
                                <p className="text-sm font-medium text-slate-800">Initializing workspace…</p>
                                <p className="text-xs text-slate-500 mt-2 max-w-sm">
                                    This only takes a moment. Sandbox folders and sample data run in the background after you connect Google Drive.
                                </p>
                                {error && (
                                    <div className="mt-6 w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-3 text-left">
                                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                {error && (
                                    <Button
                                        onClick={() => void handlePrepareSandboxShell()}
                                        disabled={creatingSandbox || !sandboxFirmName?.trim() || isSubmitting}
                                        className="mt-4 h-11 rounded-xl font-semibold bg-slate-900 text-white hover:bg-slate-800"
                                    >
                                        {creatingSandbox ? (
                                            <>
                                                <LoadingSpinner size="sm" className="mr-2" />
                                                Retrying…
                                            </>
                                        ) : (
                                            'Retry'
                                        )}
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Step 2: Subscribe — full billing UI (same as /d/billing); Skip → Drive (step 3). */}
                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                {error && (
                                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
                                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                <BillingPageClient
                                    variant="onboardingSubscribe"
                                    onSkipToConnectDrive={() => void skipSubscribeGoToDrive()}
                                    embeddedCheckoutReturnTo="/d/onboarding?after_checkout=1"
                                />
                            </div>
                        )}

                        {/* Step 4: Finalize workspace — background sandbox build (Inngest) with progress UI. */}
                        {step === 4 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                        <Building2 className="h-5 w-5 text-slate-700" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Finalize Workspace</h1>
                                            <StepRequirementBadge kind="mandatory" />
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            We&apos;re creating your sandbox firm structure, clients, and engagements on your Drive. This runs in the background—you can continue when you&apos;re ready.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
                                                    <p className="font-semibold text-slate-900">Building your sandbox</p>
                                                    {finalizeTerminalSteps.length > 0 ? (
                                                        <span className="text-[11px] font-medium tabular-nums text-slate-500">
                                                            {finalizeTerminalActiveIndex} of {finalizeTerminalSteps.length} complete
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                                    The tree below tracks progress while sample clients and engagements are created on your Drive.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-4 rounded-xl border border-emerald-100/80 bg-white/90 p-4">
                                            <SandboxHierarchyPreview
                                                sandboxFirmName={sandboxFirmName}
                                                nodeStatus={(ix) => {
                                                    if (finalizeTerminalSteps.length === 0) return 'pending'
                                                    if (finalizeTerminalActiveIndex > ix) return 'completed'
                                                    if (finalizeTerminalActiveIndex === ix) return 'inProgress'
                                                    return 'pending'
                                                }}
                                            />
                                        </div>
                                        {finalizeTerminalSteps.length > 0 ? (
                                            <FinalizeProvisioningLine
                                                steps={finalizeTerminalSteps}
                                                activeStepIndex={finalizeTerminalActiveIndex}
                                            />
                                        ) : null}
                                    </div>

                                    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5">
                                        <div className="h-8 w-8 shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center mt-0.5">
                                            <Info className="h-4 w-4 text-slate-600" />
                                        </div>
                                        <p className="text-xs leading-relaxed text-slate-700">
                                            Sample data is provisioned on <strong>your</strong> Google Drive. You can continue to your workspace whenever you&apos;re ready—provisioning keeps running in the background and will finish asynchronously.
                                        </p>
                                    </div>
                                </div>

                                {error && (
                                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
                                        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="mt-6 w-full">
                                    <Button
                                        type="button"
                                        className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white hover:bg-slate-800"
                                        onClick={() => void handleFinish()}
                                    >
                                        <span className="inline-flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-2">
                                            <span className="inline-flex items-center gap-2">
                                                Continue to workspace
                                                <ArrowRight className="h-4 w-4 shrink-0" />
                                            </span>
                                            {finalizeAutoNavSeconds !== null && finalizeAutoNavSeconds > 0 ? (
                                                <span className="text-xs font-medium text-white/85">
                                                    Continuing automatically in {finalizeAutoNavSeconds}s…
                                                </span>
                                            ) : null}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </>
    )
}

export default function OnboardingPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>}>
            <OnboardingContent />
        </Suspense>
    )
}
