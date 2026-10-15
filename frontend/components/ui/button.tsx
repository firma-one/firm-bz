import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cnV2 } from "@/lib/utils"

/*
 * v1 classes are unchanged. The `v2:` classes apply only under the New UI toggle
 * (.claude/plans/ui-ux-overhaul.md): flat Notion-style buttons — 32px default height, 4px radius,
 * no shadows or press-scale, emerald fill for the primary action, hairline neutrals otherwise.
 */
const buttonCva = cva(
  "inline-flex items-center justify-center rounded text-sm font-medium transition-[color,transform,box-shadow,background-color,border-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 v2:gap-1.5 v2:rounded-control v2:shadow-none v2:ring-0 v2:duration-100 v2:hover:shadow-none v2:hover:brightness-100 v2:hover:translate-y-0 v2:active:scale-100 v2:active:shadow-none v2:focus-visible:ring-2 v2:focus-visible:ring-action/30 v2:focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "bg-blue-600 text-white ring-1 ring-inset ring-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_-4px_rgba(37,99,235,0.16)] hover:brightness-105 active:scale-95 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.1)] v2:bg-action v2:text-action-fg v2:hover:bg-action-hover",
        blackCta:
          "border border-transparent bg-slate-800 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_3px_10px_-4px_rgba(15,23,42,0.12)] hover:bg-slate-700 hover:text-white hover:shadow-[0_2px_8px_-2px_rgba(15,23,42,0.14),0_1px_3px_rgba(15,23,42,0.08)] focus-visible:border-transparent focus-visible:bg-slate-700 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-slate-400/45 focus-visible:ring-offset-2 active:bg-slate-900 active:scale-95 active:shadow-[inset_0_2px_4px_rgba(15,23,42,0.08)] v2:bg-fg v2:hover:bg-fg v2:hover:opacity-90 v2:focus-visible:bg-fg v2:active:bg-fg",
        greenCta:
          "rounded border-0 bg-primary text-white shadow-sm hover:bg-primary hover:brightness-110 hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.20),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-px active:translate-y-0 active:scale-95 active:shadow-sm transition-all v2:bg-action v2:text-action-fg v2:hover:bg-action-hover v2:transition-colors",
        /** Dark CTA — matches blackCta family, used for Manage Subscription on active plan cards */
        manageBillingCta:
          "border border-transparent bg-slate-800 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_3px_10px_-4px_rgba(15,23,42,0.12)] hover:bg-slate-700 hover:text-white hover:shadow-[0_2px_8px_-2px_rgba(15,23,42,0.14),0_1px_3px_rgba(15,23,42,0.08)] focus-visible:ring-2 focus-visible:ring-slate-400/45 focus-visible:ring-offset-2 active:bg-slate-900 active:scale-95 active:shadow-[inset_0_2px_4px_rgba(15,23,42,0.08)] v2:bg-fg v2:hover:bg-fg v2:hover:opacity-90 v2:active:bg-fg",
        destructive:
          "bg-red-500 text-white ring-1 ring-inset ring-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.1)_inset,0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_-4px_rgba(220,38,38,0.14)] hover:brightness-105 active:scale-95 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.12)] v2:bg-danger v2:hover:bg-danger/90",
        outline: "border border-gray-300 bg-white shadow-sm hover:bg-gray-50 active:scale-95 v2:border-line-strong v2:bg-surface v2:text-fg v2:hover:bg-surface-hover",
        secondary: "bg-gray-100 text-gray-900 shadow-sm hover:bg-gray-200 active:scale-95 v2:bg-surface-muted v2:text-fg v2:hover:bg-surface-selected",
        ghost: "hover:bg-gray-100 active:scale-95 v2:text-fg-muted v2:hover:bg-surface-hover v2:hover:text-fg",
        link: "text-blue-600 underline-offset-4 hover:underline v2:text-action",
      },
      size: {
        default: "h-9 px-4 py-2 v2:h-8 v2:px-3 v2:py-0",
        sm: "h-8 px-3 text-xs v2:h-7 v2:px-2.5 v2:text-small",
        lg: "h-10 px-8 v2:h-9 v2:px-4",
        icon: "h-9 w-9 v2:h-8 v2:w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Same call shape as the cva function it wraps; a passed className overrides the v2 look too. */
function buttonVariants({ className, ...props }: VariantProps<typeof buttonCva> & { className?: string } = {}) {
  return cnV2(buttonCva(props), className)
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonCva> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
