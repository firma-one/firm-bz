'use client'

import React, { useState } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SelectWithCustomEntryProps {
    id?: string
    value: string
    onChange: (value: string) => void
    options: string[]
    placeholder?: string
    customEntryHint?: string
    disabled?: boolean
    isMandatory?: boolean
    className?: string
}

export function SelectWithCustomEntry({
    id,
    value,
    onChange,
    options,
    placeholder = 'Select…',
    customEntryHint = 'Other…',
    disabled = false,
    isMandatory = false,
    className,
}: SelectWithCustomEntryProps) {
    const [open, setOpen] = useState(false)
    const isCustom = value !== '' && !options.includes(value)

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <div className="relative w-full">
                <DropdownMenuTrigger asChild disabled={disabled}>
                    <button
                        id={id}
                        type="button"
                        className={cn('flex h-8 w-full items-center rounded-control border border-line-strong bg-surface px-2.5 pr-7 text-ui font-normal transition-[border-color,box-shadow] duration-100 focus-visible:border-action/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20 disabled:cursor-not-allowed disabled:opacity-50', className)}
                    >
                        <span className={`flex-1 text-left truncate ${value ? 'text-fg' : 'text-fg-subtle'}`}>
                            {value || placeholder}
                        </span>
                    </button>
                </DropdownMenuTrigger>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    {value && !disabled && !isMandatory ? (
                        <button
                            type="button"
                            className="pointer-events-auto rounded-control p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                            onClick={(e) => { e.stopPropagation(); onChange('') }}
                            aria-label="Clear"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" />
                    )}
                </div>
            </div>
            <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] p-1"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                {options.map((label) => (
                    <DropdownMenuItem
                        key={label}
                        className={`flex cursor-pointer items-center justify-between ${value === label && !isCustom ? 'text-fg' : 'text-fg-muted'}`}
                        onSelect={() => {
                            onChange(label)
                            setOpen(false)
                        }}
                    >
                        {label}
                        {value === label && !isCustom && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-action" />
                        )}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <input
                        value={isCustom ? value : ''}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') setOpen(false)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={customEntryHint}
                        className="flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
                    />
                    {isCustom && value && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
