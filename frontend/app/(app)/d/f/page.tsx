'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Building2, ArrowRight, Loader2, SquarePlus, Box, Home, ChevronRight, LayoutGrid } from 'lucide-react'
import { getDomainOnboardingOptionsForCurrentUser, joinOrganizationByDomain, type DomainOnboardingOptions, type DomainOrgOption } from '@/lib/actions/domain-onboarding'
import { getUserFirms, getIsAdminOnAnyFirm, type FirmOption } from '@/lib/actions/firms'
import { BRAND_NAME } from '@/config/brand'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddFirmModal } from '@/components/projects/add-firm-modal'
import { FirmSwitchDialog } from '@/components/projects/firm-switch-dialog'

export default function WorkspacePickerPage() {
    const router = useRouter()
    const pathname = usePathname()
    const [firms, setFirms] = useState<FirmOption[]>([])
    const [domainOptions, setDomainOptions] = useState<DomainOnboardingOptions | null>(null)
    const [isAdminOnAnyFirm, setIsAdminOnAnyFirm] = useState(false)
    const [addFirmOpen, setAddFirmOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [joiningId, setJoiningId] = useState<string | null>(null)
    const [joinError, setJoinError] = useState<string | null>(null)
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
    const [targetOrg, setTargetOrg] = useState<{ slug: string; name: string } | null>(null)

    const currentOrgSlug = pathname?.match(/^\/d\/f\/([^/]+)/)?.[1] ?? null

    useEffect(() => {
        async function load() {
            const [userFirms, opts, isAdmin] = await Promise.all([
                getUserFirms(),
                getDomainOnboardingOptionsForCurrentUser(),
                getIsAdminOnAnyFirm(),
            ])
            setFirms(userFirms)
            setDomainOptions(opts)
            setIsAdminOnAnyFirm(isAdmin)
            setLoading(false)
        }
        void load()
    }, [])

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="md" />
            </div>
        )
    }


    const joinableFirms = domainOptions?.orgsToJoin ?? []

    function handleFirmClick(firm: FirmOption) {
        if (currentOrgSlug && currentOrgSlug !== firm.slug) {
            setTargetOrg({ slug: firm.slug, name: firm.name })
            setSwitchDialogOpen(true)
        } else {
            router.push(`/d/f/${firm.slug}`)
        }
    }

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
                        {isAdminOnAnyFirm && (
                        <button
                            type="button"
                            className="h-auto px-4 py-1.5 rounded bg-primary text-white text-[10px] font-headline font-bold tracking-widest uppercase hover:brightness-105 shadow-sm hover:shadow-[0_6px_16px_-4px_rgba(var(--primary-rgb),0.40),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 transition-all inline-flex items-center gap-1.5"
                            onClick={() => setAddFirmOpen(true)}
                        >
                            <SquarePlus className="h-3.5 w-3.5" />
                            Add Firm
                        </button>
                        )}
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
                                className={`group relative flex flex-col gap-4 p-5 rounded border bg-white shadow-md hover:shadow-lg text-left transition-all overflow-hidden h-48 ${firm.sandboxOnly ? 'border-dashed border-[#e5e7eb] hover:border-[#e5e7eb]' : 'border-[#e5e7eb] hover:border-primary/40'}`}
                                onClick={() => handleFirmClick(firm)}
                            >
                                {/* Brand corner decoration */}
                                {firm.sandboxOnly ? (
                                    <svg className="absolute bottom-0 right-0 pointer-events-none" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <polygon points="48,0 48,48 0,48" fill="#9ca3af" fillOpacity="0.18" />
                                        <polygon points="48,22 48,48 22,48" fill="#6b7280" />
                                    </svg>
                                ) : (() => {
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
                                        className={`h-12 w-12 rounded flex items-center justify-center flex-shrink-0 overflow-hidden ${firm.sandboxOnly ? 'bg-[#f9f9fb] border border-[#e5e7eb]' : 'border'}`}
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
                                                    <Box className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" aria-label="Demo firm" />
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                    Demo Firm — contains sample data
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <p className="text-xs text-[#45474c]/70">You&apos;re already a member</p>
                                </div>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm w-fit ${firm.sandboxOnly ? 'text-[#6b7280] bg-[#9ca3af]/20' : 'text-primary bg-primary/10'}`}>
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
                                    className="group relative flex flex-col gap-4 p-5 rounded border border-[#e5e7eb] bg-white shadow-md hover:shadow-lg hover:border-primary/40 text-left transition-all disabled:opacity-50 h-48"
                                    onClick={() => handleJoin(org)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="h-12 w-12 rounded bg-[#f9f9fb] border border-[#e5e7eb] flex items-center justify-center flex-shrink-0">
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
            <AddFirmModal open={addFirmOpen} onOpenChange={setAddFirmOpen} />
            {targetOrg && (
                <FirmSwitchDialog
                    open={switchDialogOpen}
                    onOpenChange={setSwitchDialogOpen}
                    targetFirmSlug={targetOrg.slug}
                    targetFirmName={targetOrg.name}
                    currentFirmName={firms.find(f => f.slug === currentOrgSlug)?.name}
                />
            )}
        </div>
        </TooltipProvider>
    )
}
