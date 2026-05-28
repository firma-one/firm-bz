"use client"

import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Play, SquareX } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProductPreview } from "@/components/marketing/app-carousel"

export function WatchPreviewButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex h-14 w-full cursor-pointer items-center justify-center rounded-md border border-transparent bg-[#5a78ff] px-8 text-base font-bold tracking-widest text-white shadow-[0_1px_0_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4a68ef] hover:shadow-[0_10px_24px_-12px_rgba(90,120,255,0.55)] active:translate-y-0 active:scale-95 sm:w-auto [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
          className,
        )}
      >
        <Play className="mr-2 h-4 w-4 fill-white stroke-none" />
        Watch Preview
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-x-0 bottom-0 z-[72] bg-black/40",
              "top-16 lg:top-[4.25rem]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-[73] flex flex-col overflow-hidden border-0 p-0 shadow-none outline-none",
              "top-16 lg:top-[4.25rem]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
            style={{ background: "#fcf8fa" }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {/* Ambient glows — matches marketing layout */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
              <div
                className="absolute top-[-18%] right-[-8%] h-[min(88vw,680px)] w-[min(88vw,680px)] rounded-full opacity-35 blur-[100px]"
                style={{ background: "radial-gradient(circle, #72ff7044 0%, transparent 72%)" }}
              />
              <div
                className="absolute bottom-[-22%] left-[-12%] h-[min(78vw,520px)] w-[min(78vw,520px)] rounded-full opacity-25 blur-[90px]"
                style={{ background: "radial-gradient(circle, #5a78ff33 0%, transparent 70%)" }}
              />
            </div>
            <DialogPrimitive.Title className="sr-only">Product Preview</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              An animated walkthrough of Firma&apos;s core features: quick navigation, brand setup, client portal, IP protection, audit trail, full engagement control, and analytics.
            </DialogPrimitive.Description>

            <DialogPrimitive.Close
              type="button"
              className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-md bg-black/20 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#141c2a] hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 sm:right-6 sm:top-6 [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
              aria-label="Close preview"
            >
              <SquareX className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
              <span className="hidden md:inline">Close</span>
            </DialogPrimitive.Close>

            <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ProductPreview />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
