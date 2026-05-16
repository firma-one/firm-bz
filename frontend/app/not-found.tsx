import Link from 'next/link'
import { KINETIC_COLORS } from '@/config/kinetic-institution'

export default function RootNotFound() {
    return (
        <div
            className="relative min-h-screen overflow-hidden flex items-center justify-center [font-family:var(--font-kinetic-body),system-ui,sans-serif]"
            style={{ backgroundColor: KINETIC_COLORS.surface, color: KINETIC_COLORS.onSurface }}
        >
            {/* Ambient glows — mirrors (marketing)/layout.tsx */}
            <div className="pointer-events-none fixed inset-0 z-0">
                <div
                    className="absolute top-[-18%] right-[-8%] h-[min(88vw,680px)] w-[min(88vw,680px)] rounded-full opacity-35 blur-[100px]"
                    style={{ background: 'radial-gradient(circle, #72ff7044 0%, transparent 72%)' }}
                />
                <div
                    className="absolute bottom-[-22%] left-[-12%] h-[min(78vw,520px)] w-[min(78vw,520px)] rounded-full opacity-25 blur-[90px]"
                    style={{ background: 'radial-gradient(circle, #5a78ff33 0%, transparent 70%)' }}
                />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center px-6">
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
                    className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                        backgroundColor: KINETIC_COLORS.onSurface,
                        color: KINETIC_COLORS.surface,
                    }}
                >
                    Back to Home
                </Link>
            </div>
        </div>
    )
}
