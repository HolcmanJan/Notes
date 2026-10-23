// Service worker: síť má přednost (vždy čerstvá verze), cache slouží jako offline záloha.
// Při slabém signálu se po NETWORK_TIMEOUT_MS použije verze z cache a síť ji dotáhne na pozadí.
const CACHE = "moje-aplikace-v3";
const NETWORK_TIMEOUT_MS = 4000;
const PRECACHE = [
    "./", "index.html", "recepty.html", "rozpocet.html", "cviceni.html", "palivo.html", "zalozky.html",
    "hry.html", "hry-kanon.html", "hry-kostky.html", "hry-mancala.html", "hry-spider.html", "nastaveni.html",
    "styles.css", "rozpocet.css", "app-guard.js", "firebase-init.js", "navigation.js", "home.js", "app.js",
    "rozpocet.js", "budget-logic.js", "sync-logic.js", "url-utils.js", "cviceni.js", "palivo.js", "zalozky.js",
    "hry.js", "nastaveni.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon.svg",
    "hry-tower/index.html", "hry-tower/css/style.css", "hry-tower/js/lib/pixi.min.js", "hry-tower/js/lib/pixi-filters.js",
    ...["util", "wikidata", "data", "state", "game", "render2d", "render", "icons", "ui", "pages", "more", "main", "cloud"]
        .map((f) => `hry-tower/js/${f}.js`),
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    // Po jednom, ať jeden chybějící soubor nezhodí celé předběžné uložení
    event.waitUntil(caches.open(CACHE).then((c) =>
        Promise.all(PRECACHE.map((url) => c.add(url).catch(() => {})))
    ));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Uloží odpověď a smaže starší verze stejného souboru (jiné ?v=), aby cache nerostla s každým vydáním.
async function store(req, res) {
    const cache = await caches.open(CACHE);
    const url = new URL(req.url);
    const old = await cache.keys(req, { ignoreSearch: true });
    await Promise.all(old.filter((k) => k.url !== req.url && new URL(k.url).pathname === url.pathname)
        .map((k) => cache.delete(k)));
    await cache.put(req, res);
}

async function fromCache(req) {
    return (await caches.match(req)) ||
        (await caches.match(req, { ignoreSearch: true })) ||
        (await caches.match("index.html"));
}

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

    // Vlastní soubory: network-first s časovým limitem, bez HTTP cache prohlížeče, fallback na cache
    const network = fetch(req, { cache: "no-cache" }).then((res) => {
        if (res.ok) event.waitUntil(store(req, res.clone()));
        return res;
    });
    event.waitUntil(network.catch(() => {}));

    event.respondWith(new Promise((resolve) => {
        let done = false;
        const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
        const timer = setTimeout(() => fromCache(req).then(finish), NETWORK_TIMEOUT_MS);
        network
            .then((res) => { clearTimeout(timer); finish(res); })
            .catch(() => { clearTimeout(timer); fromCache(req).then((hit) => finish(hit || Response.error())); });
    }));
});
