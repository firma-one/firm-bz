"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface UserAvatarWithTooltipProps {
  displayName: string
  photoLink?: string
  email?: string
  role?: string
  avatarSize?: "sm" | "md" | "lg"
  showEmail?: boolean
  showRole?: boolean
}

export function UserAvatarWithTooltip({
  displayName,
  photoLink,
  email,
  role,
  avatarSize = "md",
  showEmail = true,
  showRole = true,
}: UserAvatarWithTooltipProps) {
  const [copied, setCopied] = useState(false)
  const [imageError, setImageError] = useState(false)
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const avatarClasses = {
    sm: "h-5 w-5 text-[9px]",
    md: "h-6 w-6 text-[9px]",
    lg: "h-7 w-7 text-[10px]",
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (email) {
      navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`${avatarClasses[avatarSize]} rounded-lg border border-slate-200/80 bg-slate-50 flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-slate-600 cursor-default`}
          >
            {photoLink && !imageError ? (
              <img
                src={photoLink}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              initials
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-white border border-slate-200 text-slate-700 text-xs p-3 shadow-lg max-w-[320px]">
          <div className="space-y-2">
            {/* Avatar + Name */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center font-bold text-slate-600 flex-shrink-0 overflow-hidden">
                {photoLink && !imageError ? (
                  <img
                    src={photoLink}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  initials
                )}
              </div>
              <span className="font-medium text-slate-900">{displayName}</span>
            </div>

            {/* Email */}
            {showEmail && email && (
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[240px] text-slate-600">{email}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                  title="Copy email"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Role */}
            {showRole && role && (
              <div className="flex items-center gap-2">
                <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                  {role}
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
