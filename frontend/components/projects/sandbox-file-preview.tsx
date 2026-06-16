'use client'

import React, { useState } from 'react'
import { Info, Folder, Link2, MessageCircle, MoreVertical } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { ProfileBubbleWithPopup } from '@/components/ui/profile-bubble-popup'
import { DocumentActionMenu } from '@/components/ui/document-action-menu'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/utils'
import { DriveFile } from '@/lib/types'
import sandboxHierarchyJson from '@/lib/services/sandbox-hierarchy.json'

const PREVIEW_OWNER = { name: 'Alex Jordan', email: 'alex@example.com' }

export type SandboxFolder = { name: string; files?: { name: string; type: string }[]; subfolders?: SandboxFolder[] }
export type SandboxEngagement = { name: string; structure: Record<string, SandboxFolder> }

export function buildSandboxPreviewFiles(projectName?: string): DriveFile[] {
    const clients = (sandboxHierarchyJson as any).clients as { clientName: string; engagements: SandboxEngagement[] }[]
    let engagement: SandboxEngagement | undefined
    for (const client of clients) {
        engagement = client.engagements.find(e =>
            projectName ? e.name.toLowerCase().includes(projectName.toLowerCase()) || projectName.toLowerCase().includes(e.name.toLowerCase()) : false
        ) ?? client.engagements[0]
        if (engagement) break
    }
    if (!engagement) return []

    const files: DriveFile[] = []
    let idx = 0

    const makeFolder = (id: string, name: string): DriveFile => ({
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: new Date(Date.now() - idx * 86400000 * 2).toISOString(),
        webViewLink: '',
        iconLink: '',
    } as DriveFile)

    const makeFile = (id: string, name: string, type: string): DriveFile => {
        idx++
        return {
            id,
            name,
            mimeType: mimeTypeForExt(type),
            modifiedTime: new Date(Date.now() - idx * 86400000).toISOString(),
            webViewLink: '',
            iconLink: '',
            size: String((idx % 9 + 1) * 128 * 1024),
            owners: [{ displayName: 'Sample User', emailAddress: 'sample@example.com', photoLink: null }],
        } as unknown as DriveFile
    }

    for (const [sectionKey, section] of Object.entries(engagement.structure)) {
        files.push(makeFolder(`preview-folder-${sectionKey}`, section.name))
        for (const sub of section.subfolders ?? []) {
            idx++
            files.push(makeFolder(`preview-subfolder-${idx}`, sub.name))
        }
        for (const f of section.files ?? []) {
            files.push(makeFile(`preview-file-${idx}`, f.name, f.type))
        }
        for (const sub of section.subfolders ?? []) {
            for (const f of sub.files ?? []) {
                files.push(makeFile(`preview-file-${idx}`, f.name, f.type))
            }
        }
    }

    // Folders first, then files — stable sort preserving relative order within each group
    return [
        ...files.filter(f => f.mimeType === 'application/vnd.google-apps.folder'),
        ...files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder'),
    ]
}

export function mimeTypeForExt(ext: string): string {
    switch (ext) {
        case 'pdf': return 'application/pdf'
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        case 'md': return 'text/markdown'
        default: return 'application/octet-stream'
    }
}

interface SandboxPreviewFileRowProps {
    file: DriveFile
    activeCommentDocId: string | null
    onOpenCommentPane: (docId: string) => void
    onOpenSearch: () => void
}

