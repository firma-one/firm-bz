"use client"

import Link from "next/link"
import { Link2, Wrench, Shield, ChevronRight, Users, CalendarRange, MailPlus, Database } from "lucide-react"

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
    }
]

export default function SystemIndex() {
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
