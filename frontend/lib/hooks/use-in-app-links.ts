'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Sends a click on an in-app link through the router, for a click handler on a container
 * (`onClickCapture`). ChatMarkdown opens every link it doesn't own in a new tab; an engagement link
 * in a Brio answer should open in place, like the engagement list's rows. A modified click (new
 * tab, new window) is left to the browser, and so is any link that leaves the app.
 */
export function useInAppLinks() {
    const router = useRouter()
    return useCallback((e: React.MouseEvent<HTMLElement>) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        const anchor = (e.target as HTMLElement).closest('a')
        const href = anchor?.getAttribute('href')
        if (!href || !href.startsWith('/') || href.startsWith('//')) return
        e.preventDefault()
        router.push(href)
    }, [router])
}
