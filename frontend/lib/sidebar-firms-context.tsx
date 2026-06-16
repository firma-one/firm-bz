'use client'

import React, { createContext, useContext } from 'react'

export interface SidebarFirmOption {
  id: string
  name: string
  slug: string
  isDefault: boolean
  createdAt?: string
  sandboxOnly?: boolean
}

const SidebarFirmsContext = createContext<SidebarFirmOption[] | null>(null)

export function SidebarFirmsProvider({
  firms,
  children,
}: {
  firms: SidebarFirmOption[]
  children: React.ReactNode
}) {
  return (
    <SidebarFirmsContext.Provider value={firms}>
      {children}
    </SidebarFirmsContext.Provider>
  )
}

export function useSidebarFirms(): SidebarFirmOption[] | null {
  return useContext(SidebarFirmsContext)
}
