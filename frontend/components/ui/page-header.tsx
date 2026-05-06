import type { ReactNode } from "react"

interface PageHeaderProps {
  icon: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4 shadow-sm">
      <div className="min-w-0 flex-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="d-title flex items-center gap-2.5">
            <span className="text-stone-500 shrink-0">{icon}</span>
            {title}
          </h1>
          {subtitle && <p className="d-subtitle mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
