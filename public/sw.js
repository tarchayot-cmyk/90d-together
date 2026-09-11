// 90 Days Growing Together — PWA service worker (spec section 35)
//
// v2: navigation requests (HTML pages) are now network-first, so a
// new deploy is always picked up on the next reload. Only static,
// content-hashed assets (Next.js JS/CSS chunks, icons) are
// cache-first, which is safe because their filename changes
// whenever their content does. Supabase requests are never cached.

const CACHE_NAME = "grow-together-v2";
const APP_SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch non-GET, Supabase, or API traffic.
  if (request.method !== "GET" || url.origin.includes("supabase.co") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Page navigations: always try the network first, so deploys show
  // up immediately. Cache is only a fallback for being offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static, content-hashed assets: cache-first is safe and fast.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached)
    )
  );
});
