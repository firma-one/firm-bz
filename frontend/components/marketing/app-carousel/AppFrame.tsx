"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users, Briefcase, Shield, BarChart3, Settings, Bell, Bookmark,
  CalendarClock, History, Search, Clock,
} from "lucide-react"

interface AppFrameProps {
  children: React.ReactNode
  activeNav: "Clients" | "Engagements" | "Audit Log" | "Analytics" | "Settings" | "Reminders" | "Recent"
  activeUrl: string
  logoColor?: string
  /** 0=closed, 1=open/idle, 2=Recent item highlighted */
  palettePhase?: number
}

const NAV_ITEMS = [
  { label: "Clients", Icon: Users },
  { label: "Engagements", Icon: Briefcase },
  { label: "Audit Log", Icon: Shield },
  { label: "Reminders", Icon: Bell },
  { label: "Recent", Icon: History },
  { label: "Analytics", Icon: BarChart3 },
  { label: "Settings", Icon: Settings },
]

const PALETTE_RECENTS = [
  { Icon: Briefcase, label: "Hartwell Group", desc: "Engagement", color: "#4b5563" },
  { Icon: Users, label: "Meridian Finance", desc: "Client", color: "#4b5563" },
]

const PALETTE_PERSONAL = [
  { Icon: CalendarClock, label: "Reminders", desc: "Your upcoming reminders", color: "#c2410c" },
  { Icon: Bookmark, label: "Bookmarks", desc: "Your saved bookmarks", color: "#5A78FF" },
  { Icon: Clock, label: "Recent", desc: "Recently visited", color: "#069668", isTarget: true },
]

