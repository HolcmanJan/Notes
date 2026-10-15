# Rozpočet – dokumentace

Stránka `rozpocet.html` slouží ke sledování výdajů v měsíčním rozpočtovém období, k plánování (predikci) výdajů a ke správě opakujících se plateb (předplatných). Data se ukládají lokálně v prohlížeči a po přihlášení přes Google se synchronizují s Firebase Firestore.

## 1. Uživatelská příručka

### 1.1 Rozpočtové období
- Výchozí období trvá od **14. do 13.** následujícího měsíce. Šipky `‹` `›` přepínají období, pod datem je stav („Aktuální období · den 7 z 31“).
- Klepnutím na datum se otevře menu: **Aktuální období** (když prohlížíš jiné období) a **Nový měsíc** (jen v aktuálním období a ne první den). Nový měsíc ukončí období k dnešku, nové začne dnes a záznamy od dneška se do něj přesunou (potvrzovací pruh pod přepínačem). Nové období je kvůli tomu delší (přirozené 14. se nahradí).

### 1.2 Hlavní karta
**Přehled:** hlavní číslo je **zůstatek**, pod ním pruh čerpání se značkou tempa (svislá čárka = kolik by sis měl/a do dneška utratit při rovnoměrném tempu). Štítek **Pod tempem / Nad tempem** nahrazuje dřívější šipku. Dole: **Dnes můžeš** (denní limit), **Utraceno** a **Rozpočet** – klepnutím na něj ho upravíš přímo v kartě.
**Predikce:** tmavá karta s plánovanou částkou, štítkem **Volné / Přes plán**, pruhem plán vs. skutečnost a trojicí Skutečné / Odchylka / Volné.

### 1.3 Akce a kalendář
- **Výdaj dnes** (jen v aktuálním období) otevře zápis pro dnešek; **Šablony** a **Hromadně** viz níže.
- V kalendáři je vidět částka dne, dnešek má rámeček, **modrá tečka** značí platbu předplatného. Barvy: zelená = do limitu, žlutá = do 150 %, červená = nad 150 % (legenda je pod kalendářem).

### 1.4 Spodní panel dne
Klepnutí na den otevře spodní panel:
- **pruh sedmi dnů** týdne – klepnutím přeskočíš na jiný den (dny mimo období jsou zašedlé);
- **Denní limit** a **Ještě můžeš** (u Predikce Průměr / den a Plán dne);
- karta **předplatného** dne s přepínačem **Zaplaceno** (automaticky: strhne se v den platby; ruční přepnutí se označí „Nastaveno ručně“);
- formulář **Částka + Popis**, rychlé **šablony** (klepnutí přidá rovnou) a **+ Nová**;
- **Položky dne** se součtem; ✎ upraví, 🗑 smaže. V Predikci má položka **→ výdaj** (převede plán na skutečný výdaj) a dole je **Převést vše na výdaje**.
Panel zavřeš tlačítkem ✕, klepnutím mimo nebo klávesou Esc.

### 1.5 Hromadné přidání
Celoobrazovkový průvodce: **1 Částka a popis** → **2 Vyber dny**. Ve druhém kroku je nahoře souhrn („Snídaně · 45 Kč“, tlačítko **Upravit**), klepáním v kalendáři vybereš dny (zmodrají s fajfkou) a spodní lišta ukazuje **počet dnů a součet**. **Přidat** je neaktivní, dokud není vybrán aspoň jeden den. Tlačítko Zpět (nebo **Zrušit**) průvodce zavře.

### 1.6 Šablony
Tlačítko **Šablony** otevře panel se seznamem šablon (název + částka). Klepnutí na šablonu spustí hromadné přidání rovnou na kroku výběru dnů. U šablony lze ✎ upravit, 🗑 smazat, **Nová šablona** vytvoří další. Šablony jsou společné pro Přehled i Predikci.

### 1.7 Předplatná
Na přehledu je karta s počtem plateb, měsíčním součtem a **Nejbližšími platbami**. Tlačítko **Spravovat** otevře samostatnou obrazovku:
- modrá karta **Měsíčně celkem** (počet aktivních a podíl na rozpočtu),
- seznam seřazený podle dne v měsíci s další platbou,
- formulář **Nové předplatné / Upravit předplatné**: název, částka, den v měsíci, **Od** a nepovinné **Do**.
Platba se objeví ve svůj den v každém období v rozmezí Od–Do (u kratších měsíců poslední den). Do výdajů se počítá od dne platby (lze přepsat přepínačem Zaplaceno), do predikce vždy. **Smazání** je až v úpravě předplatného a vyžaduje potvrzení, protože odstraní i historii; pro ukončení se zachováním historie nastav datum **Do**.

