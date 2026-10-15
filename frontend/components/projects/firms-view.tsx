'use client'

import React, { useState, useEffect } from 'react'
import { FirmOption } from '@/lib/actions/firms'
import { Building2, LayoutGrid, List, Plus } from 'lucide-react'
import { FirmList } from './firm-list'
import { AddFirmModal } from './add-firm-modal'
import { Button } from '@/components/ui/button'
import { PageHeading } from '@/components/ui/page-heading'

interface FirmsViewProps {
    firms: FirmOption[]
    activeOrgIdFromJWT?: string | null
}

export function FirmsView({ firms, activeOrgIdFromJWT }: FirmsViewProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')

    // Load view mode preference from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('fm-firm-view-mode')
        if (saved === 'list' || saved === 'grid') {
            setViewMode(saved)
        }
    }, [])

    const handleViewModeChange = (mode: 'grid' | 'list') => {
        setViewMode(mode)
        localStorage.setItem('fm-firm-view-mode', mode)
    }

    return (
        <div className="flex flex-col h-full">
            <PageHeading
                icon={<Building2 />}
                title={
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">Firms</span>
                        {firms.length > 0 && <span className="text-h3 font-normal tabular-nums text-fg-subtle">{firms.length}</span>}
                    </span>
                }
                actions={
                    <>
                        <div className="inline-flex items-center rounded-control border border-line bg-surface-subtle p-0.5" role="group" aria-label="View">
                            {([['grid', 'Gallery view', LayoutGrid], ['list', 'List view', List]] as const).map(([mode, label, Icon]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => handleViewModeChange(mode)}
                                    aria-pressed={viewMode === mode}
                                    aria-label={label}
                                    title={label}
                                    className={`flex h-6 w-7 items-center justify-center rounded-[4px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-action/30 ${viewMode === mode ? 'bg-surface text-fg shadow-sm' : 'text-fg-subtle hover:text-fg'}`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                </button>
                            ))}
                        </div>
                        <AddFirmModal
                            trigger={
                                <Button size="sm">
                                    <Plus className="h-3.5 w-3.5" />
                                    New firm
                                </Button>
                            }
                        />
                    </>
                }
            />
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <FirmList
                    firms={firms}
                    viewMode={viewMode}
                    activeOrgIdFromJWT={activeOrgIdFromJWT}
                />
            </div>
        </div>
    )
}
