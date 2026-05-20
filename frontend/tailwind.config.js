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
				sm: 'calc(var(--radius) - 4px)'
			},
			fontFamily: {
				headline: ['Space Grotesk', 'system-ui', 'sans-serif'],
				'work-sans': ['Work Sans', 'system-ui', 'sans-serif'],
			},
			keyframes: {
				'indeterminate-progress': {
					'0%': { transform: 'translateX(-100%)' },
					'100%': { transform: 'translateX(100%)' }
				}
			},
			animation: {
				'indeterminate-progress': 'indeterminate-progress 1.5s infinite linear'
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
				'ki-primary-glow': 'rgba(6,150,104,0.15)'
			}
		}
	},
	plugins: [
		require('tailwind-scrollbar'),
		require("tailwindcss-animate"),
	],
}