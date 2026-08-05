import React from "react"
import { cn } from "@/lib/utils"

interface OneDriveIconProps {
  size?: number
  className?: string
}

/** Simple inline OneDrive cloud mark — matches the placeholder mark already used in firm-drive-section.tsx. */
export function OneDriveIcon({ size = 20, className = "" }: OneDriveIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path d="M9.25 7.25A6.25 6.25 0 0 1 21.5 10a4.5 4.5 0 0 1-.5 8.996H5a4 4 0 0 1-.68-7.938A6.25 6.25 0 0 1 9.25 7.25Z" fill="#0078D4" />
    </svg>
  )
}
