"use client"

import { motion, AnimatePresence } from "framer-motion"

const DOCS = [
  { name: "Q3-Strategy-Deck.pdf",   size: "2.4 MB", shared: true  },
  { name: "Brand-Framework.pdf",    size: "1.1 MB", shared: true  },
  { name: "Engagement-Notes.docx",  size: "340 KB", shared: true  },
  { name: "Internal-Costings.xlsx", size: "88 KB",  shared: false },
]

const WRAP_ACTIONS = [
  { icon: "🔗", label: "Revoke 3 active share links" },
  { icon: "🔒", label: "Lock all documents to View-Only" },
  { icon: "📁", label: "Archive workspace" },
]

function PdfIcon() {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none" aria-hidden>
      <rect width="28" height="34" rx="3" fill="#fee2e2" />
      <rect x="5" y="8" width="18" height="2" rx="1" fill="#f87171" />
      <rect x="5" y="13" width="14" height="2" rx="1" fill="#f87171" opacity="0.6" />
      <rect x="5" y="18" width="16" height="2" rx="1" fill="#f87171" opacity="0.4" />
      <text x="4" y="30" fontSize="7" fontWeight="700" fill="#ef4444" fontFamily="system-ui">PDF</text>
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none" aria-hidden>
      <rect width="28" height="34" rx="3" fill="#dbeafe" />
      <rect x="5" y="8" width="18" height="2" rx="1" fill="#60a5fa" />
      <rect x="5" y="13" width="14" height="2" rx="1" fill="#60a5fa" opacity="0.6" />
      <rect x="5" y="18" width="16" height="2" rx="1" fill="#60a5fa" opacity="0.4" />
      <text x="3" y="30" fontSize="6" fontWeight="700" fill="#2563eb" fontFamily="system-ui">DOCX</text>
    </svg>
  )
}

function XlsIcon() {
  return (
    <svg width="28" height="34" viewBox="0 0 28 34" fill="none" aria-hidden>
      <rect width="28" height="34" rx="3" fill="#dcfce7" />
      <rect x="5" y="8" width="18" height="2" rx="1" fill="#4ade80" />
      <rect x="5" y="13" width="14" height="2" rx="1" fill="#4ade80" opacity="0.6" />
      <rect x="5" y="18" width="16" height="2" rx="1" fill="#4ade80" opacity="0.4" />
      <text x="4" y="30" fontSize="7" fontWeight="700" fill="#16a34a" fontFamily="system-ui">XLS</text>
    </svg>
  )
}

function FileIcon({ name }: { name: string }) {
  if (name.endsWith(".pdf"))  return <PdfIcon />
  if (name.endsWith(".docx")) return <DocIcon />
  return <XlsIcon />
}

