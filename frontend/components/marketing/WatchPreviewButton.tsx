import Link from "next/link"
import { Play } from "lucide-react"
import { cn } from "@/lib/utils"

export function WatchPreviewButton({ className }: { className?: string }) {
  return (
    <Link
      href="/demo"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex h-14 w-full cursor-pointer items-center justify-center rounded-md border border-transparent bg-[#5a78ff] px-8 text-base font-bold tracking-widest text-white shadow-[0_1px_0_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4a68ef] hover:shadow-[0_10px_24px_-12px_rgba(90,120,255,0.55)] active:translate-y-0 active:scale-95 sm:w-auto [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
        className,
      )}
    >
      <Play className="mr-2 h-4 w-4 fill-white stroke-none" />
      See Live Demo
    </Link>
  )
}
