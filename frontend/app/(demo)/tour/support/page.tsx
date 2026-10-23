import { Suspense } from 'react'
import { DemoSupport } from '@/components/demo/demo-support'

/** The app's Support page over the tour's sample requests. */
export default function DemoSupportPage() {
    return (
        <Suspense fallback={null}>
            <DemoSupport />
        </Suspense>
    )
}
