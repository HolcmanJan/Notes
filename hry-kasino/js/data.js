// Sloty & Plenky – herní data: automaty, vylepšení, strom RAM, CraptoMachine, úspěchy, kosmetika.
// Inspirováno hrou Slots & Diapers (viz dq7reimagined.com/slots-and-diapers/).

export const FLOOR_COLS = 4;
export const FLOOR_SLOTS = 16;
export const START_SLOTS = 6;
export const START_CHIPS = 15;
export const REBOOT_AT = 5e4;
export const DIGITAL_COST = 2e5;
export const ALLIN_AT = 2.5e10;

// ram = základní RAM rezervoár typu automatu na jeden běh (jackpoty z něj „vypouštějí“ RAM)
export const MACHINES = [
    { id: "cherry", name: "Třešňový automat", short: "Třešně", icon: "🍒", reel: ["🍒", "🍋", "🍊", "🍒"], cost: 15, pay: 1, time: 2, jp: 0.02, jpMult: 25, ram: 1 },
    { id: "bell", name: "Zvonkový automat", short: "Zvonky", icon: "🔔", reel: ["🔔", "⭐", "🍒", "🔔"], cost: 400, pay: 14, time: 3, jp: 0.02, jpMult: 25, ram: 1 },
    { id: "diamond", name: "Diamantový automat", short: "Diamanty", icon: "💎", reel: ["💎", "💰", "⭐", "💎"], cost: 9000, pay: 180, time: 4, jp: 0.02, jpMult: 25, ram: 1 },
    { id: "clover", name: "Jetelový automat", short: "Jetel", icon: "🍀", reel: ["🍀", "🌈", "🪙", "🍀"], cost: 3.5e5, pay: 4200, time: 5, jp: 0.02, jpMult: 25, ram: 2, digital: true },
    { id: "dice", name: "Kostkový automat", short: "Kostky", icon: "🎲", reel: ["🎲", "🃏", "♠️", "🎲"], cost: 1.5e7, pay: 1.1e5, time: 6, jp: 0.02, jpMult: 25, ram: 3, digital: true },
    { id: "dragon", name: "Dračí automat", short: "Drak", icon: "🐉", reel: ["🐉", "🔥", "🏮", "🐉"], cost: 7e8, pay: 3e6, time: 8, jp: 0.02, jpMult: 25, ram: 4, digital: true },
];
export const MACH = Object.fromEntries(MACHINES.map((m, i) => [m.id, { ...m, idx: i }]));

// cena = cena automatu × costMult × growth^úroveň
export const MACHINE_UPGRADES = [
    { id: "pay", name: "Výplata", desc: "Výhra ×1,4", max: 10, costMult: 4, growth: 2.1 },
    { id: "jp", name: "Šance na jackpot", desc: "+1 % šance na jackpot", max: 8, costMult: 6, growth: 2.2 },
    { id: "jpx", name: "Velký jackpot", desc: "Jackpot +15×", max: 5, costMult: 10, growth: 2.6 },
    { id: "speed", name: "Rychlé válce", desc: "Točí o 8 % rychleji", max: 5, costMult: 8, growth: 2.4 },
];

export const CURSOR_UPGRADES = [
    { id: "sticky", name: "Lepkavé prsty", desc: "Kapky sbíráš pouhým přejetím prstem nebo myší.", max: 1, cost: 250, growth: 1 },
    { id: "wide", name: "Širší kurzor", desc: "Větší dosah sbírání přejetím.", max: 3, cost: 1500, growth: 6, req: "sticky" },
    { id: "hover", name: "Točení přejetím", desc: "Přejetím roztočíš volné automaty.", max: 1, cost: 2e4, growth: 1, req: "sticky" },
    { id: "gold", name: "Zlatý prst", desc: "Tvoje vlastní zatočení vyplácí +50 %.", max: 5, cost: 800, growth: 5 },
    { id: "magnet", name: "Magnet na kapky", desc: "Kapky se po 3 s seberou samy.", max: 1, cost: 2e6, growth: 1 },
];

export const GAMBLER_UPGRADES = [
    { id: "stamina", name: "Výdrž", desc: "+15 zatočení, než hráč usne.", max: 8, cost: 300, growth: 2.6 },
    { id: "hands", name: "Rychlé ruce", desc: "−12 % pauza mezi zatočeními.", max: 5, cost: 500, growth: 3 },
    { id: "luck", name: "Šťastná plenka", desc: "+0,5 % šance na jackpot u hráčů.", max: 5, cost: 2000, growth: 3.5 },
    { id: "bet", name: "Vysoké sázky", desc: "Hráči vyhrávají o 25 % víc.", max: 6, cost: 5000, growth: 3.2 },
    { id: "coffee", name: "Kávovar", desc: "Spící hráči se po 20 s probudí sami.", max: 1, cost: 1e6, growth: 1 },
];

