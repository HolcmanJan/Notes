// Sloty & Plenky – vykreslování, ovládání a hlavní smyčka.
import * as L from "./logic.js";
import {
    FLOOR_SLOTS, REBOOT_AT, DIGITAL_COST, ALLIN_AT, MACHINES, MACH, MACHINE_UPGRADES, CURSOR_UPGRADES,
    GAMBLER_UPGRADES, GAMBLER_BASE, PERMA, PERMA_BY_ID, CRAPTO_BETS, CRAPTO_SYMBOLS, CRAPTO_LINES, CRAPTO_TIERS,
    ACHIEVEMENTS, ACH_BONUS, COSMETICS, ENDING_LINES,
} from "./data.js";

const $ = (id) => document.getElementById(id);
const fmt = L.fmt;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SYM = Object.fromEntries(CRAPTO_SYMBOLS.map((s) => [s.id, s.icon]));
const CARPET_SWATCH = { carpetGreen: "#0f3b2b", carpetRed: "#4a0f1c", carpetNeon: "#120f3d", carpetGold: "#4a3410" };
const DIAPER_SWATCH = { diaperWhite: "#f5f5f5", diaperPink: "#ff9cc7", diaperCamo: "#6f7d3c", diaperGold: "#ffc44d" };

let S = load();
let page = "floor";
let remodel = false, selSlot = -1;
let pointer = null;              // poloha kurzoru/prstu v rámci #floor-wrap
let pageSig = "";
let crapto = { anim: null, last: null, auto: false, wait: 0 };
const tiles = [], tileKeys = [], tileRefs = [];
const dropEls = new Map();
const dropXY = new Map();         // id kapky → poloha v pixelech na podlaze
const rate = { buckets: [0, 0, 0, 0, 0], acc: 0, t: 0 };

// ---------- ukládání ----------
function load() {
    try {
        const raw = localStorage.getItem(L.SAVE_KEY);
        if (raw) return L.deserialize(raw);
    } catch { /* prohlížeč bez úložiště */ }
    return L.newState();
}
function save() {
    try { localStorage.setItem(L.SAVE_KEY, L.serialize(S)); } catch { /* nevadí */ }
}

// ---------- podlaha ----------
const wrap = $("floor-wrap"), floorEl = $("floor"), fx = $("fx");
for (let i = 0; i < FLOOR_SLOTS; i++) {
    const t = document.createElement("div");
    t.className = "tile";
    t.dataset.slot = i;
    floorEl.appendChild(t);
    tiles.push(t);
}
const ring = document.createElement("div");
ring.className = "cursor-ring";
ring.hidden = true;
fx.appendChild(ring);

function gamblerState(g) {
    if (!g) return "";
    return g.whale ? "whale" : g.sleep ? "sleep" : g.boost > 0 ? "boost" : "awake";
}

function renderTile(i) {
    const run = S.run, t = tiles[i], m = run.floor[i];
    let key, cls, html = "";
    if (i >= run.slots) {
        const next = i === run.slots;
        const cost = L.expansionCost(S);
        const can = S.chips >= cost;
        key = `l:${next}:${next ? cost : 0}:${next && can}`;
        cls = "tile locked" + (next ? " next" : "") + (next && !can ? " cant" : "");
        html = next ? `🔒<small>🪙 ${fmt(cost)}</small>` : "🔒";
    } else if (!m) {
        key = `e:${selSlot >= 0}`;
        cls = "tile empty";
        html = remodel ? "" : `+<small>Automat</small>`;
    } else {
        const g = L.gamblerAt(S, i), gs = gamblerState(g), d = MACH[m.t];
        key = `m:${m.t}:${gs}:${selSlot === i}`;
        cls = `tile machine m-${m.t}` + (selSlot === i ? " sel" : "") + (gs === "sleep" ? " has-sleeper" : "");
        const face = gs === "whale" ? "🐋" : gs === "sleep" ? "😴" : gs === "boost" ? "🤪" : "👶";
        html = `<div class="screen"><span>${d.icon}</span></div><div class="bar"><i></i></div><div class="name">${d.short}</div>`
            + (g ? `<div class="gam ${gs}">${face}</div>` : "");
    }
    if (tileKeys[i] === key) return;
    tileKeys[i] = key;
    t.className = cls;
    t.innerHTML = html;
    tileRefs[i] = m ? { span: t.querySelector(".screen span"), bar: t.querySelector(".bar i"), shown: MACH[m.t].icon, spin: false, flip: 0 } : null;
}

function renderFloor() {
    for (let i = 0; i < FLOOR_SLOTS; i++) renderTile(i);
    floorEl.classList.toggle("remodel", remodel);
}

function animateTiles(now) {
    const run = S.run;
    for (let i = 0; i < run.slots; i++) {
        const m = run.floor[i], ref = tileRefs[i];
        if (!m || !ref) continue;
        const spinning = m.spin > 0;
        if (spinning !== ref.spin) { ref.spin = spinning; tiles[i].classList.toggle("spinning", spinning); }
        if (spinning) {
            ref.bar.style.width = (100 * (1 - m.spin / m.dur)).toFixed(1) + "%";
            if (now - ref.flip > 90) {
                ref.flip = now;
                const reel = MACH[m.t].reel;
                ref.span.textContent = reel[Math.floor(Math.random() * reel.length)];
                ref.shown = "";
            }
        } else if (ref.shown !== MACH[m.t].icon) {
            ref.shown = MACH[m.t].icon;
            ref.span.textContent = ref.shown;
            ref.bar.style.width = "0";
        }
    }
}

function slotCenter(slot, fx_ = 0.5, fy = 0.4) {
    const t = tiles[slot];
    return { x: t.offsetLeft + fx_ * t.offsetWidth, y: t.offsetTop + fy * t.offsetHeight };
}

function floatText(slot, text, cls = "") {
    if (page !== "floor" || fx.childElementCount > 45) return;
    const p = slotCenter(slot, 0.3 + Math.random() * 0.4, 0.35);
    const el = document.createElement("div");
    el.className = "float " + cls;
    el.textContent = text;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.addEventListener("animationend", () => el.remove());
    fx.appendChild(el);
}

