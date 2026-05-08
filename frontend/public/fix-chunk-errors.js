if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (var registration of registrations) {
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
