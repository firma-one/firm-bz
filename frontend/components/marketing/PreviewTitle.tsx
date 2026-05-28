"use client"

import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Grip } from "lucide-react"
import { cn } from "@/lib/utils"
import { kineticLandingHeroTitleClassName } from "@/components/kinetic/kinetic-section-intro"

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

export function PreviewTitle() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIndex((prev) => (prev + 1) % LINES.length), 4000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-[3.5rem] sm:h-[4.5rem] md:h-[5rem] lg:h-[2.8rem] xl:h-[3.4rem] 2xl:h-[4rem] flex items-center overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.h1
          key={index}
          className={cn("mb-0 flex flex-wrap items-center gap-0", kineticLandingHeroTitleClassName, "lg:!text-[2rem] xl:!text-[2.5rem] 2xl:!text-[3rem]")}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {LINES[index]}
        </motion.h1>
      </AnimatePresence>
    </div>
  )
}
