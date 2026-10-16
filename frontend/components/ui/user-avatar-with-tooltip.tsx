"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { initialsOf } from '@/lib/initials'

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
  const initials = initialsOf(displayName)

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
            className={`${avatarClasses[avatarSize]} flex shrink-0 cursor-default items-center justify-center overflow-hidden rounded-full bg-surface-muted font-medium text-fg-muted`}
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
        <TooltipContent side="top" className="bg-white border border-line text-fg-muted text-xs p-3 shadow-lg max-w-[320px]">
          <div className="space-y-2">
            {/* Avatar + Name */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted text-[11px] font-medium text-fg-muted">
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
              <span className="font-medium text-fg">{displayName}</span>
            </div>

            {/* Email */}
            {showEmail && email && (
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[240px] text-fg-muted">{email}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 p-1 rounded hover:bg-surface-hover text-fg-muted hover:text-fg-muted"
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
                <span className="inline-block px-2 py-1 rounded bg-surface-muted text-fg-muted text-[11px] font-medium">
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
