"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { firmPath, firmTabPath } from "@/lib/navigation/firm-paths"
import { useShellData } from "./shell-data-context"

const SEQUENCE_MS = 1000

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
}

/**
 * Linear-style "go to" shortcuts for the New UI: G then H (Home), I (Inbox), C (Clients),
 * L (Calendar), D (Doc Search), and for firm admins O (Overview) and S (Settings). `?` opens the
 * cheat sheet. Ignored while typing or with a modifier held.
 */
export function useShellShortcuts({ onShowShortcuts }: { onShowShortcuts: () => void }) {
    const router = useRouter()
    const { firmSlug, groupSlug, canManage, data } = useShellData()
    const pendingG = useRef<number | null>(null)

    useEffect(() => {
        const base = firmSlug && groupSlug ? firmPath(groupSlug, firmSlug) : null
        const tab = (t: string) => firmTabPath(groupSlug!, firmSlug!, t)
        const external = data?.isExternalOnly ?? false

        // Home and Inbox span every firm; the rest are the current firm's pages.
        const targets: Record<string, string | null> = base
            ? {
                  h: "/d/u/home",
                  i: "/d/u/inbox",
                  c: external ? null : tab("clients"),
                  l: external ? null : tab("calendar"),
                  d: external ? null : tab("doc-search"),
                  o: canManage ? tab("analytics") : null,
                  s: canManage ? tab("settings") : null,
              }
            : { h: "/d/u/home", i: "/d/u/inbox" }

        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
            if (document.querySelector('[role="dialog"]')) return
            const key = e.key.toLowerCase()

            if (pendingG.current !== null) {
                window.clearTimeout(pendingG.current)
                pendingG.current = null
                const href = targets[key]
                if (href) {
                    e.preventDefault()
                    router.push(href)
                }
                return
            }
            if (e.key === "?") {
                e.preventDefault()
                onShowShortcuts()
            } else if (key === "g") {
                pendingG.current = window.setTimeout(() => { pendingG.current = null }, SEQUENCE_MS)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => {
            window.removeEventListener("keydown", onKey)
            if (pendingG.current !== null) window.clearTimeout(pendingG.current)
        }
    }, [firmSlug, groupSlug, canManage, data?.isExternalOnly, router, onShowShortcuts])
}
