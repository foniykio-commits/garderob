const VERSION = "v4";
const SHELL_CACHE = `garderob-shell-${VERSION}`;
const DATA_CACHE = `garderob-data-${VERSION}`;
const MEDIA_CACHE = `garderob-media-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, DATA_CACHE, MEDIA_CACHE]);
const SHELL = ["/", "/assets/styles.css", "/assets/app.js", "/manifest.webmanifest", "/assets/icon-192.png", "/assets/icon-512.png"];
const READ_API = ["/api/items", "/api/meta", "/api/profile", "/api/today", "/api/stats", "/api/stylist/history", "/api/calendar"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => !KEEP.has(key)).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

function isReadApi(pathname) {
  return READ_API.some((path) => pathname === path || pathname.startsWith(`${path}?`));
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/media/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }
  if (isReadApi(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(networkFirst(request, SHELL_CACHE).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
});
