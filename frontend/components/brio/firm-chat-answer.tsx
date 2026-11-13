'use client'

import { useMemo } from 'react'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import { linkEngagementNames, type FirmChatLink } from '@/lib/ai/firm-chat'
import { useInAppLinks } from '@/lib/hooks/use-in-app-links'

/**
 * A settled answer from Ask Brio about the firm: Markdown, with each quoted engagement name the
 * server resolved turned into a link built by `hrefFor` (the model never supplies a URL). A plain
 * click opens the engagement in place; Cmd or Ctrl-click opens a new tab.
 *
 * Shared by the app's panel (EngagementAiChat with a firm subject) and the tour's (DemoBrioChat),
 * so the two render an answer the same way. Its own component so the router is only needed where a
 * firm answer is on screen.
 */
export function FirmChatAnswer({ answer, links, hrefFor }: {
    answer: string
    links?: readonly FirmChatLink[]
    hrefFor: (link: FirmChatLink) => string
}) {
    const onLinkClick = useInAppLinks()
    const content = useMemo(() => linkEngagementNames(answer, links, hrefFor), [answer, links, hrefFor])
    return (
        <div onClickCapture={onLinkClick}>
            <ChatMarkdown content={content} />
        </div>
    )
}