function syncDrops() {
    const alive = new Set();
    for (const d of S.run.drops) {
        alive.add(d.id);
        let el = dropEls.get(d.id);
        if (!el) {
            el = document.createElement("div");
            el.className = "drop " + d.k;
            el.dataset.drop = d.id;
            el.textContent = d.k === "ram" ? "💾" : "💩";
            const p = dropPos(d);
            el.style.left = p.x + "px";
            el.style.top = p.y + "px";
            fx.appendChild(el);
            dropEls.set(d.id, el);
        }
        if (d.k === "poop") el.classList.toggle("fade", d.t > 20);
    }
    for (const [id, el] of dropEls) {
        if (alive.has(id)) continue;
        dropEls.delete(id);
        dropXY.delete(id);
        if (el.dataset.collected) {
            el.classList.add("gone");
            setTimeout(() => el.remove(), 360);
        } else el.remove();
    }
}

function dropPos(d) {
    let p = dropXY.get(d.id);
    if (!p) { p = slotCenter(d.s, d.x, d.y); dropXY.set(d.id, p); }
    return p;
}

function pointerWork() {
    const sticky = L.cursorLevel(S, "sticky") > 0;
    ring.hidden = !(pointer && sticky && page === "floor");
    if (!pointer || page !== "floor") return;
    const radius = 24 + 22 * L.cursorLevel(S, "wide");
    if (sticky) {
        ring.style.left = pointer.x + "px";
        ring.style.top = pointer.y + "px";
        ring.style.width = ring.style.height = radius * 2 + "px";
        for (const d of [...S.run.drops]) {
            const p = dropPos(d);
            if (Math.hypot(p.x - pointer.x, p.y - pointer.y) <= radius) collect(d.id);
        }
    }
    if (!remodel && L.cursorLevel(S, "hover") > 0) {
        const slot = slotAt(pointer.x, pointer.y);
        if (slot >= 0 && S.run.floor[slot]) {
            const g = L.gamblerAt(S, slot);
            if (!(g && g.sleep)) L.spinMachine(S, slot, "c");
        }
    }
}

function slotAt(x, y) {
    for (let i = 0; i < S.run.slots; i++) {
        const t = tiles[i];
        if (x >= t.offsetLeft && x <= t.offsetLeft + t.offsetWidth && y >= t.offsetTop && y <= t.offsetTop + t.offsetHeight) return i;
    }
    return -1;
}

function clearDrops() {
    for (const el of dropEls.values()) el.remove();
    dropEls.clear();
    dropXY.clear();
}

function collect(id) {
    const el = dropEls.get(id);
    if (el) el.dataset.collected = "1";
    L.collectDrop(S, id);
}

function localPoint(e) {
    const r = wrap.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

wrap.addEventListener("pointerdown", (e) => {
    pointer = localPoint(e);
    const dropEl = e.target.closest(".drop");
    if (dropEl) { collect(+dropEl.dataset.drop); return; }
    const tile = e.target.closest(".tile");
    if (tile) tapTile(+tile.dataset.slot);
});
wrap.addEventListener("pointermove", (e) => { pointer = localPoint(e); });
wrap.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") pointer = null; });
wrap.addEventListener("pointerleave", () => { pointer = null; });
wrap.addEventListener("pointercancel", () => { pointer = null; });

function tapTile(i) {
    const run = S.run, m = run.floor[i];
    if (remodel) {
        if (i >= run.slots) return;
        if (selSlot < 0) { if (m) selSlot = i; }
        else if (selSlot === i) selSlot = -1;
        else { L.moveMachine(S, selSlot, i); selSlot = -1; }
        updateRemodelBar();
        renderFloor();
        return;
    }
    if (i >= run.slots) {
        if (i === run.slots) {
            if (L.buyExpansion(S)) { toast("🏗️ Podlaha rozšířena", `${run.slots} / ${FLOOR_SLOTS} míst`); renderFloor(); }
            else toast("Na rozšíření chybí žetony", `Potřebuješ 🪙 ${fmt(L.expansionCost(S))}`);
        }
        return;
    }
    if (!m) { openBuySheet(i); return; }
    if (L.wakeAt(S, i)) { floatText(i, "Vstávat! ⏰"); renderTile(i); return; }
    L.spinMachine(S, i, "c");
}

function updateRemodelBar() {
    $("remodel-bar").hidden = !remodel;
    $("b-remodel").classList.toggle("on", remodel);
    const sell = $("b-sell");
    if (selSlot >= 0 && S.run.floor[selSlot]) {
        $("remodel-text").textContent = "Klepni na cílové místo (prohodí se).";
        sell.hidden = false;
        sell.textContent = `Prodat (+${fmt(L.sellValue(S, selSlot))})`;
    } else {
        $("remodel-text").textContent = "Vyber automat, který chceš přesunout.";
        sell.hidden = true;
    }
}

// ---------- horní lišta a lišta podlahy ----------
const shown = {};
function setText(id, v) {
    if (shown[id] === v) return;
    shown[id] = v;
    $(id).textContent = v;
}

function updateHud() {
    setText("c-chips", fmt(S.chips));
    setText("c-poop", fmt(S.poop));
    setText("c-ram", fmt(S.ram));
    $("cur-ram").hidden = !(S.ram > 0 || S.stats.reboots > 0);
    setText("h-rate", fmt(rate.buckets.reduce((a, b) => a + b, 0) / rate.buckets.length));

    const sleeping = L.sleepingCount(S);
    $("b-wake").hidden = sleeping === 0;
    setText("h-sleep", String(sleeping));

    const boost = $("b-boost");
    boost.hidden = !S.perma.speedBoost;
    if (!boost.hidden) {
        const t = L.boostActive(S) ? `⏩ ${Math.ceil(S.run.boostT)} s` : `⏩ Zrychlit (💩 ${L.boostCost(S)})`;
        setText("b-boost", t);
        boost.disabled = L.boostActive(S) || S.poop < L.boostCost(S);
    }
    const rb = $("b-reboot");
    rb.hidden = !L.rebootUnlocked(S);
    if (!rb.hidden) setText("b-reboot", `💾 Reboot${L.rebootBonus(S) ? ` +${L.rebootBonus(S)}` : ""}`);
    $("allin").hidden = !L.allInAvailable(S);

    setText("floor-hint", floorHint());

    const nav = document.querySelectorAll("#nav button");
    for (const b of nav) {
        const p = b.dataset.page;
        if (p === "crapto") b.classList.toggle("locked", !L.craptoUnlocked(S));
        if (p === "tree") b.classList.toggle("dot", L.rebootUnlocked(S) || PERMA.some((n) => L.canBuyPerma(S, n.id)));
    }
}

function floorHint() {
    const run = S.run, n = L.machineCount(S);
    if (remodel) return "Přestavba: sousední automaty stejného typu dávají +10 % každý.";
    if (!n) return "Klepni na volné místo a kup svůj první automat.";
    if (!run.gamblers.length) return "Klepnutím automat roztočíš. Hráče najmeš v záložce 👶 Hráči.";
    if (L.sleepingCount(S)) return "Spící hráč netočí – klepni na jeho automat a probuď ho.";
    if (run.drops.length && !L.cursorLevel(S, "sticky")) return "Seber kapky 💩 a 💾 klepnutím, než zmizí.";
    if (!L.rebootUnlocked(S)) return `Reboot se odemkne při ${fmt(REBOOT_AT)} vydělaných žetonech (${fmt(run.earned)}).`;
    return "Reboot vymění tenhle běh za trvalá vylepšení z RAM.";
}

// ---------- události z logiky ----------
function processEvents() {
    const evs = L.events.splice(0);
    const quiet = evs.length > 150;
    for (const e of evs) {
        if (e.type === "win") {
            rate.acc += e.amount;
            if (e.jackpot) {
                floatText(e.slot, `JACKPOT +${fmt(e.amount)}`, "big");
                const t = tiles[e.slot];
                t.classList.remove("jackpot");
                void t.offsetWidth;
                t.classList.add("jackpot");
            } else if (!quiet) floatText(e.slot, "+" + fmt(e.amount));
        } else if (e.type === "collect") {
            if (!quiet) floatText(e.drop.s, `+${e.drop.n} ${e.drop.k === "ram" ? "RAM" : "💩"}`, e.drop.k);
            bump(e.drop.k === "ram" ? "cur-ram" : "c-poop");
        } else if (e.type === "ach") {
            toast(`🏆 ${e.ach.name}`, `${e.ach.desc} · +${Math.round(ACH_BONUS * 100)} % žetonů`);
        } else if (e.type === "reboot") {
            clearDrops();
            tileKeys.fill(undefined);
        }
    }
}

function bump(id) {
    const el = id === "cur-ram" ? $("cur-ram") : $(id).parentElement;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
}

// ---------- toasty a spodní okna ----------
function toast(title, sub = "") {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = esc(title) + (sub ? `<small>${esc(sub)}</small>` : "");
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 3300);
    while ($("toasts").childElementCount > 3) $("toasts").firstChild.remove();
}

