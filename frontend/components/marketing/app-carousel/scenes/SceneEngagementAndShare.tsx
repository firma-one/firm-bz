"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

interface Props {
  phase: number
}

const AUDIT_EVENTS = [
  {
    id: "e1",
    dot: "#22c55e",
    icon: "👁",
    iconBg: "#f0fdf4",
    user: "sarah@meridianfinance.com",
    action: "opened",
    target: "Q3-Strategy-Deck.pdf",
    time: "just now",
    badge: null,
  },
  {
    id: "e2",
    dot: "#22c55e",
    icon: "🔗",
    iconBg: "#f0fdf4",
    user: "sarah@meridianfinance.com",
    action: "accessed portal",
    target: "Meridian Finance",
    time: "2m ago",
    badge: null,
  },
  {
    id: "e3",
    dot: "#94a3b8",
    icon: "📄",
    iconBg: "#f8fafc",
    user: "james@hartwell.co",
    action: "viewed",
    target: "Brand-Guidelines.pdf",
    time: "1h ago",
    badge: null,
  },
  {
    id: "e4",
    dot: "#f59e0b",
    icon: "⏱",
    iconBg: "#fffbeb",
    user: "Hartwell Group portal",
    action: "link expired",
    target: "",
    time: "3h ago",
    badge: "Expired",
  },
]

export function SceneEngagementAndShare({ phase }: Props) {
  const [visibleEvents, setVisibleEvents] = useState(0)
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    if (phase === 0) { setVisibleEvents(0); setShowSummary(false); return }
    if (phase === 1) { setVisibleEvents(2); setShowSummary(false); return }
    if (phase === 2) { setVisibleEvents(3); setShowSummary(false); return }
    if (phase >= 3) { setVisibleEvents(4); setShowSummary(true); return }
  }, [phase])

  return (
    <div style={{ height: "100%", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 17, fontWeight: 600, color: "#1b1b1d", margin: 0, letterSpacing: "-0.02em" }}>Audit Log</h2>
          <p style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, color: "#6b7280", margin: "3px 0 0" }}>
            Every access event, in real time
          </p>
        </div>
        <AnimatePresence>
          {showSummary && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#f0fdf4", borderRadius: 4, padding: "6px 12px", border: "1px solid #bbf7d0" }}
            >
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.6)" }} />
              <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, fontWeight: 600, color: "#15803d" }}>0 Risks · 2 active clients</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "Events today", value: phase >= 1 ? "4" : "–", color: "#1b1b1d" },
          { label: "Active sessions", value: phase >= 1 ? "2" : "–", color: "#069668" },
          { label: "Risks detected", value: "0", color: "#069668" },
        ].map((stat) => (
          <div key={stat.label} style={{
            flex: 1, background: "#ffffff", borderRadius: 4, border: "1px solid #e5e7eb",
            padding: "10px 12px",
          }}>
            <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)", fontSize: 20, fontWeight: 700, color: stat.color, letterSpacing: "-0.03em", lineHeight: 1 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Event feed */}
      <div style={{ background: "#ffffff", borderRadius: 4, border: "1px solid #e5e7eb", overflow: "hidden", flex: 1 }}>
        <div style={{ padding: "9px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.5)" }} />
          <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>Live Activity</span>
        </div>

        <div>
          {phase === 0 ? (
            // Skeleton
            [0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #f9f9fb" }}>
                <div style={{ width: 30, height: 30, borderRadius: 4, background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite linear", animationDelay: `${i * 0.15}s` }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ height: 10, width: "70%", background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "shimmer 1.5s infinite linear" }} />
                  <div style={{ height: 8, width: "40%", background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)", backgroundSize: "200% 100%", borderRadius: 4, animation: "shimmer 1.5s infinite linear" }} />
                </div>
              </div>
            ))
          ) : (
            AUDIT_EVENTS.slice(0, visibleEvents).map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 320, damping: 28 }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: i < visibleEvents - 1 ? "1px solid #f9f9fb" : "none" }}
              >
                {/* Live dot */}
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: event.dot, flexShrink: 0, boxShadow: event.dot === "#22c55e" ? "0 0 5px rgba(34,197,94,0.5)" : "none" }} />

                {/* Icon */}
                <div style={{ width: 28, height: 28, borderRadius: 4, background: event.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 12 }}>{event.icon}</span>
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, color: "#1b1b1d", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: "#374151" }}>{event.user}</span>
                    {" "}
                    <span style={{ color: "#6b7280", fontWeight: 400 }}>{event.action}</span>
                    {event.target && (
                      <>
                        {" "}
                        <span style={{ color: "#069668", fontWeight: 600 }}>{event.target}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Badge or time */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {event.badge && (
                    <div style={{ background: "#fffbeb", color: "#b45309", borderRadius: 4, padding: "2px 6px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, fontWeight: 600, border: "1px solid #fde68a" }}>{event.badge}</div>
                  )}
                  <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#9ca3af" }}>{event.time}</span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
