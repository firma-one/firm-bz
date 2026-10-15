import { cnV2 } from "@/lib/utils"

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
            // v2: the 0.16-alpha warm line color gives the same ~6% pulse swing on white.
            // v2: a soft sweep (the same shimmer as components/ui/shimmer.tsx) instead of the pulse.
            className={cnV2("animate-pulse rounded-md bg-[#e5e7eb] dark:bg-[#2a2a2e] v2:rounded-control v2:bg-[linear-gradient(90deg,var(--ui-surface-muted)_0%,var(--ui-surface-muted)_35%,var(--ui-surface-selected)_50%,var(--ui-surface-muted)_65%,var(--ui-surface-muted)_100%)] v2:bg-[length:200%_100%] v2:animate-shimmer v2:motion-reduce:animate-none", className)}
            {...props}
        />
    )
}

export { Skeleton }
