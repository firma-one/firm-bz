import React from "react"
import { cn } from "@/lib/utils"

interface OneDriveIconProps {
  size?: number
  className?: string
}

/** Official Microsoft OneDrive product mark, same asset served from Microsoft's Fabric/M365 brand-icons CDN. */
export const ONEDRIVE_PRODUCT_MARK_SRC =
  "https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/onedrive_48x1.svg" as const

/** Official Microsoft OneDrive product mark (SVG, from Microsoft's own CDN). */
export function OneDriveIcon({ size = 20, className = "" }: OneDriveIconProps) {
  return (
    <img
      src={ONEDRIVE_PRODUCT_MARK_SRC}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn("object-contain shrink-0", className)}
      aria-hidden
    />
  )
}
