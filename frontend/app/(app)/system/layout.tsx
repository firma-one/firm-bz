"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { PanelLeft } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { SystemSidebar } from "./system-sidebar"
import { Outfit } from "next/font/google"
import { SidebarProvider, useSidebar } from "@/lib/sidebar-context"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

const systemFont = Outfit({ subsets: ["latin"] })

/** Access controlled by JWT app_metadata.role === 'SYS_ADMIN'. */
const JWT_ADMIN_ROLE = "SYS_ADMIN"

function SystemLayoutContent({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, loading } = useAuth()
    const router = useRouter()
    const [authState, setAuthState] = useState<"checking" | "authorized" | "unauthorized">("checking")
    const { isCollapsed, toggleSidebar } = useSidebar()

    useEffect(() => {
        if (loading) return

        if (!user) {
            router.push("/signin?redirect=/system")
            return
        }

        const jwtRole = user.app_metadata?.role
        if (jwtRole === JWT_ADMIN_ROLE) {
            setAuthState("authorized")
            return
        }

        fetch("/api/permissions/is-system-admin")
            .then((r) => r.ok ? r.json() : { isSystemAdmin: false })
            .then((data) => {
                if (data.isSystemAdmin) {
                    setAuthState("authorized")
                } else {
                    setAuthState("unauthorized")
                }
            })
            .catch(() => setAuthState("unauthorized"))
    }, [user, loading, router])

    if (loading || authState === "checking") {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
                {loading ? (
                    <div className="flex flex-col items-center">
                        <LoadingSpinner size="md" className="mb-4" />
                        <p className="text-slate-500 text-sm">Verifying access...</p>
                    </div>
                ) : (
                    null
                )}
            </div>
        )
    }

    if (authState === "unauthorized") {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <h1 className="text-lg font-semibold text-slate-900">System access denied</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Your account is signed in, but it does not have the SYS_ADMIN role required for this area.
                    </p>
                    <div className="mt-5">
                        <Link
                            href="/d"
                            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            Go to dashboard
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    if (!user || authState !== "authorized") {
        return null
    }

    return (
        <div className={`min-h-screen bg-white flex ${systemFont.className}`}>
            <SystemSidebar />

            <main className={`flex-1 transition-all duration-300 min-h-screen flex flex-col w-full ${isCollapsed ? 'ml-16' : 'ml-64'}`}>
                <div className="h-16 border-b border-gray-200 flex items-center px-4 bg-white sticky top-0 z-30 gap-4">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 h-8 w-8">
                                <PanelLeft className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{isCollapsed ? 'Open sidebar' : 'Close sidebar'}</p>
                        </TooltipContent>
                    </Tooltip>

                    <div className="flex-1" />
                </div>

                <div className="w-full p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}

export default function SystemLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <SidebarProvider>
            <TooltipProvider>
                <SystemLayoutContent>
                    {children}
                </SystemLayoutContent>
            </TooltipProvider>
        </SidebarProvider>
    )
}
