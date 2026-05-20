import type { ReactNode } from 'react'
import { KINETIC_COLORS } from '@/config/kinetic-institution'

export default function ChangelogLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden font-sans antialiased [font-family:var(--font-kinetic-body),system-ui,sans-serif] selection:bg-[#72ff70] selection:text-[#002203]"
      style={{
        backgroundColor: KINETIC_COLORS.surface,
        color: KINETIC_COLORS.onSurface,
      }}
    >
      {/* Decorative gradient blobs — mirrors faq/layout.tsx */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute top-[-18%] right-[-8%] h-[min(88vw,680px)] w-[min(88vw,680px)] rounded-full opacity-35 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #72ff7044 0%, transparent 72%)' }}
        />
        <div
          className="absolute bottom-[-22%] left-[-12%] h-[min(78vw,520px)] w-[min(78vw,520px)] rounded-full opacity-25 blur-[90px]"
          style={{ background: 'radial-gradient(circle, #5a78ff33 0%, transparent 70%)' }}
        />
      </div>
      <div className="relative z-10 min-h-screen pt-24 lg:pt-28">{children}</div>
    </div>
  )
}
