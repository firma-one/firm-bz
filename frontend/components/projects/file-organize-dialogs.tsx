'use client'

import type { ReactNode } from 'react'
import { Briefcase, Building2, Check, ChevronRight, Copy, Folder, FolderInput } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Hint } from '@/components/ui/tooltip'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ClientIcon } from '@/components/ui/client-icon'
import { DocumentIcon } from '@/components/ui/document-icon'
import { CreateDialogFooter, CreateDialogHeader } from '@/components/ui/create-dialog'
import { cn } from '@/lib/utils'
import type { DriveFile } from '@/lib/types'

/*
 * The Files list's organize dialogs — Move/Copy to folder, Copy to another engagement, Rename, and
 * the upload's duplicate files —
 * on the design system's dialog frame (2026-10-23, .claude/plans/ui-ux-overhaul.md Phase 6): the
 * 10px dialog radius, a sentence-case title with one line of context (CreateDialogHeader), 14px
 * rows on a 6px card, `sm` buttons and Cancel bottom-right under a hairline. They replace the
 * uppercase "themed" dialogs in engagement-file-list.tsx, which stay behind NEW_ORGANIZE_DIALOGS
 * until sign-off.
 */

/** The frame's panel: the Dialog's own radius and surface, no padding of its own. */
const PANEL_CLASS = 'gap-0 p-0 sm:max-w-md'

/**
 * The title block over a hairline, mirroring the footer's: the title and close button read as their
 * own row, apart from the controls under them.
 */
function DividedHeader({ title, description }: { title: string; description: ReactNode }) {
    return (
        <div className="border-b border-line pb-3">
            <CreateDialogHeader title={title} description={description} />
        </div>
    )
}

/**
 * The file or folder being acted on, as a chip in the header's context line: the Discussions
 * document chip's look (icon and name on a muted 4px tile), cut short with the full name on hover.
 */
function FileChip({ name, mimeType }: { name?: string; mimeType?: string }) {
    if (!name) return <>this item</>
    return (
        <span title={name} className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-surface-muted px-1.5 py-px align-bottom font-medium text-fg">
            <DocumentIcon mimeType={mimeType} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{name}</span>
        </span>
    )
}

/** The bordered list a picker scrolls in. */
const LIST_CLASS = 'max-h-64 overflow-y-auto rounded-card border border-line'

/**
 * Footer with only Cancel (the pickers act per row): CreateDialogFooter's placement, but outlined,
 * as in ConfirmDialog — a ghost Cancel with no primary beside it didn't read as a button.
 */
function CancelFooter({ onCancel }: { onCancel: () => void }) {
    return (
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
    )
}

/**
 * A two-option segmented control: the view toggle's shape on a grey (`surface-muted`) track, with
 * the picked option raised in white — on the view toggle's near-white track it barely showed.
 */
