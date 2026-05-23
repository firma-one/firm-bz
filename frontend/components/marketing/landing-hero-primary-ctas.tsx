"use client"

import Link from "next/link"
import { CalendarDays, MessageSquareMore } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Primary marketing hero CTAs — same treatment as `landing-page.tsx` (Contact Us + Book a Demo).
 */
export function LandingHeroPrimaryCtas({ className }: { className?: string }) {
    return (
        <div className={cn("flex flex-col justify-start gap-4 sm:flex-row", className)}>
            <Link href="/contact" className="w-full sm:w-auto">
                <Button
                    variant="ghost"
                    className="group h-14 w-full px-8 text-base font-bold tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#72ff70] hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 sm:w-auto [font-family:var(--font-kinetic-headline),system-ui,sans-serif] rounded-md border-0 bg-[#72ff70]"
                >
                    Contact Us
                    <MessageSquareMore
                        className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5"
                        strokeWidth={2}
                    />
                </Button>
            </Link>
            <Link
                href="https://calendly.com/firmaone/firma-connect"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
            >
                <div className="group flex h-14 w-full cursor-pointer items-center justify-center rounded-md border border-transparent bg-[#141c2a] px-8 text-base font-bold tracking-widest text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 sm:w-auto [font-family:var(--font-kinetic-headline),system-ui,sans-serif]">
                    <CalendarDays className="mr-2 h-5 w-5 stroke-[1.5] text-[#72ff70] opacity-90" />
                    Book a Demo
                </div>
            </Link>
        </div>
    )
}
