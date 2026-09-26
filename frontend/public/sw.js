// Web Push service worker. Push-only — no offline asset caching, so no install/activate
// caching logic is needed. See .claude/plans/firm-settings-event-email-and-push-notifications.md (Part B).

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Firma', body: event.data.text() }
  }

  const title = payload.title || 'Firma'
  const options = {
    body: payload.body || '',
    icon: '/logo-120x120.png',
    badge: '/logo-120x120.png',
    data: { ctaUrl: payload.ctaUrl || '/' },
    tag: payload.tag || undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const ctaUrl = event.notification.data?.ctaUrl || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of allClients) {
        if (client.url.includes(ctaUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(ctaUrl)
      }
    })()
  )
})
