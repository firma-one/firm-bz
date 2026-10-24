
/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{js,ts,jsx,tsx,mdx}',
		'./components/**/*.{js,ts,jsx,tsx,mdx}',
		'./app/**/*.{js,ts,jsx,tsx,mdx}',
		// Class strings in lib (e.g. marketing nav data) must be scanned or grid/spacing utilities are purged.
		'./lib/**/*.{js,ts,jsx,tsx,mdx}',
	],
	theme: {
		extend: {
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				DEFAULT: 'calc(var(--radius) - 4px)',
				/** UI token layer — app/ui-tokens.css */
				control: 'var(--ui-radius-control)',
				card: 'var(--ui-radius-card)',
				dialog: 'var(--ui-radius-dialog)'
			},
			/** UI token layer type scale (app/ui-tokens.css). New keys only — Tailwind's own
			 *  text-xs…text-9xl are untouched so the legacy UI does not shift. */
			fontSize: {
				caption: ['12px', { lineHeight: '16px', fontWeight: '500' }],
				small: ['13px', { lineHeight: '18px' }],
				ui: ['14px', { lineHeight: '20px' }],
				body: ['15px', { lineHeight: '24px' }],
				h3: ['16px', { lineHeight: '24px', fontWeight: '600' }],
				h2: ['20px', { lineHeight: '28px', fontWeight: '600', letterSpacing: '-0.01em' }],
				h1: ['28px', { lineHeight: '36px', fontWeight: '700', letterSpacing: '-0.02em' }]
			},
			boxShadow: {
				popover: 'var(--ui-shadow-popover)',
				dialog: 'var(--ui-shadow-dialog)',
				card: 'var(--ui-shadow-card)',
				'card-hover': 'var(--ui-shadow-card-hover)',
				'card-drag': 'var(--ui-shadow-card-drag)'
			},
			transitionTimingFunction: {
				'ui-out': 'var(--ui-ease-out)'
			},
			transitionDuration: {
				'ui-fast': 'var(--ui-dur-fast)',
				'ui-base': 'var(--ui-dur-base)',
				'ui-slow': 'var(--ui-dur-slow)'
			},
			fontFamily: {
				headline: ['Space Grotesk', 'system-ui', 'sans-serif'],
				'work-sans': ['Work Sans', 'system-ui', 'sans-serif'],
			},
			keyframes: {
				'indeterminate-progress': {
					'0%': { transform: 'translateX(-100%)' },
					'100%': { transform: 'translateX(100%)' }
				},
				// Vertical twin, for the sidebar's left-edge active border.
				'indeterminate-progress-y': {
					'0%': { transform: 'translateY(-100%)' },
					'100%': { transform: 'translateY(100%)' }
				},
				// Skeleton loading: a soft highlight sweeping across the placeholder (ShimmerBar).
				'shimmer': {
					'0%': { backgroundPosition: '100% 0' },
					'100%': { backgroundPosition: '-100% 0' }
				}
			},
			animation: {
				'indeterminate-progress': 'indeterminate-progress 1.5s infinite linear',
				'indeterminate-progress-y': 'indeterminate-progress-y 1.5s infinite linear',
				'shimmer': 'shimmer 1.6s ease-in-out infinite'
			},
			colors: {
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				},
				/** Kinetic marketing accent — see `app/globals.css` :root */
				'ds-kinetic-lime': 'var(--ds-kinetic-lime)',
				'ds-on-kinetic-lime': 'var(--ds-on-kinetic-lime)',
				'ds-kinetic-lime-icon': 'var(--ds-kinetic-lime-icon)',
				/** Firm brand accent — injected per-firm via JS; falls back to --primary */
				'brand-accent': 'hsl(var(--brand-accent))',
				'brand-accent-foreground': 'hsl(var(--brand-accent-foreground))',
				/** Firma platform chrome — fixed, never overridden by firm brand */
				'firma': {
					DEFAULT: '#069668',
					foreground: '#ffffff',
					light: '#F0FDF4',
				},
				/** Dashboard surface colors (not brand — intentional design tokens) */
				'ki-bg': '#f9f9fb',
				'ki-surface': '#ffffff',
				'ki-surface-low': '#f3f4f6',
				'ki-surface-mid': '#f0edee',
				'ki-on-surface': '#1b1b1d',
				'ki-on-surface-variant': '#45474c',
				'ki-outline': '#e5e7eb',
				'ki-outline-variant': '#d1d5db',
				'ki-primary-glow': 'rgba(6,150,104,0.15)',

				/**
				 * UI token layer — app/ui-tokens.css (one scope, Notion-style values on :root).
				 * Neutrals are full colors (some rgba), so they take no /opacity modifier;
				 * action and danger are HSL channels and do (bg-action/10).
				 */
				surface: {
					DEFAULT: 'var(--ui-surface)',
					sidebar: 'var(--ui-surface-sidebar)',
					subtle: 'var(--ui-surface-subtle)',
					muted: 'var(--ui-surface-muted)',
					hover: 'var(--ui-surface-hover)',
					selected: 'var(--ui-surface-selected)'
				},
				fg: {
					DEFAULT: 'var(--ui-fg)',
					muted: 'var(--ui-fg-muted)',
					subtle: 'var(--ui-fg-subtle)'
				},
				line: {
					DEFAULT: 'var(--ui-line)',
					strong: 'var(--ui-line-strong)'
				},
				action: {
					DEFAULT: 'hsl(var(--ui-action) / <alpha-value>)',
					hover: 'hsl(var(--ui-action-hover) / <alpha-value>)',
					fg: 'hsl(var(--ui-action-fg) / <alpha-value>)'
				},
				danger: 'hsl(var(--ui-danger) / <alpha-value>)',
				scrim: 'var(--ui-scrim)',
				tag: {
					'gray-bg': 'var(--ui-tag-gray-bg)',
					'gray-fg': 'var(--ui-tag-gray-fg)',
					'brown-bg': 'var(--ui-tag-brown-bg)',
					'brown-fg': 'var(--ui-tag-brown-fg)',
					'orange-bg': 'var(--ui-tag-orange-bg)',
					'orange-fg': 'var(--ui-tag-orange-fg)',
					'yellow-bg': 'var(--ui-tag-yellow-bg)',
					'yellow-fg': 'var(--ui-tag-yellow-fg)',
					'green-bg': 'var(--ui-tag-green-bg)',
					'green-fg': 'var(--ui-tag-green-fg)',
					'blue-bg': 'var(--ui-tag-blue-bg)',
					'blue-fg': 'var(--ui-tag-blue-fg)',
					'purple-bg': 'var(--ui-tag-purple-bg)',
					'purple-fg': 'var(--ui-tag-purple-fg)',
					'pink-bg': 'var(--ui-tag-pink-bg)',
					'pink-fg': 'var(--ui-tag-pink-fg)',
					'red-bg': 'var(--ui-tag-red-bg)',
					'red-fg': 'var(--ui-tag-red-fg)'
				},
				/** Status language (lib/ui/status.ts): bg-status-underway-bg, text-status-done-fg … */
				status: Object.fromEntries(
					['not-started', 'underway', 'waiting', 'done', 'paused', 'closed', 'problem'].map((stage) => [
						stage,
						Object.fromEntries(
							['bg', 'fg', 'icon', 'bar', 'lane', 'lane-line', 'lane-target', 'lane-target-line'].map((part) => [
								part,
								`var(--ui-status-${stage}-${part})`,
							])
						),
					])
				)
			}
		}
	},
	plugins: [
		require('tailwind-scrollbar'),
		require("tailwindcss-animate"),
		require('@tailwindcss/container-queries'),
	],
}