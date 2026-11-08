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
import { LoadFailed } from '@/components/ui/load-failed'
import { useToast } from '@/components/ui/toast'
import { failureReason } from '@/lib/files/action-failure'

type Props = {
    engagementId: string
    firmId: string
    canEdit: boolean
    initialPageSlug: string | null
    base: string
}

export function EngagementWikiTab({ engagementId, firmId, canEdit, initialPageSlug, base }: Props) {
    const router = useRouter()
    const { addToast } = useToast()
    const [pages, setPages] = useState<WikiPage[]>([])
    const [loading, setLoading] = useState(true)
    /** Why the pages didn't load. Never the empty Dossier (with New section) after a failure. */
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loadAttempt, setLoadAttempt] = useState(0)
    const [selectedId, setSelectedId] = useState<string | null>(null)

    /** The pages, or null when they didn't load (the reason is in loadError). */
    const load = useCallback(async (): Promise<WikiPage[] | null> => {
        try {
            const result = await getWikiPages(engagementId)
            if (!result.ok) {
                setLoadError(result.error)
                return null
            }
            setPages(result.data)
            setLoadError(null)
            return result.data
        } catch (e) {
            setLoadError(failureReason(e))
            return null
        }
    }, [engagementId])

    useEffect(() => {
        setLoading(true)
        load().then((data) => {
            if (!data) {
                setLoading(false)
                return
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadAttempt])

    // Sections are never shown in the editor
    const selectedPage = pages.find((p) => p.id === selectedId && p.parentId !== null) ?? null

    function handleSelect(page: WikiPage) {
        // Sections are non-editable group headers; only child pages open in the editor
        if (page.parentId === null) return
        setSelectedId(page.id)
        router.push(`${base}/wiki/${page.slug}`)
    }

    async function handleNewSection() {
        try {
            const result = await createWikiPage(engagementId, firmId, { title: 'New Section' })
            if (!result.ok) {
                addToast({ type: 'error', title: "Couldn't add the section", message: result.error })
                return
            }
        } catch (e) {
            addToast({ type: 'error', title: "Couldn't add the section", message: failureReason(e) })
            return
        }
        await load()
        // Don't select or navigate to the section — it's a group header, not an editable page
    }

    async function handleNewPage(sectionId: string) {
        let page: WikiPage
        try {
            const result = await createWikiPage(engagementId, firmId, { title: 'New Page', parentId: sectionId })
            if (!result.ok) {
                addToast({ type: 'error', title: "Couldn't add the page", message: result.error })
                return
            }
            page = result.data
        } catch (e) {
            addToast({ type: 'error', title: "Couldn't add the page", message: failureReason(e) })
            return
        }
        await load()
        setSelectedId(page.id)
        router.push(`${base}/wiki/${page.slug}`)
    }

    async function handleDelete(page: WikiPage) {
        try {
            const result = await deleteWikiPage(page.id)
            if (!result.ok) {
                addToast({ type: 'error', title: "Couldn't delete the page", message: result.error })
                return
            }
            // Gone here, but storage kept the file: say so.
            if (result.warning) addToast({ type: 'warning', title: 'Page deleted', message: result.warning })
        } catch (e) {
            addToast({ type: 'error', title: "Couldn't delete the page", message: failureReason(e) })
            return
        }
        const data = (await load()) ?? pages.filter((p) => p.id !== page.id && p.parentId !== page.id)
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
        return <div className="flex items-center justify-center h-full text-sm text-fg-subtle">Loading…</div>
    }

    if (loadError && pages.length === 0) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadFailed what="the Dossier" reason={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
            </div>
        )
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
                    <div className="flex items-center justify-center h-full text-sm text-fg-subtle">
                        Select a page or create a new one
                    </div>
                )}
            </div>
        </div>
    )
}
