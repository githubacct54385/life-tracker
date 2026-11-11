// Service worker (FND-05). It caches the app shell only: the page and its built script, style and icon files.
// It never touches /api/*, non-GET requests, or other origins, so no private data is ever stored (AC-FND-05.2).
const SHELL_CACHE = "shell-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isShellRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return false;
  return true;
}

// Only a plain successful same-origin answer is stored. A redirect (for example to the sign-in page) never is.
function storable(response) {
  return response.ok && response.type === "basic" && !response.redirected;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isShellRequest(request, url)) return; // the browser handles it: nothing is cached

  if (request.mode === "navigate") {
    // Network first so a new release shows up; fall back to the cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (storable(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put("/", copy)));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error())),
    );
    return;
  }

  // Built files are fingerprinted, so the cache copy is always right. Anything else same-origin goes to the network first.
  const fingerprinted = url.pathname.startsWith("/assets/");
  event.respondWith(
    (fingerprinted ? caches.match(request) : Promise.resolve(undefined)).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (storable(response)) {
              const copy = response.clone();
              event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(request, copy)));
            }
            return response;
          })
          .catch(() => caches.match(request).then((c) => c || Response.error())),
    ),
  );
});
