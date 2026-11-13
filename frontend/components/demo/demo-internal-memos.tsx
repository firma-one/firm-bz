'use client'

// No longer mounted on the Overview: memos moved to Discussions › Memos (demo-memos.tsx); kept until Deepak signs off.

import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tag } from '@/components/ui/tag'
import { useToast } from '@/components/ui/toast'
import { InternalMemosView } from '@/components/projects/internal-memos-card'
import { AddMemoSheet, type AddMemoInput, type AddMemoOutcome } from '@/components/projects/add-memo-sheet'
import type { DemoEngagement } from '@/lib/demo/static-demo-data'
import { memoDayLine } from '@/lib/memos/memo-shared'
import { useDemoMemos, type DemoMemo } from '@/components/demo/demo-memos'

/**
 * The Overview's "Internal memos" card on /tour: the app's own card (InternalMemosView) and Add sheet
 * over three canned calls kept in memory (demo-memos.tsx). Find actions answers with canned proposals
 * grounded in the memo's own lines, Apply marks the row, and a memo added here joins the list. Nothing
 * is sent.
 *
 * `today` is the visitor's, known only after mount (the server and the browser must agree), so the
 * Overview rendered this once it was, keyed by the engagement.
 */
export function DemoInternalMemos({ engagement, today }: { engagement: DemoEngagement; today: Date }) {
    const { addToast } = useToast()
    const c = useDemoMemos(engagement, today)
    const memos = c.memos ?? []
    const [adding, setAdding] = useState(false)
    const [opened, setOpened] = useState<DemoMemo | null>(null)

    const save = async (input: AddMemoInput): Promise<AddMemoOutcome> => {
        const out = await c.save(input)
        addToast({ type: 'success', title: 'Memo saved', message: `Saved as ${out.fileName} in Internal Memos.` })
        return { ok: true }
    }

    return (
        <>
            <InternalMemosView
                memos={memos}
                readOnly={false}
                storagePhrase="your Drive"
                onAdd={() => setAdding(true)}
                onOpen={(memo) => setOpened(memos.find((m) => m.id === memo.id) ?? null)}
                findActions={c.findActions}
                apply={c.apply}
            />
            <AddMemoSheet open={adding} onOpenChange={setAdding} onSave={save} />
            <Sheet open={!!opened} onOpenChange={(o) => { if (!o) setOpened(null) }}>
                <SheetContent side="right" className="flex w-full flex-col sm:max-w-[560px]">
                    {opened && (
                        <>
                            <div className="flex items-center gap-2 border-b border-line px-4 pb-3 pt-4">
                                <SheetTitle className="min-w-0 truncate text-h3 text-fg">{opened.fileName}</SheetTitle>
                                <Tag color="gray">Internal only</Tag>
                            </div>
                            <SheetDescription className="sr-only">The memo as it reads in the engagement&apos;s Internal Memos folder.</SheetDescription>
                            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                                <h3 className="text-h3 text-fg">{opened.title}</h3>
                                <p className="mt-1 text-small text-fg-muted">{memoDayLine(opened.date)} · {opened.authorName}</p>
                                <div className="mt-4 whitespace-pre-wrap text-ui leading-[22px] text-fg">{opened.body}</div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    )
}
