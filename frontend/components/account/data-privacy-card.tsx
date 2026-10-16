'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, ShieldAlert, Check } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { SETTINGS_SECTION_HEADING_CLASS } from '@/components/ui/property-list'

/**
 * Export and deletion, the two rights the privacy policy says live in settings.
 *
 * ## Why they sit together and are not symmetrical
 *
 * Export is immediate and changes nothing, so it needs no confirmation. Deletion is neither, so it
 * is a REQUEST: it cascades across firms, clients and engagements, some of which are shared with
 * colleagues, and a person should look at what will actually be removed before it is. The user
 * gets a ticket number and an email when it is done.
 *
 * One card even so. Someone looking for "what can I do with my data" should find both in one
 * place rather than discover deletion only after hunting for it.
 */
export function DataPrivacyCard() {
    const { addToast } = useToast()
    const [exporting, setExporting] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [requesting, setRequesting] = useState(false)
    const [openRequest, setOpenRequest] = useState<{ ticketNumber: string; status: string } | null>(null)

    // An account with a request already in flight should see its state, not a button that would
    // raise a second one.
    useEffect(() => {
        let cancelled = false
        fetch('/api/account/deletion-request')
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => { if (!cancelled) setOpenRequest(body?.data?.open ?? null) })
            .catch(() => { /* The button simply offers to raise one. */ })
        return () => { cancelled = true }
    }, [])

    const exportData = useCallback(async () => {
        setExporting(true)
        try {
            const res = await fetch('/api/account/export')
            if (!res.ok) throw new Error(String(res.status))

            // Downloaded via a blob rather than by navigating to the URL: a navigation would hand
            // the JSON to the browser, which may render it instead of saving it.
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `firmaone-data-export-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch {
            addToast({
                type: 'error',
                title: 'Could not build your export',
                message: 'Please try again, or contact support if it keeps failing.',
            })
        } finally {
            setExporting(false)
        }
    }, [addToast])

    const requestDeletion = useCallback(async () => {
        setRequesting(true)
        try {
            const res = await fetch('/api/account/deletion-request', { method: 'POST' })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body?.error ?? 'failed')

            setOpenRequest({ ticketNumber: body.data.ticketNumber, status: 'NEW' })
            setConfirming(false)
            addToast({
                type: 'success',
                title: `Request ${body.data.ticketNumber} raised`,
                message: 'We will email you when your account has been deleted.',
            })
        } catch {
            addToast({
                type: 'error',
                title: 'Could not raise the request',
                message: 'Please try again, or contact support.',
            })
        } finally {
            setRequesting(false)
        }
    }, [addToast])

    return (
        <section>
            <h3 className={SETTINGS_SECTION_HEADING_CLASS}>Your data</h3>

            {/* Linear-style rows: what it does on the left, one button on the right — no card. */}
            <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0 flex-1">
                    <p className="text-ui font-medium text-fg">Download your data</p>
                    <p className="mt-0.5 text-small text-fg-muted">
                        Your profile, memberships, activity and AI usage, as a JSON file. Your
                        documents stay in your own storage and are not part of this.
                    </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void exportData()} disabled={exporting} className="shrink-0">
                    {exporting
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…</>
                        : <><Download className="h-3.5 w-3.5" /> Download</>}
                </Button>
            </div>

            <div className="border-t border-line">
                <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1">
                        <p className="text-ui font-medium text-fg">Delete your account</p>
                        <p className="mt-0.5 text-small text-fg-muted">
                            {/* The exceptions are stated HERE, not only in the policy. Someone
                                about to delete their account is the one person who needs to know
                                what survives it, and sending them to a legal page to find out is
                                not telling them. */}
                            Your profile, memberships and sign-in are erased, and we email you when
                            it is done. Audit records of what you did remain, and a workspace shared
                            with colleagues carries on without you.
                        </p>
                    </div>
                    {openRequest ? (
                        // The status lives HERE, not on the support page.
                        //
                        // That page is gated on `canManageOrganization` and needs a firm context,
                        // so an engagement member or an external collaborator — exactly the people
                        // most likely to want their account gone — would be redirected away from
                        // the only place their ticket was visible. A right that leaves the holder
                        // unable to see whether it is being honoured is not much of a right.
                        <Tag color="gray" className="shrink-0" icon={<Check />}>
                            {openRequest.status === 'IN_PROGRESS' ? 'In progress' : 'Requested'}
                            {' · '}{openRequest.ticketNumber}
                        </Tag>
                    ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)} className="shrink-0 text-danger hover:text-danger">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Request deletion
                        </Button>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                icon={<ShieldAlert className="h-5 w-5" />}
                iconVariant="red"
                title="Request account deletion"
                subtitle="We will confirm by email when it is done."
                description={
                    <>
                        Your profile, memberships and sign-in credentials will be erased. Your files
                        in your own storage are never touched. Audit records of actions you took
                        remain, and any workspace you share with colleagues continues without you.
                    </>
                }
                confirmLabel="Request deletion"
                confirmVariant="red"
                loading={requesting}
                onCancel={() => setConfirming(false)}
                onConfirm={() => void requestDeletion()}
            />
        </section>
    )
}
