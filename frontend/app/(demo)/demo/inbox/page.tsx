import { Suspense } from 'react'
import { DemoInbox } from '@/components/demo/demo-inbox'

export default function DemoInboxPage() {
    return (
        <Suspense fallback={null}>
            <DemoInbox />
        </Suspense>
    )
}
