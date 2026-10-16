import { Suspense } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DemoCursor } from '@/components/demo/demo-cursor'
import { DemoTourProvider } from '@/lib/demo/demo-tour-context'
import { DemoTourShell } from '@/components/demo/demo-tour-shell'
import { DemoShell } from '@/components/demo/demo-shell'

/**
 * The public demo: a static, unauthenticated copy of the app (.claude/plans/demo-new-ui.md). The
 * frame is the New UI shell's (DemoShell); every page reads the sample firm in lib/demo, with no
 * fetching and no auth. The guided tour runs over it.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
    return (
        <TooltipProvider delayDuration={400}>
            <DemoTourProvider>
                <DemoCursor />
                <Suspense fallback={null}>
                    <DemoTourShell />
                </Suspense>
                <DemoShell>{children}</DemoShell>
            </DemoTourProvider>
        </TooltipProvider>
    )
}
