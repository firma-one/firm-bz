// ESLint 9 flat config. Next 16 removed `next lint` and ESLint 9 no longer reads `.eslintrc.json`,
// so nothing was linted after the Next 16 upgrade; this restores Next's recommended rules.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        // Warnings for now, so the existing backlog doesn't fail lint. `no-explicit-any` comes from Next's
        // TypeScript rules, which the old config never had (1,437 hits on 2026-11-11). The rest are new in
        // eslint-plugin-react-hooks 7; `refs`, `purity` and `immutability` can be real render bugs, so
        // look at those first. Raise each back to an error once its count reaches zero.
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/immutability': 'warn',
            'react-hooks/preserve-manual-memoization': 'warn',
            'react-hooks/static-components': 'warn',
            'react-hooks/error-boundaries': 'warn',
            'react-hooks/use-memo': 'warn',
        },
    },
    {
        // Plain JavaScript configs and scripts are CommonJS, where `require` is correct.
        files: ['**/*.js', '**/*.cjs', 'scripts/**'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    globalIgnores([
        '.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
        // Copied in from pdfjs-dist by scripts/copy-pdf-worker.js.
        'public/pdf.worker.min.mjs',
        // The narration tool's Python virtualenv ships its own JavaScript.
        'scripts/tour-narration/.venv/**',
    ]),
])
