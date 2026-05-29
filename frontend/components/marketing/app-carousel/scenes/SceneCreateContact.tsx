"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState, useRef } from "react"
import { File, FileText, MoreHorizontal, Eye, Download, Share2, Edit3, Move, Copy, Trash2, FolderOpen } from "lucide-react"

interface Props {
  phase: number
}

const DOCS = [
  { id: "q3", name: "Q3-Strategy-Deck.pdf", mimeType: "application/pdf", size: "2.4 MB" },
  { id: "framework", name: "Brand-Strategy-Framework.pdf", mimeType: "application/pdf", size: "1.8 MB" },
  { id: "brief", name: "Project-Brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: "420 KB" },
]

function DocIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes("pdf")) {
    return (
      <div style={{ width: 30, height: 30, borderRadius: 4, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <File size={15} style={{ color: "#dc2626" }} strokeWidth={1.75} />
      </div>
    )
  }
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return (
      <div style={{ width: 30, height: 30, borderRadius: 4, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={15} style={{ color: "#2563eb" }} strokeWidth={1.75} />
      </div>
    )
  }
  return (
    <div style={{ width: 30, height: 30, borderRadius: 4, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <File size={15} style={{ color: "#6b7280" }} strokeWidth={1.75} />
    </div>
  )
}

const ACTION_MENU_ITEMS = [
  { icon: Eye, label: "Open", color: "#374151" },
  { icon: Download, label: "Download", color: "#2563eb" },
  { icon: Share2, label: "Share", color: "#7c3aed" },
  null, // separator
  { icon: FolderOpen, label: "Organise", color: "#374151", sub: [
    { icon: Edit3, label: "Rename", color: "#374151" },
    { icon: Copy, label: "Duplicate", color: "#374151" },
    { icon: Move, label: "Move", color: "#374151" },
  ]},
  null,
  { icon: Trash2, label: "Move to Bin", color: "#dc2626" },
]

export function SceneCreateContact({ phase }: Props) {
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showNeverShare, setShowNeverShare] = useState(false)
  const [showExpiry, setShowExpiry] = useState(false)
  const [expiryTyped, setExpiryTyped] = useState("")
  const [openMenuDocId, setOpenMenuDocId] = useState<string | null>(null)

  useEffect(() => {
    setShowActionMenu(phase === 1 || phase === 2)
    setShowNeverShare(phase >= 3)
    setShowExpiry(phase >= 4)
  }, [phase])

  // Auto-open the action menu on the framework doc at phase 1
  useEffect(() => {
    if (phase >= 1 && phase <= 2) {
      setOpenMenuDocId("framework")
    } else {
      setOpenMenuDocId(null)
    }
  }, [phase])

  // Type expiry date
  useEffect(() => {
    if (phase < 4) { setExpiryTyped(""); return }
    const target = "Jun 26, 2025"
    let i = 0
    const interval = setInterval(() => {
      i++
      setExpiryTyped(target.slice(0, i))
      if (i >= target.length) clearInterval(interval)
    }, 60)
    return () => clearInterval(interval)
  }, [phase])

  return (
    <div style={{ height: "100%", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, color: "#9ca3af" }}>Meridian Finance</span>
            <span style={{ color: "#d1d5db", fontSize: 12 }}>›</span>
            <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, color: "#6b7280" }}>Q3 Strategy Review</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 17, fontWeight: 600, color: "#1b1b1d", margin: 0, letterSpacing: "-0.02em" }}>Documents</h2>
        </div>
        <div style={{ background: "#f3f4f6", borderRadius: 4, padding: "5px 10px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 5 }}>
          <Shield size={11} style={{ color: "#069668" }} />
          IP controls active
        </div>
      </div>

      {/* Document list */}
      <div style={{ background: "#ffffff", borderRadius: 4, border: "1px solid #e5e7eb", overflow: "visible", position: "relative" }}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 8, fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span style={{ flex: 1 }}>Document</span>
          <span style={{ width: 70 }}>Size</span>
          <span style={{ width: 110 }}>Protection</span>
          <span style={{ width: 30 }} />
        </div>

        {DOCS.map((doc, idx) => {
          const isFramework = doc.id === "framework"
          const menuOpen = openMenuDocId === doc.id
          return (
            <div
              key={doc.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                borderBottom: idx < DOCS.length - 1 ? "1px solid #f9f9fb" : "none",
                background: isFramework && phase >= 1 ? "rgba(139,92,246,0.02)" : "transparent",
                transition: "background 0.3s ease",
                position: "relative",
              }}
            >
              <DocIcon mimeType={doc.mimeType} />

              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, fontWeight: 500, color: "#1b1b1d" }}>{doc.name}</div>
              </div>

              <div style={{ width: 70, fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#9ca3af" }}>{doc.size}</div>

              <div style={{ width: 110, display: "flex", alignItems: "center", gap: 4 }}>
                {isFramework && showNeverShare ? (
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  >
                    <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 4, padding: "2px 8px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, border: "1px solid #fecaca", whiteSpace: "nowrap" }}>
                      🔴 Never Share
                    </div>
                  </motion.div>
                ) : !isFramework ? (
                  <div style={{ background: "#f3f4f6", color: "#9ca3af", borderRadius: 4, padding: "2px 8px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10 }}>Shareable</div>
                ) : null}
              </div>

              {/* Three-dot menu button */}
              <div style={{ width: 30, display: "flex", justifyContent: "center", position: "relative", zIndex: 40 }}>
                <div
                  style={{
                    width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    background: menuOpen ? "#f3f4f6" : "transparent",
                    cursor: "default",
                    flexShrink: 0,
                  }}
                >
                  <MoreHorizontal size={14} style={{ color: "#6b7280" }} strokeWidth={1.75} />
                </div>

                {/* Action dropdown */}
                {isFramework && menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 26 }}
                    style={{
                      position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
                      background: "#ffffff", borderRadius: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
                      border: "1px solid #e5e7eb", minWidth: 180, overflow: "hidden",
                    }}
                  >
                    {/* File header */}
                    <div style={{ padding: "9px 12px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
                      <File size={13} style={{ color: "#dc2626", flexShrink: 0 }} strokeWidth={1.75} />
                      <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, fontWeight: 600, color: "#1b1b1d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Brand-Strategy-Framework.pdf
                      </span>
                    </div>

                    {/* Menu items */}
                    {[
                      { Icon: Eye, label: "Open", color: "#374151", highlight: false },
                      { Icon: Download, label: "Download", color: "#374151", highlight: false },
                      { Icon: Share2, label: "Share", color: "#374151", highlight: false },
                      null,
                      { Icon: FolderOpen, label: "Organise", color: "#374151", highlight: false },
                      null,
                      { Icon: Edit3, label: "Mark as Protected", color: "#dc2626", highlight: phase === 2 },
                      { Icon: Trash2, label: "Move to Bin", color: "#dc2626", highlight: false },
                    ].map((item, i) =>
                      item === null ? (
                        <div key={`sep-${i}`} style={{ height: 1, background: "#f3f4f6", margin: "2px 0" }} />
                      ) : (
                        <div
                          key={item.label}
                          style={{
                            display: "flex", alignItems: "center", gap: 9, padding: "8px 12px",
                            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                            fontSize: 12, fontWeight: item.highlight ? 600 : 400,
                            color: item.highlight ? "#dc2626" : item.color,
                            background: item.highlight ? "#fef2f2" : "transparent",
                            cursor: "default",
                          }}
                        >
                          <item.Icon size={13} strokeWidth={item.highlight ? 2 : 1.75} style={{ flexShrink: 0 }} />
                          {item.label}
                        </div>
                      )
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Expiry setting row */}
      <AnimatePresence>
        {showExpiry && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            style={{
              background: "#fffbeb", borderRadius: 4, border: "1px solid #fde68a",
              padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <span style={{ fontSize: 18 }}>⏱️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, fontWeight: 600, color: "#92400e" }}>
                Share expiry — Brand-Strategy-Framework.pdf
              </div>
              <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#a16207", marginTop: 2 }}>
                Access auto-revoked after expiry date
              </div>
            </div>
            <div style={{
              border: "1.5px solid #f59e0b", borderRadius: 4, padding: "6px 12px",
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 12, color: "#b45309", fontWeight: 500, minWidth: 100,
              background: "#ffffff", display: "flex", alignItems: "center",
              boxShadow: "0 0 0 3px rgba(245,158,11,0.1)",
            }}>
              {expiryTyped || " "}
              {expiryTyped.length < "Jun 26, 2025".length && (
                <span style={{ display: "inline-block", width: 1.5, height: 12, background: "#f59e0b", marginLeft: 2, animation: "blink 0.7s infinite" }} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expiry badge summary */}
      <AnimatePresence>
        {phase >= 5 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#ffffff", borderRadius: 4, border: "1px solid #e5e7eb" }}
          >
            <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)" }}>🔴 Never Share</div>
            <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, color: "#6b7280" }}>+</span>
            <div style={{ background: "#fffbeb", color: "#b45309", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", border: "1px solid #fde68a" }}>⏱ Expires Jun 26</div>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, color: "#9ca3af" }}>Brand-Strategy-Framework.pdf</span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  )
}

function Shield({ size, style }: { size: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