export function SceneWrapEngagement({ phase }: { phase: number }) {
  const showModal  = phase >= 1
  const showResult = phase >= 3

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Success banner (post-wrap) ──────────────────────────────────────── */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: "linear-gradient(90deg, #f0fdf4 0%, #dcfce7 100%)",
              borderBottom: "1px solid #bbf7d0",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16 }}>🛡️</span>
            <span
              style={{
                fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                fontSize: 13,
                fontWeight: 600,
                color: "#15803d",
              }}
            >
              Engagement wrapped · IP protected · 0 active shares
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "20px 24px", overflow: "hidden", position: "relative" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h2
                style={{
                  fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#1b1b1d",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Q3 Strategy Review
              </h2>
              <div
                style={{
                  background: "#f0fdf4",
                  color: "#15803d",
                  border: "1px solid #bbf7d0",
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                }}
              >
                Active
              </div>
            </div>
            <p
              style={{
                fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                fontSize: 12,
                color: "#6b7280",
                margin: 0,
              }}
            >
              Meridian Finance · {showResult ? "0" : "3"} active shares
            </p>
          </div>

          {/* Wrap button */}
          {!showResult && (
            <motion.div
              animate={{ scale: phase === 0 ? [1, 1.03, 1] : 1 }}
              transition={{ duration: 0.6, repeat: phase === 0 ? Infinity : 0, repeatDelay: 1 }}
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                borderRadius: 6,
                padding: "7px 14px",
                fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "default",
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.02em",
              }}
            >
              <span>⬡</span> Wrap Engagement
            </motion.div>
          )}

          {showResult && (
            <div
              style={{
                background: "#f3f4f6",
                color: "#9ca3af",
                borderRadius: 6,
                padding: "7px 14px",
                fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.02em",
              }}
            >
              🔒 Wrapped
            </div>
          )}
        </div>

        {/* Document list */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div
            style={{
              padding: "7px 14px",
              borderBottom: "1px solid #f3f4f6",
              display: "flex",
              gap: 8,
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 10,
              fontWeight: 600,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <span style={{ flex: 1 }}>Document</span>
            <span style={{ width: 60 }}>Size</span>
            <span style={{ width: 80 }}>Access</span>
          </div>

          {DOCS.map((doc, i) => {
            const wasShared = doc.shared
            const isLocked = showResult && wasShared
            return (
              <div
                key={doc.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: i < DOCS.length - 1 ? "1px solid #f9f9fb" : "none",
                  background: isLocked ? "#fffbeb" : "transparent",
                  transition: "background 0.3s ease",
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <FileIcon name={doc.name} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#1b1b1d",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {doc.name}
                  </div>
                </div>
                <div
                  style={{
                    width: 60,
                    fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  {doc.size}
                </div>
                <div style={{ width: 80, display: "flex" }}>
                  <AnimatePresence mode="wait">
                    {isLocked ? (
                      <motion.div
                        key="locked"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25, delay: i * 0.08 }}
                        style={{
                          background: "#fffbeb",
                          color: "#b45309",
                          border: "1px solid #fde68a",
                          borderRadius: 4,
                          padding: "2px 7px",
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                          whiteSpace: "nowrap",
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        🔒 View Only
                      </motion.div>
                    ) : wasShared ? (
                      <motion.div
                        key="shared"
                        exit={{ opacity: 0, scale: 0.8 }}
                        style={{
                          background: "#f0fdf4",
                          color: "#15803d",
                          border: "1px solid #bbf7d0",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Shared
                      </motion.div>
                    ) : (
                      <motion.div
                        key="private"
                        style={{
                          background: "#f3f4f6",
                          color: "#9ca3af",
                          border: "1px solid #e5e7eb",
                          borderRadius: 4,
                          padding: "2px 8px",
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Private
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Wrap confirmation modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && !showResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
              backdropFilter: "blur(2px)",
            }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 10, opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                background: "#ffffff",
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                boxShadow: "0 24px 48px -12px rgba(0,0,0,0.18)",
                padding: "24px",
                width: 320,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  🛡️
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#1b1b1d",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Wrap Engagement
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                      fontSize: 11,
                      color: "#6b7280",
                      marginTop: 1,
                    }}
                  >
                    This cannot be undone
                  </div>
                </div>
              </div>

              <p
                style={{
                  fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                  fontSize: 12,
                  color: "#374151",
                  margin: "12px 0",
                  lineHeight: 1.5,
                }}
              >
                Your IP will be locked down and all external access revoked instantly.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {WRAP_ACTIONS.map((action) => (
                  <div
                    key={action.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "#f9fafb",
                      borderRadius: 6,
                      border: "1px solid #f3f4f6",
                    }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{action.icon}</span>
                    <span
                      style={{
                        fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                        fontSize: 12,
                        color: "#374151",
                        fontWeight: 500,
                      }}
                    >
                      {action.label}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    background: "#f3f4f6",
                    borderRadius: 6,
                    textAlign: "center",
                    fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6b7280",
                    cursor: "default",
                  }}
                >
                  Cancel
                </div>
                <div
                  style={{
                    flex: 2,
                    padding: "9px 0",
                    background: "#dc2626",
                    borderRadius: 6,
                    textAlign: "center",
                    fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#ffffff",
                    cursor: "default",
                    letterSpacing: "0.02em",
                  }}
                >
                  Confirm Wrap
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