let sheetRender = null, sheetOpenedAt = 0;
function openSheet(render) {
    sheetRender = render;
    sheetOpenedAt = performance.now();
    $("sheet-root").innerHTML = `<div class="sheet-bg" data-act="closeBg"><div class="sheet">${render()}</div></div>`;
}
function refreshSheet() {
    const sh = document.querySelector("#sheet-root .sheet");
    if (sh && sheetRender) sh.innerHTML = sheetRender();
}
function closeSheet() { sheetRender = null; $("sheet-root").innerHTML = ""; }

function costBtn(cost, act, attrs = "", cur = "chips") {
    if (!isFinite(cost)) return `<button class="buy max" disabled>MAX</button>`;
    const icon = cur === "poop" ? "💩" : cur === "ram" ? "💾" : "🪙";
    const cls = cur === "chips" ? "" : cur;
    const can = currency(cur) >= cost;
    return `<button class="buy ${cls}" data-act="${act}" ${attrs} data-cost="${cost}" data-cur="${cur}" ${can ? "" : "disabled"}>${icon} ${fmt(cost)}</button>`;
}
function currency(cur) { return cur === "poop" ? S.poop : cur === "ram" ? S.ram : S.chips; }
function pips(l, max) { return `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < l ? "on" : ""}"></i>`).join("")}</div>`; }

function updateAffordability() {
    for (const b of document.querySelectorAll("[data-cost]")) {
        const can = currency(b.dataset.cur) >= +b.dataset.cost;
        if (b.disabled === can) b.disabled = !can;
    }
}

function openBuySheet(slot) {
    openSheet(() => {
        const rows = MACHINES.map((d) => {
            if (!L.machineAvailable(S, d.id)) {
                return `<div class="row"><div class="ico">${d.icon}</div><div class="info"><b>${d.name}</b><small>Vyžaduje Digitální věk (záložka ⚙️ Stroje)</small></div><button class="buy" disabled>🔒</button></div>`;
            }
            const st = L.machineStats(S, d.id);
            return `<div class="row"><div class="ico">${d.icon}</div><div class="info"><b>${d.name}</b>`
                + `<small>🪙 ${fmt(st.pay)} / ${st.time.toFixed(1).replace(".", ",")} s · jackpot ${Math.round(st.jp * 100)} % ×${st.jpMult}</small></div>`
                + costBtn(L.machineCost(S, d.id), "buyMachine", `data-slot="${slot}" data-t="${d.id}"`) + `</div>`;
        }).join("");
        return `<h3>Koupit automat</h3><p class="note">Sousední automaty stejného typu si navzájem přidávají +10 % výhry.</p>`
            + `<div class="buy-list">${rows}</div><div class="actions"><button class="btn-sec" data-act="close">Zavřít</button></div>`;
    });
}

// ---------- stránky ----------
const PAGES = {
    machines: renderMachines, gamblers: renderGamblers, crapto: renderCrapto, tree: renderTree, ach: renderAch, more: renderMore,
};

function signature() {
    switch (page) {
        case "gamblers": return `${L.sleepingCount(S)}:${S.run.gamblers.length}:${L.machineCount(S)}`;
        case "crapto": return `${Math.floor(S.poop)}:${S.ram}:${!!crapto.anim}:${S.stats.reboots}`;
        case "tree": return `${S.ram}:${L.rebootUnlocked(S)}:${L.rebootBonus(S)}:${S.stats.reboots}`;
        case "ach": return `${L.achCount(S)}`;
        case "more": return `${Math.floor(S.poop)}`;
        case "machines": return `${S.run.digital}:${S.run.floor.map((m) => (m ? m.t[0] : "-")).join("")}:${L.canUnlockDigital(S)}`;
        default: return "";
    }
}

function renderPage() {
    pageSig = signature();
    const fn = PAGES[page];
    if (fn) {
        const el = $("page-" + page), top = el.scrollTop;
        el.innerHTML = fn();
        el.scrollTop = top;
        if (page === "tree") requestAnimationFrame(drawTreeLines);
    }
}

function showPage(p) {
    if (p !== "crapto") crapto.auto = false;
    page = p;
    for (const b of document.querySelectorAll("#nav button")) b.classList.toggle("on", b.dataset.page === p);
    for (const s of document.querySelectorAll(".page")) s.hidden = s.id !== "page-" + p;
    if (p === "floor") { tileKeys.fill(undefined); renderFloor(); }
    renderPage();
}

function renderMachines() {
    let h = "";
    if (!S.run.digital) {
        const can = L.canUnlockDigital(S);
        h += `<div class="card"><div class="card-head"><div class="ico">🖥️</div><div><div class="t">Digitální věk</div>`
            + `<div class="s">Odemkne Jetelové, Kostkové a Dračí automaty.${can ? "" : " Nejdřív postav Diamantový automat."}</div></div></div>`
            + (can ? costBtn(DIGITAL_COST, "digital", `style="width:100%"`) : `<button class="buy" style="width:100%" disabled>🔒 Vyžaduje 💎 automat</button>`) + `</div>`;
    }
    const types = MACHINES.filter((d) => L.countType(S, d.id) > 0 || S.run.mUp[d.id]);
    h += `<div class="h2">Vylepšení automatů</div>`;
    if (!types.length) h += `<p class="note">Zatím nemáš žádný automat. Kup ho klepnutím na volné místo na podlaze.</p>`;
    for (const d of types) {
        const st = L.machineStats(S, d.id), n = L.countType(S, d.id);
        h += `<div class="card"><div class="card-head"><div class="ico">${d.icon}</div><div><div class="t">${d.name} ×${n}</div>`
            + `<div class="s">🪙 ${fmt(st.pay)} · ${st.time.toFixed(2).replace(".", ",")} s · jackpot ${Math.round(st.jp * 100)} % ×${st.jpMult} · RAM rezervoár ${S.run.reservoir[d.id]}/${L.reservoirSize(S, d.id)}</div></div></div>`;
        for (const u of MACHINE_UPGRADES) {
            const l = (S.run.mUp[d.id] || {})[u.id] || 0;
            h += `<div class="row"><div class="info"><b>${u.name} <span class="muted small">${l}/${u.max}</span></b><small>${u.desc}</small>${pips(l, u.max)}</div>`
                + costBtn(L.machineUpCost(S, d.id, u.id), "buyMUp", `data-t="${d.id}" data-u="${u.id}"`) + `</div>`;
        }
        h += `</div>`;
    }
    h += `<div class="h2">Kurzor</div><div class="card">`;
    for (const u of CURSOR_UPGRADES) {
        const l = L.cursorLevel(S, u.id), avail = L.cursorAvailable(S, u.id);
        h += `<div class="row"><div class="info"><b>${u.name} <span class="muted small">${l}/${u.max}</span></b><small>${u.desc}${avail ? "" : " (vyžaduje Lepkavé prsty)"}</small>${u.max > 1 ? pips(l, u.max) : ""}</div>`
            + (avail ? costBtn(L.cursorCost(S, u.id), "buyCursor", `data-u="${u.id}"`) : `<button class="buy" disabled>🔒</button>`) + `</div>`;
    }
    h += `</div><div class="h2">Podlaha</div><div class="card"><div class="row"><div class="info"><b>Rozšíření podlahy <span class="muted small">${S.run.slots}/${FLOOR_SLOTS}</span></b>`
        + `<small>Další místo pro automat. Zaplň všech 16 pro úspěch Plný dům.</small></div>${costBtn(L.expansionCost(S), "expand")}</div></div>`;
    return h;
}

function renderGamblers() {
    const run = S.run, hired = run.gamblers.length, n = L.machineCount(S);
    const poopPct = Math.round(GAMBLER_BASE.poop * (S.perma.highFiber ? 1.5 : 1) * 100);
    let h = `<div class="card"><div class="card-head"><div class="ico">👶</div><div><div class="t">Hráči v plenkách: ${hired} / ${n}</div>`
        + `<div class="s">Sednou si k nejlepšímu volnému automatu a točí za tebe. Po ${L.maxStamina(S)} zatočeních usnou. Při každém zatočení s šancí ${poopPct} % kakají Craptoměnu.</div></div></div>`;
    h += hired >= n
        ? `<button class="buy big-btn" disabled>${n ? "Každý automat už má hráče" : "Nejdřív kup automat"}</button>`
        : costBtn(L.gamblerCost(S), "hire", `style="width:100%;padding:12px"`);
    const sl = L.sleepingCount(S);
    if (sl) h += `<button class="btn-sec" style="width:100%;margin-top:8px" data-act="wakeAll">⏰ Probudit spící (${sl})</button>`;
    h += `<p class="note" style="margin:8px 0 0">Probuzení celkem: <b>${S.stats.wakes}</b>${run.gamblers.some((g) => g.whale) ? " · 🐋 Velryba nikdy nespí" : ""}</p></div>`;
    h += `<div class="h2">Vylepšení hráčů</div><div class="card">`;
    for (const u of GAMBLER_UPGRADES) {
        const l = L.gamblerLevel(S, u.id);
        h += `<div class="row"><div class="info"><b>${u.name} <span class="muted small">${l}/${u.max}</span></b><small>${u.desc}</small>${u.max > 1 ? pips(l, u.max) : ""}</div>`
            + costBtn(L.gamblerUpCost(S, u.id), "buyGUp", `data-u="${u.id}"`) + `</div>`;
    }
    return h + `</div>`;
}

function renderCrapto() {
    if (!L.craptoUnlocked(S)) {
        return `<div class="card"><div class="card-head"><div class="ico">💩</div><div><div class="t">CraptoMachine je zamčená</div>`
            + `<div class="s">Odemkne se po prvním Rebootu. Craptoměnu si mezitím šetři – úspěch Likvidní aktiva chce mít najednou 500 💩.</div></div></div></div>`;
    }
    const reels = L.craptoReels(S), lines = L.craptoLines(S), bet = S.crapto.bet, cost = L.craptoSpinCost(S);
    const active = new Set();
    for (const id of lines) for (const [r, c] of CRAPTO_LINES[id].cells(reels)) active.add(r * 10 + c);
    const winCells = new Set();
    if (crapto.last && !crapto.anim) for (const w of crapto.last.wins) for (const [r, c] of w.cells) winCells.add(r * 10 + c);
    const grid = S.crapto.grid;
    let cells = "";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
        if (c >= reels) { cells += `<div class="c locked">🔒</div>`; continue; }
        const sym = grid && grid[r] && grid[r][c] ? SYM[grid[r][c]] : "❔";
        const k = r * 10 + c;
        const cls = crapto.anim ? "roll" : winCells.has(k) ? "win" : active.has(k) ? "" : "off";
        cells += `<div class="c ${cls}" data-cell="${k}"><span>${sym}</span></div>`;
    }
    const lineTags = Object.entries(CRAPTO_LINES).map(([id, l]) => `<span class="${lines.includes(id) ? "on" : ""}">${l.name}</span>`).join("");
    const bets = CRAPTO_BETS.map((b) => `<button data-act="bet" data-v="${b}" class="${b === bet ? "on" : ""}">${L.craptoSpinCost(S, b)}</button>`).join("");
    const pay = L.craptoPayouts(S);
    const rowsP = [["seven", (v) => "🪙 " + fmt(v)], ["dia", (v) => "🪙 " + fmt(v)], ["poop", (v) => `+${fmt(v)} 💩`], ["ram", (v) => `+${v} 💾`]]
        .map(([id, f]) => `<tr><td>${SYM[id]}</td>${pay[id].map((v) => `<td>${f(v)}</td>`).join("")}</tr>`).join("");
    const res = crapto.anim ? "Točí se…" : craptoResultText(crapto.last);
    const st = S.stats;
    const prog = (v, max) => `<div class="progress"><i style="width:${Math.min(100, (v / max) * 100).toFixed(1)}%"></i></div>`;
    return `<div class="crapto"><div class="cm-title">CraptoMachine</div>`
        + `<div class="reels" style="grid-template-columns:repeat(5,1fr)">${cells}</div>`
        + `<div class="cm-lines">${lineTags}</div>`
        + `<div class="bets">${bets}</div>`
        + `<div class="cm-spin"><button class="spin" data-act="cspin" ${crapto.anim || S.poop < cost ? "disabled" : ""}>Zatočit · 💩 ${cost}</button>`
        + `<button class="auto ${crapto.auto ? "on" : ""}" data-act="cauto">AUTO</button></div>`
        + `<div class="cm-result">${res}</div></div>`
        + (S.run.inflation ? `<p class="note">Za každý vyhraný 💾 v tomto běhu stojí zatočení o 10 % víc (teď +${S.run.inflation * 10} %). Reboot cenu vrátí.</p>` : "")
        + `<div class="h2">Výplatní tabulka · sázka ${bet}</div><div class="card"><table class="paytable"><tr><th></th>${CRAPTO_TIERS.map((t) => `<th>×${t}</th>`).join("")}</tr>${rowsP}</table>`
        + `<p class="note" style="margin:8px 0 0">Počítají se shodné symboly na políčkách aktivních linií. Celá linie z jednoho symbolu jeho výhru <b>zdvojnásobí</b>. Žetony se škálují podle tvého nejlepšího automatu.</p></div>`
        + `<div class="h2">Crapto úspěchy</div><div class="card"><div class="kv">`
        + `<span>Crapto Royale (protočeno)</span><span>${fmt(st.poopSpent)} / 100K</span></div>${prog(st.poopSpent, 1e5)}`
        + `<div class="kv" style="margin-top:8px"><span>Crapto milionář (žetony)</span><span>${fmt(st.craptoChips)} / 1M</span></div>${prog(st.craptoChips, 1e6)}`
        + `<div class="kv" style="margin-top:8px"><span>Crapto Grand (×15)</span><span>${st.bestGrand >= 15 ? "✔" : lines.includes("bot") ? "čeká na štěstí" : "potřebuje 3 řádky"}</span>`
        + `<span>Zatočení celkem</span><span>${fmt(st.craptoSpins)}</span><span>RAM z CraptoMachine</span><span>${fmt(st.craptoRam)}</span></div></div>`;
}

function craptoResultText(r) {
    if (!r) return `<span class="muted">Vyber sázku a zatoč.</span>`;
    if (!r.wins.length) return `<span class="muted">Nic. Ještě jedno zatočení…</span>`;
    const parts = [];
    for (const w of r.wins) parts.push(`${SYM[w.sym]}×${w.x}${w.mult > 1 ? ` (linie ×${w.mult})` : ""}`);
    const g = r.gained, got = [];
    if (g.chips) got.push(`🪙 ${fmt(g.chips)}`);
    if (g.poop) got.push(`${fmt(g.poop)} 💩`);
    if (g.ram) got.push(`${g.ram} 💾`);
    return `<span class="good">${parts.join(" · ")}</span><br>${got.join(" + ")}`;
}

function craptoSpinUI() {
    if (crapto.anim) return;
    const res = L.craptoSpin(S);
    if (!res) { crapto.auto = false; renderPage(); return; }
    crapto.anim = { res, t: 0 };
    crapto.last = null;
    renderPage();
}

function craptoFrame(dt) {
    if (!crapto.anim) {
        if (crapto.auto && page === "crapto") {
            crapto.wait -= dt;
            if (crapto.wait <= 0) {
                if (S.poop >= L.craptoSpinCost(S)) craptoSpinUI();
                else { crapto.auto = false; toast("Došla Craptoměna", "Auto-zatočení zastaveno."); renderPage(); }
            }
        }
        return;
    }
    crapto.anim.t += dt;
    if (page === "crapto") {
        for (const el of document.querySelectorAll(".reels .c.roll span")) {
            if (Math.random() < 0.5) el.textContent = CRAPTO_SYMBOLS[Math.floor(Math.random() * CRAPTO_SYMBOLS.length)].icon;
        }
    }
    if (crapto.anim.t >= (crapto.auto ? 0.45 : 0.85)) {
        crapto.last = crapto.anim.res;
        crapto.anim = null;
        crapto.wait = 0.35;
        if (crapto.last.wins.some((w) => w.x === 15)) toast("💩 CRAPTO GRAND!", "Shoda ×15 na CraptoMachine!");
        if (page === "crapto") renderPage();
    }
}

function renderTree() {
    const unlocked = S.stats.reboots > 0;
    let h = `<div class="card"><div class="card-head"><div class="ico">💾</div><div><div class="t">RAM: ${fmt(S.ram)}</div>`
        + `<div class="s">Permanentní měna. Padá z jackpotů, dokud mají automaty plný RAM rezervoár, a z CraptoMachine.</div></div></div>`;
    if (L.rebootUnlocked(S)) {
        h += `<button class="buy ram big-btn" data-act="rebootSheet">💾 Reboot${L.rebootBonus(S) ? ` · bonus +${L.rebootBonus(S)} RAM` : ""}</button>`;
    } else {
        h += `<div class="kv"><span>Reboot se odemkne při</span><span>${fmt(S.run.earned)} / ${fmt(REBOOT_AT)}</span></div>`
            + `<div class="progress"><i style="width:${Math.min(100, S.run.earned / REBOOT_AT * 100).toFixed(1)}%;background:var(--ram)"></i></div>`;
    }
    h += unlocked ? "" : `<p class="note" style="margin:8px 0 0">Strom se odemkne prvním Rebootem. Tip: rebootuj, až si za RAM koupíš něco užitečného (1–3 RAM).</p>`;
    h += `</div><div class="h2">Strom vylepšení · ${L.permaCount(S)}/${PERMA.length}</div><div class="tree" id="tree"><svg id="tree-svg"></svg>`;
    for (const p of PERMA) {
        const owned = L.permaOwned(S, p.id), reach = L.permaReachable(S, p.id);
        const cls = owned ? "owned" : reach && unlocked ? (S.ram >= p.cost ? "avail" : "") : "locked";
        h += `<button class="node ${cls}" data-act="perma" data-id="${p.id}" data-node="${p.id}" style="grid-row:${p.r + 1};grid-column:${p.c + 1}">`
            + `<span class="i">${p.icon}</span><span class="n">${p.name}</span><span class="c">${owned ? "✔" : p.cost + " RAM"}</span></button>`;
    }
    return h + `</div>`;
}

function drawTreeLines() {
    const tree = $("tree"), svg = $("tree-svg");
    if (!tree || !svg) return;
    const pos = {};
    for (const el of tree.querySelectorAll("[data-node]")) {
        pos[el.dataset.node] = { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
    }
    let lines = "";
    for (const p of PERMA) for (const r of p.req) {
        const a = pos[r], b = pos[p.id];
        if (a && b) lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${S.perma[r] && S.perma[p.id] ? "on" : ""}"/>`;
    }
    svg.innerHTML = lines;
}

