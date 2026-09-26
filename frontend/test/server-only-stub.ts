/**
 * No-op stand-in for the `server-only` package under vitest.
 *
 * `server-only` throws on import outside a React Server Component, which is what makes it useful
 * in production — it stops a module holding the Anthropic key from being bundled into the client.
 * Under a test runner there is no such boundary, so importing it aborts the suite before any test
 * runs. Aliasing it to nothing lets server modules be unit-tested while the real guard stays in
 * place for the build.
 */
export {}
