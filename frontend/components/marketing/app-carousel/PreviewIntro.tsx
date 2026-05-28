import { SquareFunction } from "lucide-react"
import { cn } from "@/lib/utils"
import { KineticMarketingBadge, kineticSectionLeadClassName } from "@/components/kinetic/kinetic-section-intro"
import { MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import { PreviewTitle } from "@/components/marketing/PreviewTitle"

export function PreviewIntro() {
  return (
    <div className={cn(MARKETING_PAGE_SHELL, "pt-10 lg:pt-14")}>
      <div className="flex flex-col gap-6 pb-10 lg:gap-8 lg:pb-14">
        <div className="w-fit">
          <KineticMarketingBadge
            variant="lime"
            className="mb-0 shrink-0"
            icon={<SquareFunction className="ds-badge-kinetic__icon stroke-[2]" aria-hidden />}
            tracking="tight"
          >
            Preview
          </KineticMarketingBadge>
        </div>
        <PreviewTitle />
        <p className={cn("mb-0", kineticSectionLeadClassName)}>
          Watch how top consultants use Firma to deliver premium work
        </p>
      </div>
    </div>
  )
}
