"use client"

import { Fragment } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
    {
        title: "General",
        rows: [
            { keys: ["⌘", "K"], label: "Search and commands" },
            { keys: ["["], label: "Toggle sidebar" },
            { keys: ["?"], label: "Keyboard shortcuts" },
        ],
    },
    {
        title: "Go to",
        rows: [
            { keys: ["G", "H"], label: "Home" },
            { keys: ["G", "I"], label: "Inbox" },
            { keys: ["G", "C"], label: "Clients" },
            { keys: ["G", "L"], label: "Calendar" },
            { keys: ["G", "D"], label: "Doc Search" },
            { keys: ["G", "O"], label: "Firm overview (admins)" },
            { keys: ["G", "S"], label: "Firm settings (admins)" },
        ],
    },
    {
        title: "Inbox",
        rows: [
            { keys: ["J", "K"], label: "Next / previous" },
            { keys: ["↵"], label: "Open" },
            { keys: ["E"], label: "Done / dismiss" },
            { keys: ["H"], label: "Hide reminder" },
        ],
    },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                    <DialogDescription>Press G, then a letter, to jump anywhere.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-5">
                    {GROUPS.map((g) => (
                        <div key={g.title} className="flex flex-col gap-1">
                            <p className="text-caption text-fg-subtle">{g.title}</p>
                            {g.rows.map((r) => (
                                <div key={r.label} className="flex h-8 items-center justify-between text-ui text-fg">
                                    <span>{r.label}</span>
                                    <span className="flex items-center gap-1">
                                        {r.keys.map((k, i) => (
                                            <Fragment key={i}>
                                                <Kbd>{k}</Kbd>
                                            </Fragment>
                                        ))}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