function openPermaSheet(id) {
    openSheet(() => {
        const p = PERMA_BY_ID[id], owned = L.permaOwned(S, id);
        const reqs = p.req.map((r) => `${S.perma[r] ? "✔" : "✖"} ${PERMA_BY_ID[r].name}`).join("<br>");
        let btn;
        if (owned) btn = `<button class="buy max big-btn" disabled>Odemčeno</button>`;
        else if (!S.stats.reboots) btn = `<button class="buy big-btn" disabled>Odemkne se prvním Rebootem</button>`;
        else if (!L.permaReachable(S, id)) btn = `<button class="buy big-btn" disabled>Nejdřív odemkni předchozí uzly</button>`;
        else btn = costBtn(p.cost, "buyPerma", `data-id="${id}" style="width:100%;padding:13px"`, "ram");
        return `<h3>${p.icon} ${p.name}</h3><p class="note">${p.desc}</p>`
            + (reqs ? `<p class="note small">Vyžaduje:<br>${reqs}</p>` : "")
            + `<div class="actions" style="flex-direction:column">${btn}<button class="btn-sec" data-act="close">Zavřít</button></div>`;
    });
}

function openRebootSheet() {
    openSheet(() => {
        const p = S.perma, pending = S.run.drops.filter((d) => d.k === "ram").reduce((a, d) => a + d.n, 0);
        const after = S.ram + L.rebootBonus(S) + pending;
        const cheapest = Math.min(...PERMA.filter((n) => !p[n.id] && L.permaReachable(S, n.id)).map((n) => n.cost));
        const keeps = [
            p.permaCherry && "Třešňové automaty", p.bpCherry && "vylepšení Třešní", p.bpBell && "vylepšení Zvonků a Diamantů",
            p.bpDigital && "Digitální věk a jeho vylepšení", p.floorMaster && "vylepšení kurzoru", p.keepFloor && "rozšíření podlahy",
            p.keepGamblers && "hráče a jejich vylepšení",
        ].filter(Boolean);
        return `<h3>💾 Reboot</h3>`
            + `<p class="note">Reboot smaže aktuální běh: <b>žetony, automaty, vylepšení, hráče i rozšíření podlahy</b>. Zůstává RAM, Craptoměna, úspěchy, kosmetika a permanentní vylepšení.</p>`
            + (keeps.length ? `<p class="note">Díky stromu si navíc necháš: <b>${keeps.join(", ")}</b>.</p>` : "")
            + `<div class="card"><div class="kv"><span>Vyděláno v tomto běhu</span><span>🪙 ${fmt(S.run.earned)}</span>`
            + `<span>Bonus za běh (každý řád nad 50K)</span><span>+${L.rebootBonus(S)} RAM</span>`
            + `<span>RAM po Rebootu</span><span>💾 ${fmt(after)}</span></div></div>`
            + (isFinite(cheapest) && after < cheapest ? `<p class="note bad">Za tolik RAM si zatím nic nekoupíš. Možná se vyplatí ještě chvíli počkat na další jackpot.</p>` : "")
            + `<div class="actions"><button class="btn-sec" data-act="close">Zrušit</button><button class="buy ram" data-act="reboot">Rebootovat</button></div>`;
    });
}

