import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import type { ReactNode } from "react"

export interface PageBreadcrumbItem {
  label: string
  href?: string
  icon?: ReactNode
}

interface PageBreadcrumbProps {
  items: PageBreadcrumbItem[]
}

export function PageBreadcrumb({ items }: PageBreadcrumbProps) {
  return (
    <div className="d-body flex items-center text-stone-500 mb-2">
      <span className="flex items-center gap-2 text-stone-500" title="Home">
        <Home className="h-4 w-4" />
      </span>
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={index} className="flex items-center">
            <ChevronRight className="h-4 w-4 mx-1 text-slate-300" />
            {isLast ? (
              <div className="flex items-center gap-2 text-slate-900 bg-slate-100 px-2 py-1 rounded-md">
                {item.icon}
                <span className="font-semibold">{item.label}</span>
              </div>
            ) : (
              <Link
                href={item.href!}
                className="flex items-center gap-2 hover:text-slate-900 transition-colors cursor-pointer"
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            )}
          </span>
        )
      })}
    </div>
  )
}
