import React from "react"
import { cn } from "@/lib/utils"

interface SharePointIconProps {
  size?: number
  className?: string
}

/** Simple inline SharePoint mark (stylized "S" wave, SharePoint brand teal). */
export function SharePointIcon({ size = 20, className = "" }: SharePointIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle cx="8" cy="7" r="4" fill="#036C70" />
      <circle cx="16" cy="9" r="5" fill="#1A9BA1" />
      <circle cx="9" cy="16" r="4.5" fill="#37C6D0" />
      <path d="M4 15.5h10a3.5 3.5 0 0 1 0 7H6a2 2 0 0 1-2-2v-5Z" fill="#1A9BA1" />
    </svg>
  )
}
