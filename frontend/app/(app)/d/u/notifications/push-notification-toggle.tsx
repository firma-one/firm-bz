'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { useRegisterPush } from '@/lib/hooks/use-register-push'
import { Bell, BellOff } from 'lucide-react'

/**
 * User-level opt-in for Web Push notifications. Registration is greenfield (see
 * .claude/plans/firm-settings-event-email-and-push-notifications.md, Part B) — this is the
 * one deliberate user action that triggers the browser's native permission prompt.
 */
export function PushNotificationToggle() {
  const { supportState, subscribing, subscribe, unsubscribe } = useRegisterPush()
  const [enabled, setEnabled] = useState(false)

  if (supportState === 'unsupported') return null

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      const ok = await subscribe()
      setEnabled(ok)
    } else {
      await unsubscribe()
      setEnabled(false)
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-start gap-2.5">
        {enabled ? (
          <Bell className="h-4 w-4 text-[#45474c] mt-0.5 shrink-0" />
        ) : (
          <BellOff className="h-4 w-4 text-[#45474c] mt-0.5 shrink-0" />
        )}
        <div>
          <div className="text-sm font-semibold text-[#1b1b1d]">Push notifications</div>
          <p className="text-xs text-[#45474c] mt-0.5">
            {supportState === 'denied'
              ? 'Notifications are blocked in your browser settings for this site.'
              : 'Get a native notification on this device when events you\'ve enabled in Firm Settings occur.'}
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={subscribing || supportState === 'denied'}
        aria-label="Push notifications"
      />
    </div>
  )
}
