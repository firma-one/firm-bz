"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Grip } from "lucide-react"
import { cn } from "@/lib/utils"
import { kineticLandingHeroTitleClassName } from "@/components/kinetic/kinetic-section-intro"
import { BrandMarkIcon } from "@/components/brand/BrandMarkIcon"

function Sep() {
  return <Grip className="shrink-0 text-[#c6c6cc] mx-1 sm:mx-2" style={{ width: "0.49em", height: "0.49em" }} strokeWidth={2} />
}


const LINES = [
  <>
    <span className="text-[#069668]">Your Drive</span>
    <Sep />
    <span className="text-[#5a78ff]">Your Portal</span>
    <Sep />
    <span className="text-[#069668]">Your Brand</span>
    <Sep />
    <span className="text-[#5a78ff]">Your IP</span>
  </>,
  <>
    <span className="text-[#069668]">Your Clients</span>
    <Sep />
    <span className="text-[#5a78ff]">Your Offering</span>
    <Sep />
    <span className="text-[#069668]">One</span>
    <span className="inline-block w-[0.3em]" />
    <span className="text-[#5a78ff]">Institutional Experience</span>
  </>,
]

const MOBILE_LINES = [
  <>
    <span className="text-[#069668]">Your Drive</span>
    <Sep />
    <span className="text-[#5a78ff]">Your Portal</span>
  </>,
  <>
    <span className="text-[#069668]">Your Brand</span>
    <Sep />
    <span className="text-[#5a78ff]">Your IP</span>
  </>,
  <>
    <span className="text-[#069668]">Your Clients</span>
    <Sep />
    <span className="text-[#5a78ff]">Your Offering</span>
  </>,
  <>
    <span className="text-[#069668]">One</span>
    <BrandMarkIcon className="shrink-0 mx-1.5 w-[0.65em] h-[0.65em]" />
    <span className="text-[#5a78ff]">Institutional Experience</span>
  </>,
]

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return isMobile
}

export function PreviewTitle() {
  const [index, setIndex] = useState(0)
  const isMobile = useIsMobile()

  const lines = isMobile ? MOBILE_LINES : LINES

  useEffect(() => {
    setIndex(0)
  }, [isMobile])

  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % lines.length), 3500)
    return () => clearInterval(timer)
  }, [lines.length])

  return (
    <div
      className={cn(
        "flex items-center overflow-hidden",
        isMobile
          ? "h-[2.4rem]"
          : "h-[3.5rem] sm:h-[4.5rem] md:h-[5rem] lg:h-[2.8rem] xl:h-[3.4rem] 2xl:h-[4rem]"
      )}
    >
      <AnimatePresence mode="wait">
        <motion.h1
          key={`${isMobile ? "m" : "d"}-${index}`}
          className={cn(
            "mb-0 flex flex-wrap items-center gap-0",
            kineticLandingHeroTitleClassName,
            isMobile
              ? (index === MOBILE_LINES.length - 1 ? "!text-[1.6rem]" : "!text-[1.75rem]")
              : "lg:!text-[2rem] xl:!text-[2.5rem] 2xl:!text-[3rem]"
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          {lines[index]}
        </motion.h1>
      </AnimatePresence>
    </div>
  )
}
