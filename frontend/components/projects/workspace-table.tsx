'use client'

import type { ReactNode } from 'react'
import { Shield, Type } from 'lucide-react'
import {
    NotionTable,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { WorkspaceMark } from './workspace-card'

export type WorkspaceRow = {
    key: string
    name: string
    logoUrl?: string | null
    accent?: string | null
    /** Replaces the default firm icon, e.g. the group icon, or a spinner while joining. */
    icon?: ReactNode
    /** Shown after the name, e.g. the "Current" tag. */
    badge?: ReactNode
    /** The count column's value, e.g. 3 (clients) or 2 (firms). Omit to leave it blank. */
    count?: number
    /** The last column: the viewer's role tag, or an action like "Join firm". */
    trailing?: ReactNode
    disabled?: boolean
    onClick: () => void
}

/**
 * The workspace pickers' table view (.claude/plans/ui-ux-overhaul.md, Phase 6) — the same Notion
 * table as All clients: name with its mark, a count, and the viewer's role. The row opens the
 * workspace; the name is also a button, so the table works from the keyboard.
 */
export function WorkspaceTable({
    rows,
    countLabel,
    countIcon,
    trailingLabel = 'Your role',
}: {
    rows: WorkspaceRow[]
    countLabel: string
    countIcon: ReactNode
    trailingLabel?: string
}) {
    return (
        <NotionTable>
            <NotionTableHeader>
                <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                <NotionTableHead icon={countIcon}>{countLabel}</NotionTableHead>
                <NotionTableHead icon={<Shield />}>{trailingLabel}</NotionTableHead>
            </NotionTableHeader>
            <NotionTableBody>
                {rows.map((r) => (
                    <NotionTableRow key={r.key} onClick={r.disabled ? undefined : r.onClick} className={r.disabled ? 'opacity-60' : undefined}>
                        <NotionTableCell className="w-[55%] max-w-0">
                            <button
                                type="button"
                                disabled={r.disabled}
                                onClick={(e) => { e.stopPropagation(); r.onClick() }}
                                className="flex min-w-0 max-w-full items-center gap-2 rounded-control text-left text-fg outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:cursor-not-allowed"
                            >
                                <WorkspaceMark logoUrl={r.logoUrl} accent={r.accent} icon={r.icon} size="sm" />
                                <span className="truncate font-medium">{r.name}</span>
                                {r.badge && <span className="shrink-0">{r.badge}</span>}
                            </button>
                        </NotionTableCell>
                        <NotionTableCell className="text-small tabular-nums text-fg-muted">
                            {r.count ?? <span className="text-fg-subtle">—</span>}
                        </NotionTableCell>
                        <NotionTableCell>{r.trailing ?? <span className="text-fg-subtle">—</span>}</NotionTableCell>
                    </NotionTableRow>
                ))}
            </NotionTableBody>
        </NotionTable>
    )
}
