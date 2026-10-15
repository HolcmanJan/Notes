// Bezpečná práce s adresami (bez DOM) – testovatelná pod Node.

// true jen pro absolutní http(s) adresu; javascript:, data: a podobné vrací false.
export function isHttpUrl(url) {
    if (typeof url !== "string" || !url.trim()) return false;
    try {
        const u = new URL(url.trim());
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

// Adresa vhodná do href/src: http(s) projde, cokoli jiného se nahradí bezpečnou hodnotou.
export function safeHref(url, fallback = "#") {
    return isHttpUrl(url) ? url.trim() : fallback;
}
