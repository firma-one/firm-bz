"use client"

import { motion, useSpring, useTransform } from "framer-motion"
import { useEffect } from "react"

interface CarouselCursorProps {
  x: number
  y: number
  clicking: boolean
}

export function CarouselCursor({ x, y, clicking }: CarouselCursorProps) {
  const springX = useSpring(x, { stiffness: 200, damping: 25 })
  const springY = useSpring(y, { stiffness: 200, damping: 25 })

  useEffect(() => {
    springX.set(x)
  }, [x, springX])

  useEffect(() => {
    springY.set(y)
  }, [y, springY])

  return (
    <motion.div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        x: springX,
        y: springY,
        pointerEvents: "none",
        zIndex: 50,
        translateX: "-50%",
        translateY: "-50%",
      }}
      animate={{ scale: clicking ? 0.7 : 1 }}
      transition={{ duration: 0.12 }}
    >
      {/* Outer ring */}
      <motion.div
        animate={{
          scale: clicking ? 0.85 : 1,
          opacity: clicking ? 0.6 : 0.3,
        }}
        transition={{ duration: 0.12 }}
        style={{
          position: "absolute",
          inset: -8,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.35)",
        }}
      />
      {/* Cursor dot */}
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(0,0,0,0.15)",
        }}
      />
    </motion.div>
  )
}
