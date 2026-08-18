// Kept in sync manually with
// .claude/skills/reddit-screener/references/search-config.md — that file is
// the human-readable/tunable source; this is what run-discovery.ts imports.

export const TARGET_SUBREDDITS = [
    'webdesign',
    'web_design',
    'freelance',
    'graphic_design',
    'videography',
    'editors',
    'agency',
    'digital_agency',
    'marketing',
    'consulting',
    'Entrepreneur',
    'smallbusiness',
    'fractional',
    'msp',
]

export const VENDOR_HOSTILE_SUBREDDITS = ['cybersecurity', 'msp']

export const KEYWORD_GROUP_A = [
    'client portal',
    'share deliverables with clients',
    'sending files to clients',
    'client file sharing',
    'one place for clients',
    'branded client portal',
    'project status for clients',
    'clients chasing updates',
    'chasing clients for',
]

export const KEYWORD_GROUP_B = [
    'google drive links to clients',
    'wetransfer',
    'dropbox',
    'version control',
    'approval flow',
    'feedback on deliverables',
    'scattered across email and drive',
]

export const KEYWORD_GROUP_C = [
    'fractional cmo',
    'fractional',
    'consultancy',
    'agency',
    'studio',
    'freelance',
]

export const DEFAULT_HOURS_WINDOW = 48
export const MAX_THREAD_AGE_DAYS = 30
export const DEFAULT_TOP_N = 5

export const SIMILARITY_DEDUPE_THRESHOLD = 0.9
