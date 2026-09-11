import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            // bg-[#e5e7eb] rather than bg-muted: `animate-pulse` animates opacity 1 -> .5 -> 1, so
            // the swing is only visible if the base has real contrast against the surface behind it.
            // --muted (0 0% 96.1%) over a white background pulses #F5F5F5 -> ~#FAFAFA — about 2%
            // lightness, indistinguishable from a static block. #e5e7eb is the border grey used
            // across the app and gives a ~6% swing that actually reads as loading.
            className={cn("animate-pulse rounded-md bg-[#e5e7eb] dark:bg-[#2a2a2e]", className)}
            {...props}
        />
    )
}

export { Skeleton }
