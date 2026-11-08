'use client'

import { useCallback, useEffect, useState } from 'react'
import { BRAND_NAME } from '@/config/brand'
import { failureFrom } from '@/lib/files/action-failure'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

export type PushSupportState = 'unsupported' | 'default' | 'granted' | 'denied'

/** Turning push on or off: done, or why not, in words for people (OT-1, P2-29). */
export type PushChange = { ok: true } | { ok: false; error: string }

/** The browser's own failures (a DOMException from the push service) aren't words for people. */
function pushFailure(e: unknown): string {
  if (e instanceof TypeError) return `Couldn't reach ${BRAND_NAME}. Check your connection and try again.`
  if (e instanceof Error && e.name === 'ServerAnswered') return e.message
  return "This browser couldn't set up notifications. Try again, or try another browser."
}

/** A refusal from /api/push/subscribe, marked so pushFailure keeps its words. */
async function serverRefusal(res: Response): Promise<Error> {
  const err = await failureFrom(res)
  err.name = 'ServerAnswered'
  return err
}

/**
 * Client-side Web Push registration. Registers the service worker (idempotent) and exposes
 * an explicit `subscribe()` action to trigger the browser's native permission prompt — never
 * called automatically, since browsers throttle/block auto-prompts on page load.
 *
 * `subscribed` follows what the server stored (OT-1): a subscription the server refused is taken
 * back in the browser, so the switch never reads On while no push can arrive; turning off asks the
 * server first and keeps the switch On if it refuses. Both answer why when they can't.
 */
export function useRegisterPush() {
  const [supportState, setSupportState] = useState<PushSupportState>('unsupported')
  const [subscribing, setSubscribing] = useState(false)
  // Whether THIS browser currently holds a push subscription. null = not yet determined,
  // so callers can avoid rendering a toggle in the wrong position before the check lands.
  const [subscribed, setSubscribed] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupportState('unsupported')
      setSubscribed(false)
      return
    }
    setSupportState(Notification.permission as PushSupportState)
    navigator.serviceWorker.register('/sw.js').then(async () => {
      // Resolve the real subscription state rather than assuming "off" on every mount —
      // a subscription survives reloads, so defaulting to off misreports it to the user.
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setSubscribed(Boolean(subscription))
      } catch {
        setSubscribed(false)
      }
    }).catch(() => {
      // Registration failure just means push stays unavailable — not fatal to the app.
      setSubscribed(false)
    })
  }, [])

  const subscribe = useCallback(async (): Promise<PushChange> => {
    if (typeof window === 'undefined') return { ok: false, error: "This browser can't show notifications." }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) return { ok: false, error: `Push notifications aren't set up for ${BRAND_NAME} yet.` }

    setSubscribing(true)
    let subscription: PushSubscription | null = null
    try {
      const permission = await Notification.requestPermission()
      setSupportState(permission as PushSupportState)
      if (permission === 'denied') {
        return { ok: false, error: "Notifications are blocked for this site. Allow them in your browser's site settings, then try again." }
      }
      if (permission !== 'granted') return { ok: false, error: 'The browser asked for permission and none was given. Try again and choose Allow.' }

      const registration = await navigator.serviceWorker.ready
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const json = subscription.toJSON()

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!res.ok) throw await serverRefusal(res)
      setSubscribed(true)
      return { ok: true }
    } catch (e) {
      // The server didn't store it, so no push would arrive: take it back here too.
      await subscription?.unsubscribe().catch(() => {})
      setSubscribed(false)
      return { ok: false, error: pushFailure(e) }
    } finally {
      setSubscribing(false)
    }
  }, [])

  const unsubscribe = useCallback(async (): Promise<PushChange> => {
    if (typeof window === 'undefined') return { ok: true }
    setSubscribing(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { setSubscribed(false); return { ok: true } }
      // The server first: while it still has the subscription, pushes keep coming, so the switch stays On.
      const res = await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      if (!res.ok) throw await serverRefusal(res)
      // The server no longer sends here; the browser's own copy is best-effort.
      await subscription.unsubscribe().catch(() => {})
      setSubscribed(false)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: pushFailure(e) }
    } finally {
      setSubscribing(false)
    }
  }, [])

  return { supportState, subscribing, subscribed, subscribe, unsubscribe }
}
