'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    getWikiPages,
    createWikiPage,
    deleteWikiPage,
    type WikiPage,
} from '@/lib/actions/engagement-wiki'
import { WikiSidebar } from './wiki-sidebar'
import { WikiEditor } from './wiki-editor'
import { WikiEmptyState } from './wiki-empty-state'

type Props = {
    engagementId: string
    firmId: string
    canEdit: boolean
    initialPageSlug: string | null
    base: string
}

export function EngagementWikiTab({ engagementId, firmId, canEdit, initialPageSlug, base }: Props) {
    const router = useRouter()
    const [pages, setPages] = useState<WikiPage[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const load = useCallback(async () => {
        const data = await getWikiPages(engagementId)
        setPages(data)
        return data
    }, [engagementId])

    useEffect(() => {
        load().then((data) => {
            const firstPage = data.find((p) => p.parentId !== null) ?? null
            if (initialPageSlug) {
                // Only resolve to a child page — sections are not editable
                const match = data.find((p) => p.slug === initialPageSlug && p.parentId !== null)
                if (match) {
                    setSelectedId(match.id)
                } else if (firstPage) {
                    setSelectedId(firstPage.id)
                    router.replace(`${base}/wiki/${firstPage.slug}`)
                }
            } else if (firstPage) {
                setSelectedId(firstPage.id)
                router.replace(`${base}/wiki/${firstPage.slug}`)
            }
            setLoading(false)
        })
    }, [])

    // Sections are never shown in the editor
    const selectedPage = pages.find((p) => p.id === selectedId && p.parentId !== null) ?? null

    function handleSelect(page: WikiPage) {
        // Sections are non-editable group headers; only child pages open in the editor
        if (page.parentId === null) return
        setSelectedId(page.id)
        router.push(`${base}/wiki/${page.slug}`)
    }

    async function handleNewSection() {
        await createWikiPage(engagementId, firmId, { title: 'New Section' })
        await load()
        // Don't select or navigate to the section — it's a group header, not an editable page
    }

    async function handleNewPage(sectionId: string) {
        const page = await createWikiPage(engagementId, firmId, { title: 'New Page', parentId: sectionId })
        const data = await load()
        setSelectedId(page.id)
        router.push(`${base}/wiki/${page.slug}`)
    }

    async function handleDelete(page: WikiPage) {
        await deleteWikiPage(page.id)
        const data = await load()
        // Select another page after deletion
        if (selectedId === page.id) {
            const next = data.find((p) => p.id !== page.id && p.parentId !== null) ?? null
            if (next) {
                setSelectedId(next.id)
                router.push(`${base}/wiki/${next.slug}`)
            } else {
                setSelectedId(null)
                router.push(`${base}/wiki`)
            }
        }
    }

    function handleTitleChange(id: string, title: string) {
        setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)))
    }

    function handleReorder(reordered: WikiPage[]) {
        setPages(reordered)
    }

    if (loading) {
        return <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading…</div>
    }

    if (pages.length === 0) {
        return (
            <WikiEmptyState
                canEdit={canEdit}
                onNewSection={handleNewSection}
            />
        )
    }

    return (
        <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-[260px] shrink-0 h-full">
                <WikiSidebar
                    pages={pages}
                    selectedId={selectedId}
                    canEdit={canEdit}
                    onSelect={handleSelect}
                    onNewSection={handleNewSection}
                    onNewPage={handleNewPage}
                    onDelete={handleDelete}
                    onTitleChange={handleTitleChange}
                    onReorder={handleReorder}
                />
            </div>

            {/* Editor */}
            <div className="flex-1 min-w-0 h-full overflow-hidden">
                {selectedPage ? (
                    <WikiEditor
                        key={selectedPage.id}
                        page={selectedPage}
                        canEdit={canEdit}
                        onTitleChange={handleTitleChange}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-sm text-slate-400">
                        Select a page or create a new one
                    </div>
                )}
            </div>
        </div>
    )
}
