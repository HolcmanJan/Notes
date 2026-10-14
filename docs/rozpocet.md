# Rozpočet – dokumentace

Stránka `rozpocet.html` slouží ke sledování výdajů v měsíčním rozpočtovém období, k plánování (predikci) výdajů a ke správě opakujících se plateb (předplatných). Data se ukládají lokálně v prohlížeči a po přihlášení přes Google se synchronizují s Firebase Firestore.

## 1. Uživatelská příručka

### 1.1 Rozpočtové období
- Výchozí období trvá od **14. do 13.** následujícího měsíce. Šipky `‹` `›` přepínají mezi obdobími, tlačítko **Aktuální období** vrací na dnešek.
- Do pole **Rozpočet na období** zadáš částku, kterou chceš v období utratit. Ukládá se automaticky.
- **Nový měsíc** (viditelné jen v aktuálním období, a ne první den období) ukončí aktuální období k dnešku a začne nové od dnešního dne. Záznamy od dneška se přesunou do nového období. Před provedením se zobrazí potvrzovací pruh. Vlastní začátky se ukládají a ovlivňují následující období (přirozené 14. se nahradí).

### 1.2 Přehled čísel
Čtyři karty nad kalendářem:

| Karta | Význam |
|---|---|
| Rozpočet | Zadaný rozpočet období |
| Utraceno | Součet výdajů + zaúčtovaných předplatných |
| Zůstatek | Rozpočet − utraceno; šipka ▲/▼ ukazuje, zda jsi nad/pod průměrným tempem |
| Denně | Kolik můžeš utratit dnes (viz vzorce níže) |

V záložce Predikce jsou karty Plánováno, Skutečné, Odchylka a Volné.

### 1.3 Kalendář a zápis výdajů
- Klik na den otevře popup: nahoře formulář (částka, popis, **Přidat**), pod ním seznam položek dne. Položku lze upravit (✎) nebo smazat (✕).
- Při otevřeném popupu zůstávají ostatní dny klikatelné – kliknutím přeskočíš na další den. Klik mimo popup ho zavře.
- Barva dne: šedá = bez výdaje, zelená = do denního budgetu, oranžová = do 150 %, červená = nad 150 %.
- Odznak `N×` v levém horním rohu = počet položek ve dni. **Modrá tečka** v pravém horním rohu = ve dni je platba předplatného.

### 1.4 Hromadné přidání
Tlačítko **Hromadné přidání** nad kalendářem: zadáš částku a popis → **Dál – vybrat dny** → klikáním v kalendáři vybereš dny (zmodrají) → **Přidat**. Tlačítko je neaktivní, dokud není vybraný alespoň jeden den. Lišta dole ukazuje počet dnů a celkovou částku; **Upravit** vrací k formuláři, **Zrušit** vše ruší.

### 1.5 Šablony
**Šablony ▾** → seznam uložených předvyplněných výdajů (název + částka). Klik na šablonu spustí hromadné přidání s předvyplněnými údaji. U šablony lze ✎ upravit a ✕ smazat; **＋ Nová šablona** vytvoří novou. Šablony jsou společné pro Přehled i Predikci.

### 1.6 Předplatná
Rozbalovací pole **Předplatná** (pod kartami) obsahuje seznam řazený podle dne v měsíci a formulář: název, částka, den v měsíci, **Od** (výchozí začátek aktuálního období) a nepovinné **Do**.
- Platba se automaticky objeví ve svůj den v každém období v rozmezí Od–Do. U měsíců bez daného dne (např. 31.) se strhne poslední den měsíce.
- **Výdaje:** platba se počítá do „Utraceno“ od svého dne. V popupu dne má tlačítko **✓ zaplaceno / nezaplaceno**, kterým lze automatický stav ručně přepsat (např. platba se nestrhla).
- **Predikce:** platba se počítá vždy, i u budoucích dnů.
- Smazání předplatného ho odstraní i z historie; pro ukončení se zachováním historie nastav datum **Do**.

### 1.7 Predikce
Záložka **Predikce** má vlastní kalendář plánovaných výdajů (stejný popup, hromadné přidání a šablony).
- Barvy: minulé dny porovnávají skutečnost s plánem (bez plánu s průměrným denním budgetem), budoucí dny plán s průměrným denním budgetem.
- **→ výdaj** u plánované položky ji převede na skutečný výdaj (plán zůstane, položka se označí „✓ převedeno“); **Převést vše na výdaje** převede celý den.
- **Převzít plán z minulého období** zkopíruje plán z předchozího období na stejná čísla dnů (bez duplicit) a pokud je rozpočet prázdný, převezme i jeho částku.

