'use client'

import React from 'react'
import { User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PropertyRow, PROPERTY_FIELD_CLASS, PROPERTY_HINT_CLASS } from '@/components/ui/property-list'

interface InviteeNameFieldsProps {
    /** Namespaces the input ids, since three different modals render this row. */
    idPrefix: string
    firstName: string
    lastName: string
    onFirstNameChange: (value: string) => void
    onLastNameChange: (value: string) => void
    disabled?: boolean
}

/**
 * The optional name an inviter can put on an invitation.
 *
 * Shared by the firm, client and engagement invite modals. Optional on purpose — an inviter who
 * only has an address still sends the invite in one field — but worth asking for, because without
 * it the invitee is shown by their email address everywhere until they find the profile form.
 */
export function InviteeNameFields({
    idPrefix,
    firstName,
    lastName,
    onFirstNameChange,
    onLastNameChange,
    disabled,
}: InviteeNameFieldsProps) {
    return (
        <PropertyRow label={<label htmlFor={`${idPrefix}-first-name`}>Name</label>} icon={<User />}>
            <div className="flex w-full flex-col gap-1">
                <div className="flex gap-2">
                    <Input
                        id={`${idPrefix}-first-name`}
                        placeholder="First name"
                        value={firstName}
                        onChange={(e) => onFirstNameChange(e.target.value)}
                        disabled={disabled}
                        className={PROPERTY_FIELD_CLASS}
                    />
                    <Input
                        id={`${idPrefix}-last-name`}
                        placeholder="Last name"
                        value={lastName}
                        onChange={(e) => onLastNameChange(e.target.value)}
                        disabled={disabled}
                        className={PROPERTY_FIELD_CLASS}
                    />
                </div>
                <p className={PROPERTY_HINT_CLASS}>
                    Optional. Without it they appear by their email address until they fill it in themselves.
                </p>
            </div>
        </PropertyRow>
    )
}
