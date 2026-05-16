'use client'

import React from 'react'
import { Users, Clock, CalendarClock } from 'lucide-react'
import { HierarchyClient } from '@/lib/actions/hierarchy'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

interface ClientListProps {
    clients: HierarchyClient[]
    orgSlug: string
    viewMode?: 'grid' | 'list'
}

function clientStatusLabel(status: string | null | undefined): string {
    switch (status) {
        case 'PROSPECT':
            return 'Prospect'
        case 'ON_HOLD':
            return 'On hold'
        case 'PAST':
            return 'Past'
        case 'ACTIVE':
        default:
            return 'Active'
    }
}

function clientStatusBadgeClass(status: string | null | undefined): string {
    switch (status) {
        case 'PROSPECT':
            return 'bg-fuchsia-50 text-fuchsia-500 ring-1 ring-fuchsia-200'
        case 'ON_HOLD':
            return 'bg-amber-50 text-amber-500 ring-1 ring-amber-200'
        case 'PAST':
            return 'bg-zinc-50 text-zinc-400 ring-1 ring-zinc-200'
        case 'ACTIVE':
        default:
            return 'bg-teal-50 text-teal-600 ring-1 ring-teal-200'
    }
}

function getFollowUpChip(followUpDate: Date | null): { label: string; cls: string } | null {
    if (!followUpDate) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const fud = new Date(followUpDate); fud.setHours(0, 0, 0, 0)
    const delta = Math.round((fud.getTime() - today.getTime()) / 86400000)
    if (delta > 2 || delta < -2) return null
    switch (delta) {
        case 2:
        case 1:  return { label: delta === 1 ? 'Follow up · tomorrow' : 'Follow up · in 2 days', cls: 'bg-blue-50 text-blue-600 border-blue-200' }
        case 0:  return { label: 'Follow up today', cls: 'bg-amber-50 text-amber-600 border-amber-200' }
        case -1: return { label: 'Follow up · 1 day late', cls: 'bg-orange-50 text-orange-600 border-orange-200' }
        case -2: return { label: 'Follow up · 2 days late', cls: 'bg-rose-50 text-rose-600 border-rose-200' }
        default: return null
    }
}

export function ClientList({ clients, orgSlug, viewMode = 'grid' }: ClientListProps) {
    if (clients.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                    <Users className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">No clients found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                    This organization doesn't have any client workspaces yet.
                </p>
            </div>
        )
    }

    if (viewMode === 'list') {
        return (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                            <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                            <th className="px-4 py-3 font-medium text-slate-500">Projects</th>
                            <th className="px-4 py-3 font-medium text-slate-500 text-right">Last Updated</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {clients.map((client) => (
                            <tr key={client.id} className="group hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                    <Link href={`/d/f/${orgSlug}/c/${client.slug}`} className="flex items-center gap-3">
                                        <div className="h-8 w-8 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center">
                                            <Users className="h-4 w-4" />
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-slate-900 group-hover:text-black transition-colors">{client.name}</span>
                                            {(() => { const chip = getFollowUpChip(client.followUpDate ?? null); return chip ? (
                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${chip.cls}`}>
                                                    <CalendarClock className="h-3 w-3" />
                                                    {chip.label}
                                                </span>
                                            ) : null })()}
                                        </div>
                                    </Link>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${clientStatusBadgeClass(client.status)}`}>
                                        {clientStatusLabel(client.status)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500">
                                    <span className="px-2 py-1 bg-slate-100 rounded-full text-xs font-medium">
                                        {client.projects.length} {client.projects.length === 1 ? 'Engagement' : 'Engagements'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right text-slate-400">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <Clock className="h-3 w-3" />
                                        <span>{formatDistanceToNow(new Date(client.updatedAt), { addSuffix: true })}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clients.map((client) => (
                <Link
                    key={client.id}
                    href={`/d/f/${orgSlug}/c/${client.slug}`}
                    className="group relative bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-48"
                >
                    <div className="flex items-start justify-between mb-3">
                        <div className="h-10 w-10 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                            <Users className="h-5 w-5" />
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${clientStatusBadgeClass(client.status)}`}>
                            {clientStatusLabel(client.status)}
                        </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 mb-auto line-clamp-1 group-hover:text-black transition-colors">
                        {client.name}
                    </h3>
                    {(() => { const chip = getFollowUpChip(client.followUpDate ?? null); return chip ? (
                        <span className={`inline-flex items-center gap-1 mt-2 rounded-full border px-2 py-0.5 text-[11px] font-medium w-fit ${chip.cls}`}>
                            <CalendarClock className="h-3 w-3" />
                            {chip.label}
                        </span>
                    ) : null })()}

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5" title="Last updated">
                            <Clock className="h-3 w-3" />
                            <span>{formatDistanceToNow(new Date(client.updatedAt), { addSuffix: true })}</span>
                        </div>
                        <span className="font-medium text-slate-500">
                            {client.projects.length} {client.projects.length === 1 ? 'engagement' : 'engagements'}
                        </span>
                    </div>
                </Link>
            ))}
        </div>
    )
}