### 1.8 Výdaje podle popisu
Rozbalovací pole pod kalendářem Přehledu seskupí výdaje období podle popisu (bez ohledu na velikost písmen, prázdný = „Bez popisu“) a ukáže součet, počet a poměrný sloupec. Zahrnuje i zaúčtovaná předplatná.

### 1.9 Export a záloha
- **Stáhnout CSV tohoto období** – sloupce `Datum;Typ;Částka;Popis` (typy: Výdaj, Předplatné, Plán, Plán (převedeno)), UTF-8 s BOM pro Excel.
- **Zálohovat všechna data (JSON)** – všechna období, predikce, předplatná, šablony a vlastní začátky období. Obnova ze zálohy zatím není implementována.

## 2. Výpočty

- **Denní budget (aktuální období):** `(rozpočet − výdaje před dneškem) / počet zbývajících dnů včetně dneška`. Dnešní hodnota se v průběhu dne nemění.
- **Denní budget (jiné období):** `rozpočet / počet dnů období`.
- **Šipka u zůstatku:** porovnává zůstatek s očekávaným `rozpočet − (rozpočet / dnů) × uplynulé dny`.
- **Zaúčtování předplatného:** ruční stav (`paid[datum]`) má přednost, jinak platí `datum ≤ dnes`.

## 3. Technická dokumentace

### 3.1 Soubory
| Soubor | Účel |
|---|---|
| `rozpocet.html` | Struktura stránky (hlavička, záložky, panely, předplatná, export) |
| `rozpocet.js` | Stav, vykreslování, popupy, ukládání, Firestore |
| `budget-logic.js` | Čistá logika bez DOM/Firebase (období, migrace, předplatná, agregace, CSV, převzetí plánu) |
| `tests/budget-logic.test.mjs` | Testy logiky (`npm test`) |
| `styles.css` | Styly (sdílené s ostatními stránkami) |
| `navigation.js`, `firebase-init.js` | Sdílená navigace a inicializace Firebase |

### 3.2 Datový model
```text
Položka:      { id, amount, desc, done? }          // done jen u plánu
Den:          "YYYY-MM-DD" -> [Položka]
Období:       { amount, expenses: { den -> [Položka] } }
Predikce:     { den -> [Položka] }
Předplatné:   { id, name, amount, day, since, until?, paid?: { den: bool } }
Šablona:      { id, name, amount }
```
Starší formát (`den -> číslo`) se při načtení automaticky převede (`migrateEntries`).

### 3.3 Úložiště
| Data | localStorage | Firestore (`users/{uid}/budget/…`) |
|---|---|---|
| Období | `recept.budget.v1` (`{ začátek: období }`) | dokument `{začátek období}` |
| Predikce | `recept.budget.predict.v1` | dokument `predict-{začátek}` → `{ predictions }` |
| Vlastní začátky | `recept.budget.customStarts` | `_meta` → `{ customStarts }` |
| Předplatná | `recept.budget.subs.v1` | `_subs` → `{ subs }` |
| Šablony | `recept.budget.templates.v1` | `_templates` → `{ templates }` |

Nepřihlášený uživatel používá jen localStorage. Přihlášený čte období přes `onSnapshot`, ostatní dokumenty přes `getDoc`. Zápisy jsou odložené (debounce 400 ms). Firestore má zapnutou offline cache (IndexedDB).

### 3.4 Načítání a odolnost
- Do načtení dat se místo kalendáře zobrazuje točící se kolečko; při chybě nebo po 15 s se zobrazí chybová hláška.
- Předplatná a šablony se načítají souběžně a kalendář neblokují. Načtení vlastních začátků období má limit 8 s.
- Pokud stránka postrádá prvky očekávané skriptem (zastaralá cache), jednou se sama obnoví.
- `app-guard.js` zobrazuje červenou lištu při neošetřené chybě; `sw.js` zajišťuje offline režim (PWA).

### 3.5 UI poznámky
- Popupy jsou vykresleny v pevně umístěném modálním kontejneru (`.budget-modal-backdrop`), takže je mobilní klávesnice neposouvá (`interactive-widget=resizes-visual`). Popup dne nemá pozadí a nepřekrývá kalendář pro klikání.
- Vstupní pole mají na dotykových zařízeních písmo 16 px, aby iOS při zaostření nepřibližoval stránku.
- Žádné `prompt()` ani `confirm()` – vše běží v inline prvcích (fungují na mobilu).

### 3.6 Vývoj
- `npm test` – testy logiky; `npm run stamp` – doplní `?v=hash` k souborům (cache-busting).
- Po změně `styles.css` nebo skriptů spusť `npm run stamp` (nebo aktivuj hook: `git config core.hooksPath .githooks`).
