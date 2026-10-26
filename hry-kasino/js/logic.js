// Sloty & Plenky – herní logika bez DOM. Stav je obyčejný objekt, který jde uložit do JSON.
import {
    FLOOR_COLS, FLOOR_SLOTS, START_SLOTS, START_CHIPS, REBOOT_AT, DIGITAL_COST, ALLIN_AT,
    MACHINES, MACH, MACHINE_UPGRADES, CURSOR_UPGRADES, GAMBLER_UPGRADES, GAMBLER_BASE, EXPANSION,
    PERMA, PERMA_BY_ID, CRAPTO_BETS, CRAPTO_SYMBOLS, CRAPTO_TIERS, CRAPTO_LINES, CRAPTO_PAY,
    ACHIEVEMENTS, ACH_BONUS, COSMETICS,
} from "./data.js";

export const SAVE_KEY = "sloty-plenky-v1";
const DROP_LIFE = 25;
const MAX_DROPS = 30;

// Události pro UI (výhry, kapky, úspěchy…); UI si je každý snímek vybere
export const events = [];
const emit = (type, data = {}) => { events.push({ type, ...data }); };

let rnd = Math.random;
export function setRandom(fn) { rnd = fn; }

// ---------- formátování ----------
const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "−" + fmt(-n);
    if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1).replace(".", ",") : String(Math.floor(n));
    let i = 0;
    while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
    const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return s.replace(/\.?0+$/, (z) => (s.includes(".") ? "" : z)).replace(".", ",") + SUFFIX[i];
}
export function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`;
}

// ---------- stav ----------
export function newState() {
    const S = {
        v: 1,
        chips: START_CHIPS, poop: 0, ram: 0,
        perma: {},
        ach: {},
        stats: {
            lifeChips: 0, lifePoop: 0, poopSpent: 0, craptoChips: 0, craptoSpins: 0, craptoRam: 0,
            wakes: 0, moves: 0, reboots: 0, jackpots: 0, ramTotal: 0, playTime: 0, bestGrand: 0,
        },
        cos: { owned: { carpetGreen: true, diaperWhite: true }, carpet: "carpetGreen", diaper: "diaperWhite" },
        crapto: { bet: 4, grid: null },
        ended: false,
        run: null,
        session: 0,
    };
    S.run = newRun(S);
    return S;
}

function newRun(S) {
    const run = {
        earned: 0,
        slots: START_SLOTS,
        floor: Array(FLOOR_SLOTS).fill(null),
        mUp: {}, cursor: {}, gUp: {},
        gamblers: [],
        digital: false,
        reservoir: {},
        drops: [], nextDrop: 1,
        boostT: 0,
        inflation: 0,
    };
    for (const m of MACHINES) run.reservoir[m.id] = reservoirSize(S, m.id);
    if (S.perma.bingo) run.gamblers.push(newGambler(true));
    return run;
}

function newMachine(t) { return { t, spin: 0, dur: 0, by: "" }; }

function newGambler(whale = false) {
    return { m: -1, stam: GAMBLER_BASE.stamina, sleep: false, sleepT: 0, cd: 0, boost: 0, whale };
}

export function reservoirSize(S, t) {
    const p = S.perma;
    let n = MACH[t].ram;
    if (t === "cherry" && p.cherryLegend) n += 1;
    if (t === "bell" && p.bellLegend) n += 1;
    if (t === "diamond" && p.diamondLegend) n += 2;
    if (MACH[t].digital && p.digitalLegend) n += 2;
    return n;
}

// ---------- násobiče a statistiky ----------
export function achCount(S) { return Object.keys(S.ach).length; }
export function globalMult(S) {
    const p = S.perma;
    let m = 1;
    if (p.rebirth) m *= 1.25;
    if (p.rebirth2) m *= 1.5;
    if (p.rebirth3) m *= 2;
    return m * (1 + ACH_BONUS * achCount(S));
}
const lvl = (obj, id) => (obj && obj[id]) || 0;

export function machineStats(S, t) {
    const d = MACH[t], u = S.run.mUp[t];
    return {
        pay: d.pay * Math.pow(1.4, lvl(u, "pay")) * globalMult(S),
        jp: d.jp + 0.01 * lvl(u, "jp"),
        jpMult: d.jpMult + 15 * lvl(u, "jpx"),
        time: d.time * Math.pow(0.92, lvl(u, "speed")),
    };
}

export function neighbors(slot) {
    const r = Math.floor(slot / FLOOR_COLS), c = slot % FLOOR_COLS, out = [];
    if (r > 0) out.push(slot - FLOOR_COLS);
    if (r < FLOOR_SLOTS / FLOOR_COLS - 1) out.push(slot + FLOOR_COLS);
    if (c > 0) out.push(slot - 1);
    if (c < FLOOR_COLS - 1) out.push(slot + 1);
    return out;
}
// +10 % za každého souseda stejného typu
export function adjacency(S, slot) {
    const m = S.run.floor[slot];
    if (!m) return 1;
    return 1 + 0.1 * neighbors(slot).filter((s) => S.run.floor[s] && S.run.floor[s].t === m.t).length;
}

export function boostActive(S) { return S.run.boostT > 0; }
const speedMult = (S) => (boostActive(S) ? 2 : 1);

// ---------- automaty ----------
export function countType(S, t) { return S.run.floor.filter((m) => m && m.t === t).length; }
export function machineCost(S, t) { return Math.ceil(MACH[t].cost * Math.pow(1.15, countType(S, t))); }
export function machineAvailable(S, t) { return !MACH[t].digital || S.run.digital; }

export function buyMachine(S, slot, t) {
    const run = S.run;
    if (slot >= run.slots || run.floor[slot] || !machineAvailable(S, t)) return false;
    const cost = machineCost(S, t);
    if (S.chips < cost) return false;
    S.chips -= cost;
    run.floor[slot] = newMachine(t);
    if (MACH[t].digital) S.stats.digitalBought = (S.stats.digitalBought || 0) + 1;
    assignGamblers(S);
    return true;
}

export function sellValue(S, slot) {
    const m = S.run.floor[slot];
    if (!m) return 0;
    return Math.floor(MACH[m.t].cost * Math.pow(1.15, countType(S, m.t) - 1) * 0.4);
}
export function sellMachine(S, slot) {
    const m = S.run.floor[slot];
    if (!m) return false;
    const v = sellValue(S, slot);
    for (const g of S.run.gamblers) if (g.m === slot) g.m = -1;
    S.run.floor[slot] = null;
    S.chips += v;
    assignGamblers(S);
    return true;
}

export function moveMachine(S, from, to) {
    const run = S.run;
    if (from === to || to >= run.slots || from >= run.slots || !run.floor[from]) return false;
    const a = run.floor[from], b = run.floor[to];
    run.floor[to] = a; run.floor[from] = b;
    for (const g of run.gamblers) {
        if (g.m === from) g.m = to;
        else if (g.m === to) g.m = from;
    }
    S.stats.moves++;
    return true;
}

export function spinMachine(S, slot, by = "c", g = null) {
    const m = S.run.floor[slot];
    if (!m || m.spin > 0) return false;
    let dur = machineStats(S, m.t).time / speedMult(S);
    if (g && g.boost > 0) dur /= 3;
    m.spin = m.dur = dur;
    m.by = by;
    if (by === "c") emit("spinStart", { slot });
    return true;
}

function finishSpin(S, slot) {
    const run = S.run, m = run.floor[slot];
    const st = machineStats(S, m.t);
    const g = m.by === "g" ? run.gamblers.find((x) => x.m === slot) : null;
    const rolls = g ? (S.perma.addicted2 ? 3 : S.perma.addicted1 ? 2 : 1) : 1;
    let total = 0, jackpot = false, poop = 0;
    for (let i = 0; i < rolls; i++) {
        let v = st.pay;
        let jp = st.jp;
        if (m.by === "c") v *= 1 + 0.5 * lvl(run.cursor, "gold");
        if (g) {
            const gu = g.whale ? maxed(GAMBLER_UPGRADES) : run.gUp;
            v *= 1 + 0.25 * lvl(gu, "bet");
            jp += 0.005 * lvl(gu, "luck");
            if (g.whale) jp *= 2;
            if (rnd() < GAMBLER_BASE.poop * (S.perma.highFiber ? 1.5 : 1)) poop += 1 + MACH[m.t].idx * 2;
        }
        if (rnd() < jp) { v *= st.jpMult; jackpot = true; }
        total += v;
    }
    total *= adjacency(S, slot);
    addChips(S, total);
    emit("win", { slot, amount: total, jackpot });
    if (jackpot) {
        S.stats.jackpots++;
        if (run.reservoir[m.t] > 0 && rnd() < 0.35) {
            run.reservoir[m.t]--;
            addDrop(S, "ram", ramPayout(S, 1), slot);
        }
    }
    if (poop) addDrop(S, "poop", poop, slot);
    m.spin = 0; m.by = "";
}

function maxed(list) { return Object.fromEntries(list.map((u) => [u.id, u.max])); }

export function addChips(S, n) {
    S.chips += n;
    S.run.earned += n;
    S.stats.lifeChips += n;
}

function ramPayout(S, n) {
    const dd = S.perma.doubleDown50 ? 0.5 : S.perma.doubleDown ? 0.25 : 0;
    return rnd() < dd ? n * 2 : n;
}

// ---------- kapky (Craptoměna a RAM) ----------
function addDrop(S, k, n, slot) {
    const run = S.run;
    if (run.drops.length >= MAX_DROPS) collectDrop(S, run.drops[0].id);
    const d = { id: run.nextDrop++, k, n, s: slot, x: 0.15 + rnd() * 0.7, y: 0.15 + rnd() * 0.6, t: 0 };
    run.drops.push(d);
    emit("drop", { drop: d });
}

export function collectDrop(S, id, auto = false) {
    const run = S.run, i = run.drops.findIndex((d) => d.id === id);
    if (i < 0) return false;
    const d = run.drops[i];
    run.drops.splice(i, 1);
    if (d.k === "poop") {
        S.poop += d.n;
        S.stats.lifePoop += d.n;
    } else {
        S.ram += d.n;
        S.stats.ramTotal += d.n;
        if (S.perma.adrenaline) for (const g of run.gamblers) { wake(S, g, false); g.boost = 15; }
    }
    emit("collect", { drop: d, auto });
    return true;
}

// ---------- hráči ----------
export function gamblerCost(S) {
    const hired = S.run.gamblers.filter((g) => !g.whale).length;
    return Math.ceil(GAMBLER_BASE.cost * Math.pow(GAMBLER_BASE.growth, hired));
}
export function machineCount(S) { return S.run.floor.filter(Boolean).length; }
export function canHire(S) { return S.run.gamblers.length < machineCount(S) && S.chips >= gamblerCost(S); }

export function hireGambler(S) {
    if (!canHire(S)) return false;
    S.chips -= gamblerCost(S);
    S.run.gamblers.push(newGambler());
    assignGamblers(S);
    return true;
}

// Volní hráči si sedají k nejlepším automatům bez hráče
export function assignGamblers(S) {
    const run = S.run;
    const taken = new Set(run.gamblers.filter((g) => g.m >= 0 && run.floor[g.m]).map((g) => g.m));
    for (const g of run.gamblers) if (g.m >= 0 && !run.floor[g.m]) g.m = -1;
    const free = run.floor.map((m, i) => (m && !taken.has(i) ? i : -1)).filter((i) => i >= 0)
        .sort((a, b) => MACH[run.floor[b].t].idx - MACH[run.floor[a].t].idx);
    for (const g of run.gamblers) {
        if (g.m >= 0) continue;
        if (!free.length) break;
        g.m = free.shift();
    }
}

export function gamblerAt(S, slot) { return S.run.gamblers.find((g) => g.m === slot) || null; }
export function maxStamina(S) { return GAMBLER_BASE.stamina + 15 * lvl(S.run.gUp, "stamina"); }
function gamblerDelay(S, g) {
    const gu = g.whale ? maxed(GAMBLER_UPGRADES) : S.run.gUp;
    return GAMBLER_BASE.delay * Math.pow(0.88, lvl(gu, "hands"));
}

function wake(S, g, manual) {
    if (!g.sleep) return false;
    g.sleep = false; g.sleepT = 0;
    g.stam = maxStamina(S);
    if (manual) {
        S.stats.wakes++;
        if (S.perma.smelling) g.boost = 15;
    }
    return true;
}
export function wakeAt(S, slot) {
    const g = gamblerAt(S, slot);
    return g ? wake(S, g, true) : false;
}
export function wakeAll(S) {
    let n = 0;
    for (const g of S.run.gamblers) if (wake(S, g, true)) n++;
    return n;
}
export function sleepingCount(S) { return S.run.gamblers.filter((g) => g.sleep).length; }

// ---------- vylepšení za žetony ----------
export function machineUpCost(S, t, id) {
    const u = MACHINE_UPGRADES.find((x) => x.id === id);
    const l = lvl(S.run.mUp[t], id);
    if (l >= u.max) return Infinity;
    return Math.ceil(MACH[t].cost * u.costMult * Math.pow(u.growth, l));
}
export function buyMachineUp(S, t, id) {
    const c = machineUpCost(S, t, id);
    if (S.chips < c) return false;
    S.chips -= c;
    const u = (S.run.mUp[t] ||= {});
    u[id] = (u[id] || 0) + 1;
    return true;
}
export function machineMaxed(S, t) {
    return MACHINE_UPGRADES.every((u) => lvl(S.run.mUp[t], u.id) >= u.max);
}

function listCost(list, obj, id) {
    const u = list.find((x) => x.id === id), l = lvl(obj, id);
    if (l >= u.max) return Infinity;
    return Math.ceil(u.cost * Math.pow(u.growth, l));
}
export function cursorCost(S, id) { return listCost(CURSOR_UPGRADES, S.run.cursor, id); }
export function cursorAvailable(S, id) {
    const u = CURSOR_UPGRADES.find((x) => x.id === id);
    return !u.req || lvl(S.run.cursor, u.req) > 0;
}
export function buyCursor(S, id) {
    const c = cursorCost(S, id);
    if (!cursorAvailable(S, id) || S.chips < c) return false;
    S.chips -= c;
    S.run.cursor[id] = lvl(S.run.cursor, id) + 1;
    return true;
}
export function cursorLevel(S, id) { return lvl(S.run.cursor, id); }

export function gamblerUpCost(S, id) { return listCost(GAMBLER_UPGRADES, S.run.gUp, id); }
export function buyGamblerUp(S, id) {
    const c = gamblerUpCost(S, id);
    if (S.chips < c) return false;
    S.chips -= c;
    S.run.gUp[id] = lvl(S.run.gUp, id) + 1;
    if (id === "stamina") for (const g of S.run.gamblers) if (!g.sleep) g.stam += 15;
    return true;
}
export function gamblerLevel(S, id) { return lvl(S.run.gUp, id); }

export function expansionCost(S) {
    if (S.run.slots >= FLOOR_SLOTS) return Infinity;
    return Math.ceil(EXPANSION.cost * Math.pow(EXPANSION.growth, S.run.slots - START_SLOTS));
}
export function buyExpansion(S) {
    const c = expansionCost(S);
    if (S.chips < c) return false;
    S.chips -= c;
    S.run.slots++;
    return true;
}

export function canUnlockDigital(S) { return !S.run.digital && countType(S, "diamond") > 0; }
export function unlockDigital(S) {
    if (!canUnlockDigital(S) || S.chips < DIGITAL_COST) return false;
    S.chips -= DIGITAL_COST;
    S.run.digital = true;
    return true;
}

// ---------- aktivní schopnost Zrychlení ----------
export function boostCost(S) { return 30 + 10 * MACH[bestType(S) || "cherry"].idx; }
export function useBoost(S) {
    if (!S.perma.speedBoost || boostActive(S) || S.poop < boostCost(S)) return false;
    S.poop -= boostCost(S);
    S.run.boostT = 30;
    return true;
}
function bestType(S) {
    let best = null;
    for (const m of S.run.floor) if (m && (!best || MACH[m.t].idx > MACH[best].idx)) best = m.t;
    return best;
}

// ---------- Reboot a RAM strom ----------
export function rebootUnlocked(S) { return S.run.earned >= REBOOT_AT; }
export function rebootBonus(S) {
    if (!rebootUnlocked(S)) return 0;
    return Math.max(0, Math.floor(Math.log10(Math.max(S.run.earned, REBOOT_AT) / REBOOT_AT)));
}

export function reboot(S) {
    if (!rebootUnlocked(S)) return false;
    const old = S.run;
    for (const d of [...old.drops]) if (d.k === "ram") collectDrop(S, d.id, true);
    S.ram += rebootBonus(S);
    S.stats.ramTotal += rebootBonus(S);
    const p = S.perma;
    const run = newRun(S);
    if (p.keepFloor) run.slots = old.slots;
    if (p.permaCherry) {
        const cherries = old.floor.map((m, i) => (m && m.t === "cherry" ? i : -1)).filter((i) => i >= 0);
        let next = 0;
        for (const i of cherries) {
            let slot = i < run.slots && !run.floor[i] ? i : -1;
            if (slot < 0) { while (next < run.slots && run.floor[next]) next++; slot = next < run.slots ? next : -1; }
            if (slot >= 0) run.floor[slot] = newMachine("cherry");
        }
    }
    const keepUp = (t) => { if (old.mUp[t]) run.mUp[t] = { ...old.mUp[t] }; };
    if (p.bpCherry) keepUp("cherry");
    if (p.bpBell) { keepUp("bell"); keepUp("diamond"); }
    if (p.bpDigital) { run.digital = old.digital; for (const m of MACHINES) if (m.digital) keepUp(m.id); }
    if (p.floorMaster) run.cursor = { ...old.cursor };
    if (p.keepGamblers) {
        run.gUp = { ...old.gUp };
        run.gamblers = old.gamblers.map((g) => ({ ...newGambler(g.whale), stam: GAMBLER_BASE.stamina + 15 * lvl(run.gUp, "stamina") }));
        if (p.bingo && !run.gamblers.some((g) => g.whale)) run.gamblers.push(newGambler(true));
    }
    S.run = run;
    S.chips = p.startCap ? 5000 : START_CHIPS;
    S.stats.reboots++;
    assignGamblers(S);
    S.crapto.grid = null;
    emit("reboot");
    return true;
}

export function permaOwned(S, id) { return !!S.perma[id]; }
export function permaReachable(S, id) { return PERMA_BY_ID[id].req.every((r) => S.perma[r]); }
export function canBuyPerma(S, id) {
    return S.stats.reboots > 0 && !S.perma[id] && permaReachable(S, id) && S.ram >= PERMA_BY_ID[id].cost;
}
export function buyPerma(S, id) {
    if (!canBuyPerma(S, id)) return false;
    S.ram -= PERMA_BY_ID[id].cost;
    S.perma[id] = true;
    // Nové legendy navýší rezervoár i v aktuálním běhu
    for (const m of MACHINES) {
        const size = reservoirSize(S, m.id), was = reservoirSizeWithout(S, m.id, id);
        if (size > was) S.run.reservoir[m.id] += size - was;
    }
    if (id === "bingo" && !S.run.gamblers.some((g) => g.whale)) { S.run.gamblers.push(newGambler(true)); assignGamblers(S); }
    return true;
}
function reservoirSizeWithout(S, t, id) {
    const saved = S.perma[id];
    delete S.perma[id];
    const n = reservoirSize(S, t);
    S.perma[id] = saved;
    return n;
}
export function permaCount(S) { return Object.keys(S.perma).length; }

// ---------- CraptoMachine ----------
export function craptoUnlocked(S) { return S.stats.reboots > 0; }
export function craptoReels(S) { return S.perma.crapto ? 5 : 3; }
export function craptoLines(S) {
    const p = S.perma, out = ["top"];
    if (p.crapto) out.push("mid");
    if (p.lines2) out.push("bot");
    if (p.lines3) out.push("v", "a");
    return out;
}
export function craptoSpinCost(S, bet = S.crapto.bet) { return Math.ceil(bet * (1 + 0.1 * S.run.inflation)); }
// Hodnota „jednoho zatočení“ nejlepšího automatu – podle ní se škálují výhry v žetonech
export function craptoChipBase(S) {
    let best = MACH.cherry.pay * globalMult(S);
    for (const m of S.run.floor) if (m) best = Math.max(best, machineStats(S, m.t).pay);
    return best;
}

function pickSymbol() {
    let r = rnd();
    for (const s of CRAPTO_SYMBOLS) { if ((r -= s.w) < 0) return s.id; }
    return CRAPTO_SYMBOLS[0].id;
}

export function craptoGenerate(S) {
    const reels = craptoReels(S), hot = pickSymbol(), h = S.perma.plunger ? 0.42 : 0.32;
    const grid = [];
    for (let r = 0; r < 3; r++) {
        grid.push([]);
        for (let c = 0; c < reels; c++) grid[r].push(rnd() < h ? hot : pickSymbol());
    }
    return grid;
}

// Spočítá shody na políčkách aktivních linií (každé políčko jen jednou), plné linie a výhry
export function craptoEvaluate(grid, lines, reels) {
    const cells = new Map(), full = {};
    for (const id of lines) {
        const list = CRAPTO_LINES[id].cells(reels);
        for (const [r, c] of list) cells.set(r * 10 + c, [r, c]);
        const first = grid[list[0][0]][list[0][1]];
        if (list.every(([r, c]) => grid[r][c] === first)) (full[first] ||= []).push(id);
    }
    const bySym = {};
    for (const [r, c] of cells.values()) (bySym[grid[r][c]] ||= []).push([r, c]);
    const wins = [];
    for (const [sym, list] of Object.entries(bySym)) {
        let tier = -1;
        CRAPTO_TIERS.forEach((t, i) => { if (list.length >= t) tier = i; });
        const fullLines = full[sym] || [];
        if (tier >= 0) wins.push({ sym, tier, x: CRAPTO_TIERS[tier], count: list.length, cells: list, fullLines, mult: 2 ** fullLines.length });
    }
    return { wins, active: [...cells.values()] };
}

export function craptoPayouts(S, bet = S.crapto.bet) {
    const base = craptoChipBase(S);
    return {
        seven: CRAPTO_PAY.seven.map((m) => m * bet * base),
        dia: CRAPTO_PAY.dia.map((m) => m * bet * base),
        poop: CRAPTO_PAY.poop.map((m) => Math.round(m * bet)),
        ram: CRAPTO_PAY.ram.map((m) => m * (bet >= 200 ? 2 : 1)),
    };
}

export function craptoSpin(S) {
    if (!craptoUnlocked(S)) return null;
    const bet = S.crapto.bet, cost = craptoSpinCost(S);
    if (!CRAPTO_BETS.includes(bet) || S.poop < cost) return null;
    S.poop -= cost;
    S.stats.poopSpent += cost;
    S.stats.craptoSpins++;
    const reels = craptoReels(S), lines = craptoLines(S);
    const grid = craptoGenerate(S);
    const res = craptoEvaluate(grid, lines, reels);
    const pay = craptoPayouts(S, bet);
    const gained = { chips: 0, poop: 0, ram: 0 };
    for (const w of res.wins) {
        const v = pay[w.sym][w.tier] * w.mult;
        if (w.sym === "poop") { S.poop += v; gained.poop += v; }
        else if (w.sym === "ram") {
            const n = ramPayout(S, v);
            S.ram += n; S.stats.ramTotal += n; S.stats.craptoRam += n; gained.ram += n;
            S.run.inflation += n;
        } else { addChips(S, v); S.stats.craptoChips += v; gained.chips += v; }
        if (w.x === 15) S.stats.bestGrand = 15;
    }
    S.crapto.grid = grid;
    return { grid, ...res, gained, cost };
}

// ---------- All In (konec hry) ----------
export function allInAvailable(S) { return countType(S, "dragon") > 0 && S.run.earned >= ALLIN_AT; }
export function allIn(S) {
    if (!allInAvailable(S)) return false;
    S.chips = 0;
    S.poop = 0;
    S.ended = true;
    S.stats.endings = (S.stats.endings || 0) + 1;
    return true;
}

// ---------- kosmetika ----------
export function buyCosmetic(S, id) {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c) return false;
    if (!S.cos.owned[id]) {
        if (S.poop < c.cost) return false;
        S.poop -= c.cost;
        S.cos.owned[id] = true;
        S.stats.cosBought = (S.stats.cosBought || 0) + 1;
    }
    S.cos[c.kind] = id;
    return true;
}

// ---------- úspěchy ----------
const ACH_CHECK = {
    firstHigh: (S) => S.stats.jackpots > 0,
    pocket: (S) => S.stats.lifeChips >= 1000,
    bio1: (S) => S.stats.lifePoop >= 5,
    janitor: (S) => S.stats.lifePoop >= 100,
    reboot: (S) => S.stats.reboots > 0,
    addiction: (S) => S.stats.craptoSpins > 0,
    decorator: (S) => S.stats.moves >= 10,
    diapers: (S) => (S.stats.cosBought || 0) > 0,
    cherry: (S) => machineMaxed(S, "cherry"),
    liquid: (S) => S.poop >= 500,
    bell: (S) => machineMaxed(S, "bell"),
    oneMore: (S) => S.session >= 7200,
    craptoMil: (S) => S.stats.craptoChips >= 1e6,
    diamond: (S) => machineMaxed(S, "diamond"),
    ramMgmt: (S) => permaCount(S) >= 10,
    industrial: (S) => (S.stats.digitalBought || 0) > 0,
    clover: (S) => machineMaxed(S, "clover"),
    why: (S) => S.stats.wakes >= 250,
    craptastic: (S) => craptoLines(S).length === Object.keys(CRAPTO_LINES).length,
    dice: (S) => machineMaxed(S, "dice"),
    onePct: (S) => permaCount(S) >= PERMA.length,
    pension: (S) => S.stats.playTime >= 18000,
    truth: (S) => S.ended,
    pointer: (S) => CURSOR_UPGRADES.every((u) => lvl(S.run.cursor, u.id) >= u.max),
    fullHouse: (S) => S.run.floor.every(Boolean),
    autoRollers: (S) => GAMBLER_UPGRADES.every((u) => lvl(S.run.gUp, u.id) >= u.max),
    craptoGrand: (S) => S.stats.bestGrand >= 15,
    dragon: (S) => machineMaxed(S, "dragon"),
    royale: (S) => S.stats.poopSpent >= 1e5,
    rich: (S) => S.stats.lifeChips >= 1e11,
};
export function checkAchievements(S) {
    for (const a of ACHIEVEMENTS) {
        if (!S.ach[a.id] && ACH_CHECK[a.id](S)) {
            S.ach[a.id] = Date.now();
            emit("ach", { ach: a });
        }
    }
}

// ---------- hlavní smyčka ----------
let achTimer = 0;
export function tick(S, dt) {
    const run = S.run;
    S.stats.playTime += dt;
    S.session += dt;
    if (run.boostT > 0) run.boostT = Math.max(0, run.boostT - dt);
    const sp = speedMult(S);

    for (let i = 0; i < run.floor.length; i++) {
        const m = run.floor[i];
        if (m && m.spin > 0) {
            m.spin -= dt;
            if (m.spin <= 0) finishSpin(S, i);
        }
    }

    const coffee = lvl(run.gUp, "coffee") > 0;
    for (const g of run.gamblers) {
        if (g.boost > 0) g.boost = Math.max(0, g.boost - dt);
        if (g.m < 0) continue;
        if (g.sleep) {
            if (coffee) { g.sleepT += dt; if (g.sleepT >= 20) wake(S, g, false); }
            continue;
        }
        g.cd -= dt * sp * (g.boost > 0 ? 3 : 1);
        const m = run.floor[g.m];
        if (m && m.spin <= 0 && g.cd <= 0) {
            spinMachine(S, g.m, "g", g);
            g.cd = gamblerDelay(S, g);
            if (!g.whale && --g.stam <= 0) { g.sleep = true; g.sleepT = 0; }
        }
    }

    const magnet = lvl(run.cursor, "magnet") > 0;
    for (const d of [...run.drops]) {
        d.t += dt;
        if (magnet && d.t >= 3) collectDrop(S, d.id, true);
        else if (d.t >= DROP_LIFE) {
            if (d.k === "ram") collectDrop(S, d.id, true);
            else { run.drops.splice(run.drops.indexOf(d), 1); emit("expire", { drop: d }); }
        }
    }

    achTimer += dt;
    if (achTimer >= 0.5) { achTimer = 0; checkAchievements(S); }
}

// ---------- ukládání ----------
export function serialize(S) {
    const { session, ...rest } = S;
    return JSON.stringify(rest);
}
export function deserialize(json) {
    const base = newState();
    let d;
    try { d = JSON.parse(json); } catch { return base; }
    if (!d || typeof d !== "object" || d.v !== 1 || !d.run) return base;
    const S = { ...base, ...d, session: 0 };
    S.stats = { ...base.stats, ...d.stats };
    S.cos = { ...base.cos, ...d.cos, owned: { ...base.cos.owned, ...(d.cos && d.cos.owned) } };
    S.crapto = { ...base.crapto, ...d.crapto };
    const run = { ...newRun(S), ...d.run };
    run.floor = Array.from({ length: FLOOR_SLOTS }, (_, i) => {
        const m = d.run.floor && d.run.floor[i];
        return m && MACH[m.t] ? newMachine(m.t) : null;
    });
    run.gamblers = (run.gamblers || []).map((g) => ({ ...newGambler(g.whale), ...g }));
    S.run = run;
    assignGamblers(S);
    return S;
}
