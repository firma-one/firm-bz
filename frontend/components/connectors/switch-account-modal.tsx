'use client'

import { useState, useEffect } from 'react'
import { SwitchCamera, Loader2, CircleCheck, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type FirmAdmin = {
  userId: string
  email: string
  name: string
  avatarUrl?: string | null
}

interface SwitchAccountModalProps {
  open: boolean
  onClose: () => void
  /** All firm admins — caller should include the currently connected account so the user can see it (it will be marked as current). */
  admins: FirmAdmin[]
  /** userId of the currently connected Google account owner — this row is disabled. */
  currentUserId: string | undefined
  loading: boolean
  /** Called with the selected admin's email as the login_hint for Google OAuth. */
  onConfirm: (selectedEmail: string) => void
}

/** Circular avatar with initials fallback */
function AdminAvatar({ name, avatarUrl, selected }: { name: string; avatarUrl?: string | null; selected: boolean }) {
  const [imgError, setImgError] = useState(false)
  const initials = name.replace('@', '').split(/[\s._-]/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div className="shrink-0 h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-semibold border border-slate-200">
      {avatarUrl && !imgError ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <div className={cn('h-full w-full flex items-center justify-center', selected ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-600')}>
          {initials}
        </div>
      )}
    </div>
  )
}

export function SwitchAccountModal({
  open,
  onClose,
  admins = [],
  currentUserId,
  loading,
  onConfirm,
}: SwitchAccountModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  useEffect(() => { if (open) setSelectedUserId(null) }, [open])

  const selectedAdmin = admins.find((a) => a.userId === selectedUserId)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelectedUserId(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-[2px]">
        <DialogHeader>
          <DialogTitle className="text-[0.9375rem] font-bold text-[#1b1b1d]">Switch Google account</DialogTitle>
          <DialogDescription className="text-xs text-[#45474c] mt-1.5">
            Select a firm administrator to connect as. You'll be redirected to Google sign-in for the chosen account.
            The current account will be disconnected.
          </DialogDescription>
        </DialogHeader>

        {/* Admin list */}
        <div className="flex flex-col gap-1 overflow-y-auto border border-slate-200 rounded-[2px] p-1 max-h-[200px]">
          {admins.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No firm administrators found.</p>
          )}
          {admins.map((admin) => {
            const isCurrent = admin.userId === currentUserId
            const isSelected = admin.userId === selectedUserId
            return (
              <button
                key={admin.userId}
                type="button"
                disabled={isCurrent}
                onClick={() => setSelectedUserId(admin.userId)}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-1.5 rounded-[2px] text-left transition-colors w-full',
                  isCurrent
                    ? 'opacity-50 cursor-not-allowed bg-slate-50'
                    : isSelected
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-slate-50'
                )}
              >
                <AdminAvatar name={admin.name} avatarUrl={admin.avatarUrl} selected={isSelected} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium text-slate-800 truncate leading-tight">
                    {admin.name}
                    {isCurrent && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(current)</span>}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate">{admin.email}</span>
                </div>
                <div className="shrink-0 ml-1">
                  {isSelected
                    ? <CircleCheck className="h-4 w-4 text-primary" />
                    : <Circle className="h-4 w-4 text-slate-300" />
                  }
                </div>
              </button>
            )
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-4 text-xs rounded-[2px] border-[#e5e7eb]"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 px-4 text-xs rounded-[2px] bg-primary text-white border-0 hover:bg-primary hover:brightness-105"
            disabled={!selectedAdmin || loading}
            onClick={() => selectedAdmin && onConfirm(selectedAdmin.email)}
          >
            {loading
              ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              : <SwitchCamera className="w-3 h-3 mr-1.5" />
            }
            Continue to Google
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
