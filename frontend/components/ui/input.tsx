import * as React from "react"
import { cnV2 } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cnV2(
          "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 selection:bg-slate-200 selection:text-slate-900 focus-visible:outline-none focus-visible:border-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 v2:h-8 v2:rounded-control v2:border-line-strong v2:bg-surface v2:text-fg v2:shadow-none v2:placeholder:text-fg-subtle v2:selection:bg-action/15 v2:selection:text-fg v2:transition-[border-color,box-shadow] v2:duration-100 v2:focus-visible:border-action/60 v2:focus-visible:ring-2 v2:focus-visible:ring-action/20",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }