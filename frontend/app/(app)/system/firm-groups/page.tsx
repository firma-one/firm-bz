'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FirmGroupListResult, FirmGroupListRow } from '@/lib/system/firm-group-list'

/**
 * Firm group directory — the entry point to the system admin tools.
 *
 * The user-data-map page is lookup-first: it needs an email or user id before it shows anything,
 * which only works when you already know the account you want. This lists the groups instead, so
 * triage starts from "show me everything" and narrows from there.
 *
 * Search covers group name, slug and the admin's email or name, because which of those an admin
 * remembers varies — a support request names a person, a bug report names a slug.
 */

type ApiResponse = { data?: FirmGroupListResult; error?: string }

function fullName(row: FirmGroupListRow): string {
    const parts = [row.admin?.firstName, row.admin?.lastName].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : '—'
}

export default function FirmGroupsPage() {
    const [search, setSearch] = useState('')
    const [submitted, setSubmitted] = useState('')
    const [result, setResult] = useState<FirmGroupListResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (term: string) => {
        setLoading(true)
        setError(null)
        try {
            const qs = term ? `?search=${encodeURIComponent(term)}` : ''
            const res = await fetch(`/api/system/firm-groups${qs}`, { cache: 'no-store' })
            const body = (await res.json().catch(() => ({}))) as ApiResponse
            if (!res.ok || !body.data) {
                setResult(null)
                setError(body.error ?? 'Could not load firm groups')
                return
            }
            setResult(body.data)
        } catch {
            setResult(null)
            setError('Could not load firm groups')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { void load('') }, [load])

    const onSubmit = (event: FormEvent) => {
        event.preventDefault()
        const term = search.trim()
        setSubmitted(term)
        void load(term)
    }

    const rows = useMemo(() => result?.rows ?? [], [result])

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
            <header className="mb-5">
                <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                    <Building2 className="h-5 w-5" />
                    Firm groups
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                    Every billing group, its admin, and a way into the full data map. Search by group
                    name, slug, or the admin&rsquo;s email or name.
                </p>
            </header>

            <form onSubmit={onSubmit} className="mb-4 flex gap-2">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search groups or admins…"
                        className="h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm"
                    />
                </div>
                <Button type="submit" disabled={loading} className="h-10 min-w-24">
                    {loading ? 'Loading…' : 'Search'}
                </Button>
                {submitted ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={() => { setSearch(''); setSubmitted(''); void load('') }}
                    >
                        Clear
                    </Button>
                ) : null}
            </form>

            {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            ) : null}

            {!error && !loading && rows.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-6 text-center text-sm text-gray-600">
                    <p>{submitted ? `No firm groups match “${submitted}”.` : 'No firm groups yet.'}</p>
                    {/* This list is GROUPS, so it shows one user per group — its admin. A search
                        for anyone else (a firm member, or an account that never onboarded) finds
                        nothing here and has to go through the lookup. */}
                    {submitted ? (
                        <p className="mt-2 text-xs text-gray-500">
                            Only group admins appear here. For a firm member or an account with no
                            workspace, use{' '}
                            <Link
                                href={`/system/user-data-map?identifier=${encodeURIComponent(submitted)}`}
                                className="underline hover:text-gray-900"
                            >
                                User Lookup
                            </Link>
                            .
                        </p>
                    ) : null}
                </div>
            ) : null}

            {rows.length > 0 ? (
                <>
                    <p className="mb-2 text-xs text-gray-500">
                        {result?.total} group{result?.total === 1 ? '' : 's'}
                        {result?.filtered ? ' matching' : ''}
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Group</th>
                                    <th className="px-3 py-2 font-medium">Slug</th>
                                    <th className="px-3 py-2 font-medium">Admin</th>
                                    <th className="px-3 py-2 font-medium">Email</th>
                                    <th className="px-3 py-2 font-medium">Plan</th>
                                    <th className="px-3 py-2 font-medium">Firms</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((row) => (
                                    <tr key={row.groupId} className="hover:bg-gray-50/70">
                                        <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.slug}</td>
                                        <td className="px-3 py-2 text-gray-700">{fullName(row)}</td>
                                        <td className="px-3 py-2 text-gray-700">
                                            {row.admin?.email ?? (
                                                <span className="inline-flex items-center gap-1 text-amber-700">
                                                    <Users className="h-3 w-3" />
                                                    no group admin
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-700">{row.plan ?? '—'}</td>
                                        <td className="px-3 py-2 tabular-nums text-gray-700">{row.firmCount}</td>
                                        <td className="px-3 py-2 text-right">
                                            {/* Deep-links by email so the data map loads without
                                                retyping it; falls back to the admin's user id when
                                                the auth record carries no email. */}
                                            {row.admin ? (
                                                <Link
                                                    href={`/system/user-data-map?identifier=${encodeURIComponent(row.admin.email ?? row.admin.userId)}`}
                                                >
                                                    <Button type="button" variant="outline" size="sm">
                                                        View
                                                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                                    </Button>
                                                </Link>
                                            ) : (
                                                <span className="text-xs text-gray-400">no admin to inspect</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : null}
        </div>
    )
}
