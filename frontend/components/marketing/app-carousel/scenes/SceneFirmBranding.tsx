"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

const FIRM_NAME = "Axiom Consulting"

const COLOR_SWATCHES = [
  { id: "slate", color: "#64748b" },
  { id: "violet", color: "#7c3aed" },
  { id: "emerald", color: "#069668" },
  { id: "rose", color: "#e11d48" },
  { id: "amber", color: "#d97706" },
]

interface Props {
  phase: number
}

export function SceneFirmBranding({ phase }: Props) {
  const [typedText, setTypedText] = useState("")
  const [selectedSwatch, setSelectedSwatch] = useState("slate")
  const [showToast, setShowToast] = useState(false)
  const [saveActive, setSaveActive] = useState(false)

  // Typewriter on phase 1
  useEffect(() => {
    if (phase < 1) {
      setTypedText("")
      return
    }
    let i = 0
    setTypedText("")
    const interval = setInterval(() => {
      i++
      setTypedText(FIRM_NAME.slice(0, i))
      if (i >= FIRM_NAME.length) clearInterval(interval)
    }, 60)
    return () => clearInterval(interval)
  }, [phase])

  // Swatch selection on phase 2
  useEffect(() => {
    if (phase >= 2) setSelectedSwatch("emerald")
    else setSelectedSwatch("slate")
  }, [phase])

  // Save active state on phase 3
  useEffect(() => {
    if (phase >= 3) {
      setSaveActive(true)
      const t = setTimeout(() => setSaveActive(false), 300)
      return () => clearTimeout(t)
    }
  }, [phase])

  // Toast on phase 4
  useEffect(() => {
    setShowToast(phase >= 4)
  }, [phase])

  const logoColor = phase >= 2 ? "#069668" : "#64748b"

  return (
    <div
      style={{
        height: "100%",
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Page header */}
      <div>
        <h2
          style={{
            fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
            fontSize: 18,
            fontWeight: 600,
            color: "#1b1b1d",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Settings
        </h2>
        <p
          style={{
            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
            fontSize: 13,
            color: "#6b7280",
            margin: "4px 0 0",
          }}
        >
          Manage your firm profile and branding
        </p>
      </div>

      {/* Branding card */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 2,
          border: "1px solid #e5e7eb",
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
            fontSize: 14,
            fontWeight: 600,
            color: "#1b1b1d",
            paddingBottom: 12,
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          Branding
        </div>

        {/* Firm logo preview */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 2,
              background: logoColor,
              transition: "background 0.5s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 4px 12px ${logoColor}40`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h10v2H6v3h5v2H6v3H2V2z" fill="white" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                fontSize: 14,
                fontWeight: 600,
                color: "#1b1b1d",
              }}
            >
              {typedText || "Your Firm"}
              {phase === 1 && typedText.length < FIRM_NAME.length && (
                <span
                  style={{
                    display: "inline-block",
                    width: 1.5,
                    height: 14,
                    background: "#069668",
                    marginLeft: 2,
                    animation: "blink 0.7s infinite",
                  }}
                />
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                fontSize: 11,
                color: "#9ca3af",
              }}
            >
              Consulting firm
            </div>
          </div>
        </div>

        {/* Firm name input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 12,
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Firm Name
          </label>
          <div
            style={{
              border: phase >= 1 ? "1.5px solid #069668" : "1.5px solid #e5e7eb",
              borderRadius: 2,
              padding: "8px 12px",
              background: phase >= 1 ? "rgba(6,150,104,0.03)" : "#ffffff",
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 13,
              color: typedText ? "#1b1b1d" : "#9ca3af",
              transition: "border-color 0.25s ease, background 0.25s ease",
              boxShadow: phase >= 1 ? "0 0 0 3px rgba(6,150,104,0.1)" : "none",
              minHeight: 36,
              display: "flex",
              alignItems: "center",
            }}
          >
            {typedText || "Enter firm name..."}
          </div>
        </div>

        {/* Brand color */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label
            style={{
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 12,
              fontWeight: 500,
              color: "#374151",
            }}
          >
            Brand Color
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {COLOR_SWATCHES.map((swatch) => {
              const isSelected = selectedSwatch === swatch.id
              return (
                <motion.div
                  key={swatch.id}
                  animate={{ scale: isSelected ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 2,
                    background: swatch.color,
                    cursor: "default",
                    boxShadow: isSelected
                      ? `0 0 0 2px #ffffff, 0 0 0 4px ${swatch.color}`
                      : "0 1px 3px rgba(0,0,0,0.15)",
                    transition: "box-shadow 0.25s ease",
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* Save button */}
        <div style={{ paddingTop: 4 }}>
          <motion.button
            animate={{ scale: saveActive ? 0.95 : 1 }}
            transition={{ duration: 0.1 }}
            style={{
              background: "#069668",
              color: "#ffffff",
              border: "none",
              borderRadius: 2,
              padding: "9px 18px",
              fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "default",
              letterSpacing: "-0.01em",
              boxShadow: "0 2px 8px rgba(6,150,104,0.35)",
            }}
          >
            Save Changes
          </motion.button>
        </div>
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              position: "absolute",
              bottom: 20,
              right: 20,
              background: "#069668",
              color: "#ffffff",
              borderRadius: 2,
              padding: "10px 16px",
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 13,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 8px 24px rgba(6,150,104,0.4)",
              zIndex: 10,
            }}
          >
            <span style={{ fontSize: 14 }}>✓</span>
            Branding updated
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
