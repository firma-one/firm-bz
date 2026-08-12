import React from "react"
import { cn } from "@/lib/utils"

interface SharePointIconProps {
  size?: number
  className?: string
}

/** Official Microsoft SharePoint product mark (three overlapping circles + "S" wave). */
export function SharePointIcon({ size = 20, className = "" }: SharePointIconProps) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle fill="#036C70" cx="63.7" cy="36.5" r="36.7" />
      <circle fill="#1A9BA1" cx="94.3" cy="70" r="33.9" />
      <circle fill="#37C6D0" cx="68.5" cy="102.1" r="26" />
      <path
        fill="#04878B"
        d="M59.5,97.2h-53c-3.5,0-6.4-2.9-6.4-6.4V38.6c0-3.5,2.9-6.4,6.4-6.4h53c3.5,0,6.4,2.9,6.4,6.4v52.2 C65.9,94.3,63.1,97.2,59.5,97.2z"
      />
      <path
        fill="#FFFFFF"
        d="M22.3,75.9c2.1,1.2,5.4,2.3,8.8,2.3c4.2,0,6.6-2,6.6-4.9c0-2.7-1.8-4.3-6.4-6c-6-2.1-9.9-5.3-9.9-10.4 c0-5.9,5-10.3,12.9-10.3c3.9,0,6.8,0.9,8.7,1.8l-1.6,5.3C40.1,53,37.6,52,34.2,52c-4.2,0-6,2.2-6,4.3c0,2.8,2.1,4,7,5.9 c6.3,2.4,9.3,5.5,9.3,10.6c0,5.8-4.4,10.7-13.8,10.7c-3.9,0-7.9-1.1-9.9-2.2L22.3,75.9z"
      />
      <path
        opacity="0.2"
        d="M65.9,38c0,0.2,0,0.4,0,0.6v52.2c0,3.5-2.9,6.4-6.4,6.4H42.8l-0.2,5.7h22.4c3.5,0,6.4-2.9,6.4-6.4V44.3 C71.3,41.1,69,38.5,65.9,38z"
      />
    </svg>
  )
}
