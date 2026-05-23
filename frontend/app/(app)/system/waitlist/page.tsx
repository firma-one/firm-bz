import { prisma } from "@/lib/prisma"
import { Shield, ChevronRight, Users, Mail, Building2, Calendar, Trophy, TrendingUp } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library"
import { CampaignManagement } from "./campaign-management"

export const dynamic = 'force-dynamic'

const POINTS_PER_REFERRAL = 30

type WaitlistEntry = any

export default async function WaitlistPage() {
    let waitlistEntries: WaitlistEntry[]
    let batches: any[] = []
    let error: string | null = null

    try {
        [waitlistEntries, batches] = await Promise.all([
            (prisma as any).waitlist.findMany({
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    plan: true,
                    companyName: true,
                    companySize: true,
                    role: true,
                    comments: true,
                    createdAt: true,
                    referralCount: true,
                    positionBoost: true,
                    referralCode: true,
                },
            }),
            (prisma as any).waitlistCampaign.findMany({
                orderBy: { openedAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    isActive: true,
                    openedAt: true,
                    closedAt: true,
                    _count: { select: { waitlist: true } },
                },
            }),
        ])
    } catch (err) {
        if (err instanceof PrismaClientKnownRequestError) {
            if (err.code === 'P1001' || err.code === 'P1002' || err.code === 'P1003') {
                error = 'Unable to connect to database. Please check your database connection.'
            } else if (err.code === 'P2021' || err.code === 'P2022') {
                error = 'Database schema is out of sync. Please contact support.'
            } else {
                error = 'Database error occurred. Please try again later.'
            }
        } else {
            error = 'An unexpected error occurred.'
        }
        waitlistEntries = []
        batches = []
    }

    const stats = {
        total: waitlistEntries.length,
        pro: waitlistEntries.filter(e => e.plan === 'Pro').length,
        proPlus: waitlistEntries.filter(e => e.plan === 'Pro Plus').length,
        business: waitlistEntries.filter(e => e.plan === 'Business').length,
        enterprise: waitlistEntries.filter(e => e.plan === 'Enterprise').length,
        totalReferrals: waitlistEntries.reduce((sum, e) => sum + (e.referralCount || 0), 0),
        totalPoints: waitlistEntries.reduce((sum, e) => sum + ((e.referralCount || 0) * POINTS_PER_REFERRAL), 0),
    }

    return (
        <div className="flex flex-col space-y-6">
            <CampaignManagement batches={batches} />

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
                    <span className="font-medium text-gray-900">Waitlist</span>
                </nav>

                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Waitlist</h1>
                    <p className="text-gray-500 mt-1">View users who joined the waitlist.</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                    <div className="text-sm text-gray-500 mt-1">Total</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-600">{stats.pro}</div>
                    <div className="text-sm text-gray-500 mt-1">Pro</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">{stats.proPlus}</div>
                    <div className="text-sm text-gray-500 mt-1">Pro Plus</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-indigo-600">{stats.business}</div>
                    <div className="text-sm text-gray-500 mt-1">Business</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-slate-600">{stats.enterprise}</div>
                    <div className="text-sm text-gray-500 mt-1">Enterprise</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-amber-600">{stats.totalReferrals}</div>
                    <div className="text-sm text-gray-500 mt-1">Total Referrals</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-600" />
                        <div className="text-2xl font-bold text-amber-600">{stats.totalPoints}</div>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">Total Points</div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <div className="text-red-800 font-semibold">Error:</div>
                        <div className="text-red-700">{error}</div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Plan</th>
                                <th className="px-4 py-3">Company</th>
                                <th className="px-4 py-3">Size</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Referrals</th>
                                <th className="px-4 py-3">Points</th>
                                <th className="px-4 py-3">Position Boost</th>
                                <th className="px-4 py-3">Comments</th>
                                <th className="px-4 py-3">Joined</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {waitlistEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                                        {error ? 'Unable to load waitlist entries.' : 'No waitlist entries yet.'}
                                    </td>
                                </tr>
                            ) : waitlistEntries.map((entry) => {
                                const points = (entry.referralCount || 0) * POINTS_PER_REFERRAL
                                return (
                                    <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center gap-2">
                                                <Mail className="w-4 h-4 text-gray-400" />
                                                <span className="font-medium text-gray-900">{entry.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <Badge variant={
                                                entry.plan === 'Pro' ? 'default' :
                                                    entry.plan === 'Pro Plus' ? 'secondary' :
                                                        entry.plan === 'Business' ? 'outline' : 'destructive'
                                            } className={
                                                entry.plan === 'Pro' ? 'bg-purple-600 hover:bg-purple-700' :
                                                    entry.plan === 'Pro Plus' ? 'bg-blue-600 hover:bg-blue-700' :
                                                        entry.plan === 'Business' ? 'bg-indigo-600 hover:bg-indigo-700' : ''
                                            }>
                                                {entry.plan}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            {entry.companyName ? (
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="w-4 h-4 text-gray-400" />
                                                    <span className="text-gray-700">{entry.companyName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <span className="text-gray-700">{entry.companySize || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <span className="text-gray-700">{entry.role || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center gap-2">
                                                <Users className="w-4 h-4 text-gray-400" />
                                                <span className="font-medium text-gray-900">{entry.referralCount || 0}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center gap-2">
                                                <Trophy className="w-4 h-4 text-amber-500" />
                                                <span className="font-bold text-amber-600">{points}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4 text-green-500" />
                                                <span className="font-medium text-green-600">+{entry.positionBoost || 0}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top max-w-xs">
                                            {entry.comments ? (
                                                <p className="text-gray-600 text-xs line-clamp-2">{entry.comments}</p>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <Calendar className="w-4 h-4" />
                                                <span className="text-xs">
                                                    {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
