'use client'

import { createContext, useContext, type ReactNode } from "react"

export type LayoutCtx = {
  slot: ReactNode
  setSlot: (node: ReactNode) => void
  setTabCount: (href: string, count: number | null) => void
}

export const LayoutContext = createContext<LayoutCtx>({
  slot: null,
  setSlot: () => {},
  setTabCount: () => {},
})

export function useTabRightSlot() { return useContext(LayoutContext) }
export function useTabCount() { return useContext(LayoutContext).setTabCount }
