'use client'

import { Switch } from '@/components/ui/switch'
import { useRegisterPush } from '@/lib/hooks/use-register-push'
import { Bell, BellOff } from 'lucide-react'

/**
 * User-level opt-in for Web Push notifications. Registration is greenfield (see
 * .claude/plans/firm-settings-event-email-and-push-notifications.md, Part B) — this is the
 * one deliberate user action that triggers the browser's native permission prompt.
 */
export function PushNotificationToggle() {
  const { supportState, subscribing, subscribed, subscribe, unsubscribe } = useRegisterPush()

  if (supportState === 'unsupported') return null

  // `subscribed` is null until the service worker reports back; treat that as off for
  // rendering but keep the switch disabled so it cannot be toggled from an unknown state.
  const enabled = subscribed === true

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      await subscribe()
    } else {
      await unsubscribe()
    }
  }

  // A Linear-style switch row (it sits in the Profile page's Notifications section).
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex shrink-0 text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">
          {enabled ? <Bell /> : <BellOff />}
        </span>
        <label htmlFor="push-notifications" className="min-w-0 cursor-pointer">
          <span className="block text-ui text-fg">Push notifications on this device</span>
          <span className="mt-0.5 block text-small text-fg-muted">
            {supportState === 'denied'
              ? 'Notifications are blocked in your browser settings for this site.'
              : 'Get a native notification here when events your firm has turned on happen.'}
          </span>
        </label>
      </div>
      <Switch
        id="push-notifications"
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={subscribing || subscribed === null || supportState === 'denied'}
        aria-label="Push notifications"
      />
    </div>
  )
}
