import type { ReactNode } from "react"

interface PageHeaderProps {
  icon: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-6 mb-6">
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 bg-white border border-[#e5e7eb] flex items-center justify-center rounded-lg shadow-sm shrink-0">
          <span className="text-[#1b1b1d]">{icon}</span>
        </div>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-headline text-3xl font-bold tracking-tight text-[#1b1b1d]">{title}</h1>
          </div>
          {subtitle && <p className="text-sm text-[#45474c] mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
