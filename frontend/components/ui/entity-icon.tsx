import { Briefcase, Building2, FileText, Folder, HardDrive, Mail, MessagesSquare, Users } from 'lucide-react'
import { ClientIcon } from '@/components/ui/client-icon'
import { DeliverableGlyph } from '@/components/ui/deliverable-icon'
import { DocumentIcon } from '@/components/ui/document-icon'
import { cn } from '@/lib/utils'

/*
 * What an item is, in the marks the app uses for each: Building2 a firm, the handshake a client,
 * Briefcase an engagement, folder-plus a deliverable, Folder a folder, a document's file-type icon
 * when its type is known, MessagesSquare a comment, Mail an invitation, Users members, HardDrive storage.
 */

export type EntityKind = 'firm' | 'client' | 'engagement' | 'deliverable' | 'folder' | 'document' | 'comment' | 'invitation' | 'member' | 'storage'

export const ENTITY_ICON: Record<EntityKind, React.ElementType> = {
    firm: Building2,
    client: ClientIcon,
    engagement: Briefcase,
    deliverable: DeliverableGlyph,
    folder: Folder,
    document: FileText,
    comment: MessagesSquare,
    invitation: Mail,
    member: Users,
    storage: HardDrive,
}

const ENTITY_LABEL: Record<EntityKind, string> = {
    firm: 'Firm',
    client: 'Client',
    engagement: 'Engagement',
    deliverable: 'Deliverable',
    folder: 'Folder',
    document: 'Document',
    comment: 'Comment',
    invitation: 'Invitation',
    member: 'Member',
    storage: 'Storage',
}

export function EntityIcon({ kind, mimeType, className }: { kind: EntityKind; mimeType?: string | null; className?: string }) {
    if (kind === 'document' && mimeType) {
        return (
            <span role="img" aria-label={ENTITY_LABEL.document} className="inline-flex shrink-0">
                <DocumentIcon mimeType={mimeType} className={className} />
            </span>
        )
    }
    const Icon = ENTITY_ICON[kind]
    return <Icon role="img" aria-label={ENTITY_LABEL[kind]} className={cn('shrink-0', className)} />
}
