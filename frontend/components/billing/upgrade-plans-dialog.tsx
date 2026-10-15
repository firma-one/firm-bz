'use client'

import { upgradeCopy } from '@/lib/billing/upgrade-copy'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { PolarPlansPicker } from '@/components/billing/polar-plans-picker'
import { cn } from '@/lib/utils'

interface UpgradePlansDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    firmId: string | null | undefined
    returnPath: string
}

export function UpgradePlansDialog({ open, onOpenChange, firmId, returnPath }: UpgradePlansDialogProps) {
    const id = firmId?.trim() ?? ''

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'max-h-[min(92vh,40rem)] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-hidden p-0',
                    'md:max-w-3xl',
                    'rounded-dialog border-0 bg-surface shadow-dialog'
                )}
            >
                <DialogHeader className="space-y-1 border-b border-line px-5 pb-4 pt-5 text-left sm:px-6">
                    <DialogTitle className="pr-8 text-h3 text-fg">
                        {upgradeCopy.upgradeDialogTitle}
                    </DialogTitle>
                    <DialogDescription className="text-left text-small text-fg-muted">
                        {upgradeCopy.upgradeDialogBody}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[min(58vh,24rem)] overflow-y-auto px-5 py-5 sm:px-6 md:max-h-[min(62vh,28rem)]">
                    <PolarPlansPicker
                        firmId={id}
                        returnPath={returnPath}
                        portalReturnPath={returnPath}
                        density="compact"
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