function renderAch() {
    const n = L.achCount(S);
    let h = `<div class="card"><div class="kv"><span>Splněno</span><span>${n} / ${ACHIEVEMENTS.length}</span><span>Bonus k žetonům</span><span>+${Math.round(n * ACH_BONUS * 100)} %</span></div></div>`;
    for (const a of ACHIEVEMENTS) {
        const done = !!S.ach[a.id];
        h += `<div class="ach ${done ? "done" : ""}"><div class="i">🏆</div><div><b>${a.name}</b><small>${a.desc}</small></div></div>`;
    }
    return h;
}

function renderMore() {
    const cosRow = (kind, sw) => COSMETICS.filter((c) => c.kind === kind).map((c) => {
        const owned = S.cos.owned[c.id], on = S.cos[kind] === c.id;
        const sub = on ? "Nasazeno" : owned ? "Nasadit" : `💩 ${c.cost}`;
        const can = owned || S.poop >= c.cost;
        return `<button class="cos ${on ? "on" : ""}" data-act="cos" data-id="${c.id}" ${can ? "" : "disabled"}><span class="sw" style="background:${sw[c.id]}"></span><span><b>${c.name}</b><small>${sub}</small></span></button>`;
    }).join("");
    const st = S.stats;
    return `<div class="h2">Kosmetika</div><p class="note">Za Craptoměnu. Koberec mění podlahu, plenky barvu hráčů.</p>`
        + `<div class="cos-grid">${cosRow("carpet", CARPET_SWATCH)}</div><div class="cos-grid" style="margin-top:8px">${cosRow("diaper", DIAPER_SWATCH)}</div>`
        + `<div class="h2">Statistiky</div><div class="card"><div class="kv">`
        + `<span>Žetony celkem</span><span>${fmt(st.lifeChips)}</span><span>Craptoměna celkem</span><span>${fmt(st.lifePoop)}</span>`
        + `<span>RAM celkem</span><span>${fmt(st.ramTotal)}</span><span>Rebootů</span><span>${st.reboots}</span>`
        + `<span>Jackpotů</span><span>${fmt(st.jackpots)}</span><span>Přesunutých automatů</span><span>${st.moves}</span>`
        + `<span>Herní čas</span><span>${L.fmtTime(st.playTime)}</span><span>Tahle relace</span><span>${L.fmtTime(S.session)}</span>`
        + `</div></div>`
        + `<div class="h2">Jak hrát</div><div class="card note">`
        + `<p><b>Žetony</b> vyděláváš točením automatů – klepni na ně, nebo najmi hráče v plenkách. Kupuj další automaty, vylepšení a rozšiřuj podlahu.</p>`
        + `<p><b>Hráči</b> točí sami, ale po čase usnou – probuď je klepnutím. Občas kakají <b>Craptoměnu 💩</b>, kterou musíš sebrat.</p>`
        + `<p><b>Jackpoty</b> občas vypustí <b>RAM 💾</b> z rezervoáru automatu. Při 50K vydělaných žetonech se odemkne <b>Reboot</b>: běh začne znovu a RAM utratíš za trvalá vylepšení ve stromu.</p>`
        + `<p>Po prvním Rebootu se otevře <b>CraptoMachine</b>, kde se točí o Craptoměnu. A úplně na konci na tebe čeká speciální automat <b>All In</b>…</p></div>`
        + `<button class="btn-sec" style="width:100%;color:var(--bad)" data-act="resetSheet">Smazat uloženou hru</button>`;
}

