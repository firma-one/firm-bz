'use client'

import { useRef, useState } from 'react'
import { ChevronRight, Plus, Trash2, Pencil, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WikiPage } from '@/lib/actions/engagement-wiki'
import { updateWikiPage, reorderPages } from '@/lib/actions/engagement-wiki'
import {
    DndContext,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    closestCenter,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

type Props = {
    pages: WikiPage[]
    selectedId: string | null
    canEdit: boolean
    onSelect: (page: WikiPage) => void
    onNewSection: () => void
    onNewPage: (sectionId: string) => void
    onDelete: (page: WikiPage) => void
    onTitleChange: (id: string, title: string) => void
    onReorder: (pages: WikiPage[]) => void
}

function SortablePage({ page, selectedId, canEdit, onSelect, onDelete }: {
    page: WikiPage
    selectedId: string | null
    canEdit: boolean
    onSelect: (page: WikiPage) => void
    onDelete: (page: WikiPage) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn('group flex items-center gap-1 pl-7 pr-3 py-1', isDragging && 'opacity-50 bg-slate-100 rounded')}
        >
            {canEdit && (
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-opacity shrink-0"
                    tabIndex={-1}
                >
                    <GripVertical className="h-3 w-3" />
                </button>
            )}
            <button
                type="button"
                onClick={() => onSelect(page)}
                className={cn(
                    'flex-1 text-left text-[12px] truncate transition-colors',
                    selectedId === page.id
                        ? 'font-semibold text-slate-900'
                        : 'text-slate-500 hover:text-slate-800'
                )}
            >
                {page.title}
            </button>
            {canEdit && (
                <button
                    type="button"
                    onClick={() => onDelete(page)}
                    title="Delete page"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-opacity shrink-0"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            )}
        </div>
    )
}

export function WikiSidebar({ pages, selectedId, canEdit, onSelect, onNewSection, onNewPage, onDelete, onTitleChange, onReorder }: Props) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingTitle, setEditingTitle] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    )

    const sections = pages.filter((p) => p.parentId === null)
    const childrenOf = (sectionId: string) => pages.filter((p) => p.parentId === sectionId)

    function toggleSection(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    function startEdit(section: WikiPage) {
        setEditingId(section.id)
        setEditingTitle(section.title)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    }

    async function commitEdit() {
        if (!editingId) return
        const title = editingTitle.trim() || 'Untitled Section'
        await updateWikiPage(editingId, { title })
        onTitleChange(editingId, title)
        setEditingId(null)
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
        if (e.key === 'Escape') setEditingId(null)
    }

    function handleDragEnd(sectionId: string, event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const children = childrenOf(sectionId)
        const oldIndex = children.findIndex((p) => p.id === active.id)
        const newIndex = children.findIndex((p) => p.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return

        const reordered = arrayMove(children, oldIndex, newIndex)
        // Replace children in the array at their original positions so array order drives render
        const reorderedIds = new Set(reordered.map((p) => p.id))
        let i = 0
        const newPages = pages.map((p) => reorderedIds.has(p.id) ? reordered[i++] : p)
        onReorder(newPages)
        reorderPages(reordered.map((p) => p.id))
    }

    return (
        <div className="flex flex-col h-full border-r border-slate-200 bg-slate-50/60">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pages</span>
                {canEdit && (
                    <button
                        type="button"
                        onClick={onNewSection}
                        title="New section"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Section
                    </button>
                )}
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto py-2">
                {sections.length === 0 && (
                    <p className="px-4 py-6 text-xs text-slate-400 text-center">No sections yet</p>
                )}
                {sections.map((section) => {
                    const children = childrenOf(section.id)
                    const isOpen = expanded.has(section.id)
                    const isEditing = editingId === section.id
                    return (
                        <div key={section.id}>
                            {/* Section row */}
                            <div className="group flex items-center gap-1 px-3 py-1.5">
                                <button
                                    type="button"
                                    onClick={() => toggleSection(section.id)}
                                    className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"
                                >
                                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
                                </button>

                                {isEditing ? (
                                    <input
                                        ref={inputRef}
                                        value={editingTitle}
                                        onChange={(e) => setEditingTitle(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleKeyDown}
                                        className="flex-1 min-w-0 text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-300 rounded px-1 py-0 outline-none focus:border-slate-500"
                                    />
                                ) : (
                                    <span
                                        onClick={() => toggleSection(section.id)}
                                        className="flex-1 min-w-0 text-left text-[11px] font-bold uppercase tracking-wider truncate text-slate-500 cursor-pointer select-none"
                                    >
                                        {section.title}
                                    </span>
                                )}

                                {canEdit && !isEditing && (
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => startEdit(section)}
                                            title="Rename section"
                                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                                        >
                                            <Pencil className="h-3 w-3" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onNewPage(section.id)}
                                            title="Add page"
                                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(section)}
                                            title="Delete section"
                                            className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Sortable children — DndContext stays mounted so drag isn't cancelled on re-render */}
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                modifiers={[restrictToVerticalAxis]}
                                onDragEnd={(e) => handleDragEnd(section.id, e)}
                            >
                                <SortableContext items={children.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                                    {isOpen && children.map((page) => (
                                        <SortablePage
                                            key={page.id}
                                            page={page}
                                            selectedId={selectedId}
                                            canEdit={canEdit}
                                            onSelect={onSelect}
                                            onDelete={onDelete}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            {isOpen && canEdit && (
                                <button
                                    type="button"
                                    onClick={() => onNewPage(section.id)}
                                    className="flex items-center gap-1.5 pl-7 pr-3 py-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors w-full"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add page
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
