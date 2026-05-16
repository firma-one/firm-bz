'use client'

import React, { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
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
    className,
}: SelectWithCustomEntryProps) {
    const [open, setOpen] = useState(false)
    const isCustom = value !== '' && !options.includes(value)

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    id={id}
                    type="button"
                    className={`w-full h-10 flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
                >
                    <span className={value ? 'text-slate-900' : 'text-slate-400'}>
                        {value || placeholder}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] p-1"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                {options.map((label) => (
                    <DropdownMenuItem
                        key={label}
                        className="flex items-center justify-between cursor-pointer"
                        onSelect={() => {
                            onChange(label)
                            setOpen(false)
                        }}
                    >
                        {label}
                        {value === label && !isCustom && (
                            <Check className="h-4 w-4 text-slate-700" />
                        )}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex items-center gap-2">
                    <input
                        value={isCustom ? value : ''}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') setOpen(false)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={customEntryHint}
                        className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                    />
                    {isCustom && value && (
                        <Check className="h-4 w-4 text-slate-700 shrink-0" />
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
