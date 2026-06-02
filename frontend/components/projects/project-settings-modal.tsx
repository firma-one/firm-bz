'use client'

import React from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EngagementSettingsForm } from './engagement-settings-form'
import type { LwCrmEngagementStatus } from '@/lib/actions/project'

interface ProjectSettingsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
    orgSlug: string
    clientSlug: string
    initialName: string
    initialDescription?: string
    initialKickoffDate?: string | null
    initialDueDate?: string | null
    initialFollowUpDate?: string | null
    initialStatus?: LwCrmEngagementStatus
    initialContractType?: string
    initialRateOrValue?: string | null
    initialTags?: string[]
    onSaved?: () => void
}

export function ProjectSettingsModal({
    open,
    onOpenChange,
    projectId,
    orgSlug,
    clientSlug,
    initialName,
    initialDescription = '',
    initialKickoffDate = null,
    initialDueDate = null,
    initialFollowUpDate = null,
    initialStatus = 'ACTIVE',
    initialContractType = '',
    initialRateOrValue = null,
    initialTags = [],
    onSaved,
}: ProjectSettingsModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Engagement settings</DialogTitle>
                    <DialogDescription>Edit properties or delete this engagement.</DialogDescription>
                </DialogHeader>
                <EngagementSettingsForm
                    projectId={projectId}
                    orgSlug={orgSlug}
                    clientSlug={clientSlug}
                    initialName={initialName}
                    initialDescription={initialDescription}
                    initialKickoffDate={initialKickoffDate}
                    initialDueDate={initialDueDate}
                    initialFollowUpDate={initialFollowUpDate}
                    initialStatus={initialStatus}
                    initialContractType={initialContractType}
                    initialRateOrValue={initialRateOrValue}
                    initialTags={initialTags}
                    onCancel={() => onOpenChange(false)}
                    onSaved={() => {
                        onSaved?.()
                        onOpenChange(false)
                    }}
                />
                <DialogFooter className="sr-only">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
