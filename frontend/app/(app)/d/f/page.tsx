'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ArrowRight, Loader2, SquarePlus, Box, Home, ChevronRight, LayoutGrid } from 'lucide-react'
import { getDomainOnboardingOptionsForCurrentUser, joinOrganizationByDomain, type DomainOnboardingOptions, type DomainOrgOption } from '@/lib/actions/domain-onboarding'
import { getUserFirms, getCanCreateAdditionalFirm, getFirmCreationGateReasonForCurrentUser, type FirmOption } from '@/lib/actions/firms'
import type { FirmCreationGateReason } from '@/lib/billing/firm-creation-gate'
import { BRAND_NAME } from '@/config/brand'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddFirmModal } from '@/components/projects/add-firm-modal'
import { buildBillingPageHref } from '@/lib/billing/build-billing-page-href'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import Link from 'next/link'

export default function WorkspacePickerPage() {
    const router = useRouter()
    const [firms, setFirms] = useState<FirmOption[]>([])
    const [domainOptions, setDomainOptions] = useState<DomainOnboardingOptions | null>(null)
    const [canCreate, setCanCreate] = useState<boolean | null>(null)
    const [gateReason, setGateReason] = useState<FirmCreationGateReason | null>(null)
    const [gateCap, setGateCap] = useState<number | null>(null)
    const [addFirmOpen, setAddFirmOpen] = useState(false)
    const [upgradeHintOpen, setUpgradeHintOpen] = useState(false)
    const upgradeHintRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!upgradeHintOpen) return
        function handleClickOutside(e: MouseEvent) {
            if (upgradeHintRef.current && !upgradeHintRef.current.contains(e.target as Node)) {
                setUpgradeHintOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [upgradeHintOpen])
    const [loading, setLoading] = useState(true)
    const [joiningId, setJoiningId] = useState<string | null>(null)
    const [joinError, setJoinError] = useState<string | null>(null)

    useEffect(() => {
        async function load() {
            const [userFirms, opts] = await Promise.all([
                getUserFirms(),
                getDomainOnboardingOptionsForCurrentUser(),
            ])
            setFirms(userFirms)
            setDomainOptions(opts)
            setLoading(false)
        }
        async function loadEntitlement() {
            try {
                const [canCreateFirm, result] = await Promise.all([
                    getCanCreateAdditionalFirm(),
                    getFirmCreationGateReasonForCurrentUser(),
                ])
                setCanCreate(canCreateFirm)
                setGateReason(result.reason)
                setGateCap(result.cap)
            } catch {
                setCanCreate(false)
                setGateReason('free_sandbox')
                setGateCap(null)
            }
        }
        void load()
        void loadEntitlement()
    }, [])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="md" />
            </div>
        )
    }


    const joinableFirms = domainOptions?.orgsToJoin ?? []

    async function handleJoin(org: DomainOrgOption) {
        setJoiningId(org.id)
        setJoinError(null)
        const result = await joinOrganizationByDomain(org.id)
        if (result.ok) {
            router.push(`/d/f/${result.slug}`)
        } else {
            setJoinError(result.error)
            setJoiningId(null)
        }
    }

    return (
        <TooltipProvider>
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 mb-4">
                <Home className="h-4 w-4 text-[#45474c] opacity-60" />
                <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] font-bold text-[#1b1b1d] uppercase tracking-tighter">Workspaces</span>
            </nav>

            {/* Page header */}
            <div className="flex items-start gap-6 mb-8">
                <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded shadow-sm shrink-0">
                    <Building2 className="h-10 w-10 text-[#1b1b1d]" />
                </div>
                <div>
                    <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-[#1b1b1d]">
                        Choose your workspace
                    </h1>
                    <p className="text-sm text-[#45474c] mt-1">Select a workspace to continue in {BRAND_NAME}</p>
                </div>
            </div>

            <Tabs defaultValue="workspaces" className="flex-1 flex flex-col min-h-0">
                <div className="bg-white border border-[#e5e7eb] rounded mb-6 shrink-0">
                    <div className="flex items-center justify-between h-14 pr-4">
                        <TabsList className="h-full p-0 bg-transparent rounded-none inline-flex justify-start gap-0 border-0">
                            <TabsTrigger
                                value="workspaces"
                                className="h-full px-4 rounded-none font-medium text-sm text-[#45474c] hover:text-[#1b1b1d] border-b-2 border-transparent data-[state=active]:border-brand-accent data-[state=active]:text-[#1b1b1d] data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:opacity-100 opacity-60 hover:opacity-100 transition-all shadow-none bg-transparent"
                            >
                                <LayoutGrid className="w-4 h-4 mr-2" />
                                Workspaces
                                {firms.length > 0 && (
                                    <span className="ml-2 font-mono text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-sm tabular-nums leading-none">
                                        {firms.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                        {canCreate === false ? (
                            <div className="relative" ref={upgradeHintRef}>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] border border-[#e5e7eb] bg-[#f3f4f6] text-[#45474c] font-medium text-[0.8125rem] transition-all hover:bg-[#ebebed]"
                                    onClick={() => setUpgradeHintOpen(v => !v)}
                                >
                                    <SquarePlus className="h-4 w-4" />
                                    Create new Firm
                                </button>
                                {upgradeHintOpen && (
                                    <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-[2px] border border-[#e5e7eb] bg-[#f3f4f6] p-3 shadow-md">
                                        <div className="flex items-start gap-2">
                                            <SquarePlus className="h-4 w-4 shrink-0 text-[#45474c] translate-y-0.5" aria-hidden />
                                            <div>
                                                <p className="text-sm font-medium text-[#1b1b1d] leading-snug">
                                                    {gateReason === 'at_cap' ? 'Firm limit reached' : upgradeCopy.dropdownHeadline}
                                                </p>
                                                <p className="text-xs text-[#45474c] leading-snug mt-1.5">
                                                    {gateReason === 'at_cap'
                                                        ? `Your plan allows ${gateCap ?? firms.length} firm workspace${(gateCap ?? firms.length) === 1 ? '' : 's'}. Contact us to increase your limit.`
                                                        : upgradeCopy.dropdownBody}
                                                </p>
                                                {gateReason === 'at_cap' ? (
                                                    <a
                                                        href="mailto:support@firmaone.com"
                                                        className="mt-2 inline-block text-xs font-semibold text-primary hover:underline underline-offset-2"
                                                        onClick={() => setUpgradeHintOpen(false)}
                                                    >
                                                        Contact support
                                                    </a>
                                                ) : (
                                                    <Link
                                                        href={buildBillingPageHref({ firmSlug: firms[0]?.slug ?? null, pathname: '/d/f/' })}
                                                        className="mt-2 inline-block text-xs font-semibold text-primary hover:underline underline-offset-2"
                                                        onClick={() => setUpgradeHintOpen(false)}
                                                    >
                                                        {upgradeCopy.dropdownAction}
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : canCreate === true ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] bg-primary hover:brightness-110 text-primary-foreground font-medium text-[0.8125rem] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
                                onClick={() => setAddFirmOpen(true)}
                            >
                                <SquarePlus className="h-4 w-4" />
                                Create new Firm
                            </button>
                        ) : null}
                    </div>
                </div>

                <TabsContent value="workspaces" className="flex-1 mt-0">
                <div className="w-full">

                {/* Member firms */}
                {firms.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {firms.map((firm) => (
                            <button
                                key={firm.id}
                                type="button"
                                className={`group relative flex flex-col gap-4 p-5 rounded-[2px] border bg-white shadow-md hover:shadow-lg text-left transition-all overflow-hidden h-48 ${firm.sandboxOnly ? 'border-dashed border-[#e5e7eb] hover:border-[#e5e7eb]' : 'border-[#e5e7eb] hover:border-primary/40'}`}
                                onClick={() => router.push(`/d/f/${firm.slug}`)}
                            >
                                {/* Brand corner decoration — only for non-sandbox firms */}
                                {!firm.sandboxOnly && (() => {
                                    const accent = firm.themeColor ?? null
                                    const solidFill = accent ?? 'hsl(var(--primary))'
                                    const fadeFill = accent ?? 'hsl(var(--primary))'
                                    return (
                                        <svg className="absolute bottom-0 right-0 pointer-events-none" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <polygon points="48,0 48,48 0,48" fill={fadeFill} fillOpacity="0.12" />
                                            <polygon points="48,22 48,48 22,48" fill={solidFill} />
                                        </svg>
                                    )
                                })()}
                                <div className="flex items-start justify-between">
                                    <div
                                        className={`h-12 w-12 rounded-[2px] flex items-center justify-center flex-shrink-0 overflow-hidden ${firm.sandboxOnly ? 'bg-[#f9f9fb] border border-[#e5e7eb]' : 'border'}`}
                                        style={!firm.sandboxOnly && firm.themeColor
                                            ? { backgroundColor: `${firm.themeColor}18`, borderColor: `${firm.themeColor}33` }
                                            : !firm.sandboxOnly ? undefined : undefined}
                                    >
                                        {firm.logoUrl
                                            ? <img src={firm.logoUrl} alt={firm.name} className="h-full w-full object-contain p-1" />
                                            : <Building2 className={`h-6 w-6 ${firm.sandboxOnly ? 'text-[#45474c]' : 'text-primary'}`} style={!firm.sandboxOnly && firm.themeColor ? { color: firm.themeColor } : undefined} />
                                        }
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <p className="font-bold text-[#1b1b1d] text-base leading-tight">{firm.name}</p>
                                        {firm.sandboxOnly && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Box className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" aria-label="Sandbox firm" />
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                    Sandbox Firm — no real client data
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <p className="text-xs text-[#45474c]/70">You&apos;re already a member</p>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-sm w-fit">
                                    Continue <ArrowRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Domain-joinable firms */}
                {joinableFirms.length > 0 && (
                    <>
                        {firms.length > 0 && (
                            <div className="relative mb-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-[#e5e7eb]" />
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="px-2 bg-white text-[#45474c]">or join</span>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {joinableFirms.map((org) => (
                                <button
                                    key={org.id}
                                    type="button"
                                    disabled={joiningId !== null}
                                    className="group relative flex flex-col gap-4 p-5 rounded-[2px] border border-[#e5e7eb] bg-white shadow-md hover:shadow-lg hover:border-primary/40 text-left transition-all disabled:opacity-50 h-48"
                                    onClick={() => handleJoin(org)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="h-12 w-12 rounded-[2px] bg-[#f9f9fb] border border-[#e5e7eb] flex items-center justify-center flex-shrink-0">
                                            {joiningId === org.id ? (
                                                <Loader2 className="h-5 w-5 text-[#45474c] animate-spin" />
                                            ) : (
                                                <Building2 className="h-6 w-6 text-[#45474c]" />
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
                        {joinError && (
                            <p className="text-sm text-red-600 mb-4">{joinError}</p>
                        )}
                    </>
                )}

                </div>
                </TabsContent>
            </Tabs>
            {canCreate === true && (
                <AddFirmModal open={addFirmOpen} onOpenChange={setAddFirmOpen} />
            )}
        </div>
        </TooltipProvider>
    )
}
