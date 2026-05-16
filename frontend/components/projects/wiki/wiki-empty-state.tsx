'use client'

import { BookOpen, Plus } from 'lucide-react'

type Props = { canEdit: boolean; onNewSection: () => void }

export function WikiEmptyState({ canEdit, onNewSection }: Props) {
    return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <BookOpen className="h-10 w-10 text-slate-300 mb-4" />
            <p className="text-[15px] font-semibold text-slate-700">No wiki pages yet</p>
            <p className="text-sm text-slate-400 mt-1 max-w-xs">
                Build a shared knowledge base for this engagement — runbooks, decisions, meeting notes.
            </p>
            {canEdit && (
                <button
                    type="button"
                    onClick={onNewSection}
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    New Section
                </button>
            )}
        </div>
    )
}
