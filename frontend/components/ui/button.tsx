import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * Flat Notion-style buttons (.claude/plans/ui-ux-overhaul.md): 32px default height, 4px radius,
 * no shadows or press-scale, emerald fill for the primary action, hairline neutrals otherwise.
 */
const buttonCva = cva(
  "inline-flex items-center justify-center text-sm font-medium transition-[color,transform,box-shadow,background-color,border-color] ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 gap-1.5 rounded-control shadow-none ring-0 duration-100 hover:shadow-none hover:brightness-100 hover:translate-y-0 active:scale-100 active:shadow-none focus-visible:ring-2 focus-visible:ring-action/30 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "bg-action text-action-fg hover:bg-action-hover",
        blackCta:
          "border border-transparent text-white hover:text-white focus-visible:border-transparent focus-visible:text-white focus-visible:ring-2 bg-fg hover:bg-fg hover:opacity-90 focus-visible:bg-fg active:bg-fg",
        greenCta:
          "border-0 active:translate-y-0 bg-action text-action-fg hover:bg-action-hover transition-colors",
        /** Dark CTA — matches blackCta family, used for Manage Subscription on active plan cards */
        manageBillingCta:
          "border border-transparent text-white hover:text-white focus-visible:ring-2 bg-fg hover:bg-fg hover:opacity-90 active:bg-fg",
        destructive:
          "text-white bg-danger hover:bg-danger/90",
        outline: "border border-line-strong bg-surface text-fg hover:bg-surface-hover",
        secondary: "bg-surface-muted text-fg hover:bg-surface-selected",
        ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
        link: "underline-offset-4 hover:underline text-action",
      },
      size: {
        default: "h-8 px-3 py-0",
        sm: "h-7 px-2.5 text-small",
        lg: "h-9 px-4",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Same call shape as the cva function it wraps; a passed className overrides the defaults. */
function buttonVariants({ className, ...props }: VariantProps<typeof buttonCva> & { className?: string } = {}) {
  return cn(buttonCva(props), className)
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
