"use client"

import Link from "next/link"
import { Link2, Wrench, Shield, ChevronRight, Users, CalendarRange, MailPlus, Database, Activity, Cpu, OctagonPause, Terminal } from "lucide-react"

import { usePlatformMaintenanceStatus } from "@/lib/hooks/use-platform-maintenance-status"

const tools = [
    {
        title: "Link Generator",
        description: "Generate and copy UTM-tracked links for social media.",
        href: "/system/links",
        icon: Link2,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Customer Success",
        description: "View and manage user requests and bug reports.",
        href: "/system/customer-success",
        icon: Shield,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Waitlist",
        description: "View users who joined the waitlist for Pro plan.",
        href: "/system/waitlist",
        icon: Users,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Roadmap",
        description: "Gantt-style milestones, tier targets, and git-derived progress.",
        href: "/system/roadmap",
        icon: CalendarRange,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Admin Signup Invite",
        description: "Send a signup completion email with a coupon code for end-users.",
        href: "/system/admin-signup",
        icon: MailPlus,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "User Data Map",
        description: "Inspect user workspace graph, detect discrepancies, and review safe remediation SQL.",
        href: "/system/user-data-map",
        icon: Database,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Integrations",
        description: "Live health status of integrations and onboarding recovery for stuck firms.",
        href: "/system/integrations",
        icon: Activity,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Background Jobs",
        description: "Monitor Inngest function runs with status, duration, and firm-level filtering.",
        href: "/system/jobs",
        icon: Cpu,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    },
    {
        title: "Admin Scripts",
        description: "Run idempotent administrative operations such as encryption backfills and data migrations.",
        href: "/system/admin-scripts",
        icon: Terminal,
        className: "group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-sm hover:border-gray-400 transition-all duration-200 flex flex-col items-start",
        iconClassName: "w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-gray-100 text-gray-900 group-hover:bg-black group-hover:text-white transition-colors"
    }
]

export default function SystemIndex() {
    const maintenanceStatus = usePlatformMaintenanceStatus(20_000)
    const isMaintenanceActive = maintenanceStatus?.active ?? false
    const isMaintenanceGrace = (maintenanceStatus?.pendingGrace ?? false) && !isMaintenanceActive
    const isMaintenanceOn = isMaintenanceActive || isMaintenanceGrace

    return (
        <div className="flex flex-col space-y-8">
            <div className="flex flex-col space-y-4">
                <nav className="flex items-center text-sm text-gray-500">
                    <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
                        <Shield className="w-4 h-4" />
                    </Link>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <span className="font-medium text-gray-900">Administration</span>
                </nav>

                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Administration</h1>
                    <p className="text-gray-500 mt-1">Manage your application utilities.</p>
                </div>
            </div>

            {/* Platform Maintenance card — full-width, prominent when active */}
            <Link
                href="/system/platform-maintenance"
                className={`group rounded-xl p-3 border transition-all duration-200 flex flex-col hover:shadow-md ${
                    isMaintenanceOn
                        ? 'bg-red-50 border-red-300 hover:border-red-400'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
            >
                <div className={`rounded-lg p-4 border flex items-center gap-4 transition-colors ${
                    isMaintenanceOn
                        ? 'bg-red-100/60 border-red-200 group-hover:bg-red-100'
                        : 'bg-gray-50 border-gray-100 group-hover:bg-gray-100/80'
                }`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm border transition-colors ${
                        isMaintenanceOn
                            ? 'bg-red-600 border-red-700 text-white'
                            : 'bg-white border-gray-200 text-gray-900 group-hover:border-gray-300'
                    }`}>
                        <OctagonPause className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className={`text-lg font-bold leading-none ${isMaintenanceOn ? 'text-red-900' : 'text-gray-900'}`}>
                            Platform Maintenance
                        </h3>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        isMaintenanceActive
                            ? 'bg-red-600 text-white'
                            : isMaintenanceGrace
                                ? 'bg-orange-500 text-white'
                                : 'bg-gray-100 text-gray-500'
                    }`}>
                        {isMaintenanceActive ? 'Active' : isMaintenanceGrace ? 'Grace period' : 'Off'}
                    </span>
                </div>
                <div className="px-2 pt-4 pb-2 flex items-end justify-between gap-4">
                    <p className={`text-sm leading-relaxed text-left ${isMaintenanceOn ? 'text-red-700' : 'text-gray-500'}`}>
                        {isMaintenanceActive
                            ? 'Platform is in maintenance mode. All non-admin sessions are signed out.'
                            : isMaintenanceGrace
                                ? 'Grace period in progress — maintenance activates shortly and sessions will be signed out.'
                                : 'Toggle platform-wide maintenance mode, configure the maintenance window, and notify users.'}
                    </p>
                    <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        isMaintenanceOn
                            ? 'text-red-500 group-hover:text-red-700'
                            : 'text-gray-400 group-hover:text-gray-700'
                    }`}>
                        Manage <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                </div>
            </Link>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tools.map((tool) => (
                    <Link
                        key={tool.href}
                        href={tool.href}
                        className="group bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md hover:border-gray-300 transition-all duration-200 flex flex-col"
                    >
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex items-center gap-4 group-hover:bg-gray-100/80 transition-colors">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white text-gray-900 shadow-sm border border-gray-200 group-hover:border-gray-300 transition-colors">
                                <tool.icon className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 leading-none">
                                {tool.title}
                            </h3>
                        </div>

                        <div className="px-2 pt-4 pb-2">
                            <p className="text-gray-500 text-sm leading-relaxed text-left">
                                {tool.description}
                            </p>
                        </div>
                    </Link>
                ))}
                <div className="border border-gray-200 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-40 hover:opacity-100 transition-opacity bg-gray-50/50">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
                        <Wrench className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-400 mb-1">
                        Coming Soon
                    </h3>
                    <p className="text-gray-400 text-xs">
                        More utilities will appear here.
                    </p>
                </div>
            </div>
        </div>
    )
}
