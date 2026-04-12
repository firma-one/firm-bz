import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
    className?: string
    message?: string
    size?: "sm" | "md" | "lg" | "xl"
    showDots?: boolean // Kept for compatibility, though animation logic is internal now
}

export function LoadingSpinner({
    className,
    message,
    size = "lg"
}: LoadingSpinnerProps) {

    // Size mapping for the container
    const sizeClasses = {
        sm: "w-6 h-6",
        md: "w-10 h-10",
        lg: "w-16 h-16",
        xl: "w-24 h-24"
    }

    // Dynamic stroke width based on size
    const strokeWidth = {
        sm: 3,
        md: 3,
        lg: 2.5,
        xl: 2
    }

    // Determine layout variant based on message presence
    const isFullPage = !!message

    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center",
                isFullPage ? "min-h-[50vh] p-4" : "p-0",
                className,
            )}
        >
            <div className={cn("flex flex-col items-center", isFullPage ? "gap-6" : "gap-0")}>
                {/* Modern Spinner: Dot inside Circle (Strictly Black) */}
                <div
                    className={cn(
                        "relative grid place-items-center",
                        sizeClasses[size],
                        isFullPage && "mb-2",
                    )}
                >

                    {/* 1. Rotating Ring with Gradual Opacity (The "Circle") */}
                    <svg
                        className="animate-spin absolute inset-0 text-current"
                        viewBox="0 0 50 50"
                        fill="none"
                        width="100%"
                        height="100%"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        {/* Static Track (Low Opacity) */}
                        <circle
                            cx="25"
                            cy="25"
                            r="20"
                            stroke="currentColor"
                            strokeWidth={strokeWidth[size]}
                            className="opacity-10"
                        />
                        {/* Active Spinning Segment */}
                        <circle
                            cx="25"
                            cy="25"
                            r="20"
                            stroke="currentColor"
                            strokeWidth={strokeWidth[size]}
                            strokeDasharray="80"
                            strokeDashoffset="60"
                            strokeLinecap="round"
                            className="opacity-100"
                        />
                    </svg>

                    {/* 2. The "Dot Inside" (Pulsing Center) */}
                    <div className={cn("bg-current rounded-full animate-pulse", {
                        "w-1.5 h-1.5": size === 'sm',
                        "w-2.5 h-2.5": size === 'md',
                        "w-3 h-3": size === 'lg',
                        "w-4 h-4": size === 'xl',
                    })} />
                </div>

                {/* Full Page Text Layout */}
                {isFullPage && (
                    <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-700 space-y-2">
                        {/* Main Message */}
                        <p className="text-base font-semibold text-current tracking-tight">
                            {message}
                        </p>

                        {/* Subtext and Bouncing Dots */}
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-xs text-gray-500 font-medium">
                                This will only take a moment
                            </p>

                            {/* 3 Dots Animation */}
                            <div className="flex items-center gap-1.5 mt-1">
                                <div className="h-1 w-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="h-1 w-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="h-1 w-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
