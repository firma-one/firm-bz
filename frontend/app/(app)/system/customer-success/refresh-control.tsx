"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

export function RefreshControl() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [lastRefreshed, setLastRefreshed] = useState(new Date())

    const handleRefresh = () => {
        startTransition(() => {
            router.refresh()
            setLastRefreshed(new Date())
        })
    }

    return (
        <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>
                Updated {lastRefreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRefresh}
                disabled={isPending}
                title="Refresh now"
            >
                <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
            </Button>
        </div>
    )
}
