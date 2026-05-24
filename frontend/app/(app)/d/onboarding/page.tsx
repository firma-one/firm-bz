"use client"

import React, { useState, useEffect, Suspense, useCallback, useRef } from "react"
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
import { GoogleDriveMock, CALLOUTS as DRIVE_MOCK_CALLOUTS, STAGE_TO_STEP } from "@/components/google-drive/google-drive-mock"
import {
    initiateGoogleDriveOAuthPopup,
    startGoogleDriveOAuthPopup,
    googleDriveOAuthPopupFailureMessage,
} from '@/lib/google-drive-popup-oauth'
import { BillingPageClient } from '@/components/billing/billing-page-client'
import { clearCheckoutIntent } from '@/lib/marketing/checkout-intent'
import { Checkbox } from "@/components/ui/checkbox"
import { generateWorkspaceFolderName } from "@/lib/generate-unique-workspace-folder-name"

const ONBOARDING_CREATING_STORAGE_KEY = 'firm_onboarding_creating'
const FINALIZE_AUTO_NAV_TOTAL_SECONDS = 5

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
            className={`font-mono inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide tabular-nums leading-none ${
                kind === 'mandatory'
                    ? 'bg-[#1b1b1d]/10 text-[#1b1b1d]'
                    : 'border border-amber-200/80 bg-amber-50 text-amber-900'
            }`}
        >
            {kind === 'mandatory' ? 'Mandatory' : 'Optional'}
        </span>
    )
}

