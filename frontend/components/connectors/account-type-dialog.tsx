'use client'

import { User, Building2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DeclaredAccountType = 'personal' | 'work_school'

interface AccountTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (accountType: DeclaredAccountType) => void
  /** 'onedrive' | 'google' — only changes copy, not behavior. */
  provider: 'onedrive' | 'google'
}

const COPY = {
  onedrive: {
    title: 'What type of Microsoft account?',
    subtitle: 'This determines which permissions we request and whether SharePoint is offered as an option.',
    personalLabel: 'Personal account',
    personalExample: 'e.g. outlook.com, hotmail.com',
    personalDescription: 'Individual OneDrive storage. No admin approval needed to connect.',
    workLabel: 'Work or School account',
    workExample: 'Microsoft 365, Entra ID',
    workDescription: 'Lets you choose OneDrive or a SharePoint site, and share files with people outside your organization.',
  },
  google: {
    title: 'What type of Google account?',
    subtitle: 'This determines whether Shared Drive is offered as an option.',
    personalLabel: 'Personal account',
    personalExample: 'e.g. gmail.com',
    personalDescription: 'Individual My Drive storage.',
    workLabel: 'Work or School account',
    workExample: 'Google Workspace',
    workDescription: 'Lets you choose My Drive or a Shared Drive.',
  },
} as const

/**
 * Upfront "Personal or Work/School account?" choice, shown before the OAuth redirect for both
 * OneDrive and Google Drive connect flows. For OneDrive, the answer branches which Graph scopes
 * are requested — Personal skips Sites.Read.All and User.Invite.All entirely, since a genuine
 * personal Microsoft account (MSA) has no backing Entra tenant for either to apply to, and both
 * otherwise require tenant-admin consent. For Google, no current scope is admin-gated (confirmed
 * via research), so the answer only affects which post-connect folder-choice screen is shown —
 * declaring Personal skips the later My-Drive-vs-Shared-Drive picker entirely, converging on the
 * same auto-skip behavior already built for detected personal accounts (see workspace-root
 * components). See .claude/plans/connector-microsoft-impl.md, item 20.
 */
export function AccountTypeDialog({ open, onOpenChange, onSelect, provider }: AccountTypeDialogProps) {
  const copy = COPY[provider]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded">
        <DialogHeader>
          <DialogTitle className="text-[0.9375rem] font-bold text-[#1b1b1d]">{copy.title}</DialogTitle>
          <DialogDescription className="text-left text-xs text-[#45474c]">{copy.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 py-1">
          <button
            type="button"
            onClick={() => onSelect('personal')}
            className="group flex flex-col items-start gap-3 rounded border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#1b1b1d] hover:bg-[#f9f9fb] active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]">
              <User className="h-6 w-6 text-[#45474c]" />
            </div>
            <div>
              <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">{copy.personalLabel}</p>
              <p className="text-[11px] text-[#9a9ba0] mt-0.5">{copy.personalExample}</p>
              <p className="text-xs text-[#45474c] leading-relaxed mt-1.5">{copy.personalDescription}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect('work_school')}
            className="group flex flex-col items-start gap-3 rounded border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#1b1b1d] hover:bg-[#f9f9fb] active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[#e5e7eb] bg-[#f9f9fb]">
              <Building2 className="h-6 w-6 text-[#45474c]" />
            </div>
            <div>
              <p className="text-[0.8125rem] font-semibold text-[#1b1b1d]">{copy.workLabel}</p>
              <p className="text-[11px] text-[#9a9ba0] mt-0.5">{copy.workExample}</p>
              <p className="text-xs text-[#45474c] leading-relaxed mt-1.5">{copy.workDescription}</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
