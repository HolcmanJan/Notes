# Notes

Osobní webová aplikace (PWA) bez buildu: čisté HTML, CSS a JavaScript. Funguje v prohlížeči i jako aplikace na ploše telefonu, offline i s přihlášením přes Google a synchronizací přes Firebase.

## Moduly

| Stránka | Co dělá |
|---|---|
| `recepty.html` | Recepty: přidávání, úprava, hledání a filtrování podle kategorie |
| `rozpocet.html` | Měsíční rozpočet, predikce výdajů, předplatná a export (podrobně v [docs/rozpocet.md](docs/rozpocet.md)) |
| `cviceni.html` | Tréninky, cviky (i vlastní s obrázkem nebo GIFem), šablony a statistiky |
| `palivo.html` | Výpočet ceny cesty za palivo a rozúčtování mezi spolujezdce |
| `zalozky.html` | Záložky s náhledy, složky, Reddit, bookmarklet a volitelné šifrování |
| `hry.html` | Hry: Kanon, Kostky, Mancala, Pavouk, Neon Tower (ve složce `hry-tower/`, postup se po přihlášení ukládá do `users/{uid}/hry/tower`), Sloty & Plenky (inkrementální kasino ve složce `hry-kasino/`, postup jen v `localStorage`) |
| `nastaveni.html` | Nastavení aplikace |

Bez přihlášení se data ukládají jen do `localStorage` v daném prohlížeči. Po přihlášení přes Google se ukládají do Firestore pod `users/{uid}` a synchronizují mezi zařízeními.

## Spuštění

Aplikace potřebuje statický server; otevření `index.html` přímo ze souboru nefunguje, protože prohlížeč přes `file://` nenačte ES moduly ani service worker.

```bash
python3 -m http.server 8000
# pak http://localhost:8000
```

## Firebase

- Konfigurace je v `firebase-init.js` (je veřejná, to je u webových aplikací Firebase normální).
- Ochranu dat zajišťují pravidla v `firestore.rules`: každý uživatel smí číst a zapisovat jen `users/{svoje uid}`. Po změně je nasaď v konzoli Firebase (Firestore → Rules) nebo příkazem `firebase deploy --only firestore:rules`.

## Náhledy záložek (Cloudflare Worker)

`worker/` obsahuje Worker `link-preview`, který stahuje náhledy stránek a JSON z Redditu. Adresy záložek se neposílají žádné cizí službě.

- Worker odpovídá jen webům uvedeným v `DEFAULT_ALLOWED_ORIGINS` (`worker/src/index.js`) nebo v proměnné `ALLOWED_ORIGINS` (čárkami oddělený seznam). Pokud aplikaci provozuješ jinde, doplň tam její adresu.
- Nasazení: `cd worker && npx wrangler deploy`.

## Vývoj

- **Testy:** `npm test` (logika rozpočtu, slučování změn pro Firestore a kontrola adres; spouští se pod Node bez prohlížeče).
- **Cache-busting:** `npm run stamp` doplní ke skriptům, stylům a importům modulů `?v=<hash>`. Aby se spouštěl automaticky před každým commitem, jednou spusť `git config core.hooksPath .githooks`.
- **PWA / offline:** `manifest.webmanifest` + `sw.js` (síť má přednost s limitem 4 s, potom cache; všechny stránky se ukládají předem). Firestore ukládá data do IndexedDB, takže funguje i bez signálu.
- **Chyby:** `app-guard.js` zobrazí červenou lištu při neošetřené chybě na kterékoli stránce.
