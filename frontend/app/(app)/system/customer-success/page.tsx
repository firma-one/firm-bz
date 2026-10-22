import { prisma } from "@/lib/prisma"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield, MessageSquare, ChevronRight, Clock } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { notFound } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { isSystemAdminEmail } from "@/lib/system/admin-check"
import { SupportStaffView } from "@/components/support/support-staff-view"
import { SentryTestButton } from "./sentry-test-button"
import { RefreshControl } from "./refresh-control"

export const dynamic = 'force-dynamic'

export default async function CustomerSuccessPage() {
    // The /system layout checks in the browser only; every firm's requests are read here, so this page
    // checks for itself (SYSTEM_ADMIN_EMAILS) before reading anything.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isSystemAdminEmail(user.email)) notFound()

    const requests = await (prisma as any).customerRequest.findMany({
        orderBy: { createdAt: 'desc' },
    })

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex flex-col space-y-4">
                <nav className="flex items-center text-sm text-gray-500">
                    <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
                        <Shield className="w-4 h-4" />
                    </Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <Link href="/system" className="hover:text-gray-900 transition-colors">
                        Administration
                    </Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <span className="font-medium text-gray-900">Customer Success</span>
                </nav>

                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Customer Success</h1>
                    <div className="flex items-center justify-between gap-4 mt-1">
                        <p className="text-gray-500">Manage incoming user requests and bug reports.</p>
                        <SentryTestButton />
                    </div>
                </div>
            </div>

            <Tabs defaultValue="requests" className="w-full">
                <div className="flex items-center justify-between mb-4">
                    <TabsList>
                        <TabsTrigger value="requests" className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            Requests
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[20px]">{requests.length}</Badge>
                        </TabsTrigger>
                        {/* The list as it was, kept beside the new one until it's signed off. */}
                        <TabsTrigger value="old" className="flex items-center gap-2">
                            Old list
                        </TabsTrigger>
                        <TabsTrigger value="analytics" disabled className="flex items-center gap-2 opacity-50">
                            Analytics
                        </TabsTrigger>
                    </TabsList>

                    <RefreshControl />
                </div>

                {/* Reply and set status from a request's sidebar (.claude/plans/app-design-refinements.md, section 14). */}
                <TabsContent value="requests">
                    <SupportStaffView myEmail={user.email ?? null} />
                </TabsContent>

                <TabsContent value="old" className="space-y-4">
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3">Description</th>
                                        <th className="px-4 py-3">User</th>
                                        <th className="px-4 py-3">Context</th>
                                        <th className="px-4 py-3">Data</th>
                                        <th className="px-4 py-3">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {requests.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                                No requests found.
                                            </td>
                                        </tr>
                                    ) : requests.map((req: any) => (
                                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 align-top">
                                                <Badge variant={
                                                    req.status === 'NEW' ? 'default' :
                                                        req.status === 'IN_PROGRESS' ? 'secondary' :
                                                            req.status === 'RESOLVED' ? 'outline' : 'destructive'
                                                } className={
                                                    req.status === 'NEW' ? 'bg-blue-600 hover:bg-blue-700' : ''
                                                }>
                                                    {req.status}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <span className="font-medium text-gray-700">{req.type}</span>
                                            </td>
                                            <td className="px-4 py-3 align-top">
                                                <p className="text-gray-900 whitespace-pre-wrap max-w-md line-clamp-3">{req.description}</p>
                                                {req.errorDetails && (
                                                    <div className="mt-1">
                                                        <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                                            Has Error Data
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-xs text-gray-500">
                                                {req.userEmail ? (
                                                    <div className="font-medium text-gray-900">{req.userEmail}</div>
                                                ) : req.userId ? (
                                                    <span className="font-mono text-xs">{req.userId.slice(0, 8)}...</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-xs text-gray-500 space-y-1">
                                                {req.organizationId && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold w-8">Org:</span>
                                                        <span className="font-mono">{req.organizationId.slice(0, 8)}...</span>
                                                    </div>
                                                )}
                                                {req.clientId && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold w-8">Client:</span>
                                                        <span className="font-mono">{req.clientId.slice(0, 8)}...</span>
                                                    </div>
                                                )}
                                                {req.projectId && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold w-8">Proj:</span>
                                                        <span className="font-mono">{req.projectId.slice(0, 8)}...</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-top text-xs">
                                                <div className="space-y-2">
                                                    {(req.errorDetails && Object.keys(req.errorDetails as object).length > 0) && (
                                                        <details className="group">
                                                            <summary className="cursor-pointer text-red-600 hover:text-red-700 font-medium list-none flex items-center gap-1">
                                                                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                                                                Error
                                                            </summary>
                                                            <pre className="mt-1 p-2 bg-red-50 rounded border border-red-100 overflow-x-auto text-[10px] max-w-[200px]">
                                                                {JSON.stringify(req.errorDetails, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                    {(req.metadata && Object.keys(req.metadata as object).length > 0) && (
                                                        <details className="group">
                                                            <summary className="cursor-pointer text-slate-600 hover:text-slate-700 font-medium list-none flex items-center gap-1">
                                                                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                                                                Meta
                                                            </summary>
                                                            <pre className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 overflow-x-auto text-[10px] max-w-[200px]">
                                                                {JSON.stringify(req.metadata, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top whitespace-nowrap text-gray-500">
                                                <div className="flex items-center gap-1" title={req.createdAt.toString()}>
                                                    <Clock className="w-3 h-3" />
                                                    {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
