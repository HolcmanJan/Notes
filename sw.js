// Service worker: síť má přednost (vždy čerstvá verze), cache slouží jako offline záloha.
const CACHE = "moje-aplikace-v1";
const PRECACHE = ["./", "index.html", "styles.css", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    // Firebase SDK ze gstatic: verzované URL se nemění → cache-first (offline start aplikace)
    if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
        event.respondWith(
            caches.match(req).then((hit) => hit || fetch(req).then((res) => {
                if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
                return res;
            }))
        );
        return;
    }

    if (url.origin !== self.location.origin) return;

    // Vlastní soubory: network-first, bez HTTP cache prohlížeče, fallback na cache
    event.respondWith(
        fetch(req, { cache: "no-cache" })
            .then((res) => {
                if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
                return res;
            })
            .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
});
