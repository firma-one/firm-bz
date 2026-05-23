import { STITCH_COLORS } from '@/config/stitch-firma-redesign'

/** Tailwind-safe ambient shadow (matches Stitch design doc). */
const SF = 'shadow-[0px_20px_40px_rgba(24,28,28,0.06)]'

export type LandingSkin = 'legacy' | 'stitch' | 'kinetic'

/** Semantic classes for the consulting landing — legacy (peach / mono) vs Stitch *Institutional Curator*. */
export interface LandingTheme {
  skin: LandingSkin
  pageRoot: string
  dotGridWrapper: string
  dotGridPattern: string
  blurTop: string
  blurBottom: string
  heroSection: string
  heroGiant: string
  heroBadge: string
  heroBadgeIcon: string
  heroTitle: string
  heroGradient: string
  heroTaglineAccent: string
  heroTaglinePipe: string
  heroTaglineStrong: string
  heroTaglineMuted: string
  heroLead: string
  heroLeadStrong: string
  heroPrimaryCta: string
  heroSecondaryShell: string
  heroSecondaryIconHover: string
  heroFootnote: string
  carouselMobileCard: string
  carouselDesktopShell: string
  carouselLeftPane: string
  carouselRightPane: string
  carouselBrowserBar: string
  carouselBrowserDots: string
  carouselAddressBar: string
  carouselTabActive: string
  carouselTabInactive: string
  carouselTabIndicator: string
  carouselTabDotActive: string
  carouselTabDotIdle: string
  carouselShadow: string
  slideTintSelected: string
  slideTintHover: string
  slideCheckBg: string
  slideCheckBorder: string
  slideFileAccent: string
  slideFileNameSelected: string
  slideImportBtn: string
  treeHighlight: string
  treeItemHover: string
  treeProjectActive: string
  ringFocus: string
  mockPanel: string
  mockHeader: string
  mockRowHover: string
  protectTagOrange: string
  protectIconMuted: string
  deliverHeroIcon: string
  wrapGradientBar: string
  wrapIconBg: string
  auditCloseBtn: string
  sectionTrust: string
  sectionTrustGrid: string
  trustCenterCta: string
  storagePanel: string
  whoForSection: string
  whoForGrid: string
  personaCard: string
  personaIconWrap: string
  personaIconWrapHover: string
  personaChip: string
  personaWorkflowBar: string
  personaWorkflowSep: string
  bulletsPeach: string
  projectTypesSection: string
  useCaseCard: string
  useCaseIcon: string
  useCaseIconHover: string
  benefitsPanel: string
  benefitsPattern: string
  benefitsTilesWarm: string
  benefitsTilesWarmBorder: string
  benefitsIconWarm: string
  problemSection: string
  problemGrid: string
  realityBadge: string
  chaosGradient: string
  realityLead: string
  rotatingBadge: string
  rotatingBadgeIcon: string
  rotatingAccentLine: string
  rotatingHeadline: string
  rotatingSub: string
  rotatingCta: string
  problemCard: string
  problemCardHover: string
  problemIconTile: string
  problemTitleHover: string
  headlineMuted: string
  shadowLift: string
  shadowLiftHover: string
  textPrimary: string
  textBody: string
  textMuted: string
  labelUpper: string
  displayXL: string
  /** Giant watermark number in carousel */
  carouselWatermark: string
  /** Stitch: hero “Secure Vault” panel (from Stitch MCP full-page / hero screens) */
  secureVaultCard: string
  stitchVaultDriveRow: string
  stitchVaultFeatureIcon: string
  /** Stitch: section title block — editorial left rail vs legacy centered */
  sectionIntro: string
}

/** Kinetic / editorial: Work Sans body + Space Grotesk headlines (`--font-kinetic-*` from root `layout.tsx` + `globals.css`). */
const KINETIC_BODY = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'
const KINETIC_HEADLINE = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'

