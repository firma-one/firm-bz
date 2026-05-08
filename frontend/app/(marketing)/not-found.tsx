import Link from 'next/link'
import { KINETIC_COLORS } from '@/config/kinetic-institution'

export default function MarketingNotFound() {
    return (
        <div
            className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6 [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
            style={{ color: KINETIC_COLORS.onSurface }}
        >
            <p
                className="text-8xl font-bold tracking-tighter mb-4 select-none"
                style={{ color: KINETIC_COLORS.outlineVariant }}
            >
                404
            </p>

            <h1 className="text-3xl font-semibold tracking-tight mb-3">
                Page not found
            </h1>

            <p className="text-base mb-8 max-w-sm" style={{ color: KINETIC_COLORS.onSurfaceVariant }}>
                This page has moved or doesn&apos;t exist.
            </p>

            <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                    backgroundColor: KINETIC_COLORS.onSurface,
                    color: KINETIC_COLORS.surface,
                }}
            >
                Back to Home
            </Link>
        </div>
    )
}
