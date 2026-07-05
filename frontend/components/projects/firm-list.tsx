'use client'

import React, { useState } from 'react'
import { Building2, Clock } from 'lucide-react'
import { FirmOption, switchFirm } from '@/lib/actions/firms'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { FirmSwitchDialog } from './firm-switch-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface FirmListProps {
    firms: FirmOption[]
    viewMode?: 'grid' | 'list'
    activeOrgIdFromJWT?: string | null
}

export function FirmList({ firms, viewMode = 'grid', activeOrgIdFromJWT }: FirmListProps) {
    const pathname = usePathname()
    const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
    const [targetOrg, setTargetOrg] = useState<{ slug: string; name: string } | null>(null)

    // Current org from URL; when on /d (no org in path), use default org as "active"
    const currentOrgSlug = pathname?.match(/^\/d\/f\/([^\/]+)/)?.[1] ?? null
    const activeOrgSlug = currentOrgSlug ?? firms.find(o => o.isDefault)?.slug ?? null
    const currentOrg = currentOrgSlug ? firms.find(o => o.slug === currentOrgSlug) : null

    const handleOrgClick = async (e: React.MouseEvent, org: FirmOption) => {
        // If this firm is already the ACTIVE one according to the JWT or the URL,
        // we can safely navigate without re-triggering the switch logic.
        if (activeOrgIdFromJWT === org.id || currentOrgSlug === org.slug) {
            return
        }

        e.preventDefault()

        // If it's the default org and we are on the landing dashboard (/d),
        // we can navigate directly or auto-switch without showing the confirmation dialog.
        if (org.isDefault && !currentOrgSlug) {
            try {
                await switchFirm(org.slug)
                const { supabase } = await import('@/lib/supabase')
                await supabase.auth.refreshSession()
                window.location.href = `/d/f/${org.slug}`
                return
            } catch (err) {
                console.error('Failed to auto-switch to default org:', err)
                // Fallback to normal flow if something goes wrong
            }
        }

        setTargetOrg({ slug: org.slug, name: org.name })
        setSwitchDialogOpen(true)
    }

    if (firms.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                    <Building2 className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No firms found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                    You don't belong to any firms yet.
                </p>
            </div>
        )
    }

    const ActiveIndicator = () => (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-purple-600 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-600" />
                </span>
            </TooltipTrigger>
            <TooltipContent side="top">Active</TooltipContent>
        </Tooltip>
    )

    if (viewMode === 'list') {
        return (
            <>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 font-medium text-slate-500">Firm</th>
                                <th className="px-4 py-3 font-medium text-slate-500 text-right">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {firms.map((org) => (
                                <tr key={org.id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/d/f/${org.slug}`}
                                            prefetch={false}
                                            onClick={(e) => handleOrgClick(e, org)}
                                            className="flex items-center gap-3"
                                        >
                                            <div className="h-8 w-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center shrink-0">
                                                <Building2 className="h-4 w-4" />
                                            </div>
                                            <div className="flex items-center gap-2 min-w-0">
                                                {activeOrgSlug === org.slug && (
                                                    <ActiveIndicator />
                                                )}
                                                <span className="font-medium text-slate-900 group-hover:text-black transition-colors truncate">
                                                    {org.name}
                                                </span>
                                                {org.sandboxOnly && (
                                                    <span className="px-1.5 py-0.5 bg-amber-100/50 text-amber-700 rounded text-[10px] font-medium shrink-0 border border-amber-200/50">
                                                        Sandbox
                                                    </span>
                                                )}
                                                {org.isDefault && (
                                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium shrink-0">
                                                        Default
                                                    </span>
                                                )}
                                            </div>
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-400">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Clock className="h-3 w-3" />
                                            <span>{formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {targetOrg && (
                    <FirmSwitchDialog
                        open={switchDialogOpen}
                        onOpenChange={setSwitchDialogOpen}
                        targetFirmSlug={targetOrg.slug}
                        targetFirmName={targetOrg.name}
                        currentFirmName={currentOrg?.name}
                    />
                )}
            </>
        )
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {firms.map((org) => (
                    <Link
                        key={org.id}
                        href={`/d/f/${org.slug}`}
                        prefetch={false}
                        onClick={(e) => handleOrgClick(e, org)}
                        className="group relative bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-48"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="h-10 w-10 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                                <Building2 className="h-5 w-5" />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {activeOrgSlug === org.slug && (
                                    <ActiveIndicator />
                                )}
                                {org.sandboxOnly && (
                                    <span className="px-2 py-1 bg-amber-100/50 text-amber-700 rounded-full text-[10px] font-medium border border-amber-200/50">
                                        Sandbox
                                    </span>
                                )}
                                {org.isDefault && (
                                    <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-medium">
                                        Default
                                    </span>
                                )}
                            </div>
                        </div>

                        <h3 className="text-sm font-semibold text-slate-900 mb-1 line-clamp-1 group-hover:text-black transition-colors">
                            {org.name}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-2 mb-auto">
                            {org.isDefault ? 'Your default workspace' : 'Click to open workspace'}
                        </p>

                        <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between text-[11px] text-slate-400">
                            <div className="flex items-center gap-1.5" title="Created">
                                <Clock className="h-3 w-3" />
                                <span>{formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {targetOrg && (
                <FirmSwitchDialog
                    open={switchDialogOpen}
                    onOpenChange={setSwitchDialogOpen}
                    targetFirmSlug={targetOrg.slug}
                    targetFirmName={targetOrg.name}
                    currentFirmName={currentOrg?.name}
                />
            )}
        </>
    )
}
