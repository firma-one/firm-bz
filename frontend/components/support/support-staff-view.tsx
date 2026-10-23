"use client"

import { Suspense } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { LayoutRightPanel } from "@/components/app/layout-right-panel"
import { RightPaneProvider, useRightPane } from "@/lib/right-pane-context"
import { cn } from "@/lib/utils"
import { SupportView } from "./support-view"

/*
 * The Firma team's view of every firm's support requests, on /system/customer-success
 * (.claude/plans/app-design-refinements.md, section 14): the Support page's table on the Firma side,
 * and a request's sidebar to reply from. /system has no right pane of its own, so this brings one,
 * docked on the right as the app's shell docks it.
 */

function DockedPane() {
    const { content, contentKey, title, clearPane, canClose, headerActions, headerIcon, iconTooltip, headerSubtitle } = useRightPane()
    if (!content) return null
    return (
        <div className="fixed inset-y-0 right-0 z-[110] flex w-full flex-col border-l border-line bg-surface shadow-dialog sm:w-[460px]">
            <LayoutRightPanel
                title={title || "Request"}
                icon={headerIcon}
                iconTooltip={iconTooltip || undefined}
                subtitle={headerSubtitle || undefined}
                onClose={clearPane}
                beforeClose={canClose}
                headerActions={headerActions}
                embedContent={true}
                frame="flush"
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={contentKey}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15, ease: "easeInOut" }}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        {content}
                    </motion.div>
                </AnimatePresence>
            </LayoutRightPanel>
        </div>
    )
}

function Body({ myEmail }: { myEmail: string | null }) {
    const { content } = useRightPane()
    return (
        // The table steps aside for the pane on wide screens, so the open request's row stays in view.
        <div className={cn("transition-[padding]", content && "lg:pr-[460px]")}>
            <SupportView side="firma" firmSlug={null} firmName="Firma" myEmail={myEmail} engagements={[]} bare />
            <DockedPane />
        </div>
    )
}

export function SupportStaffView({ myEmail }: { myEmail: string | null }) {
    return (
        <RightPaneProvider>
            <Suspense fallback={null}>
                <Body myEmail={myEmail} />
            </Suspense>
        </RightPaneProvider>
    )
}
