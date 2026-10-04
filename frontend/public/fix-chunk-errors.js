// Sweeps stale service workers that cause ChunkLoadError. MUST skip the Web Push worker
// (/sw.js): unregistering it destroys the browser's push subscription, so an unconditional
// sweep silently killed push on every page load — the subscription was recreated by the
// toggle and torn down again on the next navigation.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (var registration of registrations) {
      var worker = registration.active || registration.waiting || registration.installing;
      var scriptUrl = (worker && worker.scriptURL) || '';
      if (scriptUrl.indexOf('/sw.js') !== -1) continue;
      registration.unregister();
    }
  });
}

window.addEventListener('error', function(e) {
  if (e.message && e.message.includes('Loading chunk') && e.message.includes('failed')) {
    if ('caches' in window) {
      caches.keys().then(function(names) {
        for (var name of names) { caches.delete(name); }
      });
    }
    setTimeout(function() { window.location.reload(); }, 100);
  }
}, true);

window.addEventListener('unhandledrejection', function(e) {
  if (e.reason && typeof e.reason === 'string' && e.reason.includes('Loading chunk')) {
    e.preventDefault();
    if ('caches' in window) {
      caches.keys().then(function(names) {
        for (var name of names) { caches.delete(name); }
      });
    }
    setTimeout(function() { window.location.reload(); }, 100);
  }
});
