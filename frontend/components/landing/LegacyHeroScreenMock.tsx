"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { ComponentType } from "react"
import {
  Briefcase,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  FolderLock,
  Gem,
  LockKeyhole,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react"
import { GoogleDriveIcon } from "@/components/ui/google-drive-icon"
import { Button } from "@/components/ui/button"
import { getAppHostDisplay } from "@/config/platform-domain"
import { cn } from "@/lib/utils"
import type { LandingTheme } from "@/components/landing/landing-theme"

export function LegacyHeroScreenMock({
  currentSlide,
  t,
  isEditorial,
  edAccent,
  slides,
  onSlideChange,
  compactSlideNav = false,
  slideViewportHeightClass = "h-[330px]",
  /** Unique Framer `layoutId` prefix when two mocks mount (hero + marketing strip). */
  motionInstanceKey = "hero",
}: {
  currentSlide: number
  t: LandingTheme
  isEditorial: boolean
  edAccent: string
  slides: Array<{
    id: string
    label: string
    subtitle: string
    desc: string
    icon: ComponentType<{ className?: string }>
  }>
  onSlideChange: (index: number) => void
  compactSlideNav?: boolean
  slideViewportHeightClass?: string
  motionInstanceKey?: string
}) {
  // Match kinetic institution palette in hero mock: lime + warm blush (not legacy purple).
  const redesignAccent = "text-[#006e16]"
  const redesignAccentSoft = "bg-[#72ff70]/20"
  const redesignAccentBorder = "border-[#006e16]/35"
  const redesignAccentIcon = "text-[#006e16]"
  const redesignPinkSoft = "bg-rose-50"
  const redesignPinkText = "text-rose-600"

  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]",
        t.carouselShadow,
      )}
    >
      <div className={cn(t.carouselBrowserBar, "border-b border-slate-100")}>
        <div className="flex gap-1.5">
          <div className={t.carouselBrowserDots} />
          <div className={t.carouselBrowserDots} />
          <div className={t.carouselBrowserDots} />
        </div>
        <div className={cn(t.carouselAddressBar, "border border-slate-100 shadow-sm")}>
          <LockKeyhole className="w-2.5 h-2.5 opacity-50" />
          {getAppHostDisplay()}/workspace
        </div>
      </div>
      <div className={cn("relative overflow-hidden bg-slate-50/40", slideViewportHeightClass)}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`hero-visual-${currentSlide}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute inset-0 p-4"
          >
            {currentSlide === 0 && (
              <div className={cn("w-full h-full rounded-lg overflow-hidden", t.mockPanel)}>
                <div
                  className={cn(
                    t.mockHeader,
                    "border-b border-black/[0.08] px-3 py-2 flex items-center justify-between",
                    !isEditorial && "border-slate-100",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center",
                        isEditorial ? "bg-white border border-black/[0.1]" : "bg-white border border-slate-200",
                      )}
                    >
                      <GoogleDriveIcon size={12} />
                    </div>
                    <div className={cn("font-bold text-xs", t.textPrimary)}>Select from Google Drive</div>
                  </div>
                  <Search className={cn("w-3.5 h-3.5", t.textMuted)} />
                </div>
                <div className="p-2">
                  <div className="space-y-1">
                    {[
                      { name: "Market_Analysis_vFinal.pdf", selected: true },
                      { name: "Growth_Model.xlsx", selected: true },
                      { name: "Competitor_Review.deck", selected: true },
                      { name: "Meeting_Notes_Internal.docx", selected: false },
                    ].map((file, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 p-1.5 rounded",
                          file.selected ? redesignAccentSoft : "hover:bg-slate-50",
                        )}
                      >
                        <div
                          className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                            file.selected ? cn("bg-[#72ff70]", "border-[#006e16]/35") : "border-slate-300",
                          )}
                        >
                          {file.selected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <FileText className={cn("w-3.5 h-3.5", file.selected ? redesignAccentIcon : "text-slate-400")} />
                        <span className={cn("text-[11px] font-medium truncate", file.selected ? "text-[#163022]" : "text-slate-900")}>
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentSlide === 1 && (
              <div className={cn("w-full h-full rounded-lg p-3", t.mockPanel)}>
                <div className="grid grid-cols-12 gap-3 h-full">
                  <div className={cn("col-span-5 pr-2", isEditorial ? "border-r border-black/[0.1]" : "border-r border-slate-200")}>
                    <div className={cn("text-[10px] font-bold uppercase tracking-widest mb-2", t.labelUpper)}>Structure</div>
                    <div className="space-y-1 text-xs">
                      <div className={cn("flex items-center gap-1.5 px-1.5 py-1 rounded font-bold", redesignAccentSoft, redesignAccent)}>
                        <BriefcaseBusiness className="w-3 h-3" /> Business
                      </div>
                      <div className={cn("flex items-center gap-1.5 px-1.5 py-1 rounded", t.treeItemHover)}>
                        <ChevronDown className="w-3 h-3" /> Acme Corp
                      </div>
                      <div className={cn("ml-3 flex items-center gap-1.5 px-1.5 py-1 rounded font-medium bg-white border border-slate-100 shadow-sm", redesignAccent)}>
                        <Gem className="w-3 h-3" /> Rebrand 2024
                      </div>
                    </div>
                  </div>
                  <div className="col-span-7">
                    <div className={cn("border rounded-lg p-3 h-full ring-[#72ff70]/35 focus-within:ring-2", !isEditorial && "border-slate-200")}>
                      <label className={cn("block text-[10px] font-bold uppercase mb-1", t.labelUpper)}>Project Name</label>
                      <div className={cn("text-sm font-bold mb-3", t.textPrimary)}>Acme Rebrand 2024</div>
                      <label className={cn("block text-[10px] font-bold uppercase mb-1", t.labelUpper)}>Client</label>
                      <div
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-medium p-1.5 rounded border",
                          t.textBody,
                          isEditorial ? "bg-white border-black/[0.1]" : "bg-slate-50 border-slate-100",
                        )}
                      >
                        <UsersRound className="w-3 h-3" /> Acme Corp
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentSlide === 2 && (
              <div className="grid grid-cols-1 gap-2 w-full h-full">
                <div className={cn("p-3 rounded-lg flex items-center justify-between", t.mockPanel)}>
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded", redesignPinkSoft, redesignPinkText)}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className={cn("text-xs font-bold", t.textPrimary)}>Pricing_Model_v3.xlsx</div>
                      <div className={cn("text-[10px]", t.textMuted)}>Sensitive IP</div>
                    </div>
                  </div>
                  <div className="text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100">
                    <Clock className="w-3 h-3" /> 48h
                  </div>
                </div>
                <div className={cn("p-3 rounded-lg flex items-center justify-between opacity-80", t.mockPanel)}>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-white border border-slate-200 text-slate-500">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <div className={cn("text-xs font-bold", t.textPrimary)}>Internal_Frameworks</div>
                      <div className={cn("text-[10px]", t.textMuted)}>Do Not Share</div>
                    </div>
                  </div>
                  <ShieldCheck className={cn("w-3.5 h-3.5", t.textMuted)} />
                </div>
              </div>
            )}

            {currentSlide === 3 && (
              <div className={cn("w-full h-full rounded-lg overflow-hidden", t.mockPanel)}>
                <div
                  className={cn(
                    t.mockHeader,
                    "border-b border-black/[0.08] px-3 py-2 flex items-center justify-between",
                    !isEditorial && "border-slate-100",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                  <div className={cn("text-[10px] font-bold", t.labelUpper)}>CLIENT VIEW</div>
                </div>
                <div className="p-4 text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-[#72ff70]/20 text-[#006e16] border border-[#006e16]/20">
                    <Gem className="w-6 h-6" />
                  </div>
                  <h3 className={cn("text-base font-bold mb-1", t.textPrimary)}>Acme Corp Portal</h3>
                  <p className={cn("text-xs mb-4", t.textMuted)}>Securely access deliverables.</p>
                  <div className="space-y-1.5 text-left">
                    <div
                      className={cn(
                        "p-2 rounded flex items-center gap-2 border",
                        isEditorial ? "border-black/[0.1]" : "border-slate-200",
                        t.mockRowHover,
                      )}
                    >
                      <FolderLock className={cn("w-4 h-4", t.textMuted)} />
                      <span className={cn("text-xs font-medium", t.textBody)}>Final Strategy [Read Only]</span>
                    </div>
                    <div
                      className={cn(
                        "p-2 rounded flex items-center gap-2 border",
                        isEditorial ? "border-black/[0.1]" : "border-slate-200",
                        t.mockRowHover,
                      )}
                    >
                      <FolderLock className={cn("w-4 h-4", t.textMuted)} />
                      <span className={cn("text-xs font-medium", t.textBody)}>Assets [Downloadable]</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentSlide === 4 && (
              <div className={cn("w-full h-full rounded-lg overflow-hidden relative", t.mockPanel)}>
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#72ff70] via-[#72ff70]/80 to-rose-200" />
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 rounded bg-[#72ff70]/20 text-[#006e16] border border-[#006e16]/20">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <div className={cn("text-[10px] font-bold uppercase", t.labelUpper)}>Active Engagement</div>
                      <h3 className={cn("text-sm font-bold", t.textPrimary)}>Acme Rebrand 2024</h3>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className={cn("flex justify-between items-center text-xs", t.textBody)}>
                      <span>Status</span>
                      <span className="font-bold text-[#006e16] bg-[#72ff70]/20 px-2 py-0.5 rounded border border-[#006e16]/20">Active</span>
                    </div>
                    <div className={cn("flex justify-between items-center text-xs", t.textBody)}>
                      <span>Shared With</span>
                      <div className="flex -space-x-2">
                        <div className="w-5 h-5 rounded-full bg-slate-200 border-2 border-white text-[8px] flex items-center justify-center font-bold text-slate-500">
                          AC
                        </div>
                        <div className="w-5 h-5 rounded-full bg-slate-200 border-2 border-white text-[8px] flex items-center justify-center font-bold text-slate-500">
                          JS
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button className="w-full gap-2 h-8 text-xs bg-[#0f172a] hover:bg-black text-white border border-transparent">
                    <LockKeyhole className="w-3 h-3" />
                    Close & Archive
                  </Button>
                </div>
              </div>
            )}

            {currentSlide === 5 && (
              <div className={cn("space-y-2 w-full h-full p-3 rounded-lg", t.mockPanel)}>
                <div className={cn("flex items-center justify-between border-b pb-2", isEditorial ? "border-black/[0.08]" : "border-slate-100")}>
                  <div>
                    <div className={cn("text-[10px] font-bold uppercase tracking-widest mb-0.5", t.labelUpper)}>Audit Log</div>
                    <h3 className={cn("text-sm font-bold flex items-center gap-1.5", t.textPrimary)}>
                      <Briefcase className={cn("w-3.5 h-3.5", isEditorial ? edAccent : "text-[#006e16]")} />
                      Acme Rebrand
                    </h3>
                  </div>
                  <div
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-mono rounded border",
                      isEditorial ? "bg-white text-[#44474c] border-black/[0.1]" : "bg-slate-100 text-slate-600 border-slate-200",
                    )}
                  >
                    402-ACME
                  </div>
                </div>
                <div className="space-y-1.5">
                  {["FILE_UPLOADED", "STATUS_CHANGE", "SHARED_EXT", "PROJECT_LOCKED"].map((action) => (
                    <div
                      key={action}
                      className={cn(
                        "flex items-center justify-between p-2 rounded border text-xs",
                        isEditorial ? "border-black/[0.08] bg-[#ffffff]" : "border-slate-100 bg-white",
                        t.mockRowHover,
                      )}
                    >
                      <span className={cn("font-bold", t.textBody)}>{action}</span>
                      <FileCheck className={cn("w-3.5 h-3.5", t.textMuted)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="border-t border-slate-100 bg-white">
        <div className={cn("relative bg-white", compactSlideNav ? "min-h-[128px]" : "min-h-[116px]")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`flat-strip-${currentSlide}`}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className={cn(
                "absolute inset-0 flex items-center px-4 md:px-5",
                compactSlideNav &&
                  "max-md:flex-col max-md:items-stretch max-md:justify-center max-md:gap-3 max-md:py-3",
              )}
            >
              {(() => {
                const current = slides[currentSlide]
                const Icon = current.icon
                return (
                  <>
                    {compactSlideNav ? (
                      <div className="flex min-w-0 items-start gap-3 max-md:w-full md:contents">
                        <div className="mr-3 flex w-11 shrink-0 items-center justify-center rounded-md border border-[#006e16]/25 bg-[#72ff70]/18 py-2 shadow-sm text-[#006e16] md:py-0">
                          <Icon className="h-5 w-5 stroke-[1.6]" />
                        </div>
                        <div className="min-w-0 flex-1 md:mr-4 md:min-w-[148px] md:flex-none">
                          <h3 className="text-[1.2rem] md:text-[1.3rem] leading-none font-bold text-[#0f1a15] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] md:mb-0.5">
                            {current.label}
                          </h3>
                          <div className="mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.11em] text-[#006e16] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] md:mt-0 md:text-[9px] md:whitespace-nowrap">
                            {current.subtitle}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#006e16]/25 bg-[#72ff70]/18 shadow-sm text-[#006e16]">
                          <Icon className="h-5 w-5 stroke-[1.6]" />
                        </div>
                        <div className="mr-4 min-w-[128px] shrink-0 md:min-w-[148px]">
                          <h3 className="mb-0.5 text-[1.2rem] font-bold leading-none text-[#0f1a15] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] md:text-[1.3rem]">
                            {current.label}
                          </h3>
                          <div className="text-[8.5px] font-bold uppercase tracking-[0.11em] text-[#006e16] [font-family:var(--font-kinetic-headline),system-ui,sans-serif] md:text-[9px] md:whitespace-nowrap">
                            {current.subtitle}
                          </div>
                        </div>
                      </>
                    )}
                    <p
                      className={cn(
                        "min-w-0 flex-1 font-medium leading-snug text-[#2f4338] [font-family:var(--font-kinetic-body),system-ui,sans-serif] pr-5",
                        compactSlideNav
                          ? "max-md:w-full max-md:text-xs max-md:leading-snug max-md:pr-0 md:text-[13px] lg:text-[14px]"
                          : "text-[13px] md:text-[14px]",
                      )}
                    >
                      {current.desc}
                    </p>
                    <div className={cn(t.carouselWatermark, "right-5 bottom-1")}>{currentSlide + 1}</div>
                  </>
                )
              })()}
            </motion.div>
          </AnimatePresence>
        </div>

        {compactSlideNav ? (
          <div className="relative z-30 flex h-12 items-stretch border-t border-slate-100 bg-white">
            <button
              type="button"
              aria-label="Previous slide"
              className="flex w-10 shrink-0 items-center justify-center border-r border-slate-100 text-[#4a5563] transition-colors hover:bg-slate-50"
              onClick={() =>
                onSlideChange((currentSlide - 1 + slides.length) % slides.length)
              }
            >
              <ChevronLeft className="h-5 w-5" aria-hidden strokeWidth={2} />
            </button>
            <div className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-h-full min-w-min flex-1">
                {slides.map((slide, index) => {
                  const isActive = currentSlide === index
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => onSlideChange(index)}
                      className={cn(
                        "relative flex min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-slate-100 px-2 py-1 text-[10px] font-bold transition-all duration-300 [font-family:var(--font-kinetic-headline),system-ui,sans-serif] last:border-r-0",
                        isActive ? "bg-[#72ff70] text-[#0f2a16]" : "bg-white text-[#4a5563] hover:bg-[#72ff70]/10 hover:text-[#1c2f24]",
                      )}
                    >
                      <div className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-[#0f2a16]" : "bg-slate-300")} />
                      <span className="leading-none">{slide.label}</span>
                      {isActive ? (
                        <motion.div
                          layoutId={`activeTabStrip-${motionInstanceKey}`}
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#006e16]"
                          transition={{ duration: 0.3 }}
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              type="button"
              aria-label="Next slide"
              className="flex w-10 shrink-0 items-center justify-center border-l border-slate-100 text-[#4a5563] transition-colors hover:bg-slate-50"
              onClick={() => onSlideChange((currentSlide + 1) % slides.length)}
            >
              <ChevronRight className="h-5 w-5" aria-hidden strokeWidth={2} />
            </button>
          </div>
        ) : (
          <div className="relative z-30 flex h-12 divide-x divide-slate-100 border-t border-slate-100 bg-white">
            {slides.map((slide, index) => {
              const isActive = currentSlide === index
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => onSlideChange(index)}
                  className={cn(
                    "relative flex flex-1 items-center justify-center gap-2 text-xs font-bold transition-all duration-300 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]",
                    isActive ? "bg-[#72ff70] text-[#0f2a16]" : "bg-white text-[#4a5563] hover:bg-[#72ff70]/10 hover:text-[#1c2f24]",
                  )}
                >
                  <div className={cn("h-2 w-2 rounded-full", isActive ? "bg-[#0f2a16]" : "bg-slate-300")} />
                  {slide.label}
                  {isActive ? (
                    <motion.div
                      layoutId={`activeTabIndicatorUnified-${motionInstanceKey}`}
                      className="absolute left-0 right-0 top-0 h-0.5 bg-[#006e16]"
                      transition={{ duration: 0.3 }}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