async function getAccessToken(): Promise<string | null> {
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
            <div className="h-20 w-20 rounded-[2px] bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 mx-auto">
                <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-headline text-2xl font-bold text-[#1b1b1d] mb-3">You're all set!</h1>
            <p className="text-[#45474c] mb-2 text-[0.8125rem]">
                Onboarding has already been completed for your account.
            </p>
            <p className="text-xs text-[#45474c]/60 mb-8">
                Redirecting to your dashboard in <span className="font-bold text-[#45474c]">{countdown}s</span>…
            </p>
            <button
                onClick={onGoToDashboard}
                className="inline-flex items-center gap-2 h-auto px-4 py-1.5 rounded-[2px] bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:bg-primary hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all border-0"
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
    const [myDriveCreating, setMyDriveCreating] = useState(false)
    const [myDriveCreated, setMyDriveCreated] = useState(false)
    const [myDriveCountdown, setMyDriveCountdown] = useState<number | null>(null)
    const [hasCopied, setHasCopied] = useState(false)
    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
    const [driveLocationConfirmed, setDriveLocationConfirmed] = useState(false)
    const [sharedDriveWizardStep, setSharedDriveWizardStep] = useState<1 | 2>(1)
    const [sharedDriveFolderConfirmed, setSharedDriveFolderConfirmed] = useState(false)
    const [mockCallout, setMockCallout] = useState(DRIVE_MOCK_CALLOUTS["shared-drives"])
    const [mockActiveStep, setMockActiveStep] = useState(STAGE_TO_STEP["shared-drives"])
    const [mockCompleted, setMockCompleted] = useState(false)
    const [workspaceFolderName] = useState(() => generateWorkspaceFolderName())

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
                        if (statusData.connector?.email || statusData.connector?.name) setConnectedEmail(statusData.connector.email || statusData.connector.name)
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
            try {
                const token = await getAccessToken()
                if (connectionDetails?.connectionId) {
                    await Promise.all([
                        fetch('/api/connectors/google-drive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({
                                action: 'update-root-folder',
                                connectionId: connectionDetails.connectionId,
                                rootFolderId: selectedId
                            })
                        }),
                        fetch('/api/onboarding/ui-progress', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ action: 'confirm_drive_location' })
                        })
                    ])
                    setDriveLocationConfirmed(true)
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
        clearCheckoutIntent()
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
                                if (statusData.connector.email || statusData.connector.name) setConnectedEmail(statusData.connector.email || statusData.connector.name)
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
                                            if (statusData.connector.email || statusData.connector.name) setConnectedEmail(statusData.connector.email || statusData.connector.name)
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
                                        } else if (!driveConnected || stage === 'awaiting_drive') {
                                            // Stay on step 3 until folder is selected (stage advances past 'awaiting_drive' only after folder pick)
                                            setStep(3)
                                        } else if (stage === 'provisioning') {
                                            const nm = String(resolvedOrg.name || SANDBOX_FIRM_NAME_FALLBACK)
                                            setFinalizeTerminalSteps(buildFinalizeTerminalSteps(nm))
                                            setFinalizeTerminalActiveIndex(0)
                                            setStep(4)
                                            driveProvisionStartedRef.current = true
                                        } else {
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
                    if (data.connector?.email || data.connector?.name) setConnectedEmail(data.connector.email || data.connector.name)
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

        let remaining = FINALIZE_AUTO_NAV_TOTAL_SECONDS
        setFinalizeAutoNavSeconds(FINALIZE_AUTO_NAV_TOTAL_SECONDS)
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

    /** Stage 3 ends once the user has confirmed their drive location (My Drive or Shared Drive). */
    useEffect(() => {
        if (step !== 3 || !isConnected || !connectionDetails?.connectionId || !driveLocationConfirmed) return
        setStep(4)
    }, [step, isConnected, connectionDetails?.connectionId, driveLocationConfirmed])

    // My Drive folder creation countdown → auto-confirm when it hits 0
    useEffect(() => {
        if (myDriveCountdown === null) return
        if (myDriveCountdown <= 0) { setDriveLocationConfirmed(true); return }
        const t = setTimeout(() => setMyDriveCountdown(c => (c ?? 1) - 1), 1000)
        return () => clearTimeout(t)
    }, [myDriveCountdown])

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
                                if (statusData.connector.externalAccountId || statusData.connector.name) {
                                    setConnectedEmail(statusData.connector.email || statusData.connector.name)
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
                            skipAutoFolder: true,
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
    }, [step, isConnected, user?.id, existingOrg?.id, rootFolderId, previewDrive])

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
                    <div className={`w-full ${step === 2 || step === 3 ? 'max-w-5xl' : 'max-w-2xl'}`}>
                        {/* Onboarding Already Completed — redirect guard */}
                        {step === -1 && (
                            <AlreadyCompletedScreen onGoToDashboard={() => void handleFinish()} />
                        )}

                        {/* Domain Choice Screen (Step 0) */}
                        {step === 0 && domainOptions && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="mb-6">
                                    <h1 className="font-headline text-3xl font-bold text-[#1b1b1d] mb-2">Choose your workspace</h1>
                                    <p className="text-[0.8125rem] text-[#45474c]">
                                        Your email is part of an organization that uses {BRAND_NAME}
                                    </p>
                                </div>

                                {user?.email && (
                                    <div className="bg-[#f9f9fb] border border-[#e5e7eb] rounded-[2px] px-4 py-3 mb-8 flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xs">
                                            {user.email.charAt(0).toUpperCase()}
                                        </div>
                                        <p className="text-[0.8125rem] text-[#45474c]">{user.email}</p>
                                    </div>
                                )}

                                {/* Already-in orgs as cards */}
                                {domainOptions.orgsAlreadyIn.length > 0 && (
                                    <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2">
                                        {domainOptions.orgsAlreadyIn.map((org: DomainOrgOption) => (
                                            <button
                                                key={org.id}
                                                type="button"
                                                className="group relative flex flex-col gap-4 p-5 rounded-[2px] border border-[#e5e7eb] bg-white hover:border-primary/40 hover:shadow-md text-left transition-all"
                                                onClick={() => router.push(`/d/f/${org.slug}`)}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="h-12 w-12 rounded-[2px] bg-[#f9f9fb] border border-[#e5e7eb] flex items-center justify-center flex-shrink-0">
                                                        <Building2 className="h-6 w-6 text-[#45474c]" />
                                                    </div>
                                                    <ArrowRight className="h-4 w-4 text-[#45474c]/30 group-hover:text-primary transition-colors mt-1" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-[#1b1b1d] text-base leading-tight mb-1">{org.name}</p>
                                                    <p className="text-xs text-[#45474c]/70">You're already a member</p>
                                                </div>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-sm w-fit">
                                                    Continue <ArrowRight className="h-2.5 w-2.5" />
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {domainOptions.orgsToJoin.length > 0 && (
                                    <>
                                        {domainOptions.orgsAlreadyIn.length > 0 && (
                                            <div className="relative mb-6">
                                                <div className="absolute inset-0 flex items-center">
                                                    <div className="w-full border-t border-[#e5e7eb]" />
                                                </div>
                                                <div className="relative flex justify-center text-xs">
                                                    <span className="px-2 bg-white text-[#45474c] text-xs">or join</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2">
                                            {domainOptions.orgsToJoin.map((org: DomainOrgOption) => (
                                                <button
                                                    key={org.id}
                                                    type="button"
                                                    disabled={domainJoiningId !== null}
                                                    className="group relative flex flex-col gap-4 p-5 rounded-[2px] border border-[#e5e7eb] bg-white hover:border-primary/40 hover:shadow-md text-left transition-all disabled:opacity-50"
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
                                                    <div className="flex items-start justify-between">
                                                        <div className="h-12 w-12 rounded-[2px] bg-[#f9f9fb] border border-[#e5e7eb] flex items-center justify-center flex-shrink-0">
                                                            {domainJoiningId === org.id ? (
                                                                <LoadingSpinner size="sm" />
                                                            ) : (
                                                                <LogIn className="h-6 w-6 text-[#45474c]" />
                                                            )}
                                                        </div>
                                                        <ArrowRight className="h-4 w-4 text-[#45474c]/30 group-hover:text-primary transition-colors mt-1" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-[#1b1b1d] text-base leading-tight mb-1">{org.name}</p>
                                                        <p className="text-xs text-[#45474c]/70">Request access to join</p>
                                                    </div>
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#45474c] bg-[#f9f9fb] border border-[#e5e7eb] px-2 py-0.5 rounded-sm w-fit">
                                                        Join workspace
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                <div className="relative mb-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-[#e5e7eb]" />
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="px-2 bg-white text-[#45474c] text-xs">or</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={domainJoiningId !== null}
                                    className="group w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[2px] bg-primary hover:brightness-110 text-primary-foreground font-medium text-[0.8125rem] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)] disabled:opacity-50"
                                    onClick={() => setStep(1)}
                                >
                                    <Building2 className="h-4 w-4" />
                                    Create a new Firm workspace
                                </button>

                                {domainError && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-[2px] text-xs text-red-700">
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
                                    <div className="space-y-6 text-left border-t border-slate-100 pt-6">
                                        {/* Step ① — label + card grouped tightly */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">1</span>
                                                <p className="text-sm font-semibold text-slate-800">Google Drive Connected</p>
                                            </div>
                                            {/* Connected badge */}
                                            <div className="p-4 bg-white border border-slate-200 flex items-center justify-between">
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
                                        </div>

                                        {/* Drive location selection */}
                                        {!previewDrive ? (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                                <p className="text-sm text-slate-600 mb-3">Choose where your workspace folder should live in Google Drive.</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            setPreviewDrive("My Drive")
                                                            setMyDriveCreating(true)
                                                            setMyDriveCreated(false)
                                                            setMyDriveCountdown(null)
                                                            try {
                                                                const token = await getAccessToken()
                                                                if (token && connectionDetails?.connectionId) {
                                                                    await Promise.all([
                                                                        fetch('/api/connectors/google-drive', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                            body: JSON.stringify({ action: 'ensure-my-drive-workspace', connectionId: connectionDetails.connectionId })
                                                                        }),
                                                                        fetch('/api/onboarding/ui-progress', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                            body: JSON.stringify({ action: 'confirm_drive_location' })
                                                                        })
                                                                    ])
                                                                }
                                                            } catch (e) {
                                                                logger.error('Failed to create My Drive workspace', e as Error)
                                                            } finally {
                                                                setMyDriveCreating(false)
                                                                setMyDriveCreated(true)
                                                                setMyDriveCountdown(3)
                                                            }
                                                        }}
                                                        className="group flex flex-col items-start gap-3 border-2 border-slate-100 bg-white p-5 text-left transition-all hover:border-slate-900 hover:shadow-lg active:scale-[0.98]"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 group-hover:bg-slate-100">
                                                                <svg width="24px" height="24px" viewBox="0 0 24 24" fill="#4285F4" focusable="false"><path d="M9.05 15H15q.275 0 .5-.137.225-.138.35-.363l1.1-1.9q.125-.225.1-.5-.025-.275-.15-.5l-2.95-5.1q-.125-.225-.35-.363Q13.375 6 13.1 6h-2.2q-.275 0-.5.137-.225.138-.35.363L7.1 11.6q-.125.225-.125.5t.125.5l1.05 1.9q.125.25.375.375T9.05 15Zm1.2-3L12 9l1.75 3ZM3 17V4q0-.825.587-1.413Q4.175 2 5 2h14q.825 0 1.413.587Q21 3.175 21 4v13Zm2 5q-.825 0-1.413-.587Q3 20.825 3 20v-1h18v1q0 .825-.587 1.413Q19.825 22 19 22Z"/></svg>
                                                            </div>
                                                            <p className="font-bold text-slate-900">My Drive</p>
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-relaxed">
                                                            Your personal Google Drive. Best if you don&apos;t have a Google Workspace account or prefer to store files in your own Drive.
                                                        </p>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewDrive("Shared Drive")}
                                                        className="group flex flex-col items-start gap-3 border-2 border-slate-100 bg-white p-5 text-left transition-all hover:border-slate-900 hover:shadow-lg active:scale-[0.98]"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 group-hover:bg-slate-100">
                                                                <svg width="24px" height="24px" viewBox="0 0 24 24" fill="#34A853" focusable="false"><g><rect fill="none" height="24" width="24"/></g><g><g><path d="M19,2H5C3.9,2,3,2.9,3,4v13h18V4C21,2.9,20.1,2,19,2z M9.5,7C10.33,7,11,7.67,11,8.5c0,0.83-0.67,1.5-1.5,1.5 S8,9.33,8,8.5C8,7.67,8.67,7,9.5,7z M13,14H6v-1.35C6,11.55,8.34,11,9.5,11s3.5,0.55,3.5,1.65V14z M14.5,7C15.33,7,16,7.67,16,8.5 c0,0.83-0.67,1.5-1.5,1.5S13,9.33,13,8.5C13,7.67,13.67,7,14.5,7z M18,14h-4v-1.35c0-0.62-0.3-1.12-0.75-1.5 c0.46-0.1,0.9-0.15,1.25-0.15c1.16,0,3.5,0.55,3.5,1.65V14z"/><path d="M3,20c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2v-2H3V20z M18,19c0.55,0,1,0.45,1,1s-0.45,1-1,1s-1-0.45-1-1S17.45,19,18,19z"/></g></g></svg>
                                                            </div>
                                                            <p className="font-bold text-slate-900">Shared Drive</p>
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-relaxed">
                                                            A team drive under your Google Workspace account. Recommended for firms where files should be owned by the organisation, not an individual.
                                                        </p>
                                                    </button>
                                                </div>
                                            </div>
                                        ) : previewDrive === "My Drive" ? (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                                                {myDriveCreating ? (
                                                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                                        <svg className="h-4 w-4 shrink-0 animate-spin text-slate-500" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                                        </svg>
                                                        <p className="text-sm text-slate-600">Creating workspace folder in My Drive…</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                                        <p className="text-sm text-slate-700">
                                                            Workspace folder created in <span className="font-semibold">My Drive</span>.
                                                            {myDriveCountdown !== null && myDriveCountdown > 0 && (
                                                                <span className="ml-1 text-slate-400">Continuing in {myDriveCountdown}s…</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                )}
                                                {!myDriveCreating && (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => { setPreviewDrive(null); setMyDriveCreated(false); setMyDriveCountdown(null) }}
                                                            className="border-slate-300 text-slate-600"
                                                        >
                                                            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                                                            Change location
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold"
                                                            onClick={() => setDriveLocationConfirmed(true)}
                                                        >
                                                            Continue now
                                                            <ArrowRight className="ml-2 h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            /* Shared Drive — 2-step wizard */
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                                                {/* Step 1 — guided demo + create folder */}
                                                {sharedDriveWizardStep === 1 && (
                                                    <div className="animate-in fade-in duration-200 space-y-8">

                                                        {/* ② Copy folder name */}
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">2</span>
                                                                <p className="text-sm font-semibold text-slate-800">Copy your workspace root folder name</p>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                                                <code className="break-all font-mono text-sm text-slate-900">{workspaceFolderName}</code>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        void navigator.clipboard.writeText(workspaceFolderName)
                                                                        setHasCopied(true)
                                                                        setTimeout(() => setHasCopied(false), 2000)
                                                                    }}
                                                                    className="ml-2 shrink-0 flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all"
                                                                >
                                                                    {hasCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                                                    {hasCopied ? "Copied!" : "Copy"}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* ③ Visual guide + instructions */}
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">3</span>
                                                                <p className="text-sm font-semibold text-slate-800">Follow instructions to create workspace root folder in Google Shared Drive</p>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-4 items-stretch">
                                                                {/* Callout — spans both columns */}
                                                                <div className={`col-span-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-300 ${
                                                                    mockCallout.done
                                                                        ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                                                                        : "border-blue-100 bg-blue-50 text-blue-800"
                                                                }`}>
                                                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mockCallout.done ? "bg-emerald-500" : "animate-pulse bg-blue-500"}`} />
                                                                    {mockCallout.text}
                                                                </div>

                                                                {/* Animated Google Drive mock */}
                                                                <GoogleDriveMock
                                                                    folderName={workspaceFolderName}
                                                                    onStageChange={(_, callout, activeStep) => { setMockCallout(callout); setMockActiveStep(activeStep); if (callout.done) setMockCompleted(true) }}
                                                                />

                                                                {/* Roman numeral steps with live highlighting */}
                                                                <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white px-5 py-4">
                                                                    {([
                                                                        { n: 1, roman: "i",   text: <>Open <a href={`https://drive.google.com/drive/u/0/shared-drives?authuser=${connectedEmail ?? ""}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">Google Drive &gt; Shared Drives</a></> },
                                                                        { n: 2, roman: "ii",  text: <>Double-click the Shared Drive where your workspace should live.</> },
                                                                        { n: 3, roman: "iii", text: <>Click <span className="font-semibold">+ New</span> → <span className="font-semibold">New folder</span>.</> },
                                                                        { n: 4, roman: "iv",  text: <>Paste the folder name from above and click <span className="font-semibold">Create</span>.</> },
                                                                        { n: 5, roman: "v",   text: <>Return here and click <span className="font-semibold">Select Folder</span>.</> },
                                                                    ] as { n: number; roman: string; text: React.ReactNode }[]).map(({ n, roman, text }) => {
                                                                        const completed = n < mockActiveStep
                                                                        const active = n === mockActiveStep
                                                                        return (
                                                                            <div key={n} className={`flex items-start gap-2.5 py-1.5 transition-all duration-300 ${active ? "opacity-100" : completed ? "opacity-70" : "opacity-40"}`}>
                                                                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                                                                                    completed ? "bg-emerald-100 text-emerald-600" :
                                                                                    active    ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-200" :
                                                                                                "bg-slate-100 text-slate-400"
                                                                                }`}>
                                                                                    {roman}
                                                                                </span>
                                                                                <span className={`flex-1 text-sm transition-colors duration-300 ${active ? "font-semibold text-slate-900" : completed ? "text-slate-500" : "text-slate-400"}`}>
                                                                                    {text}
                                                                                </span>
                                                                                {completed && (
                                                                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 transition-all duration-300" />
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* ④ Confirmation */}
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">4</span>
                                                                <p className="text-sm font-semibold text-slate-800">Confirm folder creation</p>
                                                            </div>
                                                            <label className={`flex items-start gap-3 rounded-lg border p-3 transition-colors duration-300 ${
                                                                mockCompleted
                                                                    ? "cursor-pointer border-slate-200 bg-white"
                                                                    : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                                                            }`}>
                                                                <Checkbox
                                                                    checked={sharedDriveFolderConfirmed}
                                                                    onCheckedChange={(v) => mockCompleted && setSharedDriveFolderConfirmed(v === true)}
                                                                    disabled={!mockCompleted}
                                                                    className="mt-0.5"
                                                                />
                                                                <span className="text-sm text-slate-700">I&apos;ve created the folder with the exact name in my Shared Drive.</span>
                                                            </label>
                                                            {!mockCompleted && (
                                                                <p className="text-xs text-slate-400">Watch the guide above to unlock this step.</p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between pt-1">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() => { setPreviewDrive(null); setSharedDriveWizardStep(1); setSharedDriveFolderConfirmed(false); setHasCopied(false) }}
                                                                className="border-slate-300 text-slate-600"
                                                            >
                                                                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                                                                Change location
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                className="bg-slate-900 text-white hover:bg-slate-800 font-bold"
                                                                disabled={!sharedDriveFolderConfirmed}
                                                                onClick={() => setSharedDriveWizardStep(2)}
                                                            >
                                                                Select Folder
                                                                <ArrowRight className="ml-2 h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Step 2 — pick the folder via Google Picker */}
                                                {sharedDriveWizardStep === 2 && (
                                                    <div className="animate-in fade-in duration-200 space-y-3">
                                                        <p className="text-sm text-slate-700">
                                                            Open the folder picker below. The search is pre-filled with your folder name — select it to set it as your workspace root.
                                                        </p>
                                                        {connectionDetails?.connectionId ? (
                                                            <GooglePickerButton
                                                                connectionId={connectionDetails.connectionId}
                                                                mode="select-folder"
                                                                driveType="Shared Drive"
                                                                query={workspaceFolderName}
                                                                onImport={(items) => {
                                                                    const first = items[0] as { id: string; name: string } | string | undefined
                                                                    const folderId = first ? (typeof first === 'string' ? first : first.id) : undefined
                                                                    if (folderId) void handleRootFolderSelected([folderId])
                                                                }}
                                                            >
                                                                <Button
                                                                    type="button"
                                                                    variant="blackCta"
                                                                    className="w-full py-5 text-base font-medium"
                                                                >
                                                                    <FolderOpen className="mr-2 h-5 w-5" />
                                                                    Open folder picker
                                                                </Button>
                                                            </GooglePickerButton>
                                                        ) : (
                                                            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-5 text-sm text-slate-400">
                                                                <LoadingSpinner size="sm" />
                                                                Loading picker…
                                                            </div>
                                                        )}
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => setSharedDriveWizardStep(1)}
                                                            className="border-slate-300 text-slate-600"
                                                        >
                                                            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                                                            Back
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="p-6 bg-white border border-slate-200">
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

                                        {/* Google Workspace tip */}
                                        <div className="flex gap-2.5 border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs text-blue-800">
                                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                                            <p className="leading-relaxed">
                                                <span className="font-semibold">Google Workspace?</span> Connect with a dedicated account not tied to any individual user, so access isn&apos;t disrupted if someone leaves.{' '}
                                                <a
                                                    href="https://support.google.com/a/answer/7378726"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="underline underline-offset-2 hover:text-blue-900 transition-colors"
                                                >
                                                    How to create a service account →
                                                </a>
                                            </p>
                                        </div>

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
                                    <div className="border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm">
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
                                        <div className="mt-4 border border-emerald-100/80 bg-white/90 p-4">
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

                                    <div className="flex items-start gap-3 border border-slate-200 bg-white p-3.5">
                                        <div className="h-8 w-8 shrink-0 rounded-lg bg-white border border-slate-200 flex items-center justify-center mt-0.5">
                                            <Info className="h-4 w-4 text-slate-600" />
                                        </div>
                                        <p className="text-xs leading-relaxed text-slate-700">
                                            Sample data is provisioned on <strong>your </strong> Google Drive. You can continue to your workspace whenever you&apos;re ready—provisioning keeps running in the background and will finish asynchronously.
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
                                        className="relative h-12 w-full overflow-hidden rounded-xl bg-slate-900 font-bold text-white hover:bg-slate-800"
                                        onClick={() => void handleFinish()}
                                    >
                                        {finalizeAutoNavSeconds !== null && finalizeAutoNavSeconds > 0 ? (
                                            <span
                                                aria-hidden="true"
                                                className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-1000 ease-linear"
                                                style={{
                                                    width: `${Math.max(
                                                        0,
                                                        Math.min(
                                                            100,
                                                            ((FINALIZE_AUTO_NAV_TOTAL_SECONDS - finalizeAutoNavSeconds) /
                                                                FINALIZE_AUTO_NAV_TOTAL_SECONDS) *
                                                                100
                                                        )
                                                    )}%`,
                                                }}
                                            />
                                        ) : null}
                                        <span className="relative z-10 inline-flex flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-2">
                                            <span className="inline-flex items-center gap-2">
                                                Continue to workspace
                                                <ArrowRight className="h-4 w-4 shrink-0" />
                                            </span>
                                            {finalizeAutoNavSeconds !== null && finalizeAutoNavSeconds > 0 ? (
                                                <span className="text-xs font-medium text-white/85">
                                                    {finalizeAutoNavSeconds}s
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
