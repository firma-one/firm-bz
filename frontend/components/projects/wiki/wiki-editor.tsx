'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { AlertCircle, Bold, Italic, UnderlineIcon, List, ListChecks, Heading1, Heading2, Quote, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateWikiPage, getWikiPageContent } from '@/lib/actions/engagement-wiki'
import type { WikiPage } from '@/lib/actions/engagement-wiki'
import { useToast } from '@/components/ui/toast'
import { LoadFailed } from '@/components/ui/load-failed'
import { failureReason } from '@/lib/files/action-failure'

type SaveState = 'saved' | 'saving' | 'unsaved' | 'failed'

type Props = {
    page: WikiPage
    canEdit: boolean
    onTitleChange: (id: string, title: string) => void
}

/**
 * One Dossier page. The editor stays read only until the page's text has loaded from storage: a failed
 * load shows why, with Retry, and never an empty page that autosaves over the real one. A save that
 * fails says "Not saved" with its reason and keeps the words, with Retry.
 */
export function WikiEditor({ page, canEdit, onTitleChange }: Props) {
    const { addToast } = useToast()
    const [title, setTitle] = useState(page.title)
    const [saveState, setSaveState] = useState<SaveState>('saved')
    const [saveError, setSaveError] = useState<string | null>(null)
    const [contentLoading, setContentLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loadAttempt, setLoadAttempt] = useState(0)
    /** True only once this page's text is in the editor: nothing is saved before that. */
    const contentReadyRef = useRef(false)
    const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const contentDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

    const saveContent = useCallback(async (markdown: string) => {
        setSaveState('saving')
        try {
            const result = await updateWikiPage(page.id, { content: markdown })
            if (!result.ok) {
                setSaveError(result.error)
                setSaveState('failed')
                return
            }
            setSaveError(null)
            setSaveState('saved')
        } catch (e) {
            setSaveError(failureReason(e))
            setSaveState('failed')
        }
    }, [page.id])

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
        // Read only until the page's text has loaded (see the load below).
        editable: false,
        onUpdate: ({ editor }) => {
            if (!canEdit || !contentReadyRef.current) return
            setSaveState('unsaved')
            if (contentDebounce.current) clearTimeout(contentDebounce.current)
            contentDebounce.current = setTimeout(() => {
                const markdown = (editor.storage as any).markdown.getMarkdown() as string
                void saveContent(markdown)
            }, 1500)
        },
    }, [page.id])

    // Load content from storage when the page changes. setContent and setEditable are told not to emit
    // an update: an update is an edit, and an edit is saved.
    useEffect(() => {
        if (!editor) return
        let cancelled = false
        contentReadyRef.current = false
        editor.setEditable(false, false)
        setTitle(page.title)
        setSaveState('saved')
        setSaveError(null)
        setLoadError(null)
        setContentLoading(true)
        getWikiPageContent(page.id).then((result) => {
            if (cancelled || editor.isDestroyed) return
            if (!result.ok) {
                setLoadError(result.error)
                setContentLoading(false)
                return
            }
            editor.commands.setContent(result.data || '', { emitUpdate: false })
            contentReadyRef.current = true
            editor.setEditable(canEdit, false)
            setContentLoading(false)
        }).catch((e) => {
            if (cancelled || editor.isDestroyed) return
            setLoadError(failureReason(e))
            setContentLoading(false)
        })
        return () => { cancelled = true }
    }, [page.id, editor, canEdit, loadAttempt])

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
            try {
                const result = await updateWikiPage(page.id, { title: value })
                if (!result.ok) {
                    setSaveError(result.error)
                    setSaveState('failed')
                    return
                }
                // Renamed here, but storage kept the old name: say so.
                if (result.warning) addToast({ type: 'warning', title: 'Page renamed', message: result.warning })
                onTitleChange(page.id, value)
                setSaveError(null)
                setSaveState('saved')
            } catch (e) {
                setSaveError(failureReason(e))
                setSaveState('failed')
            }
        }, 1000)
    }, [page.id, onTitleChange, addToast])

    const retrySave = useCallback(() => {
        if (!editor || !contentReadyRef.current) return
        const markdown = (editor.storage as any).markdown.getMarkdown() as string
        void saveContent(markdown)
        if (title !== page.title) handleTitleChange(title)
    }, [editor, saveContent, title, page.title, handleTitleChange])

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
                    className="w-full text-2xl font-bold text-fg placeholder:text-fg-subtle outline-none bg-transparent border-none disabled:cursor-default"
                />
            </div>

            {/* Toolbar */}
            {canEdit && !loadError && !contentLoading && (
                <div className="px-8 py-2 flex items-center gap-1 border-b border-line">
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

                    <div className="ml-auto flex items-center gap-1.5 text-[11px] text-fg-subtle">
                        {saveState === 'saving' && (
                            <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
                        )}
                        {saveState === 'saved' && (
                            <><Check className="h-3 w-3 text-emerald-500" />Saved</>
                        )}
                        {saveState === 'failed' && (
                            <span role="alert" className="flex items-center gap-1.5 text-danger" title={saveError ?? undefined}>
                                <AlertCircle className="h-3 w-3" />
                                <span className="max-w-[24rem] truncate">Not saved · {saveError ?? 'Something went wrong.'} Your changes are still here.</span>
                                <button type="button" onClick={retrySave} className="font-medium underline underline-offset-2">Retry</button>
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Editor body */}
            {loadError ? (
                <div className="flex flex-1 items-center justify-center px-8 py-6">
                    <LoadFailed
                        what="this page"
                        reason={`${loadError} It can't be edited until it loads.`}
                        onRetry={() => setLoadAttempt((n) => n + 1)}
                    />
                </div>
            ) : contentLoading ? (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <div className="space-y-3">
                        <div className="h-4 bg-surface-muted rounded w-3/4 animate-pulse" />
                        <div className="h-4 bg-surface-muted rounded w-1/2 animate-pulse" />
                        <div className="h-4 bg-surface-muted rounded w-2/3 animate-pulse" />
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <EditorContent
                        editor={editor}
                        className="prose prose-slate prose-sm max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-fg-subtle [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li>label]:mt-0.5"
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
                active ? 'bg-slate-900 text-white' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
            )}
        >
            {children}
        </button>
    )
}

function Divider() {
    return <div className="w-px h-5 bg-surface-selected mx-1" />
}