// ---------- All In a konec ----------
function openAllInSheet() {
    openSheet(() => `<h3>ALL IN</h3><p class="note">Speciální automat přijímá jen jednu sázku: <b>všechno</b>. Všechny žetony (🪙 ${fmt(S.chips)}) a všechnu Craptoměnu (💩 ${fmt(S.poop)}).</p>`
        + `<p class="note">Tohle je konec hry. Pak můžeš hrát dál, ale pokud sbíráš 100 %, dokonči nejdřív ostatní úspěchy.</p>`
        + `<div class="actions"><button class="btn-sec" data-act="close">Ještě ne</button><button class="buy" data-act="allIn" style="background:linear-gradient(#ff7fb5,#e02a78);color:#fff">Vsadit všechno</button></div>`);
}

function playEnding() {
    closeSheet();
    const el = $("ending");
    el.hidden = false;
    el.innerHTML = `<div class="allin-reels"><span>🎰</span><span>🎰</span><span>🎰</span></div>`;
    const icons = ["🍒", "🔔", "💎", "🍀", "🎲", "🐉", "💩", "💾"];
    const iv = setInterval(() => {
        for (const s of el.querySelectorAll(".allin-reels span")) s.textContent = icons[Math.floor(Math.random() * icons.length)];
    }, 90);
    setTimeout(() => {
        clearInterval(iv);
        const lines = ENDING_LINES.map((t, i) => `<p class="${t === "👽" ? "alien" : ""}" style="animation-delay:${i * 2.1}s">${esc(t)}</p>`).join("");
        const end = ENDING_LINES.length * 2.1;
        el.innerHTML = lines + `<h2 style="animation-delay:${end}s">Konec</h2>`
            + `<button class="btn-sec" data-act="endClose" style="animation-delay:${end + 1}s">Pokračovat ve hře</button>`;
    }, 3000);
}

