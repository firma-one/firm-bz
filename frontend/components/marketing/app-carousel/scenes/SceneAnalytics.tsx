"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"

const STATS = [
  { label: "Active Clients", value: 12 },
  { label: "Engagements", value: 34 },
  { label: "Action Center", value: 3 },
]

const BAR_HEIGHTS = [40, 65, 45, 80, 70, 90]
const MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"]

const ACTIVITY_ITEMS = [
  { icon: "✅", text: "Hartwell Group — engagement wrapped", time: "1h ago", color: "#069668" },
  { icon: "🔒", text: "Meridian Finance portal access revoked", time: "2h ago", color: "#8b5cf6" },
  { icon: "🛡️", text: "Brand-Strategy-Framework.pdf protected", time: "3h ago", color: "#ef4444" },
  { icon: "🎉", text: "Vantage Partners onboarded", time: "5h ago", color: "#f59e0b" },
]

interface Props {
  phase: number
}

function useCountUp(target: number, active: boolean, duration = 1000) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) { setValue(0); return }
    let startTime: number | null = null
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [active, target, duration])

  return value
}

function StatTile({ label, target, displayOverride, active }: {
  label: string
  target: number
  displayOverride?: string
  active: boolean
}) {
  const count = useCountUp(target, active)

  const display = displayOverride && active
    ? count >= target
      ? displayOverride
      : count >= 1000
        ? (count / 1000).toFixed(1) + "K"
        : String(count)
    : String(count)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 16 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      style={{
        background: "#ffffff",
        borderRadius: 2,
        border: "1px solid #e5e7eb",
        padding: "16px 18px",
        flex: 1,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
          fontSize: 11,
          color: "#6b7280",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
          fontSize: 28,
          fontWeight: 700,
          color: "#1b1b1d",
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        {display}
      </div>
    </motion.div>
  )
}

export function SceneAnalytics({ phase }: Props) {
  const [barsVisible, setBarsVisible] = useState(false)
  const [activityVisible, setActivityVisible] = useState(false)

  useEffect(() => {
    if (phase >= 2) setBarsVisible(true)
    else setBarsVisible(false)
    if (phase >= 3) setActivityVisible(true)
    else setActivityVisible(false)
  }, [phase])

  return (
    <div
      style={{
        height: "100%",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div>
        <h2
          style={{
            fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
            fontSize: 17,
            fontWeight: 600,
            color: "#1b1b1d",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Analytics
        </h2>
        <p
          style={{
            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
            fontSize: 12,
            color: "#6b7280",
            margin: "3px 0 0",
          }}
        >
          Last 30 days
        </p>
      </div>

      {/* Stat tiles — skeleton or real */}
      <div style={{ display: "flex", gap: 10 }}>
        {phase === 0 ? (
          // Skeleton tiles
          [0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: "#ffffff",
                borderRadius: 2,
                border: "1px solid #e5e7eb",
                padding: "16px 18px",
              }}
            >
              <div
                style={{
                  height: 10,
                  width: "60%",
                  background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
                  backgroundSize: "200% 100%",
                  borderRadius: 2,
                  marginBottom: 10,
                  animation: "shimmer 1.5s infinite linear",
                }}
              />
              <div
                style={{
                  height: 28,
                  width: "40%",
                  background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
                  backgroundSize: "200% 100%",
                  borderRadius: 2,
                  animation: "shimmer 1.5s infinite linear",
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            </div>
          ))
        ) : (
          STATS.map((stat, i) => (
            <StatTile
              key={stat.label}
              label={stat.label}
              target={stat.value}
              displayOverride={undefined}
              active={phase >= 1}
            />
          ))
        )}
      </div>

      {/* Chart */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 2,
          border: "1px solid #e5e7eb",
          padding: "14px 16px",
          flex: phase >= 3 ? "0 0 auto" : 1,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
            fontSize: 11,
            fontWeight: 600,
            color: "#6b7280",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Engagement Activity
        </div>
        {phase === 0 ? (
          // Skeleton chart
          <div
            style={{
              height: 80,
              background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)",
              backgroundSize: "200% 100%",
              borderRadius: 2,
              animation: "shimmer 1.5s infinite linear",
            }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
            {BAR_HEIGHTS.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  height: "100%",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${h}%`,
                    background: "linear-gradient(180deg, #069668, #04724e)",
                    borderRadius: "2px 2px 0 0",
                    transform: barsVisible ? "scaleY(1)" : "scaleY(0)",
                    transformOrigin: "bottom",
                    transition: `transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                    transitionDelay: `${i * 0.07}s`,
                    boxShadow: barsVisible ? "0 -2px 8px rgba(6,150,104,0.2)" : "none",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                    fontSize: 9,
                    color: "#9ca3af",
                  }}
                >
                  {MONTHS[i]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity list */}
      <AnimatePresence>
        {activityVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              background: "#ffffff",
              borderRadius: 2,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #f3f4f6",
                fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Recent Activity
            </div>
            {ACTIVITY_ITEMS.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 300, damping: 28 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 14px",
                  borderBottom: i < ACTIVITY_ITEMS.length - 1 ? "1px solid #f9f9fb" : "none",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 2,
                    background: `${item.color}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{item.icon}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                      fontSize: 11,
                      color: "#374151",
                      fontWeight: 500,
                    }}
                  >
                    {item.text}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                    fontSize: 10,
                    color: "#9ca3af",
                    flexShrink: 0,
                  }}
                >
                  {item.time}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
