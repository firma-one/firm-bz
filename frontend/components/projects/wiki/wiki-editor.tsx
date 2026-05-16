'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { Bold, Italic, UnderlineIcon, List, ListChecks, Heading1, Heading2, Quote, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateWikiPage, getWikiPageContent } from '@/lib/actions/engagement-wiki'
import type { WikiPage } from '@/lib/actions/engagement-wiki'

type SaveState = 'saved' | 'saving' | 'unsaved'

type Props = {
    page: WikiPage
    canEdit: boolean
    onTitleChange: (id: string, title: string) => void
}

export function WikiEditor({ page, canEdit, onTitleChange }: Props) {
    const [title, setTitle] = useState(page.title)
    const [saveState, setSaveState] = useState<SaveState>('saved')
    const [contentLoading, setContentLoading] = useState(true)
    const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const contentDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            TaskList,
            TaskItem.configure({ nested: false }),
            Underline,
            Placeholder.configure({ placeholder: 'Start writing…' }),
            Markdown.configure({ transformPastedText: true, linkify: false }),
        ],
        content: '',
        editable: canEdit,
        onUpdate: ({ editor }) => {
            if (!canEdit) return
            setSaveState('unsaved')
            if (contentDebounce.current) clearTimeout(contentDebounce.current)
            contentDebounce.current = setTimeout(async () => {
                setSaveState('saving')
                const markdown = (editor.storage as any).markdown.getMarkdown() as string
                await updateWikiPage(page.id, { content: markdown })
                setSaveState('saved')
            }, 1500)
        },
    }, [page.id])

    // Load content from Drive when page changes
    useEffect(() => {
        if (!editor) return
        setTitle(page.title)
        setSaveState('saved')
        setContentLoading(true)
        getWikiPageContent(page.id).then((text) => {
            if (!editor.isDestroyed) editor.commands.setContent(text || '')
            setContentLoading(false)
        }).catch(() => {
            if (!editor.isDestroyed) editor.commands.setContent('')
            setContentLoading(false)
        })
    }, [page.id, editor])

    useEffect(() => {
        return () => {
            if (titleDebounce.current) clearTimeout(titleDebounce.current)
            if (contentDebounce.current) clearTimeout(contentDebounce.current)
        }
    }, [])

    const handleTitleChange = useCallback((value: string) => {
        setTitle(value)
        setSaveState('unsaved')
        if (titleDebounce.current) clearTimeout(titleDebounce.current)
        titleDebounce.current = setTimeout(async () => {
            setSaveState('saving')
            await updateWikiPage(page.id, { title: value })
            onTitleChange(page.id, value)
            setSaveState('saved')
        }, 1000)
    }, [page.id, onTitleChange])

    if (!editor) return null

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Title */}
            <div className="px-8 pt-8 pb-2">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Untitled"
                    className="w-full text-2xl font-bold text-slate-900 placeholder:text-slate-300 outline-none bg-transparent border-none disabled:cursor-default"
                />
            </div>

            {/* Toolbar */}
            {canEdit && (
                <div className="px-8 py-2 flex items-center gap-1 border-b border-slate-100">
                    <ToolbarBtn
                        active={editor.isActive('heading', { level: 1 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        title="Heading 1"
                    ><Heading1 className="h-4 w-4" /></ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('heading', { level: 2 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        title="Heading 2"
                    ><Heading2 className="h-4 w-4" /></ToolbarBtn>
                    <Divider />
                    <ToolbarBtn
                        active={editor.isActive('bold')}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        title="Bold"
                    ><Bold className="h-4 w-4" /></ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('italic')}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        title="Italic"
                    ><Italic className="h-4 w-4" /></ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('underline')}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        title="Underline"
                    ><UnderlineIcon className="h-4 w-4" /></ToolbarBtn>
                    <Divider />
                    <ToolbarBtn
                        active={editor.isActive('bulletList')}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        title="Bullet list"
                    ><List className="h-4 w-4" /></ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('taskList')}
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        title="Task list"
                    ><ListChecks className="h-4 w-4" /></ToolbarBtn>
                    <ToolbarBtn
                        active={editor.isActive('blockquote')}
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        title="Blockquote"
                    ><Quote className="h-4 w-4" /></ToolbarBtn>

                    <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                        {saveState === 'saving' && (
                            <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
                        )}
                        {saveState === 'saved' && (
                            <><Check className="h-3 w-3 text-emerald-500" />Saved</>
                        )}
                    </div>
                </div>
            )}

            {/* Editor body */}
            {contentLoading ? (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <div className="space-y-3">
                        <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
                        <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
                        <div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse" />
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <EditorContent
                        editor={editor}
                        className="prose prose-slate prose-sm max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-slate-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li>label]:mt-0.5"
                    />
                </div>
            )}
        </div>
    )
}

function ToolbarBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick() }}
            title={title}
            className={cn(
                'p-1.5 rounded transition-colors',
                active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            )}
        >
            {children}
        </button>
    )
}

function Divider() {
    return <div className="w-px h-5 bg-slate-200 mx-1" />
}