// ---------- akce ----------
const ACTIONS = {
    close: closeSheet,
    // Okno otevřené na pointerdown nesmí hned zavřít „click“ téhož klepnutí
    closeBg: (el, e) => { if (e.target === el && performance.now() - sheetOpenedAt > 400) closeSheet(); },
    remodel: () => { remodel = !remodel; selSlot = -1; updateRemodelBar(); tileKeys.fill(undefined); renderFloor(); },
    sellSel: () => { if (selSlot >= 0) { L.sellMachine(S, selSlot); selSlot = -1; updateRemodelBar(); renderFloor(); } },
    wakeAll: () => { const n = L.wakeAll(S); if (n) toast(`⏰ Probuzeno ${n} hráčů`); renderFloor(); },
    boost: () => { if (L.useBoost(S)) toast("⏩ Zrychlení!", "Automaty i hráči jsou 30 s dvakrát rychlejší."); },
    rebootSheet: openRebootSheet,
    reboot: () => {
        if (!L.reboot(S)) return;
        closeSheet();
        remodel = false; selSlot = -1; updateRemodelBar();
        processEvents();
        crapto.last = null;
        save();
        toast("💾 Reboot hotov", "Utrať RAM ve stromu vylepšení.");
        showPage("tree");
    },
    allInSheet: openAllInSheet,
    allIn: () => { if (L.allIn(S)) { L.checkAchievements(S); save(); playEnding(); } },
    endClose: () => { $("ending").hidden = true; $("ending").innerHTML = ""; showPage("floor"); },
    buyMachine: (el) => {
        if (L.buyMachine(S, +el.dataset.slot, el.dataset.t)) { closeSheet(); renderFloor(); }
    },
    buyMUp: (el) => { L.buyMachineUp(S, el.dataset.t, el.dataset.u); },
    buyCursor: (el) => { L.buyCursor(S, el.dataset.u); },
    buyGUp: (el) => { L.buyGamblerUp(S, el.dataset.u); },
    hire: () => { if (L.hireGambler(S)) renderFloor(); },
    expand: () => { L.buyExpansion(S); },
    digital: () => { if (L.unlockDigital(S)) toast("🖥️ Digitální věk!", "Odemčeny Jetelové, Kostkové a Dračí automaty."); },
    bet: (el) => { if (!crapto.anim) S.crapto.bet = +el.dataset.v; },
    cspin: () => { crapto.auto = false; craptoSpinUI(); },
    cauto: () => { crapto.auto = !crapto.auto; crapto.wait = 0; },
    perma: (el) => openPermaSheet(el.dataset.id),
    buyPerma: (el) => {
        const p = PERMA_BY_ID[el.dataset.id];
        if (L.buyPerma(S, p.id)) { closeSheet(); toast(`${p.icon} ${p.name}`, "Permanentně odemčeno."); save(); }
    },
    cos: (el) => {
        if (L.buyCosmetic(S, el.dataset.id)) applyCosmetics();
    },
    resetSheet: () => openSheet(() => `<h3>Smazat hru?</h3><p class="note">Přijdeš o všechno včetně RAM, stromu a úspěchů. Nejde to vrátit.</p>`
        + `<div class="actions"><button class="btn-sec" data-act="close">Zrušit</button><button class="buy" data-act="reset" style="background:var(--bad);color:#fff">Smazat</button></div>`),
    reset: () => {
        S = L.newState();
        save();
        closeSheet();
        crapto = { anim: null, last: null, auto: false, wait: 0 };
        clearDrops();
        applyCosmetics();
        showPage("floor");
    },
};

