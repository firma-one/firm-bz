'use client'

import React, { useState } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
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
                        className={`w-full h-9 flex items-center rounded border border-[#e5e7eb] bg-white px-3 pr-7 text-xs font-normal disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary ${className ?? ''}`}
                    >
                        <span className={`flex-1 text-left truncate ${value ? 'text-[#1b1b1d]' : 'text-[#9a9ba0]'}`}>
                            {value || placeholder}
                        </span>
                    </button>
                </DropdownMenuTrigger>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                    {value && !disabled && !isMandatory ? (
                        <button
                            type="button"
                            className="pointer-events-auto p-0.5 rounded text-[#9a9ba0] hover:text-[#1b1b1d] hover:bg-gray-100 transition-colors"
                            onClick={(e) => { e.stopPropagation(); onChange('') }}
                            aria-label="Clear"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    ) : (
                        <ChevronDown className="h-3 w-3 text-[#45474c]" />
                    )}
                </div>
            </div>
            <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-[2px] border border-[#e5e7eb] bg-white shadow-md py-0.5 p-0"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                {options.map((label) => (
                    <DropdownMenuItem
                        key={label}
                        className={`cursor-pointer rounded-none py-1 px-2.5 !text-[0.8125rem] text-[#45474c] outline-none focus:bg-[#f9f9fb] flex items-center justify-between ${value === label && !isCustom ? 'bg-primary/10 border-l-2 border-brand-accent text-primary font-semibold' : ''}`}
                        onSelect={() => {
                            onChange(label)
                            setOpen(false)
                        }}
                    >
                        {label}
                        {value === label && !isCustom && (
                            <Check className="h-3 w-3 shrink-0" />
                        )}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="my-0.5 bg-[#e5e7eb]" />
                <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <input
                        value={isCustom ? value : ''}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') setOpen(false)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={customEntryHint}
                        className="flex-1 text-xs text-[#1b1b1d] placeholder:text-[#9a9ba0] outline-none bg-transparent"
                    />
                    {isCustom && value && (
                        <Check className="h-3 w-3 text-[#45474c] shrink-0" />
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