export const GAMBLER_BASE = { cost: 80, growth: 1.7, stamina: 20, delay: 1.5, poop: 0.06 };
export const EXPANSION = { cost: 300, growth: 4 };

// Strom permanentních vylepšení (RAM). r = řádek, c = sloupec v mřížce stromu.
export const PERMA = [
    { id: "rebirth", name: "Znovuzrození", icon: "🔁", cost: 1, r: 0, c: 2, req: [], desc: "Všechny automaty vyplácí o 25 % víc žetonů." },

    { id: "cherryLegend", name: "Třešňová legenda I", icon: "🍒", cost: 1, r: 1, c: 0, req: ["rebirth"], desc: "+1 do RAM rezervoáru Třešňového automatu." },
    { id: "bpCherry", name: "Plány: Třešně", icon: "📐", cost: 2, r: 2, c: 0, req: ["cherryLegend"], desc: "Vylepšení Třešňových automatů zůstávají po Rebootu." },
    { id: "permaCherry", name: "Věčné třešně", icon: "🍒", cost: 3, r: 3, c: 0, req: ["bpCherry"], desc: "Třešňové automaty zůstávají po Rebootu na podlaze." },
    { id: "bpBell", name: "Plány: Zvonky a diamanty", icon: "📐", cost: 3, r: 4, c: 0, req: ["permaCherry", "bellLegend"], desc: "Vylepšení Zvonkových a Diamantových automatů zůstávají po Rebootu." },
    { id: "bpDigital", name: "Plány: Digitál", icon: "🧬", cost: 8, r: 5, c: 0, req: ["bpBell", "digitalLegend"], desc: "Digitální věk i vylepšení digitálních automatů zůstávají po Rebootu." },

    { id: "startCap", name: "Startovní kapitál", icon: "💼", cost: 2, r: 1, c: 1, req: ["rebirth"], desc: "Každý běh začínáš s 5 000 žetony." },
    { id: "bellLegend", name: "Zvonková legenda", icon: "🔔", cost: 2, r: 2, c: 1, req: ["cherryLegend"], desc: "+1 do RAM rezervoáru Zvonkového automatu." },
    { id: "diamondLegend", name: "Diamantová legenda", icon: "💎", cost: 3, r: 3, c: 1, req: ["bellLegend"], desc: "+2 do RAM rezervoáru Diamantového automatu." },
    { id: "doubleDown", name: "Zdvojení 25 %", icon: "✌️", cost: 4, r: 4, c: 1, req: ["diamondLegend"], desc: "25% šance, že výplata RAM bude dvojitá." },
    { id: "digitalLegend", name: "Digitální legenda", icon: "💽", cost: 6, r: 5, c: 1, req: ["doubleDown"], desc: "+2 do RAM rezervoáru každého digitálního automatu." },

    { id: "rebirth2", name: "Znovuzrození II", icon: "🔁", cost: 3, r: 1, c: 2, req: ["rebirth"], desc: "Všechny automaty vyplácí o dalších 50 % víc." },
    { id: "floorMaster", name: "Mistr podlahy", icon: "🖱️", cost: 5, r: 2, c: 2, req: ["rebirth2"], desc: "Vylepšení kurzoru zůstávají po Rebootu." },
    { id: "keepFloor", name: "Stavební povolení", icon: "🏗️", cost: 4, r: 3, c: 2, req: ["floorMaster"], desc: "Rozšíření podlahy zůstávají po Rebootu." },
    { id: "rebirth3", name: "Znovuzrození III", icon: "🔁", cost: 7, r: 4, c: 2, req: ["keepFloor"], desc: "Všechny automaty vyplácí dvojnásobek." },
    { id: "doubleDown50", name: "Zdvojení 50 %", icon: "✌️", cost: 9, r: 5, c: 2, req: ["rebirth3", "doubleDown"], desc: "Šance na dvojitou výplatu RAM stoupne na 50 %." },

    { id: "addicted1", name: "Závislák I", icon: "🎰", cost: 1, r: 1, c: 3, req: ["rebirth"], desc: "Hráči točí automat, u kterého sedí, dvakrát." },
    { id: "adrenaline", name: "Adrenalin", icon: "⚡", cost: 1, r: 2, c: 3, req: ["addicted1"], desc: "Sebrání RAM probudí všechny hráče a dá jim 300% rychlost na 15 s." },
    { id: "smelling", name: "Čichací sůl", icon: "🧂", cost: 2, r: 3, c: 3, req: ["adrenaline"], desc: "Probuzený hráč dostane 300% rychlost na 15 s." },
    { id: "bingo", name: "Bingo legenda", icon: "🐋", cost: 4, r: 4, c: 3, req: ["smelling"], desc: "Každý běh dostaneš Velrybu – vymaxovaného hráče, který nikdy nespí a má víc štěstí." },
    { id: "addicted2", name: "Závislák II", icon: "🎰", cost: 5, r: 5, c: 3, req: ["bingo"], desc: "Hráči točí automat třikrát." },
    { id: "keepGamblers", name: "Odbory hráčů", icon: "🪪", cost: 6, r: 6, c: 3, req: ["addicted2"], desc: "Hráči i jejich vylepšení zůstávají po Rebootu." },

    { id: "crapto", name: "Crapto X5", icon: "💩", cost: 1, r: 1, c: 4, req: ["rebirth"], desc: "Odemkne prostřední linii CraptoMachine a rozšíří ji na 5 válců." },
    { id: "highFiber", name: "Vláknina", icon: "🥦", cost: 2, r: 2, c: 4, req: ["crapto"], desc: "Hráči kakají o 50 % častěji." },
    { id: "speedBoost", name: "Odemknout Zrychlení", icon: "⏩", cost: 2, r: 3, c: 4, req: ["highFiber"], desc: "Za Craptoměnu zrychlíš na 30 s všechny automaty i hráče." },
    { id: "lines2", name: "Crapto: spodní linie", icon: "➖", cost: 3, r: 4, c: 4, req: ["speedBoost"], desc: "Odemkne spodní linii CraptoMachine." },
    { id: "plunger", name: "Šťastný zvon na záchod", icon: "🪠", cost: 4, r: 5, c: 4, req: ["lines2"], desc: "Válce CraptoMachine častěji padají ve shodě." },
    { id: "lines3", name: "Crapto: úhlopříčky", icon: "✖️", cost: 6, r: 6, c: 4, req: ["plunger"], desc: "Odemkne obě úhlopříčné linie CraptoMachine (V a Λ)." },
];
export const PERMA_BY_ID = Object.fromEntries(PERMA.map((p) => [p.id, p]));

