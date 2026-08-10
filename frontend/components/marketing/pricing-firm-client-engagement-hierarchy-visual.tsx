/**
 * Sample hierarchy for pricing comparison tooltips — top-down tree (Firm → clients → engagements → deliverables).
 */
const SAMPLE_TREE = `Firm
├── Client A
│   ├── Engagement
│   │   ├── Deliverable: SOW
│   │   │   └── SOW.pdf
│   │   └── Deliverable: Fee schedule
│   │       └── Fee schedule.xlsx
│   └── Engagement
│       ├── Deliverable: Workpapers
│       │   └── Workpapers.xlsx
│       └── Deliverable: Client checklist
│           └── Client checklist.docx
└── Client B
    ├── Engagement
    │   ├── Deliverable: Adjusting entries
    │   │   └── Adjusting entries.xlsx
    │   └── Deliverable: Management letter
    │       └── Management letter.pdf
    └── Engagement
        ├── Deliverable: PBC requests
        │   └── PBC requests.xlsx
        └── Deliverable: Closing memo
            └── Closing memo.docx`

export function PricingFirmClientEngagementHierarchyVisual() {
    return (
        <div
            className="rounded-md border border-[#c6c6cc]/40 bg-[#f6f3f4]/70 p-2.5 text-left text-[#1b1b1d]"
            aria-hidden
        >
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#76777d]">
                Sample shape
            </div>
            <pre className="m-0 overflow-x-auto rounded border border-[#c6c6cc]/35 bg-white px-2.5 py-2 font-mono text-[11px] leading-[1.45] text-[#2a261c] shadow-sm">
                {SAMPLE_TREE}
            </pre>
            <p className="mt-1.5 text-[10px] text-[#76777d]">1 firm · 2 clients · 4 engagements · 8 deliverables</p>
        </div>
    )
}