document.getElementById("app").addEventListener("click", (e) => {
    const nav = e.target.closest("#nav button");
    if (nav) { showPage(nav.dataset.page); return; }
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (!fn) return;
    fn(el, e);
    if (el.dataset.act !== "closeBg") {
        if (page !== "floor") renderPage();
        refreshSheet();
    }
});

function applyCosmetics() {
    const app = $("app");
    app.className = `carpet-${S.cos.carpet} diaper-${S.cos.diaper}`;
}

// ---------- smyčky ----------
let lastTick = performance.now();
setInterval(() => {
    const now = performance.now();
    let el = Math.min((now - lastTick) / 1000, 60);
    lastTick = now;
    while (el > 1e-4) {
        const step = Math.min(el, 0.1);
        L.tick(S, step);
        el -= step;
    }
}, 50);

let lastFrame = performance.now(), slowT = 0;
function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    processEvents();
    rate.t += dt;
    if (rate.t >= 1) { rate.buckets.push(rate.acc / rate.t); rate.buckets.shift(); rate.acc = 0; rate.t = 0; }
    if (page === "floor") {
        pointerWork();
        renderFloor();
        syncDrops();
        animateTiles(now);
    }
    craptoFrame(dt);
    slowT += dt;
    if (slowT >= 0.25) {
        slowT = 0;
        updateHud();
        if (page !== "floor" && !crapto.anim) {
            if (signature() !== pageSig) renderPage();
            else updateAffordability();
        }
        if (sheetRender) updateAffordability();
    }
    requestAnimationFrame(frame);
}

setInterval(save, 5000);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
window.addEventListener("pagehide", save);
window.addEventListener("resize", () => {
    clearDrops();
    if (page === "tree") drawTreeLines();
});

applyCosmetics();
updateRemodelBar();
showPage("floor");
updateHud();
requestAnimationFrame(frame);