export function AppFrame({ children, activeNav, activeUrl, logoColor = "#069668", palettePhase = 0 }: AppFrameProps) {
  const paletteOpen = palettePhase >= 1

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        background: "#ffffff",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Browser chrome bar */}
      <div
        style={{
          background: "#e2e4e8",
          height: 40,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        </div>

        {/* Address bar */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              background: "#ffffff", borderRadius: 20, height: 26, width: "46%",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 5, padding: "0 12px", overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.1)",
            }}
          >
            <span style={{ fontSize: 10 }}>🔒</span>
            <span
              style={{
                fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                fontSize: 11, color: "#3c3c3c",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
              }}
            >
              www.firma.bz/{activeUrl}
            </span>
          </div>
        </div>
      </div>

      {/* App top bar */}
      <div
        style={{
          height: 42,
          background: "#ffffff",
          borderBottom: "1px solid #f0f0f2",
          display: "flex",
          alignItems: "center",
          padding: "0 12px 0 14px",
          gap: 10,
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Branding — logo + firm name */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <div
            style={{
              width: 22, height: 22, borderRadius: 2, background: logoColor,
              transition: "background 0.4s ease",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h10v2H6v3h5v2H6v3H2V2z" fill="white" />
            </svg>
          </div>
          <span
            style={{
              fontFamily: "var(--font-kinetic-headline, 'Space Grotesk', system-ui, sans-serif)",
              fontSize: 13, fontWeight: 600, color: "#1b1b1d", letterSpacing: "-0.01em",
            }}
          >
            Axiom
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 18, background: "#e5e7eb", flexShrink: 0 }} />

        {/* ⌘K command palette trigger — absolutely centered */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            width: 240, height: 28,
            background: "#f3f4f6", borderRadius: 2,
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 10px", cursor: "default",
            border: "1px solid #e5e7eb",
          }}
        >
          <Search size={12} style={{ color: "#9ca3af", flexShrink: 0 }} strokeWidth={2} />
          <span
            style={{
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 11, color: "#9ca3af", flex: 1,
            }}
          >
            Go to…
          </span>
          <div
            style={{
              background: "#ffffff", borderRadius: 2, border: "1px solid #e5e7eb",
              padding: "1px 5px",
              fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
              fontSize: 10, color: "#6b7280", letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            ⌘K
          </div>
        </div>

        {/* Utility icons — right aligned */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, marginLeft: "auto" }}>
          <div style={{ width: 28, height: 28, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff7ed" }}>
            <CalendarClock size={14} style={{ color: "#c2410c" }} strokeWidth={1.75} />
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2ff" }}>
            <Bookmark size={14} style={{ color: "#4f46e5" }} strokeWidth={1.75} />
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ width: 28, height: 28, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0fdf4" }}>
              <Bell size={14} style={{ color: "#069668" }} strokeWidth={1.75} />
            </div>
            <div style={{ position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: "50%", background: "#22c55e", border: "1.5px solid #ffffff" }} />
          </div>
        </div>
      </div>

      {/* App viewport */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0, position: "relative" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 172,
            flexShrink: 0,
            background: "#f3f4f6",
            borderRight: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Nav items */}
          <div style={{ padding: "8px 0", flex: 1, position: "relative" }}>
            {NAV_ITEMS.map((item) => {
              const isActive = item.label === activeNav
              return (
                <div
                  key={item.label}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 14px", margin: "1px 6px", borderRadius: 2,
                    cursor: "default",
                    fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)",
                    fontSize: 13, fontWeight: isActive ? 500 : 400,
                    color: isActive ? "#069668" : "#4b5563",
                    background: isActive ? "rgba(6,150,104,0.07)" : "transparent",
                    borderLeft: isActive ? "2px solid #069668" : "2px solid transparent",
                    transition: "all 0.25s ease",
                  }}
                >
                  <item.Icon
                    size={14}
                    style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0, color: isActive ? "#069668" : "#4b5563" }}
                    strokeWidth={isActive ? 2 : 1.75}
                  />
                  {item.label}
                </div>
              )
            })}
          </div>

          {/* Sidebar bottom fade */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              background: "linear-gradient(to bottom, transparent, #f3f4f6)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />

          {/* Bottom user area */}
          <div style={{ padding: "10px 14px", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26, height: 26, borderRadius: "50%",
                background: "linear-gradient(135deg, #069668, #04724e)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 10, color: "white", fontWeight: 600 }}>A</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 11, fontWeight: 500, color: "#1b1b1d" }}>Alex Morgan</div>
              <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#9ca3af" }}>Owner</div>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, background: "#f9f9fb", overflow: "hidden", position: "relative" }}>
          {children}
          {/* Bottom fade */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 140,
              background: "linear-gradient(to bottom, transparent, #f9f9fb)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        </div>

        {/* Command palette overlay */}
        <AnimatePresence>
          {paletteOpen && (
            <motion.div
              key="palette-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute", inset: 0, zIndex: 60,
                background: "rgba(0,0,0,0.22)",
                display: "flex", alignItems: "flex-start", justifyContent: "center",
                paddingTop: 40,
              }}
            >
              <motion.div
                key="palette-panel"
                initial={{ y: -12, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -8, opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                style={{
                  width: "88%", maxWidth: 420,
                  background: "#ffffff", borderRadius: 2,
                  boxShadow: "0 20px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)",
                  border: "1px solid #e5e7eb", overflow: "hidden",
                }}
              >
                {/* Search input row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid #f3f4f6" }}>
                  <Search size={14} style={{ color: "#9ca3af", flexShrink: 0 }} strokeWidth={2} />
                  <span style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 13, color: "#9ca3af", flex: 1 }}>
                    Go to…
                  </span>
                  <div style={{ background: "#f3f4f6", borderRadius: 2, padding: "2px 6px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#6b7280" }}>esc</div>
                </div>

                {/* Recent group */}
                <div>
                  <div style={{ padding: "8px 14px 4px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent</div>
                  {PALETTE_RECENTS.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                        cursor: "default",
                      }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: 2, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <item.Icon size={13} style={{ color: item.color }} strokeWidth={1.75} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, fontWeight: 500, color: "#1b1b1d" }}>{item.label}</div>
                        <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#9ca3af" }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Personal group */}
                <div style={{ borderTop: "1px solid #f3f4f6" }}>
                  <div style={{ padding: "8px 14px 4px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Personal</div>
                  {PALETTE_PERSONAL.map((item) => {
                    const isHighlighted = item.isTarget && palettePhase >= 2
                    return (
                      <motion.div
                        key={item.label}
                        animate={{
                          background: isHighlighted ? "rgba(6,150,104,0.07)" : "transparent",
                        }}
                        transition={{ duration: 0.2 }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                          cursor: "default",
                        }}
                      >
                        <div
                          style={{
                            width: 26, height: 26, borderRadius: 2,
                            background: isHighlighted ? "rgba(6,150,104,0.1)" : "#f3f4f6",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            transition: "background 0.2s ease",
                          }}
                        >
                          <item.Icon size={13} style={{ color: isHighlighted ? "#069668" : item.color }} strokeWidth={1.75} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 12, fontWeight: isHighlighted ? 600 : 500, color: isHighlighted ? "#069668" : "#1b1b1d" }}>{item.label}</div>
                          <div style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#9ca3af" }}>{item.desc}</div>
                        </div>
                        {isHighlighted && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{ background: "#f0fdf4", borderRadius: 2, padding: "2px 6px", fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#069668", border: "1px solid #bbf7d0" }}
                          >
                            ↵
                          </motion.div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>

                {/* Footer */}
                <div style={{ padding: "8px 14px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 12 }}>
                  {["↑↓ navigate", "↵ open", "esc close"].map((hint) => (
                    <span key={hint} style={{ fontFamily: "var(--font-kinetic-body, 'Work Sans', system-ui, sans-serif)", fontSize: 10, color: "#9ca3af" }}>{hint}</span>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
