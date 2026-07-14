'use client'

import { ChevronDown, SlidersHorizontal } from "lucide-react"

interface OptionalFieldsSectionProps {
    open: boolean
    onToggle: () => void
    children: React.ReactNode
    label?: string
    className?: string
}

export function OptionalFieldsSection({ open, onToggle, children, label = 'Optional fields', className = '' }: OptionalFieldsSectionProps) {
    return (
        <section className={`border border-[#e5e7eb] rounded overflow-hidden ${className}`}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="w-full px-4 py-3 flex items-center justify-between bg-[#f9f9fb] hover:bg-[#f3f4f6] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#45474c]" aria-hidden />
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c]">{label}</span>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-[#45474c] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden min-h-0">
                    <div className="p-4 border-t border-[#e5e7eb] bg-white space-y-3">
                        {children}
                    </div>
                </div>
            </div>
        </section>
    )
}
