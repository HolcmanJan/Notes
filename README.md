# Recept

Jednoduchá webová aplikace pro zaznamenávání receptů na vaření. Žádný backend, žádné instalace – stačí otevřít `index.html` v prohlížeči.

## Funkce

- Přidávání, úprava a mazání receptů
- U každého receptu: název, kategorie, počet porcí, doba přípravy, suroviny, postup, poznámky
- Vyhledávání podle textu (název, suroviny, postup, poznámky)
- Filtrování podle kategorie
- **Přihlášení přes Google** – recepty se synchronizují mezi všemi zařízeními přes Firebase Firestore
- Bez přihlášení funguje offline s ukládáním do `localStorage`
- Responzivní design pro mobil i desktop

## Spuštění

```bash
# Stačí otevřít soubor v prohlížeči:
xdg-open index.html        # Linux
open index.html            # macOS
start index.html           # Windows
```

Případně lze servírovat přes libovolný statický server:

```bash
python3 -m http.server 8000
# pak http://localhost:8000
```

## Struktura

- `index.html` – struktura stránky
- `styles.css` – styly
- `app.js` – logika (CRUD, vyhledávání, localStorage)


## Vývoj

- **Testy:** `npm test` (čistá logika rozpočtu v `budget-logic.js`, spouští se pod Node bez prohlížeče).
- **Cache-busting:** `npm run stamp` doplní ke skriptům, stylům a importům modulů `?v=<hash>`. Aby se spouštěl automaticky před každým commitem, jednou spusť `git config core.hooksPath .githooks`.
- **PWA / offline:** `manifest.webmanifest` + `sw.js` (síť má přednost, cache je záloha; Firebase SDK se ukládá pro offline start). Firestore ukládá data do IndexedDB, takže funguje i bez signálu.
- **Chyby:** `app-guard.js` zobrazí červenou lištu při neošetřené chybě na kterékoli stránce.
