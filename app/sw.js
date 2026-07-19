/* Pfennigfuchser App — Service Worker.
   Shell: cache-first (offline-fähig). today.json: network-first (immer frische Preise),
   offline aus dem Cache. Navigation: immer index.html (auch mit ?query). */
const CACHE = "pf-app-v5";
const SHELL = [
  "./", "./index.html", "./app.js", "./styles.css", "./manifest.webmanifest",
  "./favicon.svg",
  "./fonts/DejaVuSansMono.woff2", "./fonts/DejaVuSansMono-Bold.woff2",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Navigation (App-Start, auch ?src=pwa) -> immer die Shell, offline-sicher
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // today.json: network-first, Cache-Buster ignorieren, unter kanonischem Schlüssel ablegen
  if (req.url.indexOf("today.json") !== -1) {
    const canon = new Request(req.url.split("?")[0]);
    e.respondWith(
      fetch(req)
        .then((r) => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(canon, cp)); } return r; })
        .catch(() => caches.match(canon, { ignoreSearch: true }))
    );
    return;
  }

  // Shell: cache-first (ignoreSearch, damit Query nie den Treffer verfehlt)
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