// CraptoMachine
export const CRAPTO_BETS = [4, 20, 50, 200];
export const CRAPTO_SYMBOLS = [
    { id: "poop", icon: "💩", w: 0.38 },
    { id: "dia", icon: "💎", w: 0.31 },
    { id: "seven", icon: "7️⃣", w: 0.27 },
    { id: "ram", icon: "💾", w: 0.04 },
];
export const CRAPTO_TIERS = [3, 5, 10, 15];
// Linie jako seznam [řádek, sloupec]; 5 válců × 3 řádky
export const CRAPTO_LINES = {
    top: { name: "Horní", cells: (n) => range(n).map((c) => [0, c]) },
    mid: { name: "Prostřední", cells: (n) => range(n).map((c) => [1, c]) },
    bot: { name: "Spodní", cells: (n) => range(n).map((c) => [2, c]) },
    v: { name: "V", cells: () => [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]] },
    a: { name: "Λ", cells: () => [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]] },
};
// Výplata podle počtu shodných symbolů na políčkách aktivních linií (×3, ×5, ×10, ×15);
// každá celá linie ze stejného symbolu výhru toho symbolu zdvojnásobí
export const CRAPTO_PAY = {
    seven: [8, 24, 40, 80],          // × sázka × nejlepší výhra automatu na podlaze
    dia: [1.5, 4, 12, 50],
    poop: [0.2, 0.5, 1, 2.5],     // × sázka v Craptoměně (návratnost vždy pod 100 %)
    ram: [1, 1, 2, 5],            // RAM (×2 při sázce 200)
};

function range(n) { return Array.from({ length: n }, (_, i) => i); }

