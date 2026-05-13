'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Persona } from '@prisma/client'
import { inviteMember } from '@/lib/actions/invitations'
import { Badge } from '@/components/ui/badge'
import { SandboxInfoBanner } from '@/components/ui/sandbox-info-banner'
import { Users, Shield, Briefcase, Eye, CheckCircle2 } from 'lucide-react'
import { ROLES } from '@/lib/roles'
import { useOrgSandbox } from '@/lib/use-org-sandbox'

type ProjectPersonaWithRole = Persona & {
    rbacPersona: {
        role: {
            slug: string
            displayName: string
        }
    }
}

interface InviteMemberModalProps {
    projectId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    personas: ProjectPersonaWithRole[]
    preselectedPersonaId?: string | null
    onSuccess: () => void
}

export function InviteMemberModal({ projectId, open, onOpenChange, personas, preselectedPersonaId, onSuccess }: InviteMemberModalProps) {
    const [email, setEmail] = useState('')
    const [emailError, setEmailError] = useState('')
    const [selectedPersonaId, setSelectedPersonaId] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const orgSandbox = useOrgSandbox()
    const isSandboxFirm = Boolean(orgSandbox?.sandboxOnly)

    const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

    // Set preselected persona when modal opens
    useEffect(() => {
        if (open && preselectedPersonaId) {
            setSelectedPersonaId(preselectedPersonaId)
        } else if (!open) {
            setSelectedPersonaId('')
            setEmail('')
            setError('')
            setEmailError('')
        }
    }, [open, preselectedPersonaId])

    // Debounced email validation
    useEffect(() => {
        if (!email) {
            setEmailError('')
            return
        }
        const timer = setTimeout(() => {
            setEmailError(isValidEmail(email) ? '' : 'Please enter a valid email address')
        }, 400)
        return () => clearTimeout(timer)
    }, [email])

    const selectedPersona = personas.find(p => p.id === selectedPersonaId)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (isSandboxFirm) return

        if (!isValidEmail(email)) {
            setEmailError('Please enter a valid email address')
            return
        }

        setIsSubmitting(true)

        try {
            await inviteMember(projectId, email, selectedPersonaId)
            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation')
        } finally {
            setIsSubmitting(false)
        }
    }

    const getPersonaIcon = (name: string) => {
        if (name.includes('Owner')) return <Shield className="h-4 w-4" />
        if (name.includes('Internal')) return <Users className="h-4 w-4" />
        if (name.includes('Client')) return <Eye className="h-4 w-4" />
        return <Briefcase className="h-4 w-4" />
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Invite to Project</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    {isSandboxFirm && <SandboxInfoBanner />}
                    {/* Email Input */}
                    <div className="space-y-2">
                        <Label htmlFor="email" className={isSandboxFirm ? 'text-slate-500' : undefined}>Email Address</Label>
                        <div className="relative">
                            <Input
                                id="email"
                                type="text"
                                placeholder="colleague@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isSandboxFirm}
                                className={`disabled:cursor-not-allowed disabled:opacity-60 ${emailError ? 'border-red-400 focus-visible:ring-red-400' : ''} ${email && !emailError ? 'pr-9' : ''}`}
                            />
                            {email && !emailError && (
                                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />
                            )}
                        </div>
                        {emailError && (
                            <p className="text-xs text-red-500">{emailError}</p>
                        )}
                    </div>

                    {/* Persona Selection */}
                    <div className="space-y-2">
                        <Label className={isSandboxFirm ? 'text-slate-500' : undefined}>Role (Persona)</Label>
                        <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId} required={!isSandboxFirm} disabled={isSandboxFirm}>
                            <SelectTrigger className="disabled:cursor-not-allowed disabled:opacity-60">
                                <SelectValue placeholder="Select a persona" />
                            </SelectTrigger>
                            <SelectContent>
                                {personas.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        <span className="font-medium">{p.displayName}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Persona Description Preview */}
                        {selectedPersona && (
                            <div className="mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
                                <div className="flex items-center gap-2 font-medium text-slate-900 mb-1">
                                    {getPersonaIcon(selectedPersona.displayName)}
                                    {selectedPersona.displayName}
                                </div>

                                <div className="flex gap-2">
                                    <Badge variant="outline" className="text-xs bg-white">
                                        {selectedPersona.rbacPersona?.role?.slug === 'eng_admin' ? 'Manage' :
                                            selectedPersona.rbacPersona?.role?.slug === 'eng_member' || selectedPersona.rbacPersona?.role?.slug === 'eng_ext_collaborator' ? 'Edit' : 'View'}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                        {selectedPersona.rbacPersona?.role?.slug === 'firm_member' || selectedPersona.rbacPersona?.role?.slug === 'firm_admin' ? 'Internal' : 'Guest'}
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="blackCta" disabled={isSandboxFirm || isSubmitting || !selectedPersonaId || !email || !!emailError}>
                            {isSubmitting ? 'Sending...' : 'Send Invitation'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
