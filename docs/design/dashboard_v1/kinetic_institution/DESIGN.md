---
name: Architectural Institutional
colors:
  surface: '#f5fbf4'
  surface-dim: '#d5dcd5'
  surface-bright: '#f5fbf4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff5ef'
  surface-container: '#e9efe9'
  surface-container-high: '#e4eae3'
  surface-container-highest: '#dee4de'
  on-surface: '#171d19'
  on-surface-variant: '#45474c'
  inverse-surface: '#2c322e'
  inverse-on-surface: '#ecf2ec'
  outline: '#e5e7eb'
  outline-variant: '#d1d5db'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855c'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dca8'
  secondary: '#52625c'
  on-secondary: '#ffffff'
  secondary-container: '#d3e3dc'
  on-secondary-container: '#566660'
  tertiary: '#5c5b5e'
  on-tertiary: '#ffffff'
  tertiary-container: '#757476'
  on-tertiary-container: '#fffcfe'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c3'
  primary-fixed-dim: '#68dca8'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005237'
  secondary-fixed: '#d5e6df'
  secondary-fixed-dim: '#bacac3'
  on-secondary-fixed: '#101e1a'
  on-secondary-fixed-variant: '#3b4a44'
  tertiary-fixed: '#e4e2e4'
  tertiary-fixed-dim: '#c8c6c8'
  on-tertiary-fixed: '#1b1b1d'
  on-tertiary-fixed-variant: '#474649'
  background: '#f5fbf4'
  on-background: '#171d19'
  surface-variant: '#dee4de'
  pearl-background: '#f9f9fb'
  pure-white: '#ffffff'
  success-container: '#ecfdf5'
  on-success-container: '#065f46'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.5'
    letterSpacing: 0.2em
  body-md:
    fontFamily: Work Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Work Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.1em
  label-mono-bold:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  stack-sm: 8px
  stack-md: 16px
  gutter: 16px
  container-padding: 24px
  stack-lg: 32px
  header-height: 64px
  sidebar-width: 240px
  sidebar-collapsed: 72px
---

## Brand & Style

The brand identity, "firmä," evokes a sense of structural integrity, precision, and institutional authority. It is designed for high-stakes environments like fintech, cybersecurity, or legal orchestration where clarity and auditability are paramount. 

The design style is **Architectural Modernism**. It prioritizes a high-information density layout with "technical" aesthetics—utilizing monospaced accents, subtle grid-based dot patterns, and sharp, thin borders. It borrows from **Minimalism** for its spaciousness and **Brutalism** for its heavy reliance on structural lines and uppercase tracking, but refines these with a sophisticated, light-mode "Pearl" palette. The emotional response is one of calm control, high-functioning efficiency, and professional transparency.

## Colors

The palette is anchored by "Institutional Emerald" (#069668), a deep green that signals growth and security without the alarmism of red or the ubiquity of corporate blue. 

- **Primary:** Used for actionable status indicators, primary buttons, and active navigational states.
- **Surface & Background:** A "Pearl White" (#f9f9fb) background provides a soft canvas for "Pure White" (#ffffff) cards, creating a subtle contrast that helps define content areas without heavy shadows.
- **Neutrals:** A range of cool grays from `#1b1b1d` (text) to `#e5e7eb` (borders) maintains a crisp, high-contrast environment.
- **Semantic Accents:** Low-saturation tints of the primary green are used for "Success" or "Verified" containers to denote safety.

## Typography

The system employs a tri-font strategy to distinguish between different types of information:
- **Space Grotesk (Headlines):** Its geometric and technical qualities are used for brand headers and section titles.
- **Work Sans (Body):** A highly legible humanist sans-serif used for all long-form reading and interface labels.
- **JetBrains Mono (Metadata/System):** Used for IDs, timestamps, status levels, and "root" paths to reinforce the technical/auditable nature of the platform.

Font sizes range from 9px (system versioning) up to 40px (client names). Heavy use of uppercase tracking (0.1em to 0.2em) is applied to small labels to improve readability and visual hierarchy.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model:
- **Global Structure:** A fixed top header (64px) anchors the page. A collapsible left navigation bar (240px default) provides primary routing. A contextual right "Action Pane" (320px) slides in for secondary tasks.
- **Content Area:** Uses a 12-column grid within the main panel. Cards usually span 4 columns (3-up on desktop) or full width for data-heavy visualizations.
- **Spacing Logic:** Based on a 4px base unit. Gaps between related items use 8px or 16px, while distinct sections are separated by 32px or border-top dividers.
- **Architectural Dot Grid:** A 16x16px radial gradient pattern is applied at low opacity (20%) to background layers to reinforce the structural aesthetic.

## Elevation & Depth

This system avoids traditional "floating" shadows in favor of **Structural Stacking** and **Tonal Layers**:
- **Planes:** The lowest level is the Pearl White background. The next level up is the Pure White card or sidebar, defined by a 1px `outline` border.
- **Interactions:** Elevation is signaled through shadow only on high-priority floating elements (like the right-side pane which uses a `shadow-xl`) or when hovering over cards (shifting from a simple border to a `shadow-lg` and a subtle primary-tinted border).
- **Dividers:** Horizontal and vertical 1px lines are the primary method of separation.
- **Backdrop:** A 50% white blur is used for footers that scroll over content, maintaining context while ensuring legibility.

## Shapes

The shape language is "Sophisticated Precision"—minimal rounding to keep the interface feeling crisp and professional:
- **Base Components:** 0.125rem (2px) for buttons and nav items to give a "sharp but not painful" edge.
- **Cards & Inputs:** 0.25rem (4px) or 0.5rem (8px) for containers that hold content, providing a clear frame.
- **Full Rounded:** Only used for utility-level buttons (icons) and user avatars to distinguish "people and tools" from "data and structure."

## Components

- **Buttons:** 
    - *Primary:* Emerald background, white bold text, uppercase, wide tracking.
    - *Secondary/Ghost:* 1px outline, white background, black text.
- **Inputs:** Background uses the `#f9f9fb` pearl tone, with a 1px gray border that transitions to Emerald on focus.
- **Cards:** White background, 1px border. Hover state should include a subtle `primary/50` border-color shift and a soft shadow.
- **Chips/Badges:** Monospaced font, small caps, light gray or primary tints for background.
- **Nav Items:** Vertical sidebar items use a simple hover background. Active state is marked by a 2px left border in the primary color and a tinted background.
- **Breadcrumbs:** Use monospaced labels for paths, separated by chevron icons, emphasizing the "root" structure of the application.