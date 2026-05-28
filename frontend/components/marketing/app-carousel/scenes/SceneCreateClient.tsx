"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

const CLIENT_NAME = "Meridian Finance"

interface Props {
  phase: number
}

export function SceneCreateClient({ phase }: Props) {
  const [typedName, setTypedName] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [showNewRow, setShowNewRow] = useState(false)
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    setShowModal(phase >= 2)
    setShowNewRow(phase >= 5)
    setShowPortal(phase >= 5)
  }, [phase])

  useEffect(() => {
    if (phase < 3) { setTypedName(""); return }
    let i = 0
    setTypedName("")
    const interval = setInterval(() => {
      i++
      setTypedName(CLIENT_NAME.slice(0, i))
      if (i >= CLIENT_NAME.length) clearInterval(interval)
    }, 55)
    return () => clearInterval(interval)
  }, [phase])

  return (
    <div style={{ height: "100%", display: "flex", position: "relative", overflow: "hidden" }}>
      {/* Left: client list */}
      <div style={{
        flex: showPortal ? "0 0 52%" : "1",
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "flex 0.5s ease",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{
              fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
              fontSize: 17, fontWeight: 600, color: "#1b1b1d", margin: 0, letterSpacing: "-0.02em",
            }}>Clients</h2>
            <p style={{
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 12, color: "#6b7280", margin: "3px 0 0",
            }}>2 active clients</p>
          </div>
          <motion.div
            animate={{ scale: phase === 1 ? 1.05 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{
              background: "#069668", color: "#ffffff", borderRadius: 2, padding: "7px 13px",
              fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
              fontSize: 12, fontWeight: 600, cursor: "default", letterSpacing: "-0.01em",
              boxShadow: "0 2px 8px rgba(6,150,104,0.3)", whiteSpace: "nowrap",
            }}
          >
            + New Client
          </motion.div>
        </div>

        <div style={{ background: "#ffffff", borderRadius: 2, border: "1px solid #e5e7eb", overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderBottom: "1px solid #f9f9fb",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 2, background: "linear-gradient(135deg, #64748b, #475569)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "white", fontWeight: 600 }}>HG</span>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 13, fontWeight: 500, color: "#1b1b1d" }}>Hartwell Group</div>
                <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#9ca3af" }}>4 engagements</div>
              </div>
            </div>
            <div style={{ background: "#f0fdf4", color: "#069668", borderRadius: 2, padding: "3px 10px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, fontWeight: 600 }}>Active</div>
          </div>

          <AnimatePresence>
            {showNewRow && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", background: "rgba(6,150,104,0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 2, background: "linear-gradient(135deg, #069668, #04724e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 11, color: "white", fontWeight: 600 }}>MF</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 13, fontWeight: 500, color: "#1b1b1d" }}>Meridian Finance</div>
                    <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#9ca3af" }}>Just created</div>
                  </div>
                </div>
                <div style={{ background: "#f0fdf4", color: "#069668", borderRadius: 2, padding: "3px 10px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, fontWeight: 600 }}>Active</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right: branded portal preview */}
      <AnimatePresence>
        {showPortal && (
          <motion.div
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.15 }}
            style={{
              flex: "0 0 48%", borderLeft: "1px solid #e5e7eb",
              background: "#ffffff", display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ background: "#069668", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 2, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 2h10v2H6v3h5v2H6v3H2V2z" fill="white" /></svg>
              </div>
              <span style={{ fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Axiom Consulting</span>
              <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", borderRadius: 2, padding: "2px 7px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "rgba(255,255,255,0.8)" }}>Client Portal</div>
            </div>

            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 14, fontWeight: 600, color: "#1b1b1d", margin: 0, letterSpacing: "-0.02em" }}>Meridian Finance</h3>
                <p style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>Secure access · sarah@meridianfinance.com</p>
              </div>

              {[
                { name: "Q3 Strategy Deck", type: "PDF", color: "#ef4444" },
                { name: "Brand Guidelines", type: "PDF", color: "#3b82f6" },
                { name: "Project Brief", type: "DOC", color: "#8b5cf6" },
              ].map((doc, i) => (
                <motion.div
                  key={doc.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 300, damping: 28 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 11px",
                    background: "#f9f9fb", borderRadius: 2, border: "1px solid #f3f4f6",
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 2, background: `${doc.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: doc.color, fontFamily: "monospace" }}>{doc.type}</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, color: "#374151", fontWeight: 500 }}>{doc.name}</span>
                </motion.div>
              ))}

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto", padding: "8px 10px", background: "#f0fdf4", borderRadius: 2, border: "1px solid #bbf7d0" }}>
                <span style={{ fontSize: 12 }}>🔒</span>
                <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#069668", fontWeight: 500 }}>Secure · non-custodial · Axiom Consulting</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create client modal */}
      <AnimatePresence>
        {showModal && phase < 5 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}
          >
            <motion.div
              initial={{ y: -16, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -8, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              style={{ background: "#ffffff", borderRadius: 2, padding: "22px 24px", width: 300, boxShadow: "0 24px 48px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 16 }}
            >
              <h3 style={{ fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 15, fontWeight: 600, color: "#1b1b1d", margin: 0, letterSpacing: "-0.02em" }}>New Client</h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, fontWeight: 500, color: "#374151" }}>Client name</label>
                <div style={{
                  border: phase >= 3 ? "1.5px solid #069668" : "1.5px solid #e5e7eb",
                  borderRadius: 2, padding: "8px 12px",
                  fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                  fontSize: 13, color: typedName ? "#1b1b1d" : "#9ca3af",
                  minHeight: 36, display: "flex", alignItems: "center",
                  background: phase >= 3 ? "rgba(6,150,104,0.02)" : "#ffffff",
                  boxShadow: phase >= 3 ? "0 0 0 3px rgba(6,150,104,0.08)" : "none",
                  transition: "all 0.2s ease",
                }}>
                  {typedName || "e.g. Acme Corp"}
                  {phase === 3 && typedName.length < CLIENT_NAME.length && (
                    <span style={{ display: "inline-block", width: 1.5, height: 13, background: "#069668", marginLeft: 2, animation: "blink 0.7s infinite" }} />
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 2, padding: "8px 12px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 13, color: "#9ca3af", cursor: "default", textAlign: "center" }}>Cancel</div>
                <motion.div
                  animate={{ scale: phase === 4 ? 0.95 : 1 }}
                  transition={{ duration: 0.1 }}
                  style={{ flex: 1, background: "#069668", color: "#ffffff", borderRadius: 2, padding: "8px 12px", fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 13, fontWeight: 600, cursor: "default", textAlign: "center", boxShadow: "0 2px 8px rgba(6,150,104,0.3)" }}
                >
                  Create client
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  )
}
