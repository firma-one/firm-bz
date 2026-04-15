"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, MailPlus, Shield } from "lucide-react"

import {
  getSystemSignupInvites,
  resendSystemSignupInvite,
  sendSystemAdminSignupInvite,
  type SystemSignupInviteListItem,
  updateSystemSignupInvite,
} from "@/lib/actions/system-admin-signup"

export default function SystemAdminSignupPage() {
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [couponCode, setCouponCode] = useState("")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [invites, setInvites] = useState<SystemSignupInviteListItem[]>([])
  const [invitesLoading, setInvitesLoading] = useState(false)
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)
  const [editingInviteId, setEditingInviteId] = useState<string | null>(null)
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editCouponCode, setEditCouponCode] = useState("")
  const [savingInviteId, setSavingInviteId] = useState<string | null>(null)

  const loadInvites = async () => {
    setInvitesLoading(true)
    const result = await getSystemSignupInvites()
    if (result.success && result.data) {
      setInvites(result.data)
    } else {
      setErrorMessage(result.error || "Failed to load previous invites")
    }
    setInvitesLoading(false)
  }

  useEffect(() => {
    void loadInvites()
  }, [])

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatusMessage(null)
    setErrorMessage(null)
    setIsSubmitting(true)

    const result = await sendSystemAdminSignupInvite({
      email,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      couponCode: couponCode.trim() || undefined,
    })

    if (!result.success) {
      const validationError = result.validationErrors
        ? Object.values(result.validationErrors).flat().join(" ")
        : null
      setErrorMessage(validationError || result.error || "Failed to send invite email")
      setIsSubmitting(false)
      return
    }

    setStatusMessage(
      couponCode.trim()
        ? "Invite email sent with signup link and coupon code."
        : "Invite email sent with signup link."
    )
    await loadInvites()
    setIsSubmitting(false)
  }

  const handleResend = async (inviteId: string) => {
    setStatusMessage(null)
    setErrorMessage(null)
    setResendingInviteId(inviteId)

    const result = await resendSystemSignupInvite(inviteId)
    if (!result.success) {
      setErrorMessage(result.error || "Failed to resend invite")
      setResendingInviteId(null)
      return
    }

    setStatusMessage("Invite resent successfully.")
    await loadInvites()
    setResendingInviteId(null)
  }

  const startEditing = (invite: SystemSignupInviteListItem) => {
    setEditingInviteId(invite.id)
    setEditFirstName(invite.firstName)
    setEditLastName(invite.lastName)
    setEditCouponCode(invite.couponCode || "")
    setStatusMessage(null)
    setErrorMessage(null)
  }

  const cancelEditing = () => {
    setEditingInviteId(null)
    setEditFirstName("")
    setEditLastName("")
    setEditCouponCode("")
  }

  const handleSaveEdit = async (inviteId: string) => {
    setErrorMessage(null)
    setStatusMessage(null)
    setSavingInviteId(inviteId)

    const result = await updateSystemSignupInvite({
      inviteId,
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
      couponCode: editCouponCode.trim() || undefined,
    })

    if (!result.success) {
      const validationError = result.validationErrors
        ? Object.values(result.validationErrors).flat().join(" ")
        : null
      setErrorMessage(validationError || result.error || "Failed to update invite")
      setSavingInviteId(null)
      return
    }

    setStatusMessage("Invite updated.")
    setSavingInviteId(null)
    cancelEditing()
    await loadInvites()
  }

  return (
    <div className="flex flex-col space-y-8">
      <div className="flex flex-col space-y-4">
        <nav className="flex items-center text-sm text-gray-500">
          <Link href="/system" className="flex items-center hover:text-gray-900 transition-colors">
            <Shield className="w-4 h-4" />
          </Link>
          <ChevronRight className="w-4 h-4 mx-2" />
          <Link href="/system" className="hover:text-gray-900 transition-colors">
            Administration
          </Link>
          <ChevronRight className="w-4 h-4 mx-2" />
          <span className="font-medium text-gray-900">Admin Signup Invite</span>
        </nav>

        <div className="flex flex-col">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Admin Signup Invite</h1>
          <p className="text-gray-500 mt-1">
            Send a confirmation email and coupon code to complete signup on a user&apos;s behalf.
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-gray-50/50 p-6 sm:p-8">
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium text-gray-900">
              User Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition focus:border-gray-500"
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="invite-first-name" className="text-sm font-medium text-gray-900">
                First Name
              </label>
              <input
                id="invite-first-name"
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition focus:border-gray-500"
                placeholder="Jane"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-last-name" className="text-sm font-medium text-gray-900">
                Last Name
              </label>
              <input
                id="invite-last-name"
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition focus:border-gray-500"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="coupon-code" className="text-sm font-medium text-gray-900">
              Coupon Code (optional)
            </label>
            <input
              id="coupon-code"
              type="text"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition focus:border-gray-500"
              placeholder="WELCOME20"
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Use this carefully: repeated sends to the same email can hit provider cooldown limits.
          </div>

          {statusMessage ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {statusMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg border border-[#2d6d3a] bg-[#4aba5e] px-4 py-2 text-sm font-semibold text-[#0d1f12] transition hover:bg-[#6bd87c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MailPlus className="h-4 w-4" />
            {isSubmitting ? "Sending..." : "Send Signup Invite"}
          </button>
        </form>
      </div>

      <div className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Previous Invites</h2>
          <button
            type="button"
            onClick={() => void loadInvites()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        {invitesLoading ? (
          <p className="text-sm text-gray-500">Loading invites...</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-gray-500">No invites have been sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Coupon</th>
                  <th className="px-3 py-2">Invites</th>
                  <th className="px-3 py-2">Last Sent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-b border-gray-100 text-gray-800">
                    <td className="px-3 py-2">{invite.email}</td>
                    <td className="px-3 py-2">
                      {editingInviteId === invite.id ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editFirstName}
                            onChange={(event) => setEditFirstName(event.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                            placeholder="First"
                          />
                          <input
                            type="text"
                            value={editLastName}
                            onChange={(event) => setEditLastName(event.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                            placeholder="Last"
                          />
                        </div>
                      ) : (
                        <>{invite.firstName} {invite.lastName}</>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingInviteId === invite.id ? (
                        <input
                          type="text"
                          value={editCouponCode}
                          onChange={(event) => setEditCouponCode(event.target.value.toUpperCase())}
                          className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                          placeholder="Optional"
                        />
                      ) : (
                        invite.couponCode || "-"
                      )}
                    </td>
                    <td className="px-3 py-2">{invite.inviteCount}</td>
                    <td className="px-3 py-2">{new Date(invite.lastInvitedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {invite.isConfirmed ? (
                        <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Confirmed</span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {editingInviteId === invite.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(invite.id)}
                              disabled={savingInviteId === invite.id}
                              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingInviteId === invite.id ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(invite)}
                              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={invite.isConfirmed || resendingInviteId === invite.id}
                              onClick={() => void handleResend(invite.id)}
                              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {resendingInviteId === invite.id ? "Resending..." : "Resend"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
