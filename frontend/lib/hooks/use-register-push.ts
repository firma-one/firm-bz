'use client'

import { useCallback, useEffect, useState } from 'react'

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

/**
 * Client-side Web Push registration. Registers the service worker (idempotent) and exposes
 * an explicit `subscribe()` action to trigger the browser's native permission prompt — never
 * called automatically, since browsers throttle/block auto-prompts on page load.
 */
export function useRegisterPush() {
  const [supportState, setSupportState] = useState<PushSupportState>('unsupported')
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupportState('unsupported')
      return
    }
    setSupportState(Notification.permission as PushSupportState)
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure just means push stays unavailable — not fatal to the app.
    })
  }, [])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) return false

    setSubscribing(true)
    try {
      const permission = await Notification.requestPermission()
      setSupportState(permission as PushSupportState)
      if (permission !== 'granted') return false

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const json = subscription.toJSON()

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      return true
    } catch {
      return false
    } finally {
      setSubscribing(false)
    }
  }, [])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined') return
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    } catch {
      // Best-effort cleanup — a stale subscription will be pruned server-side on next failed send anyway.
    }
  }, [])

  return { supportState, subscribing, subscribe, unsubscribe }
}