export const ACHIEVEMENTS = [
    { id: "firstHigh", name: "První trip", desc: "Trefit první jackpot." },
    { id: "pocket", name: "Drobné", desc: "Vydělat prvních 1 000 žetonů." },
    { id: "bio1", name: "Biohazard 1. stupně", desc: "Sebrat 5 Craptoměny." },
    { id: "janitor", name: "Úklidová služba", desc: "Sebrat 100 Craptoměny." },
    { id: "reboot", name: "Zpátky na začátek", desc: "Provést první Reboot." },
    { id: "addiction", name: "Nová závislost", desc: "Poprvé zatočit CraptoMachine." },
    { id: "decorator", name: "Bytový architekt", desc: "Přesunout 10 automatů nástrojem Přestavba." },
    { id: "diapers", name: "Nové plenky!", desc: "Koupit první kosmetiku." },
    { id: "cherry", name: "Třešňový sběrač", desc: "Vymaxovat všechna vylepšení Třešňového automatu." },
    { id: "liquid", name: "Likvidní aktiva", desc: "Mít najednou 500 Craptoměny." },
    { id: "bell", name: "Zazvoň!", desc: "Vymaxovat všechna vylepšení Zvonkového automatu." },
    { id: "oneMore", name: "Ještě jedno zatočení…", desc: "Hrát 2 hodiny v kuse." },
    { id: "craptoMil", name: "Crapto milionář", desc: "Vydělat 1M žetonů z CraptoMachine." },
    { id: "diamond", name: "Hnědé diamanty", desc: "Vymaxovat všechna vylepšení Diamantového automatu." },
    { id: "ramMgmt", name: "Správa R.A.M.", desc: "Odemknout 10 permanentních vylepšení." },
    { id: "industrial", name: "Průmyslová revoluce", desc: "Koupit první digitální automat." },
    { id: "clover", name: "Jetelová párty", desc: "Vymaxovat všechna vylepšení Jetelového automatu." },
    { id: "why", name: "Proč?", desc: "Probudit spící hráče 250×." },
    { id: "craptastic", name: "Craptastické", desc: "Odemknout všechny linie CraptoMachine." },
    { id: "dice", name: "Cinknuté kostky", desc: "Vymaxovat všechna vylepšení Kostkového automatu." },
    { id: "onePct", name: "To jedno procento", desc: "Odemknout všechna permanentní vylepšení." },
    { id: "pension", name: "Penzijní plán", desc: "Hrát celkem 5 hodin." },
    { id: "truth", name: "Pravda je tam venku", desc: "Dosáhnout konce hry." },
    { id: "pointer", name: "Ukazovátko", desc: "Vymaxovat všechna vylepšení kurzoru." },
    { id: "fullHouse", name: "Plný dům", desc: "Zaplnit automaty všech 16 míst na podlaze." },
    { id: "autoRollers", name: "Auto-hráči", desc: "Vymaxovat všechna vylepšení hráčů." },
    { id: "craptoGrand", name: "Crapto Grand", desc: "Trefit na CraptoMachine jackpot 15× shoda." },
    { id: "dragon", name: "Dračí technologie", desc: "Vymaxovat všechna vylepšení Dračího automatu." },
    { id: "royale", name: "Crapto Royale", desc: "Protočit v CraptoMachine 100 000 Craptoměny." },
    { id: "rich", name: "Smradlavé bohatství", desc: "Vydělat celkem 100B žetonů." },
];
export const ACH_BONUS = 0.02;

export const COSMETICS = [
    { id: "carpetGreen", kind: "carpet", name: "Zelené sukno", cost: 0 },
    { id: "carpetRed", kind: "carpet", name: "Rudý samet", cost: 40 },
    { id: "carpetNeon", kind: "carpet", name: "Neonová noc", cost: 120 },
    { id: "carpetGold", kind: "carpet", name: "Zlatý luxus", cost: 300 },
    { id: "diaperWhite", kind: "diaper", name: "Bílé plenky", cost: 0 },
    { id: "diaperPink", kind: "diaper", name: "Růžové plenky", cost: 10 },
    { id: "diaperCamo", kind: "diaper", name: "Maskáčové plenky", cost: 60 },
    { id: "diaperGold", kind: "diaper", name: "Zlaté plenky", cost: 250 },
];

export const ENDING_LINES = [
    "Válce se roztočí. Celé kasino ztichne.",
    "Hráči v plenkách přestanou křičet. Automaty přestanou blikat.",
    "Najednou ti dojde, že tady nikdy nešlo o výhru.",
    "Žádní jiní hráči tu nikdy nebyli. Jen ty – a tlačítko ZATOČIT.",
    "Reboot za Rebootem. Paměť za pamětí. Každá vzpomínka skončila v sázce.",
    "Poslední symbol dopadá…",
    "👽",
    "Pravda je tam venku. Ale tady uvnitř se to pořád točí.",
];