### 1.8 Predikce
Záložka **Predikce** má vlastní kalendář plánu (stejný panel dne, šablony a hromadné přidání). **Převzít plán z minulého období** zkopíruje plán na stejná čísla dnů (bez duplicit) a prázdný rozpočet doplní z minulého období.

### 1.9 Podle popisu, export a záloha
- **Podle popisu** seskupí výdaje období podle popisu (bez ohledu na velikost písmen) se součtem, počtem a sloupcem; zahrnuje i zaúčtovaná předplatná.
- **CSV období** (`Datum;Typ;Částka;Popis`, UTF-8 s BOM pro Excel) a **Záloha (JSON)** všech dat. Obnova ze zálohy zatím není implementována.

## 2. Výpočty

- **Denní budget (aktuální období):** `(rozpočet − výdaje před dneškem) / počet zbývajících dnů včetně dneška`. Dnešní hodnota se v průběhu dne nemění.
- **Denní budget (jiné období):** `rozpočet / počet dnů období`.
- **Šipka u zůstatku:** porovnává zůstatek s očekávaným `rozpočet − (rozpočet / dnů) × uplynulé dny`.
- **Zaúčtování předplatného:** ruční stav (`paid[datum]`) má přednost, jinak platí `datum ≤ dnes`.

## 3. Technická dokumentace

### 3.1 Soubory
| Soubor | Účel |
|---|---|
| `rozpocet.html` | Kostra stránky (období, hlavní karta, přepínač, panely, celoobrazovkové pohledy, spodní panel) |
| `rozpocet.css` | Vzhled stránky (redesign, písmo Manrope, tokeny `--bx-*`) |
| `rozpocet.js` | Stav, vykreslování (pomocník `h()`), spodní panel, průvodce, správa předplatných, ukládání, Firestore |
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

Nepřihlášený uživatel používá jen localStorage. Přihlášený čte období přes `onSnapshot`, ostatní dokumenty přes `getDoc`. Zápisy jsou odložené (debounce 400 ms) a při skrytí nebo zavření stránky se odešlou hned. Do Firestore se posílají jen změněné dny a pole (`setDoc` s `merge`, rozdíl počítá `diffDoc` v `sync-logic.js`), takže souběžné úpravy z více zařízení se nepřepíšou; na potvrzení serveru se nečeká. Firestore má zapnutou offline cache (IndexedDB).

### 3.4 Načítání a odolnost
- Do načtení dat se místo kalendáře zobrazuje točící se kolečko; při chybě nebo po 15 s se zobrazí chybová hláška.
- Předplatná a šablony se načítají souběžně a kalendář neblokují. Načtení vlastních začátků období má limit 8 s.
- Pokud stránka postrádá prvky očekávané skriptem (zastaralá cache), jednou se sama obnoví.
- `app-guard.js` zobrazuje červenou lištu při neošetřené chybě; `sw.js` zajišťuje offline režim (PWA).

### 3.5 UI poznámky
- Rozhraní se celé překresluje z jednoho stavu (`render()`); rozepsané hodnoty formulářů drží „koncepty“ (`entryDraft`, `bulkDraft`, `subDraft`, `tplDraft`) a po překreslení se obnoví i zaostřené pole (`data-k`), takže synchronizace z cloudu nepřeruší psaní.
- Spodní panel je `position: fixed`, vyplňuje výšku obrazovky a je ukotven dole; s `interactive-widget=resizes-visual` ho mobilní klávesnice neposouvá.
- Průvodce hromadného přidání a správa předplatných jsou celoobrazovkové pohledy napojené na historii prohlížeče (`pushState`/`popstate`), takže tlačítko Zpět je zavře.
- Všechna vstupní pole mají písmo 16 px (iOS nepřibližuje), ovládací prvky mají min. 44 px, ikony jsou čárové SVG.
- Žádné `prompt()` ani `confirm()` – potvrzení jsou vložené prvky.

### 3.6 Vývoj
- `npm test` – testy logiky; `npm run stamp` – doplní `?v=hash` k souborům (cache-busting).
- Po změně `styles.css` nebo skriptů spusť `npm run stamp` (nebo aktivuj hook: `git config core.hooksPath .githooks`).
