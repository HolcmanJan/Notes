// Sdílený ochranný skript: viditelná chybová lišta + registrace service workeru (PWA/offline).
(function () {
    function showBanner(msg) {
        var b = document.getElementById("app-error-banner");
        if (!b) {
            b = document.createElement("div");
            b.id = "app-error-banner";
            b.setAttribute("role", "alert");
            b.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2000;background:#fee2e2;color:#991b1b;" +
                "border-bottom:1px solid #fca5a5;padding:.5rem .75rem;font:14px system-ui,sans-serif;" +
                "display:flex;gap:.5rem;align-items:center;justify-content:space-between";
            var t = document.createElement("span");
            t.id = "app-error-text";
            var x = document.createElement("button");
            x.type = "button";
            x.textContent = "✕";
            x.setAttribute("aria-label", "Zavřít");
            x.style.cssText = "border:none;background:none;font-size:16px;cursor:pointer;color:inherit";
            x.addEventListener("click", function () { b.remove(); });
            b.appendChild(t);
            b.appendChild(x);
            (document.body || document.documentElement).appendChild(b);
        }
        document.getElementById("app-error-text").textContent = msg;
    }

    function ignorable(msg) {
        return !msg || /ResizeObserver|^Script error\.?$/i.test(msg);
    }

    window.addEventListener("error", function (e) {
        if (e.target && e.target !== window) return;
        if (ignorable(e.message)) return;
        showBanner("Chyba na stránce: " + e.message);
    });

    window.addEventListener("unhandledrejection", function (e) {
        var msg = (e.reason && e.reason.message) || String(e.reason || "");
        if (ignorable(msg)) return;
        showBanner("Chyba při zpracování dat: " + msg);
    });

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("sw.js").catch(function (err) {
                console.warn("Service worker se nepodařilo zaregistrovat:", err);
            });
        });
    }
})();