const LEGACY: LandingTheme = {
  skin: 'legacy',
  pageRoot: `min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-[#B07D62] selection:text-white overflow-hidden ${KINETIC_BODY}`,
  dotGridWrapper: 'absolute inset-0 opacity-[0.4]',
  dotGridPattern: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
  blurTop: 'absolute top-0 right-0 w-[800px] h-[800px] bg-[#ECC0AA]/28 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2',
  blurBottom: 'absolute bottom-0 left-0 w-[600px] h-[600px] bg-slate-100/50 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4',
  /** Fills laptop viewport below marketing layout header (`pt-24` / `lg:pt-28`); `100dvh` avoids mobile URL bar jump. */
  heroSection:
    'relative flex min-h-[calc(100dvh-6rem)] flex-col pt-4 pb-10 md:pt-16 md:pb-12 lg:min-h-[calc(100dvh-7rem)] lg:pt-10 lg:pb-14',
  heroGiant: `text-[10rem] lg:text-[10rem] font-black text-slate-100/80 tracking-tighter leading-none opacity-50 mix-blend-multiply blur-[1px] ${KINETIC_HEADLINE}`,
  heroBadge:
    `inline-flex items-center px-4 py-1.5 bg-black text-white rounded-md text-xs font-bold tracking-widest uppercase mb-4 shadow-xl shadow-[#b07d62]/20 ${KINETIC_HEADLINE}`,
  heroBadgeIcon: 'w-3.5 h-3.5 mr-2 text-[#c49a82] stroke-2',
  heroTitle: `text-4xl md:text-5xl lg:text-7xl font-bold tracking-tighter text-slate-900 leading-[1.1] ${KINETIC_HEADLINE}`,
  heroGradient: 'text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-[#7a5343] to-[#ECC0AA]',
  heroTaglineAccent: 'text-[#B07D62]',
  heroTaglinePipe: 'text-slate-300 font-light px-1 sm:px-2',
  heroTaglineStrong: 'text-slate-900',
  heroTaglineMuted: 'text-slate-500',
  heroLead: `text-xl text-slate-600 max-w-2xl mx-auto font-medium leading-relaxed ${KINETIC_BODY}`,
  heroLeadStrong: 'text-slate-900 font-semibold',
  heroPrimaryCta:
    `w-full sm:w-auto h-14 px-10 rounded-md bg-black hover:bg-neutral-900 text-white text-lg font-bold shadow-2xl shadow-black/25 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ring-4 ring-[#ECC0AA]/25 ring-offset-0 border border-transparent ${KINETIC_HEADLINE}`,
  heroSecondaryShell:
    `w-full sm:w-auto h-14 px-10 rounded-md bg-white text-slate-900 text-lg font-bold border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex items-center justify-center cursor-pointer group ${KINETIC_HEADLINE}`,
  heroSecondaryIconHover: 'group-hover:text-[#B07D62] transition-colors',
  heroFootnote: `text-sm text-slate-500 font-medium tracking-wide ${KINETIC_HEADLINE}`,
  carouselMobileCard: 'bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col gap-4',
  carouselDesktopShell:
    'hidden md:flex relative bg-white rounded-xl shadow-[0_40px_100px_-15px_rgba(236,192,170,0.45)] border border-slate-200 overflow-hidden flex-col md:flex-row h-[460px]',
  carouselLeftPane:
    'w-full md:w-[35%] p-6 md:p-8 relative flex flex-col justify-center bg-white z-10 border-r border-slate-100 overflow-hidden',
  carouselRightPane: 'w-full md:w-[65%] bg-slate-50/50 relative overflow-hidden flex flex-col',
  carouselBrowserBar: 'h-10 bg-white border-b border-slate-100 flex items-center px-4 gap-2 flex-shrink-0 relative z-20',
  carouselBrowserDots: 'w-2.5 h-2.5 rounded-full bg-slate-200',
  carouselAddressBar:
    'ml-4 px-3 py-1 bg-slate-50 rounded text-[10px] font-semibold text-slate-400 flex items-center gap-2 border border-slate-100 w-64 shadow-sm',
  carouselTabActive: 'text-[#7a5343] bg-[#ECC0AA]/12',
  carouselTabInactive: 'text-slate-400 hover:text-slate-600 hover:bg-slate-50',
  carouselTabIndicator: 'bg-[#B07D62]',
  carouselTabDotActive: 'bg-[#B07D62]',
  carouselTabDotIdle: 'bg-slate-300',
  carouselShadow: 'shadow-[0_40px_100px_-15px_rgba(236,192,170,0.45)]',
  slideTintSelected: 'bg-[#ECC0AA]/18',
  slideTintHover: 'hover:bg-slate-50',
  slideCheckBg: 'bg-[#B07D62] border-[#B07D62]',
  slideCheckBorder: 'border-slate-300',
  slideFileAccent: 'text-[#B07D62]',
  slideFileNameSelected: 'text-[#5c3f32]',
  slideImportBtn: 'h-8 text-xs bg-[#B07D62] hover:bg-[#7a5343]',
  treeHighlight: 'bg-[#ECC0AA]/18 text-[#7a5343]',
  treeItemHover: 'hover:bg-slate-50',
  treeProjectActive: 'text-[#B07D62] font-medium text-sm bg-white border border-slate-100 shadow-sm rounded',
  ringFocus: 'focus-within:ring-2 ring-[#ECC0AA]/35',
  mockPanel: 'bg-white rounded-lg border border-slate-200 shadow-xl',
  mockHeader: 'bg-slate-50 border-b border-slate-100',
  mockRowHover: 'hover:bg-slate-50',
  protectTagOrange: `text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100 mb-1 flex items-center gap-1 ${KINETIC_HEADLINE}`,
  protectIconMuted: 'p-2 bg-slate-50 rounded text-slate-400',
  deliverHeroIcon: 'w-16 h-16 bg-[#ECC0AA]/30 rounded-full flex items-center justify-center mx-auto mb-4 text-[#B07D62]',
  wrapGradientBar: 'h-2 bg-gradient-to-r from-[#c17a54] to-[#7a5343]',
  wrapIconBg: 'w-10 h-10 rounded bg-[#ECC0AA]/18 flex items-center justify-center text-[#B07D62]',
  auditCloseBtn: `w-full bg-slate-900 hover:bg-black text-white gap-2 h-10 ${KINETIC_HEADLINE}`,
  sectionTrust: 'py-24 lg:py-32 bg-[#ECC0AA]/18 relative overflow-hidden',
  sectionTrustGrid:
    'absolute inset-0 bg-[linear-gradient(to_right,#F6E8E1_1px,transparent_1px),linear-gradient(to_bottom,#F6E8E1_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50',
  trustCenterCta:
    `inline-flex items-center px-8 py-4 bg-white text-slate-900 font-bold rounded-xl border border-slate-200 hover:border-[#ECC0AA]/55 hover:shadow-xl hover:shadow-[#b07d62]/20 transition-all group ${KINETIC_HEADLINE}`,
  storagePanel: 'bg-white rounded-xl p-5 lg:p-6 border border-slate-200 shadow-sm',
  whoForSection: 'py-24 lg:py-32 bg-[#ECC0AA]/18 relative overflow-hidden border-t border-[#ECC0AA]/35',
  whoForGrid:
    'absolute inset-0 bg-[linear-gradient(to_right,#F6E8E1_1px,transparent_1px),linear-gradient(to_bottom,#F6E8E1_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50',
  personaCard:
    'p-6 rounded-2xl bg-white border border-slate-200 h-full flex flex-col group hover:border-[#ECC0AA]/55 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500 relative overflow-hidden',
  personaIconWrap:
    'w-12 h-12 rounded-xl bg-[#ECC0AA]/18 border border-[#ECC0AA]/35 flex items-center justify-center text-[#B07D62] group-hover:bg-[#B07D62] group-hover:text-white transition-colors duration-300 shadow-sm shrink-0',
  personaIconWrapHover: '',
  personaChip:
    `flex items-center gap-3 text-sm font-bold text-[#5c3f32] bg-[#ECC0AA]/18/80 p-3 rounded-xl border border-[#ECC0AA]/35 shadow-sm overflow-x-auto whitespace-nowrap ${KINETIC_HEADLINE}`,
  personaWorkflowBar:
    `flex items-center gap-3 text-sm font-bold text-[#5c3f32] bg-[#ECC0AA]/18/80 p-3 rounded-xl border border-[#ECC0AA]/35 shadow-sm overflow-x-auto whitespace-nowrap ${KINETIC_HEADLINE}`,
  personaWorkflowSep: 'text-[#d4a892]',
  bulletsPeach: 'w-1.5 h-1.5 rounded-full bg-[#ECC0AA]/180 shadow-[0_0_8px_rgba(168,85,247,0.4)]',
  projectTypesSection: 'py-24 lg:py-32 bg-white relative overflow-hidden border-t border-slate-100',
  useCaseCard:
    'p-6 rounded-2xl bg-white border border-slate-200 h-full flex flex-col group hover:border-[#ECC0AA]/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500 relative overflow-hidden',
  useCaseIcon:
    'w-12 h-12 rounded-xl bg-[#ECC0AA]/20 border border-[#ECC0AA]/40 flex items-center justify-center text-[#7a5343] group-hover:bg-[#7a5343] group-hover:text-white transition-colors duration-300 shadow-sm shrink-0',
  useCaseIconHover: '',
  benefitsPanel:
    'bg-white rounded-2xl p-8 lg:p-10 border-2 border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.06)] relative overflow-hidden',
  benefitsPattern:
    'absolute inset-0 bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-50',
  benefitsTilesWarm:
    'flex flex-col items-center gap-4 p-6 rounded-xl bg-gradient-to-br from-[#ECC0AA]/18 to-[#ECC0AA]/10 border border-[#ECC0AA]/35 hover:border-[#ECC0AA]/55 hover:shadow-md transition-all duration-300',
  benefitsTilesWarmBorder: '',
  benefitsIconWarm:
    'w-14 h-14 rounded-xl bg-[#ECC0AA]/30 border-2 border-[#ECC0AA]/55 flex items-center justify-center text-[#B07D62] shadow-sm',
  problemSection: 'py-32 bg-[#ECC0AA]/18 relative border-t border-[#ECC0AA]/35',
  problemGrid:
    'absolute inset-0 bg-[linear-gradient(to_right,#F6E8E1_1px,transparent_1px),linear-gradient(to_bottom,#F6E8E1_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50',
  realityBadge:
    `inline-flex items-center px-4 py-1.5 bg-black text-white rounded-md text-xs font-bold tracking-widest uppercase mb-6 shadow-xl shadow-[#b07d62]/20 ${KINETIC_HEADLINE}`,
  chaosGradient: `text-transparent bg-clip-text bg-gradient-to-r from-[#B07D62] to-[#7a5343] ${KINETIC_HEADLINE}`,
  realityLead: `text-xl text-stone-700 max-w-2xl mx-auto font-medium leading-relaxed ${KINETIC_BODY}`,
  rotatingBadge:
    `inline-flex items-center px-4 py-1.5 bg-black text-white rounded-md text-xs font-bold tracking-widest uppercase shadow-xl shadow-[#b07d62]/20 ${KINETIC_HEADLINE}`,
  rotatingBadgeIcon: 'w-3.5 h-3.5 mr-2 text-[#c49a82] stroke-2',
  rotatingAccentLine: 'absolute -left-6 top-16 bottom-2 w-1 bg-gradient-to-b from-[#B07D62] to-transparent rounded-full',
  rotatingHeadline: 'text-4xl lg:text-6xl font-black text-slate-900 tracking-tighter leading-none',
  rotatingSub: 'text-xl text-stone-700 font-medium leading-relaxed absolute top-0 left-0 w-full',
  rotatingCta:
    'inline-flex items-center px-6 py-3 bg-black text-white font-bold rounded-lg shadow-lg shadow-black/20 hover:bg-neutral-900 hover:shadow-xl transition-all cursor-pointer group',
  problemCard:
    'flex items-start gap-6 p-8 rounded-lg bg-white border border-[#ECC0AA]/30 shadow-sm hover:shadow-xl hover:shadow-[#b07d62]/15 hover:border-[#ECC0AA]/50 hover:bg-[#FFF7F2] transition-all duration-300 group',
  problemCardHover: '',
  problemIconTile:
    'w-14 h-14 rounded-md bg-[#FFF7F2] border border-[#ECC0AA]/35 shadow-sm flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:border-[#ECC0AA]/55 group-hover:bg-white transition-all',
  problemTitleHover: 'group-hover:text-[#7a5343] transition-colors',
  headlineMuted: 'text-[#B07D62]',
  shadowLift: 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
  shadowLiftHover: 'hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)]',
  textPrimary: 'text-slate-900',
  textBody: `text-slate-600 ${KINETIC_BODY}`,
  textMuted: `text-slate-500 ${KINETIC_BODY}`,
  labelUpper: `text-xs font-bold text-slate-400 uppercase tracking-widest ${KINETIC_HEADLINE}`,
  displayXL: `text-4xl lg:text-5xl font-black text-slate-900 tracking-tight ${KINETIC_HEADLINE}`,
  carouselWatermark: `absolute -bottom-10 -right-0 text-[12rem] font-black text-slate-50 leading-none select-none -z-10 mix-blend-darken ${KINETIC_HEADLINE}`,
  secureVaultCard: '',
  stitchVaultDriveRow: '',
  stitchVaultFeatureIcon: '',
  sectionIntro: 'mt-8 text-center max-w-4xl mx-auto mb-16 relative',
}

