import * as React from "react"
import { cnV2 } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cnV2(
          "flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-500 selection:bg-slate-200 selection:text-slate-900 focus-visible:outline-none focus-visible:border-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 v2:rounded-control v2:border-line-strong v2:bg-surface v2:text-fg v2:shadow-none v2:placeholder:text-fg-subtle v2:selection:bg-action/15 v2:selection:text-fg v2:transition-[border-color,box-shadow] v2:duration-100 v2:focus-visible:border-action/60 v2:focus-visible:ring-2 v2:focus-visible:ring-action/20",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
