/* Bengaluru Eats service worker — offline shell.
   ponytail: network-first for everything same-origin (deploys always
   land), cache fallback when offline. App data itself lives in
   localStorage/Supabase, so this only needs to keep the shell alive. */
const CACHE = 'be-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/script.js', '/config.js', '/supabase.js', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Supabase / fonts: straight to network
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() =>
      caches.match(e.request).then(hit => hit || caches.match('/index.html'))
    )
  );
});
