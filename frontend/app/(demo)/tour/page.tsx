import { Suspense } from 'react'
import { DemoFirmDashboard } from '@/components/demo/demo-firm-dashboard'
import { DEMO_FIRM } from '@/lib/demo/static-demo-data'

export default function DemoFirmPage() {
    return (
        <Suspense fallback={null}>
            <DemoFirmDashboard firm={DEMO_FIRM} />
        </Suspense>
    )
}
