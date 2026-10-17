'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { Briefcase, Building2, CircleDot, Clock3, Type, Users } from 'lucide-react'
import type { ClientSummary } from '@/lib/actions/hierarchy'
import { clientPath } from '@/lib/navigation/firm-paths'
import { useBranding } from '@/lib/use-branding'
import {
    NotionTable,
    NotionTableBody,
    NotionTableCell,
    NotionTableHead,
    NotionTableHeader,
    NotionTableRow,
} from '@/components/ui/notion-table'
import { StatusPill } from '@/components/ui/tag'
import { EmptyPanel } from '@/components/ui/empty-panel'
import { ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'

interface ClientListProps {
    clients: ClientSummary[]
    groupSlug: string
    orgSlug: string
    viewMode?: 'grid' | 'list'
    isRefreshing?: boolean
    /** Where a client opens; defaults to the client's firm page. The public demo passes its own. */
    hrefFor?: (client: ClientSummary) => string
}

function ago(value: Date): string {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

/** The client's logo, else an icon on a tile tinted with its (or the firm's) brand color. */
function ClientMark({ client, accent, size = 'sm' }: { client: ClientSummary; accent: string | null; size?: 'sm' | 'md' }) {
    const box = size === 'md' ? 'h-9 w-9' : 'h-5 w-5'
    if (client.brandLogoUrl) {
        return (
            <span className={`flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface`}>
                <img src={client.brandLogoUrl} alt="" className="h-full w-full object-contain" />
            </span>
        )
    }
    return (
        <span
            className={`flex ${box} shrink-0 items-center justify-center rounded-control bg-surface-muted text-fg-subtle`}
            style={accent ? { backgroundColor: `${accent}1f`, color: accent } : undefined}
        >
            <Users className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />
        </span>
    )
}

/**
 * The firm's clients (.claude/plans/ui-ux-overhaul.md, Phase 6): a Notion table by default, or a
 * gallery of flat cards. Rows and cards open the client.
 */
export function ClientList({ clients, groupSlug, orgSlug, viewMode = 'list', isRefreshing = false, hrefFor }: ClientListProps) {
    const linkFor = (c: ClientSummary) => (hrefFor ? hrefFor(c) : clientPath(groupSlug, orgSlug, c.slug))
    const router = useRouter()
    const firmBranding = useBranding()
    const firmAccent = firmBranding?.themeColor && /^#[0-9A-Fa-f]{6}$/.test(firmBranding.themeColor) ? firmBranding.themeColor : null
    const accentFor = (c: ClientSummary) =>
        (c.brandPrimaryColor && /^#[0-9A-Fa-f]{6}$/.test(c.brandPrimaryColor) ? c.brandPrimaryColor : null) ?? firmAccent

    if (clients.length === 0 && !isRefreshing) {
        return <EmptyPanel icon={<Users />} title="No clients yet" description="Clients you add show up here." />
    }

    if (viewMode === 'list') {
        return (
            <NotionTable>
                <NotionTableHeader>
                    <NotionTableHead icon={<Type />}>Name</NotionTableHead>
                    <NotionTableHead icon={<CircleDot />}>Status</NotionTableHead>
                    <NotionTableHead icon={<Building2 />} className="hidden md:table-cell">Industry</NotionTableHead>
                    <NotionTableHead icon={<Briefcase />}>Engagements</NotionTableHead>
                    <NotionTableHead icon={<Clock3 />} className="hidden sm:table-cell">Updated</NotionTableHead>
                </NotionTableHeader>
                <NotionTableBody>
                    {isRefreshing && (
                        <tr className="h-9 border-b border-line" aria-hidden>
                            <td colSpan={5} className="px-2 first:pl-1">
                                <span className="flex items-center gap-2"><ShimmerBlock className="h-5 w-5" /><ShimmerBar className="w-40" /></span>
                            </td>
                        </tr>
                    )}
                    {clients.map((client) => {
                        const href = linkFor(client)
                        return (
                            <NotionTableRow key={client.id} onClick={() => router.push(href)}>
                                <NotionTableCell className="w-[40%] max-w-0">
                                    <Link href={href} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2 text-fg">
                                        <ClientMark client={client} accent={accentFor(client)} />
                                        <span className="truncate font-medium">{client.name}</span>
                                    </Link>
                                </NotionTableCell>
                                <NotionTableCell><StatusPill kind="client" status={client.status ?? 'ACTIVE'} /></NotionTableCell>
                                <NotionTableCell className="hidden max-w-[12rem] truncate text-small text-fg-muted md:table-cell">
                                    {client.industry ?? <span className="text-fg-subtle">—</span>}
                                </NotionTableCell>
                                <NotionTableCell className="text-small tabular-nums text-fg-muted">{client.engagements.length}</NotionTableCell>
                                <NotionTableCell className="hidden whitespace-nowrap text-small text-fg-subtle sm:table-cell">
                                    <time dateTime={new Date(client.updatedAt).toISOString()} suppressHydrationWarning>{ago(client.updatedAt)}</time>
                                </NotionTableCell>
                            </NotionTableRow>
                        )
                    })}
                </NotionTableBody>
            </NotionTable>
        )
    }

    // Gallery: flat cards, Notion's gallery view.
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isRefreshing && (
                <div className="flex h-36 flex-col gap-3 rounded-card border border-line bg-surface p-3.5" aria-hidden>
                    <ShimmerBlock className="h-9 w-9" />
                    <ShimmerBar className="w-3/4" />
                    <ShimmerBar className="mt-auto w-1/3" />
                </div>
            )}
            {clients.map((client) => {
                return (
                    <Link
                        key={client.id}
                        href={linkFor(client)}
                        className={`group flex h-36 flex-col rounded-card border bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-hover ${
                            client.status === 'PROSPECT' ? 'border-dashed border-line-strong' : 'border-line'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <ClientMark client={client} accent={accentFor(client)} size="md" />
                            <StatusPill kind="client" status={client.status ?? 'ACTIVE'} />
                        </div>
                        <span className="mt-2.5 line-clamp-1 text-ui font-medium text-fg">{client.name}</span>
                        <div className="mt-auto flex items-center justify-between text-caption text-fg-subtle">
                            <span className="flex items-center gap-1" title="Last updated">
                                <Clock3 className="h-3 w-3" />
                                <time dateTime={new Date(client.updatedAt).toISOString()} suppressHydrationWarning>{ago(client.updatedAt)}</time>
                            </span>
                            <span className="tabular-nums">
                                {client.engagements.length} {client.engagements.length === 1 ? 'engagement' : 'engagements'}
                            </span>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}
