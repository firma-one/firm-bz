// Skip Sentry initialization in development to avoid performance overhead
// Note: This file is only imported in production via instrumentation.ts, but adding check for safety
if (process.env.NODE_ENV !== 'development') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");

    Sentry.init({
        // Use private DSN for server-side (not exposed to browser)
        dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

        // Set environment to distinguish between production and preview
        // This allows filtering errors by environment in Sentry
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',

        // 10% everywhere by default, but 100% for the few routes whose *latency* is the
        // diagnosis rather than a side note. The secure-access regrant runs sequential Graph
        // round-trips and has been measured at 16.6s; past ~5s the browser's transient user
        // activation expires and the new tab it opens is silently blocked, so the duration of
        // this request is the difference between working and failing. At 10% sampling nine out
        // of ten reports had no trace to look at. Document preview is included for the same
        // reason — it may now run a second, slower conversion attempt.
        tracesSampler: (ctx: { name?: string; attributes?: Record<string, unknown> }) => {
            const route = `${ctx.name ?? ''} ${String(ctx.attributes?.['http.route'] ?? '')}`
            if (route.includes('/sharing/regrant') || route.includes('/preview')) return 1.0
            return 0.1
        },

        // Setting this option to true will print useful information to the console while you're setting up Sentry.
        debug: false,

        // Ignore certain errors
        ignoreErrors: [
            // Prisma client errors that are expected
            'PrismaClientKnownRequestError',
            // Network errors
            'NetworkError',
            'Failed to fetch',
        ],

        // Filter events before sending
        beforeSend(event: { request?: { url?: string } }, _hint?: unknown) {
            // Filter out healthcheck/monitoring requests
            if (event.request?.url) {
                const url = event.request.url;
                if (url.includes('/api/health') || url.includes('/api/ping')) {
                    return null;
                }
            }

            return event;
        },

        beforeSendTransaction(event: unknown) {
            return event;
        },
    });
}

export {}