const S = STITCH_COLORS

const STITCH: LandingTheme = {
  skin: 'stitch',
  pageRoot: 'min-h-screen bg-transparent text-[#181c1c] font-sans selection:bg-[#1a2b3c] selection:text-white overflow-hidden',
  dotGridWrapper: 'absolute inset-0 opacity-[0.35]',
  dotGridPattern: `radial-gradient(${S.outlineVariant} 1px, transparent 1px)`,
  blurTop:
    'absolute top-0 right-0 w-[800px] h-[800px] bg-[#0060a9]/12 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2',
  blurBottom:
    'absolute bottom-0 left-0 w-[600px] h-[600px] bg-[#041627]/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/4',
  heroSection: 'relative pt-32 pb-16 lg:pt-28 lg:pb-20',
  heroGiant: `text-[10rem] lg:text-[10rem] font-semibold tracking-tighter leading-none opacity-[0.07] text-[#041627] select-none blur-[1px] [font-family:var(--font-stitch-display),serif]`,
  heroBadge: `inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold tracking-widest uppercase mb-4 text-white bg-[#041627] [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  heroBadgeIcon: `w-3.5 h-3.5 mr-2 text-[#b7c8de] stroke-2`,
  heroTitle: `text-4xl md:text-5xl lg:text-7xl font-semibold tracking-tight text-[#181c1c] leading-[1.08] [font-family:var(--font-stitch-display),serif]`,
  heroGradient: `text-transparent bg-clip-text bg-gradient-to-r from-[#041627] via-[#1a2b3c] to-[#0060a9]`,
  heroTaglineAccent: `text-[#0060a9] font-semibold [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  heroTaglinePipe: `text-[#c4c6cd] font-light px-1 sm:px-2`,
  heroTaglineStrong: `text-[#181c1c]`,
  heroTaglineMuted: `text-[#44474c]`,
  heroLead: `text-xl text-[#44474c] max-w-2xl mx-auto font-normal leading-relaxed`,
  heroLeadStrong: `text-[#181c1c] font-semibold`,
  heroPrimaryCta: `w-full sm:w-auto h-14 px-10 rounded-lg bg-[#041627] hover:bg-[#1a2b3c] text-white text-lg font-semibold transition-all duration-300 border border-transparent ${SF} hover:-translate-y-0.5`,
  heroSecondaryShell: `w-full sm:w-auto h-14 px-10 rounded-lg bg-[#ffffff] text-[#181c1c] text-lg font-semibold border border-[#c4c6cd]/25 flex items-center justify-center cursor-pointer group transition-all ${SF} hover:-translate-y-0.5`,
  heroSecondaryIconHover: `group-hover:text-[#0060a9] transition-colors`,
  heroFootnote: `text-xs text-[#44474c] font-semibold tracking-widest uppercase [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  carouselMobileCard: `rounded-xl p-6 flex flex-col gap-4 bg-[#ffffff]`,
  carouselDesktopShell: `hidden md:flex relative rounded-xl overflow-hidden flex-col md:flex-row h-[460px] bg-[#ffffff] ${SF}`,
  carouselLeftPane: `w-full md:w-[35%] p-6 md:p-8 relative flex flex-col justify-center bg-[#ffffff] z-10 overflow-hidden md:border-r md:border-[#c4c6cd]/18`,
  carouselRightPane: `w-full md:w-[65%] relative overflow-hidden flex flex-col bg-[#ffffff]`,
  carouselBrowserBar: `h-10 flex items-center px-4 gap-2 flex-shrink-0 relative z-20 bg-[#ffffff] border-b border-black/[0.06]`,
  carouselBrowserDots: `w-2.5 h-2.5 rounded-full bg-neutral-300`,
  carouselAddressBar: `ml-4 px-3 py-1 rounded text-[10px] font-semibold text-[#041627] flex items-center gap-2 w-64 bg-white border border-black/[0.08] [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  carouselTabActive: `text-white bg-[#041627]`,
  carouselTabInactive: `text-neutral-600 hover:text-[#041627] hover:bg-neutral-100`,
  carouselTabIndicator: `bg-[#0060a9]`,
  carouselTabDotActive: `bg-[#0060a9]`,
  carouselTabDotIdle: `bg-[#c4c6cd]`,
  carouselShadow: SF,
  slideTintSelected: `bg-[#d3e4ff]/45`,
  slideTintHover: `hover:bg-neutral-50`,
  slideCheckBg: `bg-[#041627] border-[#041627]`,
  slideCheckBorder: `border-[#c4c6cd]`,
  slideFileAccent: `text-[#0060a9]`,
  slideFileNameSelected: `text-[#041627]`,
  slideImportBtn: `h-8 text-xs bg-[#041627] hover:bg-[#1a2b3c]`,
  treeHighlight: `bg-[#d3e4ff]/60 text-[#041627]`,
  treeItemHover: `hover:bg-neutral-50`,
  treeProjectActive: `text-[#041627] font-medium text-sm bg-[#ffffff] rounded-md border border-black/[0.08] ${SF}`,
  ringFocus: `focus-within:ring-2 ring-[#0060a9]/35`,
  mockPanel: `rounded-xl bg-[#ffffff] overflow-hidden border border-black/[0.08] ${SF}`,
  mockHeader: `bg-white`,
  mockRowHover: `hover:bg-neutral-50`,
  protectTagOrange: `text-[10px] font-bold text-[#c2410c] bg-[#ffedd5]/80 px-2 py-1 rounded-md mb-1 flex items-center gap-1 [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  protectIconMuted: `p-2 rounded-md bg-white border border-black/[0.06] text-neutral-600`,
  deliverHeroIcon: `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[#d3e4ff]/50 text-[#0060a9]`,
  wrapGradientBar: `h-1.5 rounded-full bg-gradient-to-r from-[#041627] to-[#0060a9]`,
  wrapIconBg: `w-10 h-10 rounded-lg flex items-center justify-center bg-white text-[#041627] border border-black/[0.1]`,
  auditCloseBtn: `w-full h-10 gap-2 bg-[#041627] hover:bg-[#1a2b3c] text-white`,
  sectionTrust: `py-28 lg:py-40 relative overflow-hidden bg-white`,
  sectionTrustGrid: `absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35 pointer-events-none`,
  trustCenterCta: `inline-flex items-center px-8 py-4 rounded-xl font-semibold text-white bg-[#041627] transition-all group border border-[#041627] ${SF} hover:-translate-y-0.5 hover:bg-[#1a2b3c]`,
  storagePanel: `rounded-xl p-5 lg:p-6 bg-white border border-black/[0.08] ${SF}`,
  whoForSection: `py-28 lg:py-40 relative overflow-hidden bg-[#fafafa]`,
  whoForGrid: `absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35 pointer-events-none`,
  personaCard: `p-6 rounded-xl h-full flex flex-col group bg-white border border-black/[0.08] transition-all duration-300 relative overflow-hidden ${SF} hover:-translate-y-1 hover:border-black/[0.12]`,
  personaIconWrap: `w-12 h-12 rounded-xl flex items-center justify-center text-[#0060a9] bg-[#d3e4ff]/50 shrink-0 group-hover:bg-[#041627] group-hover:text-white transition-colors duration-300 border border-black/[0.06]`,
  personaIconWrapHover: '',
  personaChip: `flex items-center gap-3 text-sm font-semibold text-[#041627] bg-white p-3 rounded-xl overflow-x-auto whitespace-nowrap border border-black/[0.08] [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  personaWorkflowBar: `flex items-center gap-3 text-sm font-semibold text-[#041627] bg-white p-3 rounded-xl overflow-x-auto whitespace-nowrap [font-family:var(--font-stitch-label),system-ui,sans-serif] border border-black/[0.08]`,
  personaWorkflowSep: `text-[#0060a9]/60`,
  bulletsPeach: `w-1.5 h-1.5 rounded-full bg-[#0060a9] shadow-[0_0_8px_rgba(0,96,169,0.35)]`,
  projectTypesSection: `py-28 lg:py-40 bg-white relative overflow-hidden`,
  useCaseCard: `p-6 rounded-xl h-full flex flex-col group relative overflow-hidden bg-white border border-black/[0.08] transition-all duration-300 ${SF} hover:-translate-y-1 hover:border-black/[0.12]`,
  useCaseIcon: `w-12 h-12 rounded-xl flex items-center justify-center text-[#041627] bg-white border border-black/[0.1] group-hover:bg-[#041627] group-hover:text-white group-hover:border-[#041627] transition-colors duration-300 shrink-0`,
  useCaseIconHover: '',
  benefitsPanel: `rounded-2xl p-8 lg:p-10 relative overflow-hidden bg-white border border-black/[0.08] ${SF}`,
  benefitsPattern: `absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-60`,
  benefitsTilesWarm: `flex flex-col items-center gap-4 p-6 rounded-xl bg-white border border-black/[0.06] transition-all duration-300 hover:border-black/[0.1]`,
  benefitsTilesWarmBorder: '',
  benefitsIconWarm: `w-14 h-14 rounded-xl flex items-center justify-center text-[#041627] bg-white border border-black/[0.1]`,
  problemSection: `py-32 lg:py-40 relative bg-[#fafafa]`,
  problemGrid: `absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35 pointer-events-none`,
  realityBadge: `inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold tracking-widest uppercase mb-6 text-white bg-[#041627] [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  chaosGradient: `text-transparent bg-clip-text bg-gradient-to-r from-[#041627] to-[#0060a9]`,
  realityLead: `text-xl text-[#44474c] max-w-2xl font-normal leading-relaxed`,
  rotatingBadge: `inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold tracking-widest uppercase text-white bg-[#041627] [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  rotatingBadgeIcon: `w-3.5 h-3.5 mr-2 text-[#b7c8de] stroke-2`,
  rotatingAccentLine: `absolute -left-6 top-16 bottom-2 w-0.5 bg-gradient-to-b from-[#0060a9] to-transparent rounded-full`,
  rotatingHeadline: `text-4xl lg:text-6xl font-semibold text-[#041627] tracking-tight leading-none [font-family:var(--font-stitch-display),serif]`,
  rotatingSub: `text-xl text-[#44474c] font-normal leading-relaxed absolute top-0 left-0 w-full`,
  rotatingCta: `inline-flex items-center px-6 py-3 rounded-lg bg-[#041627] text-white font-semibold cursor-pointer group hover:bg-[#1a2b3c] transition-all ${SF}`,
  problemCard: `flex items-start gap-6 p-8 rounded-xl bg-white border border-black/[0.08] ${SF.replace(/\s+/g, ' ')} transition-all duration-300 group hover:-translate-y-0.5 hover:border-black/[0.12]`,
  problemCardHover: '',
  problemIconTile: `w-14 h-14 rounded-lg bg-white border border-black/[0.1] flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-[#041627] group-hover:text-white transition-all`,
  problemTitleHover: `group-hover:text-[#0060a9] transition-colors`,
  headlineMuted: `text-[#0060a9]`,
  shadowLift: SF,
  shadowLiftHover: ``,
  textPrimary: `text-[#181c1c]`,
  textBody: `text-[#44474c]`,
  textMuted: `text-[#44474c]`,
  labelUpper: `text-xs font-semibold text-[#44474c] uppercase tracking-widest [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  displayXL: `text-4xl lg:text-5xl font-semibold text-[#181c1c] tracking-tight [font-family:var(--font-stitch-display),serif]`,
  carouselWatermark: `absolute -bottom-10 -right-0 text-[12rem] font-semibold leading-none select-none -z-10 text-black/[0.06] [font-family:var(--font-stitch-display),serif]`,
  secureVaultCard: `rounded-xl p-8 lg:p-9 bg-[#ffffff] ${SF} border border-black/[0.1]`,
  stitchVaultDriveRow: `flex items-center gap-3 text-sm font-medium text-[#0060a9] mb-1 [font-family:var(--font-stitch-label),system-ui,sans-serif]`,
  stitchVaultFeatureIcon: `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#041627] border border-black/[0.08]`,
  sectionIntro: `mt-8 text-left max-w-3xl mb-20 lg:mb-28 relative`,
}

/** Stitch export *Kinetic Institution Edition* — Space Grotesk / Work Sans, lime CTAs, pearl surface. */
const KINETIC: LandingTheme = {
  ...STITCH,
  skin: 'kinetic',
  pageRoot:
    'min-h-screen bg-transparent text-[#1b1b1d] font-sans selection:bg-ds-kinetic-lime selection:text-ds-on-kinetic-lime overflow-hidden',
  heroSection: 'relative pt-4 pb-8 lg:pt-6 lg:pb-12',
  heroGiant: 'hidden',
  heroBadge: `ds-badge-kinetic mb-6 tracking-tight`,
  heroBadgeIcon: 'w-3 h-3 ds-badge-kinetic__icon stroke-2',
  heroTitle: `text-4xl md:text-6xl lg:text-[4.25rem] xl:text-7xl font-bold tracking-tighter text-[#1b1b1d] leading-[0.92] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  heroGradient: `text-ds-kinetic-lime-icon`,
  heroTaglineAccent: `text-ds-kinetic-lime-icon font-bold [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  heroTaglinePipe: `text-[#c6c6cc] font-light px-1 sm:px-2`,
  heroTaglineStrong: `text-[#1b1b1d]`,
  heroTaglineMuted: `text-[#45474c]`,
  heroLead: `text-xl text-[#45474c] max-w-2xl mx-auto font-normal leading-relaxed [font-family:var(--font-kinetic-body),system-ui,sans-serif]`,
  heroLeadStrong: `text-[#1b1b1d] font-semibold`,
  heroPrimaryCta: `w-full sm:w-auto h-14 px-8 rounded-md bg-ds-kinetic-lime hover:brightness-110 text-ds-on-kinetic-lime text-base font-bold tracking-widest transition-all border-0 shadow-lg shadow-ds-kinetic-lime/20 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  heroSecondaryShell: `w-full sm:w-auto h-14 px-8 rounded-md bg-[#141c2a] text-white text-base font-bold tracking-widest border border-transparent flex items-center justify-center cursor-pointer hover:bg-black transition-colors [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  heroSecondaryIconHover: `text-ds-kinetic-lime opacity-90`,
  heroFootnote: `text-xs text-[#45474c] font-bold tracking-widest uppercase [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  slideTintSelected: `bg-ds-kinetic-lime/25`,
  slideCheckBg: `bg-ds-kinetic-lime-icon border-ds-kinetic-lime-icon`,
  slideFileAccent: `text-[#5a78ff]`,
  slideFileNameSelected: `text-[#1b1b1d]`,
  slideImportBtn: `h-8 text-xs bg-ds-kinetic-lime-icon hover:bg-[#00530e]`,
  treeHighlight: `bg-ds-kinetic-lime/35 text-ds-on-kinetic-lime`,
  treeProjectActive: `text-[#1b1b1d] font-medium text-sm bg-white rounded-md border border-black/[0.1] ${SF}`,
  ringFocus: `focus-within:ring-2 ring-ds-kinetic-lime/40`,
  deliverHeroIcon: `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-ds-kinetic-lime/30 text-ds-kinetic-lime-icon`,
  wrapGradientBar: `h-1.5 rounded-full bg-gradient-to-r from-ds-kinetic-lime-icon to-ds-kinetic-lime`,
  wrapIconBg: `w-10 h-10 rounded-lg flex items-center justify-center bg-white text-[#1b1b1d] border border-black/[0.1]`,
  auditCloseBtn: `w-full h-10 gap-2 bg-ds-kinetic-lime-icon hover:bg-[#00530e] text-white`,
  trustCenterCta: `inline-flex items-center px-8 py-4 rounded-md font-bold text-ds-on-kinetic-lime bg-ds-kinetic-lime transition-all border border-transparent ${SF} hover:brightness-110 hover:-translate-y-0.5 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  chaosGradient: `text-transparent bg-clip-text bg-gradient-to-r from-[#000000] to-ds-kinetic-lime-icon`,
  realityBadge: `inline-flex items-center px-4 py-2 rounded-md text-xs font-bold tracking-widest uppercase mb-6 text-ds-on-kinetic-lime bg-ds-kinetic-lime [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  rotatingBadge: `inline-flex items-center px-4 py-2 rounded-md text-xs font-bold tracking-widest uppercase text-ds-on-kinetic-lime bg-ds-kinetic-lime [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  rotatingBadgeIcon: `w-3.5 h-3.5 mr-2 text-ds-kinetic-lime-icon stroke-2`,
  rotatingAccentLine: `absolute -left-6 top-16 bottom-2 w-0.5 bg-gradient-to-b from-ds-kinetic-lime to-transparent rounded-full`,
  rotatingHeadline: `text-4xl lg:text-6xl font-bold text-[#1b1b1d] tracking-tighter leading-none [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  rotatingCta: `inline-flex items-center px-6 py-3 rounded-md bg-ds-kinetic-lime text-ds-on-kinetic-lime font-bold cursor-pointer hover:brightness-110 transition-all ${SF}`,
  problemTitleHover: `group-hover:text-ds-kinetic-lime-icon transition-colors`,
  headlineMuted: `text-ds-kinetic-lime-icon`,
  carouselTabActive: `text-ds-on-kinetic-lime bg-ds-kinetic-lime`,
  carouselTabInactive: `text-[#45474c] hover:text-[#1b1b1d] hover:bg-[#f6f3f4]`,
  carouselTabIndicator: `bg-ds-kinetic-lime-icon`,
  carouselTabDotActive: `bg-ds-kinetic-lime-icon`,
  secureVaultCard: `rounded-lg p-8 lg:p-9 bg-white/80 backdrop-blur-md border border-[#c6c6cc]/20 shadow-2xl`,
  stitchVaultDriveRow: `text-sm font-medium text-ds-kinetic-lime-icon mb-1 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  stitchVaultFeatureIcon: `flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-[#1b1b1d] border border-black/[0.08]`,
  personaIconWrap: `w-12 h-12 rounded-lg flex items-center justify-center text-ds-kinetic-lime-icon bg-ds-kinetic-lime/30 shrink-0 group-hover:bg-[#141c2a] group-hover:text-ds-kinetic-lime transition-colors border border-black/[0.08]`,
  personaWorkflowSep: `text-ds-kinetic-lime-icon/70`,
  bulletsPeach: `w-1.5 h-1.5 rounded-full bg-ds-kinetic-lime-icon shadow-[0_0_8px_rgba(0,110,22,0.35)]`,
  useCaseIcon: `w-12 h-12 rounded-lg flex items-center justify-center text-[#1b1b1d] bg-white border border-black/[0.1] group-hover:bg-[#141c2a] group-hover:text-ds-kinetic-lime group-hover:border-[#141c2a] transition-colors duration-300 shrink-0`,
  whoForSection: `py-28 lg:py-40 relative overflow-hidden bg-[#f6f3f4]`,
  problemSection: `py-32 lg:py-40 relative bg-white`,
  labelUpper: `text-xs font-bold text-[#45474c] uppercase tracking-widest [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  displayXL: `text-4xl lg:text-5xl font-bold text-[#1b1b1d] tracking-tighter [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  carouselWatermark: `absolute -bottom-10 -right-0 text-[12rem] font-bold leading-none select-none -z-10 text-ds-kinetic-lime/15`,
  textPrimary: `text-[#1b1b1d]`,
  textBody: `text-[#45474c] [font-family:var(--font-kinetic-body),system-ui,sans-serif]`,
  textMuted: `text-[#45474c]`,
  protectTagOrange: `text-[10px] font-bold text-[#c2410c] bg-[#ffedd5]/80 px-2 py-1 rounded-md mb-1 flex items-center gap-1 [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  personaChip: `flex items-center gap-3 text-sm font-semibold text-[#1b1b1d] bg-white p-3 rounded-lg overflow-x-auto whitespace-nowrap border border-black/[0.08] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
  personaWorkflowBar: `flex items-center gap-3 text-sm font-semibold text-[#1b1b1d] bg-white p-3 rounded-lg overflow-x-auto whitespace-nowrap border border-black/[0.08] [font-family:var(--font-kinetic-headline),system-ui,sans-serif]`,
}

export function landingTheme(skin: LandingSkin): LandingTheme {
  if (skin === 'kinetic') return KINETIC
  return skin === 'stitch' ? STITCH : LEGACY
}