function SandboxPreviewFileRow({ file, activeCommentDocId, onOpenCommentPane, onOpenSearch }: SandboxPreviewFileRowProps) {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
    const [menuOpen, setMenuOpen] = useState(false)
    const isCommentActive = file.id === activeCommentDocId

    return (
        <div
            style={{ gridTemplateColumns: 'minmax(0, 1fr) 10% 10% 14% 12% 8%' }}
            className={cn(
                "group grid gap-4 h-10 pl-3 pr-2 items-center text-[0.8125rem] hover:bg-[#f9f9fb] cursor-default",
                menuOpen && "bg-[#f3f4f6]",
                isCommentActive && !isFolder && "bg-[#f3f4f6]",
            )}
        >
            {/* Name column */}
            <div className="flex items-center gap-3 min-w-0">
                {/* Checkbox / icon toggle on hover */}
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center relative">
                    <div className="absolute inset-0 flex items-center justify-center hidden group-hover:flex">
                        <Checkbox checked={false} className="h-4 w-4 pointer-events-none" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center flex group-hover:hidden">
                        {isFolder ? (
                            <Folder className="h-4 w-4 fill-primary/20 text-primary flex-shrink-0" />
                        ) : (
                            <DocumentIcon mimeType={file.mimeType} className="h-4 w-4" />
                        )}
                    </div>
                </div>
                <span className={cn(
                    "text-[0.8125rem] font-medium truncate",
                    isFolder ? "text-[#1b1b1d]" : "text-[#45474c]"
                )}>
                    {file.name}
                </span>
            </div>

            {/* Badges column — empty for preview */}
            <div className="flex items-center justify-end gap-1" />

            {/* Quick icons column */}
            <div className="flex items-center justify-end">
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {!isFolder && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'h-7 w-7 rounded-md inline-flex items-center justify-center',
                                        isCommentActive
                                            ? 'text-slate-700 bg-slate-100'
                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                                    )}
                                    aria-label="Open comments"
                                    onClick={() => onOpenCommentPane(file.id)}
                                >
                                    <MessageCircle className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Comments (preview)</TooltipContent>
                        </Tooltip>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                className="h-7 w-7 rounded-md inline-flex items-center justify-center text-slate-400 cursor-not-allowed opacity-40"
                                aria-label="Copy link"
                                disabled
                            >
                                <Link2 className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">Unavailable in preview</TooltipContent>
                    </Tooltip>
                    <DocumentActionMenu
                        document={{
                            id: file.id,
                            name: file.name,
                            mimeType: file.mimeType,
                            modifiedTime: file.modifiedTime,
                            size: file.size ?? null,
                        }}
                        triggerIcon={<MoreVertical className="h-4 w-4" />}
                        isEngagementLead={true}
                        canManage={true}
                        onOpenChange={setMenuOpen}
                        onOpenDocument={() => {}}
                        onRenameDocument={() => {}}
                        onDuplicateDocument={() => {}}
                        onMoveDocument={() => {}}
                        onDeleteDocument={() => {}}
                        onOpenCommentPane={() => {}}
                        sandboxPreview
                    />
                </div>
            </div>

            {/* Owner column */}
            <div className="min-w-0">
                {!isFolder ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                        <ProfileBubbleWithPopup
                            name={PREVIEW_OWNER.name}
                            email={PREVIEW_OWNER.email}
                            avatarUrl={null}
                        />
                        <span className="text-[0.8125rem] text-[#45474c] truncate">{PREVIEW_OWNER.name}</span>
                    </div>
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                )}
            </div>

            {/* Date modified column */}
            <div>
                {file.modifiedTime ? (
                    <RelativeDateTime
                        date={file.modifiedTime}
                        textClassName="text-[0.8125rem] text-[#45474c]"
                        iconClassName="text-[#e5e7eb] hover:text-[#45474c]"
                        tooltipSide="top"
                    />
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]">—</span>
                )}
            </div>

            {/* File size column */}
            <div className="text-left">
                {isFolder ? (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                ) : file.size ? (
                    <span className="text-[0.8125rem] text-[#45474c]/40 font-mono">
                        {formatFileSize(Number(file.size))}
                    </span>
                ) : (
                    <span className="text-[0.8125rem] text-[#45474c]/40">—</span>
                )}
            </div>
        </div>
    )
}

interface SandboxFilePreviewProps {
    projectName?: string
    onOpenCommentPane?: (docId: string) => void
    onOpenSearch?: () => void
}

export function SandboxFilePreview({ projectName, onOpenCommentPane, onOpenSearch }: SandboxFilePreviewProps) {
    const [activeCommentDocId, setActiveCommentDocId] = useState<string | null>(null)

    const handleOpenCommentPane = (docId: string) => {
        setActiveCommentDocId(prev => prev === docId ? null : docId)
        onOpenCommentPane?.(docId)
    }

    const handleOpenSearch = () => {
        onOpenSearch?.()
    }

    return (
        <div className="relative select-none">
            {/* Preview banner */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-950">
                <Info className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                <span className="text-[0.75rem] font-medium">This is a demo firm — sample files are shown for preview only. Sign up for a paid plan to manage real client files.</span>
            </div>
            {/* File rows */}
            <div className="divide-y divide-[#e5e7eb]">
                {buildSandboxPreviewFiles(projectName).map((file) => (
                    <SandboxPreviewFileRow
                        key={file.id}
                        file={file}
                        activeCommentDocId={activeCommentDocId}
                        onOpenCommentPane={handleOpenCommentPane}
                        onOpenSearch={handleOpenSearch}
                    />
                ))}
            </div>
        </div>
    )
}
