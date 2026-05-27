import Link from "next/link"
import { Bolt, CalendarClock, SquareFunction } from "lucide-react"
import { AppCarousel } from "@/components/marketing/app-carousel"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import {
  KineticMarketingBadge,
  kineticLandingHeroTitleClassName,
  kineticSectionLeadClassName,
} from "@/components/kinetic/kinetic-section-intro"
import { MARKETING_PAGE_SHELL } from "@/lib/marketing/target-audience-nav"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Product Tour — Firma",
  description: "Watch how top consultants use Firma to deliver premium client work.",
}

function Pipe({ wide }: { wide?: boolean }) {
  return (
    <span className={cn("text-[#c4c4c8] font-light", wide ? "mx-10" : "mx-1")} style={{ fontSize: "0.65em", verticalAlign: "middle" }}>
      |
    </span>
  )
}

export default function PreviewPage() {
  return (
    <>
      <Header />
      <main className={cn(MARKETING_PAGE_SHELL, "pb-24 lg:pb-32")}>
        <div className="flex flex-col gap-10 py-10 lg:gap-14 lg:py-14">

          {/* Intro — left-aligned, full width */}
          <div className="flex flex-col gap-6 lg:gap-8">
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

            <h1
              className={cn(
                "mb-0 lg:shrink-0",
                kineticLandingHeroTitleClassName,
                "lg:!text-[2rem] xl:!text-[2.5rem] 2xl:!text-[3rem]"
              )}
            >
              Your Drive <Pipe wide /> Your Portal <Pipe wide /> Your Brand <Pipe wide /> Your IP
              <br />
              Your Clients <Pipe /> Your Offering <Pipe />{" "}
              <span className="text-[#069668]">One</span>
              {" "}
              <span className="text-[#5a78ff]">Institutional Experience</span>
            </h1>

            <div className="flex items-center gap-16">
              <p className={cn("mb-0 whitespace-nowrap", kineticSectionLeadClassName)}>
                Watch how top consultants use Firma to deliver premium work
              </p>

              <div className="flex shrink-0 flex-wrap gap-3">
                <Link
                  href="/go"
                  className="group inline-flex items-center justify-center gap-2 rounded-md border border-transparent bg-[#72ff70] px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 sm:px-6 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
                >
                  Get started
                  <Bolt className="h-4 w-4" strokeWidth={2} />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-transparent bg-[#141c2a] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_1px_0_rgba(2,6,23,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_10px_24px_-12px_rgba(2,6,23,0.7)] active:translate-y-0 active:scale-95 sm:px-6 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]"
                >
                  <CalendarClock className="h-4 w-4 stroke-[1.75]" />
                  Book a demo
                </Link>
              </div>
            </div>
          </div>

          {/* Visual — full width, left-aligned */}
          <div className="w-full">
            <AppCarousel />
          </div>

        </div>
      </main>
      <Footer />
    </>
  )
}