function Segmented<T extends string | boolean>({ label, value, options, onChange }: {
    label: string
    value: T
    options: ReadonlyArray<{ value: T; label: string }>
    onChange: (value: T) => void
}) {
    return (
        <div className="inline-flex items-center rounded-control bg-surface-muted p-0.5" role="group" aria-label={label}>
            {options.map((o) => (
                <button
                    key={String(o.value)}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'h-6 rounded-[4px] px-2.5 text-small outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action/30',
                        value === o.value ? 'bg-surface font-medium text-fg shadow-sm ring-1 ring-line-strong' : 'text-fg-muted hover:text-fg'
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

function ListLoading() {
    return (
        <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="sm" />
        </div>
    )
}

function ListEmpty({ children }: { children: ReactNode }) {
    return <p className="px-4 py-6 text-center text-small leading-relaxed text-fg-muted">{children}</p>
}

export interface CopyMoveDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    action: 'copy' | 'move'
    targetName?: string
    /** Picks the chip's icon. */
    targetMimeType?: string
    keepBoth: boolean
    onKeepBothChange: (keepBoth: boolean) => void
    /** From the root (General, Confidential or Staging) down to the folder being shown. */
    path: { id: string; name: string }[]
    onPathClick: (index: number) => void
    loading: boolean
    folders: DriveFile[]
    emptyFolderIds: Set<string>
    /** Folders known to have subfolders (the look-ahead's answer): only these show an arrow. */
    subfolderIds: Set<string>
    checkingFolderId: string | null
    submittingFolderId: string | null
    onOpenFolder: (folder: DriveFile) => void
    onSubmit: (folderId: string) => void
    onCancel: () => void
}

/** Move/Copy to folder: browse the root's folders and move or copy into one, or into the root itself. */
export function CopyMoveDialog({
    open, onOpenChange, action, targetName, targetMimeType, keepBoth, onKeepBothChange, path, onPathClick, loading, folders,
    emptyFolderIds, subfolderIds, checkingFolderId, submittingFolderId, onOpenFolder, onSubmit, onCancel,
}: CopyMoveDialogProps) {
    const verb = action === 'copy' ? 'Copy' : 'Move'
    const root = path[0]
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={PANEL_CLASS}>
                <DividedHeader
                    title={`${verb} to folder`}
                    description={<><FileChip name={targetName} mimeType={targetMimeType} /> will be {action === 'copy' ? 'copied' : 'moved'} to the folder you pick.</>}
                />

                <div className="space-y-4 px-5 pb-5 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-small text-fg-muted">If the name already exists</span>
                        <Segmented
                            label="If the name already exists"
                            value={keepBoth}
                            onChange={onKeepBothChange}
                            options={[{ value: true, label: 'Keep both' }, { value: false, label: 'Replace' }] as const}
                        />
                    </div>

                    <div className="space-y-1.5">
                        {path.length > 0 && (
                            <div className="flex min-h-7 items-center justify-between gap-2">
                                <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center text-small">
                                    {path.map((seg, i) => (
                                        <div key={seg.id} className="flex shrink-0 items-center">
                                            {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />}
                                            <button
                                                type="button"
                                                onClick={() => onPathClick(i)}
                                                title={seg.name}
                                                aria-current={i === path.length - 1 ? 'location' : undefined}
                                                className={cn(
                                                    'flex max-w-[160px] items-center gap-1.5 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover',
                                                    i === path.length - 1 ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg'
                                                )}
                                            >
                                                {/* The root is the engagement's own top folder: the breadcrumb's Briefcase and label */}
                                                {i === 0
                                                    ? <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                                    : <Folder className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />}
                                                <span className="truncate">{seg.name}</span>
                                            </button>
                                        </div>
                                    ))}
                                </nav>
                                {/* Into the root itself — only at the root (General/Confidential/Staging) level */}
                                {path.length === 1 && root && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onSubmit(root.id)}
                                        disabled={!!submittingFolderId}
                                        className={cn('h-7 shrink-0 gap-1.5 px-2 text-small text-fg-muted hover:text-fg', submittingFolderId === root.id && 'disabled:opacity-100')}
                                    >
                                        {submittingFolderId === root.id ? <LoadingSpinner size="sm" /> : <ActionIcon action={action} />}
                                        {verb} here
                                    </Button>
                                )}
                            </div>
                        )}

                        <div className={cn(LIST_CLASS, 'divide-y divide-line')}>
                            {loading ? (
                                <ListLoading />
                            ) : folders.length === 0 ? (
                                <ListEmpty>No subfolders here. Use the path above to go back, or {action} into this folder.</ListEmpty>
                            ) : (
                                folders.map((f) => {
                                    const isEmpty = emptyFolderIds.has(f.id)
                                    const hasSubfolders = subfolderIds.has(f.id)
                                    const isChecking = checkingFolderId === f.id
                                    return (
                                        <div key={f.id} className="group flex h-9 items-center justify-between gap-3 pl-2 pr-1.5 transition-colors hover:bg-surface-hover">
                                            <button
                                                type="button"
                                                onClick={() => !isEmpty && !isChecking && onOpenFolder(f)}
                                                disabled={isChecking}
                                                title={isEmpty ? 'No subfolders' : hasSubfolders ? `Open ${f.name}` : undefined}
                                                className={cn(
                                                    'flex min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left text-ui text-fg outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                                                    hasSubfolders && !isChecking ? 'cursor-pointer' : 'cursor-default'
                                                )}
                                            >
                                                <Folder className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                                                <span className="truncate">{f.name}</span>
                                                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                                    {/* The arrow waits for the look-ahead: one that showed and then vanished read as "has subfolders" for a moment. */}
                                                    {isChecking ? <LoadingSpinner size="sm" /> : hasSubfolders ? <ChevronRight className="h-3.5 w-3.5 text-fg-subtle animate-in fade-in duration-150" aria-hidden /> : null}
                                                </span>
                                            </button>
                                            <RowAction
                                                action={action}
                                                folderName={f.name}
                                                busy={submittingFolderId === f.id}
                                                disabled={!!submittingFolderId}
                                                onClick={() => onSubmit(f.id)}
                                            />
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>

                <CancelFooter onCancel={onCancel} />
            </DialogContent>
        </Dialog>
    )
}

/** Copy's or Move's 14px glyph. */
function ActionIcon({ action }: { action: 'copy' | 'move' }) {
    const Icon = action === 'copy' ? Copy : FolderInput
    return <Icon className="h-3.5 w-3.5" aria-hidden />
}

/**
 * A picker row's action: a quiet 28px icon (like the Files toolbar's), named in its hint and label,
 * darker on the row's hover. Busy, it shows a spinner in place; while another row is busy it dims.
 */
function RowAction({ action, folderName, busy, disabled, onClick }: {
    action: 'copy' | 'move'
    folderName: string
    busy: boolean
    disabled: boolean
    onClick: () => void
}) {
    const label = `${action === 'copy' ? 'Copy' : 'Move'} to ${folderName}`
    return (
        <Hint label={label}>
            <button
                type="button"
                aria-label={label}
                onClick={onClick}
                disabled={disabled}
                className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors',
                    'hover:bg-surface-muted hover:text-fg group-hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30',
                    'disabled:pointer-events-none disabled:opacity-40',
                    busy && 'disabled:opacity-100'
                )}
            >
                {busy ? <LoadingSpinner size="sm" /> : <ActionIcon action={action} />}
            </button>
        </Hint>
    )
}

export interface CopyToEngagementDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    targetName?: string
    /** Picks the chip's icon. */
    targetMimeType?: string
    firmName: string | null
    loading: boolean
    engagements: { id: string; name: string; clientId: string; clientName: string }[]
    selectedId: string | null
    onSelect: (id: string) => void
    submitting: boolean
    onSubmit: () => void
    onCancel: () => void
}

/** Copy to another engagement: the firm's engagements by client; the copy lands in that engagement's General folder. */
export function CopyToEngagementDialog({
    open, onOpenChange, targetName, targetMimeType, firmName, loading, engagements, selectedId, onSelect, submitting, onSubmit, onCancel,
}: CopyToEngagementDialogProps) {
    const groups = Object.values(
        engagements.reduce<Record<string, { clientName: string; engagements: typeof engagements }>>((acc, e) => {
            if (!acc[e.clientId]) acc[e.clientId] = { clientName: e.clientName, engagements: [] }
            acc[e.clientId].engagements.push(e)
            return acc
        }, {})
    ).sort((a, b) => a.clientName.localeCompare(b.clientName))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={PANEL_CLASS}>
                <form onSubmit={(e) => { e.preventDefault(); if (selectedId && !submitting) onSubmit() }}>
                    <DividedHeader
                        title="Copy to another engagement"
                        description={<>Pick where to copy <FileChip name={targetName} mimeType={targetMimeType} />. It lands in that engagement’s General folder.</>}
                    />
                    <div className="px-5 pb-5 pt-4">
                        <div className={cn(LIST_CLASS, 'p-1')} role="listbox" aria-label="Engagements">
                            {loading ? (
                                <ListLoading />
                            ) : engagements.length === 0 ? (
                                <ListEmpty>No other engagements available.</ListEmpty>
                            ) : (
                                <>
                                    {firmName && (
                                        <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-small font-medium text-fg-muted">
                                            <Building2 className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                                            <span className="truncate">{firmName}</span>
                                        </div>
                                    )}
                                    {groups.map((group) => (
                                        <div key={group.clientName} className="pb-1">
                                            <div className="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-small text-fg-muted">
                                                <ClientIcon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                                                <span className="truncate">{group.clientName}</span>
                                            </div>
                                            {[...group.engagements].sort((a, b) => a.name.localeCompare(b.name)).map((e) => {
                                                const selected = selectedId === e.id
                                                return (
                                                    <button
                                                        key={e.id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={selected}
                                                        onClick={() => onSelect(e.id)}
                                                        className={cn(
                                                            'flex h-8 w-full items-center gap-2 rounded-control pl-7 pr-2 text-left text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-action/30',
                                                            selected ? 'bg-surface-selected font-medium text-fg' : 'text-fg hover:bg-surface-hover'
                                                        )}
                                                    >
                                                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                                                        <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                                        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-action" aria-hidden />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                    <CreateDialogFooter
                        onCancel={onCancel}
                        submitDisabled={!selectedId || submitting}
                        submitting={submitting}
                        submitLabel="Copy"
                    />
                </form>
            </DialogContent>
        </Dialog>
    )
}

export interface RenameDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    targetName?: string
    /** Picks the chip's icon. */
    targetMimeType?: string
    value: string
    onChange: (value: string) => void
    /** The file's extension, shown after the field and kept as is. */
    extension?: string
    submitting: boolean
    onSubmit: () => void
    onCancel: () => void
}

/** Rename a file or folder; the extension stays as it is. */
export function RenameDialog({ open, onOpenChange, targetName, targetMimeType, value, onChange, extension, submitting, onSubmit, onCancel }: RenameDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={PANEL_CLASS}>
                <form onSubmit={(e) => { e.preventDefault(); if (value.trim() && !submitting) onSubmit() }}>
                    <DividedHeader
                        title="Rename"
                        description={<>Enter a new name for <FileChip name={targetName} mimeType={targetMimeType} />.</>}
                    />
                    <div className="flex items-center gap-1.5 px-5 pb-5 pt-4">
                        <Input
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="New name"
                            aria-label="New name"
                            autoFocus
                        />
                        {extension && <span className="shrink-0 text-small text-fg-muted">{extension}</span>}
                    </div>
                    <CreateDialogFooter
                        onCancel={onCancel}
                        submitDisabled={!value.trim() || submitting}
                        submitting={submitting}
                        submitLabel="Save"
                    />
                </form>
            </DialogContent>
        </Dialog>
    )
}

export interface UploadConflictDialogProps {
    /** Files in the upload whose names already exist in the destination folder. */
    files: { name: string; type?: string }[]
    /** Names of the files that replace the existing one; the rest upload as a renamed copy. */
    replace: Set<string>
    onReplaceChange: (name: string, replace: boolean) => void
    onReplaceAllChange: (replace: boolean) => void
    onCancel: () => void
    onConfirm: () => void
}

/**
 * An upload whose files already exist in the folder: per file, replace the existing one or upload a
 * renamed copy (the default the hook starts from is replace). Cancel stops the whole upload.
 */
export function UploadConflictDialog({ files, replace, onReplaceChange, onReplaceAllChange, onCancel, onConfirm }: UploadConflictDialogProps) {
    const allReplaced = files.length > 0 && replace.size === files.length
    const many = files.length > 1
    return (
        <Dialog open={files.length > 0} onOpenChange={(open) => { if (!open) onCancel() }}>
            <DialogContent className={PANEL_CLASS}>
                <form onSubmit={(e) => { e.preventDefault(); onConfirm() }}>
                    <DividedHeader
                        title={many ? `${files.length} files already in this folder` : 'This file is already in the folder'}
                        description={many
                            ? 'Choose which to replace. The others upload as a copy with a new name.'
                            : 'Replace the existing file, or upload this one as a copy with a new name.'}
                    />
                    <div className="px-5 pb-5 pt-4">
                        <div className={cn(LIST_CLASS, 'divide-y divide-line')}>
                            {many && (
                                <label className="flex h-9 cursor-pointer items-center gap-2.5 px-3 text-small text-fg-muted">
                                    <Checkbox checked={allReplaced} onCheckedChange={(checked) => onReplaceAllChange(checked === true)} aria-label="Replace all" />
                                    <span className="font-medium">Replace all</span>
                                </label>
                            )}
                            {files.map((f) => {
                                const replacing = replace.has(f.name)
                                return (
                                    <label key={f.name} className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-surface-hover">
                                        <Checkbox checked={replacing} onCheckedChange={(checked) => onReplaceChange(f.name, checked === true)} aria-label={`Replace ${f.name}`} />
                                        <DocumentIcon mimeType={f.type} className="h-4 w-4 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate text-ui text-fg" title={f.name}>{f.name}</span>
                                        <span className="shrink-0 text-small text-fg-muted">{replacing ? 'Replaces the existing file' : 'Uploads as a copy'}</span>
                                    </label>
                                )
                            })}
                        </div>
                    </div>
                    <CreateDialogFooter onCancel={onCancel} submitLabel="Upload" />
                </form>
            </DialogContent>
        </Dialog>
    )
}
