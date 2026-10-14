// Rozpočet – sledování měsíčního rozpočtu (výchozí období 14. – 13., s možností vlastního začátku)
import { db } from "./firebase-init.js?v=42169443";
import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initNavigation } from "./navigation.js?v=476675d6";
import * as logic from "./budget-logic.js?v=00b71e40";
const { fmtDate } = logic;

const REQUIRED_IDS = [
    "hero", "period-label", "period-menu", "newmonth-confirm", "quick-add-btn", "tpl-btn-actual", "tpl-btn-predict",
    "bulk-btn-actual", "bulk-btn-predict", "subs-card", "breakdown-card", "export-csv", "copy-prev-btn",
    "view-bulk", "view-subs", "sticky-bar", "sheet", "sheet-backdrop", "predict-calendar", "budget-calendar",
];
if (REQUIRED_IDS.some((id) => !document.getElementById(id))) {
    try {
        if (!sessionStorage.getItem("rozpocet.reloaded")) {
            sessionStorage.setItem("rozpocet.reloaded", "1");
            location.reload();
        }
    } catch { /* ignore */ }
    throw new Error("Zastaralá verze stránky – obnov ji (Ctrl+F5).");
}
try { sessionStorage.removeItem("rozpocet.reloaded"); } catch { /* ignore */ }

const STORAGE_KEY = "recept.budget.v1";
const CUSTOM_STARTS_KEY = "recept.budget.customStarts";
const PREDICT_STORAGE_KEY = "recept.budget.predict.v1";
const SUBS_KEY = "recept.budget.subs.v1";
const TPL_KEY = "recept.budget.templates.v1";

function setChildren(el, ...nodes) {
    el.textContent = "";
    nodes.flat(Infinity).forEach((n) => {
        if (n != null && n !== false) el.append(n);
    });
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

// ----- Drobné pomůcky pro tvorbu DOM -----
const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    calcheck: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M9.5 15.5l2 2 3.5-3.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    down: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
};

function icon(name, size = 20) {
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
        '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        ICONS[name] + "</svg>";
    return span;
}

function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "value") el.value = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
    }
    children.flat(Infinity).forEach((c) => {
        if (c == null || c === false) return;
        el.append(c);
    });
    return el;
}

const MONTHS_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const WEEKDAYS_FULL = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
const WEEKDAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function parseDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function plural(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
}

function fmtNum(n) {
    return Math.round(n).toLocaleString("cs-CZ");
}

function fmtMoney(n) {
    return n.toLocaleString("cs-CZ") + " Kč";
}

function fmtPct(x) {
    if (!x) return "0 %";
    return (x < 10 ? x.toFixed(1).replace(".", ",") : String(Math.round(x))) + " %";
}

// ----- Stav -----
let currentUser = null;
let unsubscribeBudget = null;
let budgetData = null; // { amount, expenses: { "YYYY-MM-DD": [{id, amount, desc}] } }
let predictData = {};  // { "YYYY-MM-DD": [{id, amount, desc, done?}] } — plánované výdaje
let periodStart = null;
let periodEnd = null;
let periodDays = [];
let periodOffset = 0; // 0 = aktuální, -1 = předchozí, …
let activeTab = "actual";
let customStarts = [];
let subs = [];       // [{ id, name, amount, day, since, until?, paid? }]
let templates = [];  // [{ id, name, amount }]

// Stav rozhraní
let sheet = null;            // { kind, date?, mode: "day" | "templates" | "tplform" }
let sheetBack = null;        // kam se vrátit po formuláři šablony
let editingEntryId = null;
let entryDraft = { amount: "", desc: "" };
let tplDraft = { id: null, name: "", amount: "" };
let bulk = null;             // { kind, step: 1 | 2, amount, desc, days: Set }
let bulkDraft = { amount: "", desc: "" };
let subsOpen = false;
let subDraft = null;         // { id?, name, amount, day, since, until }
let subDeleteAsk = false;
let editingBudget = false;
let periodMenuOpen = false;
let subsCardOpen = false;
try { subsCardOpen = localStorage.getItem("recept.budget.subsCardOpen") === "1"; } catch { /* ignore */ }

// ----- DOM -----
const $ = (id) => document.getElementById(id);
const periodEl = $("budget-period");
const periodSubEl = $("period-sub");
const prevBtn = $("period-prev");
const nextBtn = $("period-next");
const periodLabelBtn = $("period-label");
const periodMenuEl = $("period-menu");
const periodMenuHint = $("period-menu-hint");
const todayBtn = $("period-today");
const newMonthBtn = $("new-month-btn");
const newMonthConfirmEl = $("newmonth-confirm");
const heroEl = $("hero");
const calendarEl = $("budget-calendar");
const predictCalendarEl = $("predict-calendar");
const predictAvgEl = $("predict-avg");
const tabActual = $("tab-actual");
const tabPredict = $("tab-predict");
const panelActual = $("panel-actual");
const panelPredict = $("panel-predict");
const subsCardEl = $("subs-card");
const breakdownCardEl = $("breakdown-card");
const viewBulkEl = $("view-bulk");
const viewSubsEl = $("view-subs");
const sheetBackdropEl = $("sheet-backdrop");
const sheetEl = $("sheet");
const quickAddBtn = $("quick-add-btn");
const stickyBar = $("sticky-bar");
const stickyPrev = $("sticky-prev");
const stickyNext = $("sticky-next");
const stickyMid = $("sticky-mid");

// ----- Období -----
function buildBoundaries() {
    return logic.buildBoundaries(new Date(), customStarts);
}

function findCurrentIndex(boundaries) {
    return logic.findCurrentIndex(boundaries, fmtDate(new Date()));
}

function computePeriod(offset) {
    const boundaries = buildBoundaries();
    const curIdx = findCurrentIndex(boundaries);
    const targetIdx = curIdx + offset;

    if (targetIdx < 0 || targetIdx >= boundaries.length) return;

    const startStr = boundaries[targetIdx];
    const [sy, sm, sd] = startStr.split("-").map(Number);
    periodStart = new Date(sy, sm - 1, sd);

    if (targetIdx + 1 < boundaries.length) {
        const endStr = boundaries[targetIdx + 1];
        const [ey, em, ed] = endStr.split("-").map(Number);
        periodEnd = new Date(ey, em - 1, ed);
        periodEnd.setDate(periodEnd.getDate() - 1);
    } else {
        if (periodStart.getDate() < 14) {
            periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), 13);
        } else {
            periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 13);
        }
    }

    periodDays = [];
    const d = new Date(periodStart);
    while (d <= periodEnd) {
        periodDays.push(fmtDate(d));
        d.setDate(d.getDate() + 1);
    }
}

function fmtDateCZ(dateStr) {
    const [y, m, d] = dateStr.split("-");
    return parseInt(d) + ". " + parseInt(m) + ". " + y;
}

function periodKey() {
    return fmtDate(periodStart);
}

function isCurrentPeriod() {
    return periodOffset === 0;
}

// ----- Data -----
function defaultBudget() {
    return { amount: 0, expenses: {} };
}

function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

function saveLocal(allData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
}

function getBudgetForPeriod(allData) {
    const key = periodKey();
    return allData[key] ? { ...defaultBudget(), ...allData[key] } : defaultBudget();
}

function genId() {
    return Math.random().toString(36).slice(2, 10);
}

function migrateExpenses(expenses) {
    return logic.migrateEntries(expenses, genId);
}

async function persistBudgetData() {
    if (currentUser) {
        const ref = doc(db, "users", currentUser.uid, "budget", periodKey());
        await setDoc(ref, budgetData);
    } else {
        const allData = loadLocal();
        allData[periodKey()] = budgetData;
        saveLocal(allData);
    }
}

let saveTimeout = null;
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await persistBudgetData();
        } catch (err) {
            console.error(err);
        }
    }, 400);
}

// ----- Výpočty -----
function daySpent(dateStr) {
    const entries = budgetData.expenses && budgetData.expenses[dateStr];
    let sum = Array.isArray(entries) ? entries.reduce((s, e) => s + (e.amount || 0), 0) : 0;
    sum += subsChargedSum(dateStr);
    return sum;
}

function totalSpent() {
    let sum = 0;
    for (const day of periodDays) sum += daySpent(day);
    return sum;
}

function dailyBudget() {
    const today = fmtDate(new Date());

    if (isCurrentPeriod()) {
        // Zůstatek BEZ dnešní útraty / zbývající dny (včetně dneška)
        // → dnešní budget se nemění průběhem dne
        let spentBeforeToday = 0;
        let daysLeft = 0;
        for (const day of periodDays) {
            if (day < today) spentBeforeToday += daySpent(day);
            if (day >= today) daysLeft++;
        }
        if (daysLeft <= 0) return 0;
        return (budgetData.amount - spentBeforeToday) / daysLeft;
    } else {
        if (periodDays.length === 0) return 0;
        return budgetData.amount / periodDays.length;
    }
}

function expectedRemainingToday() {
    if (!isCurrentPeriod()) return budgetData.amount - totalSpent();
    const today = fmtDate(new Date());
    const avgDaily = periodDays.length > 0 ? budgetData.amount / periodDays.length : 0;
    let daysPassed = 0;
    for (const day of periodDays) {
        if (day <= today) daysPassed++;
    }
    return budgetData.amount - avgDaily * daysPassed;
}

// ----- Stav načítání / predikce -----
function loadPeriodData() {
    // Zruš předchozí Firestore listener
    if (unsubscribeBudget) {
        unsubscribeBudget();
        unsubscribeBudget = null;
    }

    // Vždy načti predikce z localStorage (Firestore sync níže)
    loadPredictForPeriod();

    if (currentUser) {
        showCalendarLoading();
        // Načti predikce z Firestore
        const predRef = doc(db, "users", currentUser.uid, "budget", predictKey());
        getDoc(predRef).then((snap) => {
            if (snap.exists() && snap.data().predictions) {
                predictData = migrateExpenses(snap.data().predictions);
                savePredictLocal({ ...loadPredictLocal(), [predictKey()]: predictData });
                render();
            }
        }).catch(() => {});

        const ref = doc(db, "users", currentUser.uid, "budget", periodKey());
        unsubscribeBudget = onSnapshot(
            ref,
            (snapshot) => {
                if (snapshot.exists()) {
                    budgetData = { ...defaultBudget(), ...snapshot.data() };
                    budgetData.expenses = migrateExpenses(budgetData.expenses);
                } else {
                    budgetData = defaultBudget();
                }
                render();
            },
            (err) => {
                console.error("Firestore chyba:", err);
                budgetData = defaultBudget();
                render();
                alert(
                    "Nepodařilo se načíst rozpočet z cloudu. Zkontroluj Firestore pravidla.\n\n" +
                    err.message
                );
            }
        );
    } else {
        const allData = loadLocal();
        budgetData = getBudgetForPeriod(allData);
        budgetData.expenses = migrateExpenses(budgetData.expenses);
        render();
    }
}

// ----- Predikce – data -----
function predictKey() {
    return "predict-" + periodKey();
}

function loadPredictLocal() {
    try {
        const raw = localStorage.getItem(PREDICT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function savePredictLocal(allPredict) {
    localStorage.setItem(PREDICT_STORAGE_KEY, JSON.stringify(allPredict));
}

function loadPredictForPeriod() {
    const allPredict = loadPredictLocal();
    predictData = migrateExpenses(allPredict[predictKey()]);
}

async function persistPredictData() {
    const allPredict = loadPredictLocal();
    allPredict[predictKey()] = predictData;
    savePredictLocal(allPredict);
    if (currentUser) {
        try {
            const ref = doc(db, "users", currentUser.uid, "budget", predictKey());
            await setDoc(ref, { predictions: predictData });
        } catch (err) { console.error(err); }
    }
}

let predictSaveTimeout = null;
function debouncedPredictSave() {
    clearTimeout(predictSaveTimeout);
    predictSaveTimeout = setTimeout(() => persistPredictData(), 400);
}

function dayPredicted(dateStr) {
    const entries = predictData[dateStr];
    const sum = Array.isArray(entries) ? entries.reduce((s, e) => s + (e.amount || 0), 0) : 0;
    return sum + subsSum(dateStr);
}

function totalPredicted() {
    let sum = 0;
    for (const day of periodDays) sum += dayPredicted(day);
    return sum;
}

// ----- Vlastní začátky období -----
function loadCustomStartsLocal() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_STARTS_KEY) || "[]"); }
    catch { return []; }
}

function saveCustomStartsLocal(starts) {
    localStorage.setItem(CUSTOM_STARTS_KEY, JSON.stringify(starts));
}

async function loadCustomStartsFirestore() {
    if (!currentUser) return;
    try {
        const ref = doc(db, "users", currentUser.uid, "budget", "_meta");
        const snap = await getDoc(ref);
        if (snap.exists() && Array.isArray(snap.data().customStarts)) {
            customStarts = snap.data().customStarts;
            saveCustomStartsLocal(customStarts);
        }
    } catch (err) { console.error("Failed to load custom starts:", err); }
}

async function persistCustomStarts() {
    saveCustomStartsLocal(customStarts);
    if (currentUser) {
        try {
            const ref = doc(db, "users", currentUser.uid, "budget", "_meta");
            await setDoc(ref, { customStarts });
        } catch (err) { console.error("Failed to save custom starts:", err); }
    }
}

async function startNewMonth() {
    hideNewMonthConfirm();
    const today = fmtDate(new Date());
    if (today === fmtDate(periodStart)) return;

    const expensesToMove = {};
    const oldBudgetAmount = budgetData.amount || 0;
    if (budgetData.expenses) {
        for (const day of periodDays) {
            if (day >= today && budgetData.expenses[day]) {
                expensesToMove[day] = budgetData.expenses[day];
                delete budgetData.expenses[day];
            }
        }
    }

    await persistBudgetData();

    if (!customStarts.includes(today)) {
        customStarts.push(today);
        customStarts.sort();
    }
    await persistCustomStarts();

    periodOffset = 0;
    computePeriod(0);

    let newBudget;
    if (currentUser) {
        try {
            const ref = doc(db, "users", currentUser.uid, "budget", periodKey());
            const snap = await getDoc(ref);
            newBudget = snap.exists() ? { ...defaultBudget(), ...snap.data() } : defaultBudget();
        } catch { newBudget = defaultBudget(); }
    } else {
        const allData = loadLocal();
        newBudget = getBudgetForPeriod(allData);
    }
    newBudget.expenses = migrateExpenses(newBudget.expenses);

    if (!newBudget.amount) newBudget.amount = oldBudgetAmount;

    for (const [day, entries] of Object.entries(expensesToMove)) {
        if (!Array.isArray(newBudget.expenses[day])) newBudget.expenses[day] = [];
        newBudget.expenses[day] = [...newBudget.expenses[day], ...entries];
    }

    budgetData = newBudget;
    await persistBudgetData();

    loadPeriodData();
}

function loadSubsLocal() {
    try {
        const a = JSON.parse(localStorage.getItem(SUBS_KEY) || "[]");
        return Array.isArray(a) ? a : [];
    } catch { return []; }
}

async function loadSubsFirestore() {
    if (!currentUser) return;
    try {
        const snap = await getDoc(doc(db, "users", currentUser.uid, "budget", "_subs"));
        if (snap.exists() && Array.isArray(snap.data().subs)) {
            subs = snap.data().subs;
            localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
        }
    } catch (err) { console.error("Failed to load subscriptions:", err); }
}

async function persistSubs() {
    localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid, "budget", "_subs"), { subs });
        } catch (err) { console.error("Failed to save subscriptions:", err); }
    }
}

function subsOn(dateStr) {
    return logic.subsOn(subs, dateStr);
}

function subsSum(dateStr) {
    return subsOn(dateStr).reduce((t, s) => t + s.amount, 0);
}

function subsChargedSum(dateStr) {
    const today = fmtDate(new Date());
    return subsOn(dateStr)
        .filter((s) => logic.subCharged(s, dateStr, today))
        .reduce((t, s) => t + s.amount, 0);
}

function currentPeriodStart() {
    const b = buildBoundaries();
    return b[findCurrentIndex(b)];
}

function loadTemplatesLocal() {
    try {
        const a = JSON.parse(localStorage.getItem(TPL_KEY) || "[]");
        return Array.isArray(a) ? a : [];
    } catch { return []; }
}

async function loadTemplatesFirestore() {
    if (!currentUser) return;
    try {
        const snap = await getDoc(doc(db, "users", currentUser.uid, "budget", "_templates"));
        if (snap.exists() && Array.isArray(snap.data().templates)) {
            templates = snap.data().templates;
            localStorage.setItem(TPL_KEY, JSON.stringify(templates));
        }
    } catch (err) { console.error("Failed to load templates:", err); }
}

async function persistTemplates() {
    localStorage.setItem(TPL_KEY, JSON.stringify(templates));
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid, "budget", "_templates"), { templates });
        } catch (err) { console.error("Failed to save templates:", err); }
    }
}

function completePrediction(dateStr, entry) {
    if (entry.done) return;
    entry.done = true;
    if (!budgetData.expenses) budgetData.expenses = {};
    if (!Array.isArray(budgetData.expenses[dateStr])) budgetData.expenses[dateStr] = [];
    budgetData.expenses[dateStr].push({ id: genId(), amount: entry.amount, desc: entry.desc || "" });
    debouncedSave();
    debouncedPredictSave();
    render();
}

// ----- Převzetí plánu z minulého období -----
const copyPrevBtn = document.getElementById("copy-prev-btn");
const copyPrevHint = document.getElementById("copy-prev-hint");

async function copyFromPreviousPeriod() {
    copyPrevHint.textContent = "";
    const b = buildBoundaries();
    const idx = findCurrentIndex(b) + periodOffset - 1;
    if (idx < 0) { copyPrevHint.textContent = "Žádné předchozí období."; return; }
    const prevStart = b[idx];
    const prevKey = "predict-" + prevStart;
    let prevPred = loadPredictLocal()[prevKey];
    let prevAmount = (loadLocal()[prevStart] || {}).amount || 0;
    if (currentUser) {
        try {
            const p = await getDoc(doc(db, "users", currentUser.uid, "budget", prevKey));
            if (p.exists() && p.data().predictions) prevPred = p.data().predictions;
            const a = await getDoc(doc(db, "users", currentUser.uid, "budget", prevStart));
            if (a.exists()) prevAmount = a.data().amount || prevAmount;
        } catch (err) { console.error(err); }
    }
    const { map } = logic.mapPredictionsToPeriod(migrateExpenses(prevPred), periodDays, genId);
    let added = 0;
    for (const [d, entries] of Object.entries(map)) {
        for (const e of entries) {
            const list = predictData[d] || (predictData[d] = []);
            if (list.some((x) => x.amount === e.amount && x.desc === e.desc)) continue;
            list.push(e);
            added++;
        }
    }
    let amountSet = false;
    if (!budgetData.amount && prevAmount) {
        budgetData.amount = prevAmount;
        amountSet = true;
        debouncedSave();
    }
    if (added === 0 && !amountSet) { copyPrevHint.textContent = "V minulém období není co převzít."; return; }
    if (added > 0) debouncedPredictSave();
    render();
    copyPrevHint.textContent = "Převzato položek: " + added + (amountSet ? ", rozpočet " + fmtMoney(prevAmount) : "") + ".";
}

copyPrevBtn.addEventListener("click", (e) => { e.stopPropagation(); copyFromPreviousPeriod(); });

// ----- Export a záloha -----
const exportCsvBtn = document.getElementById("export-csv");
const exportJsonBtn = document.getElementById("export-json");
const exportHint = document.getElementById("export-hint");

function downloadFile(name, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
    const rows = [];
    const today = fmtDate(new Date());
    for (const day of periodDays) {
        for (const e of (budgetData.expenses && budgetData.expenses[day]) || []) {
            rows.push({ date: day, type: "Výdaj", amount: e.amount, desc: e.desc || "" });
        }
        for (const sub of subsOn(day)) {
            if (logic.subCharged(sub, day, today)) rows.push({ date: day, type: "Předplatné", amount: sub.amount, desc: sub.name });
        }
        for (const e of predictData[day] || []) {
            rows.push({ date: day, type: e.done ? "Plán (převedeno)" : "Plán", amount: e.amount, desc: e.desc || "" });
        }
    }
    downloadFile("rozpocet-" + periodKey() + ".csv", "text/csv;charset=utf-8", logic.buildCsv(rows));
    exportHint.textContent = "Staženo řádků: " + rows.length + ".";
}

async function exportAll() {
    exportHint.textContent = "Připravuji zálohu…";
    try {
        clearTimeout(saveTimeout);
        clearTimeout(predictSaveTimeout);
        if (budgetData) await persistBudgetData();
        await persistPredictData();
    } catch (err) { console.error(err); }
    const out = { version: 1, exportedAt: new Date().toISOString(), periods: {}, predictions: {}, subs, templates, customStarts };
    try {
        if (currentUser) {
            const snap = await getDocs(collection(db, "users", currentUser.uid, "budget"));
            snap.forEach((d) => {
                if (d.id.startsWith("_")) return;
                if (d.id.startsWith("predict-")) out.predictions[d.id] = d.data().predictions || {};
                else out.periods[d.id] = d.data();
            });
        } else {
            out.periods = loadLocal();
            out.predictions = loadPredictLocal();
        }
    } catch (err) {
        console.error(err);
        exportHint.textContent = "Zálohu se nepodařilo vytvořit: " + err.message;
        return;
    }
    downloadFile("rozpocet-zaloha-" + fmtDate(new Date()) + ".json", "application/json", JSON.stringify(out, null, 2));
    exportHint.textContent = "Záloha stažena (období: " + Object.keys(out.periods).length + ").";
}

exportCsvBtn.addEventListener("click", () => { if (budgetData) exportCsv(); });
exportJsonBtn.addEventListener("click", exportAll);

// ----- Navigace mezi obdobími -----
function periodExists(offset) {
    const b = buildBoundaries();
    const i = findCurrentIndex(b) + offset;
    return i >= 0 && i < b.length;
}

function updateNavBtns() {
    prevBtn.disabled = stickyPrev.disabled = !periodExists(periodOffset - 1);
    nextBtn.disabled = stickyNext.disabled = !periodExists(periodOffset + 1);
}

function goToPeriod(offset) {
    if (!periodExists(offset)) return;
    periodOffset = offset;
    sheet = null;
    sheetBack = null;
    editingEntryId = null;
    periodMenuOpen = false;
    hideNewMonthConfirm();
    computePeriod(periodOffset);
    updateNavBtns();
    renderPeriod();
    loadPeriodData();
}

function showCalendarLoading() {
    for (const el of [calendarEl, predictCalendarEl]) {
        setChildren(el, h("div", { class: "budget-loading", role: "status", "aria-label": "Načítání" }, h("div", { class: "budget-spinner" })));
    }
}

function hideNewMonthConfirm() {
    newMonthConfirmEl.classList.add("hidden");
}

function updatePeriodMenu() {
    const canNew = isCurrentPeriod() && fmtDate(new Date()) !== fmtDate(periodStart);
    todayBtn.classList.toggle("hidden", isCurrentPeriod());
    newMonthBtn.classList.toggle("hidden", !canNew);
    periodMenuHint.classList.toggle("hidden", !(isCurrentPeriod() && !canNew));
    periodMenuEl.classList.toggle("hidden", !periodMenuOpen);
    periodLabelBtn.setAttribute("aria-expanded", String(periodMenuOpen));
}

// ----- Zápis položek (výdaje / plán) -----
const actualCtx = {
    entries: (d) => (budgetData.expenses && budgetData.expenses[d]) || [],
    add(d, amount, desc) {
        if (!budgetData.expenses) budgetData.expenses = {};
        if (!Array.isArray(budgetData.expenses[d])) budgetData.expenses[d] = [];
        budgetData.expenses[d].push({ id: genId(), amount, desc });
        debouncedSave();
        render();
    },
    update(d, id, amount, desc) {
        const e = ((budgetData.expenses && budgetData.expenses[d]) || []).find((x) => x.id === id);
        if (!e) return;
        e.amount = amount;
        e.desc = desc;
        editingEntryId = null;
        debouncedSave();
        render();
    },
    remove(d, id) {
        if (!budgetData.expenses || !Array.isArray(budgetData.expenses[d])) return;
        budgetData.expenses[d] = budgetData.expenses[d].filter((x) => x.id !== id);
        if (budgetData.expenses[d].length === 0) delete budgetData.expenses[d];
        debouncedSave();
        render();
    },
};

const predictCtx = {
    entries: (d) => predictData[d] || [],
    add(d, amount, desc) {
        if (!Array.isArray(predictData[d])) predictData[d] = [];
        predictData[d].push({ id: genId(), amount, desc });
        debouncedPredictSave();
        render();
    },
    update(d, id, amount, desc) {
        const e = (predictData[d] || []).find((x) => x.id === id);
        if (!e) return;
        e.amount = amount;
        e.desc = desc;
        editingEntryId = null;
        debouncedPredictSave();
        render();
    },
    remove(d, id) {
        predictData[d] = (predictData[d] || []).filter((x) => x.id !== id);
        if (predictData[d].length === 0) delete predictData[d];
        debouncedPredictSave();
        render();
    },
    complete: (d, entry) => completePrediction(d, entry),
    completeAll: (d) => (predictData[d] || []).filter((e) => !e.done).forEach((e) => completePrediction(d, e)),
};

function ctxFor(kind) {
    return kind === "actual" ? actualCtx : predictCtx;
}

// ----- Vykreslení -----
function captureFocus() {
    const a = document.activeElement;
    if (a && a.dataset && a.dataset.k) return { k: a.dataset.k, s: a.selectionStart, e: a.selectionEnd };
    return null;
}

function restoreFocus(f) {
    if (!f) return;
    const el = document.querySelector('[data-k="' + f.k + '"]');
    if (!el || document.activeElement === el) return;
    el.focus();
    try { if (f.s != null) el.setSelectionRange(f.s, f.e); } catch { /* number input */ }
}

function render() {
    if (!budgetData) return;
    const focus = captureFocus();
    renderPeriod();
    renderHero();
    renderCalendars();
    renderSubsCard();
    renderBreakdown();
    renderSheet();
    renderBulk();
    renderSubsView();
    renderSticky();
    document.body.style.overflow = sheet || bulk || subsOpen ? "hidden" : "";
    if (editingBudget) {
        const inp = heroEl.querySelector('[data-k="budget"]');
        if (inp && document.activeElement !== inp) { inp.focus(); inp.select(); }
    } else {
        restoreFocus(focus);
    }
}

function fmtShort(dateStr) {
    const d = parseDate(dateStr);
    return d.getDate() + ". " + (d.getMonth() + 1) + ".";
}

function fmtRange() {
    const a = fmtDate(periodStart);
    const b = fmtDate(periodEnd);
    const sameYear = a.slice(0, 4) === b.slice(0, 4);
    return fmtShort(a) + (sameYear ? "" : " " + a.slice(0, 4)) + " – " + fmtShort(b) + " " + b.slice(0, 4);
}

function renderPeriod() {
    periodEl.textContent = fmtRange();
    const n = periodDays.length;
    if (periodOffset === 0) {
        const idx = periodDays.indexOf(fmtDate(new Date()));
        periodSubEl.textContent = "Aktuální období · den " + (idx + 1) + " z " + n;
    } else {
        periodSubEl.textContent = (periodOffset < 0 ? "Minulé" : "Budoucí") + " období · " + n + " " + plural(n, "den", "dny", "dní");
    }
    quickAddBtn.classList.toggle("hidden", !isCurrentPeriod());
    updatePeriodMenu();
    updateNavBtns();
}

function paceInfo() {
    const amount = budgetData.amount || 0;
    const today = fmtDate(new Date());
    const avg = periodDays.length ? amount / periodDays.length : 0;
    let passed = 0;
    if (periodOffset < 0) passed = periodDays.length;
    else if (periodOffset === 0) passed = periodDays.filter((d) => d <= today).length;
    return { amount, avg, pace: avg * passed };
}

function heroStat(label, value) {
    return h("div", { class: "bx-stat" },
        h("div", { class: "bx-stat-label", text: label }),
        h("div", { class: "bx-stat-value", text: value }));
}

function commitBudget(e) {
    if (!editingBudget) return;
    editingBudget = false;
    const v = parseFloat(e.target.value);
    budgetData.amount = isNaN(v) || v < 0 ? 0 : v;
    debouncedSave();
    render();
}

function budgetStat(amount) {
    if (editingBudget) {
        return h("div", { class: "bx-stat" },
            h("div", { class: "bx-stat-label", text: "Rozpočet" }),
            h("input", {
                class: "bx-stat-input", type: "number", inputmode: "numeric", min: "0", step: "100",
                "data-k": "budget", "aria-label": "Rozpočet na období", value: amount || "",
                onblur: commitBudget,
                onkeydown: (e) => { if (e.key === "Enter") e.target.blur(); },
            }));
    }
    return h("button", {
        type: "button", class: "bx-stat", "aria-label": "Upravit rozpočet na období",
        onclick: () => { editingBudget = true; render(); },
    },
    h("div", { class: "bx-stat-label" }, "Rozpočet", icon("pencil", 12)),
    h("div", { class: "bx-stat-value", text: fmtMoney(amount) }));
}

function heroActual() {
    const { amount, pace } = paceInfo();
    const spent = totalSpent();
    const remaining = amount - spent;
    let pill = null;
    if (amount > 0 && periodOffset <= 0) {
        pill = spent <= pace
            ? h("span", { class: "bx-pill" }, icon("up", 14), "Pod tempem")
            : h("span", { class: "bx-pill bx-pill-bad" }, icon("down", 14), "Nad tempem");
    }
    const pct = amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;
    const showMark = amount > 0 && periodOffset <= 0 && pace > 0;
    return [
        h("div", { class: "bx-hero-top" },
            h("div", {},
                h("div", { class: "bx-hero-label", text: "Zůstatek" }),
                h("div", { class: "bx-hero-value", text: fmtMoney(remaining) })),
            pill),
        h("div", { class: "bx-bar" },
            h("div", { class: "bx-bar-fill", style: "width:" + pct + "%" }),
            showMark ? h("div", { class: "bx-bar-mark", style: "left:calc(" + Math.min(100, (pace / amount) * 100) + "% - 1px)" }) : null),
        h("div", { class: "bx-bar-labels" },
            h("span", { text: "Utraceno " + fmtPct(amount > 0 ? (spent / amount) * 100 : 0) }),
            periodOffset <= 0 ? h("span", { text: "Tempo k dnešku " + fmtMoney(Math.round(pace)) }) : null),
        h("div", { class: "bx-stats" },
            heroStat(periodOffset === 0 ? "Dnes můžeš" : "Denně", fmtMoney(Math.round(dailyBudget()))),
            heroStat("Utraceno", fmtMoney(spent)),
            budgetStat(amount)),
    ];
}

function heroPredict() {
    const amount = budgetData.amount || 0;
    const planned = totalPredicted();
    const actual = totalSpent();
    const free = amount - planned;
    const diff = actual - planned;
    const denom = Math.max(amount, planned, actual, 1);
    let pill = null;
    if (amount > 0) {
        pill = free >= 0
            ? h("span", { class: "bx-pill bx-pill-good-dark", text: "Volné " + fmtMoney(free) })
            : h("span", { class: "bx-pill bx-pill-bad-dark", text: "Přes plán " + fmtMoney(-free) });
    }
    return [
        h("div", { class: "bx-hero-top" },
            h("div", {},
                h("div", { class: "bx-hero-label", text: "Plánováno" }),
                h("div", { class: "bx-hero-value", text: fmtMoney(planned) }),
                h("div", { class: "bx-hero-sub", text: "z rozpočtu " + fmtMoney(amount) })),
            pill),
        h("div", { class: "bx-bar" },
            h("div", { class: "bx-bar-fill bx-bar-plan", style: "width:" + (planned / denom) * 100 + "%" }),
            h("div", { class: "bx-bar-fill", style: "width:" + (actual / denom) * 100 + "%" })),
        h("div", { class: "bx-legend-dark" },
            h("span", {}, h("i"), "Skutečné"),
            h("span", {}, h("i", { class: "plan" }), "Plán " + fmtPct(amount > 0 ? (planned / amount) * 100 : 0))),
        h("div", { class: "bx-stats" },
            heroStat("Skutečné", fmtMoney(actual)),
            heroStat("Odchylka", (diff > 0 ? "+" : "") + fmtMoney(diff)),
            heroStat("Volné", fmtMoney(free))),
    ];
}

function renderHero() {
    heroEl.className = "bx-hero" + (activeTab === "predict" ? " bx-hero-dark" : "");
    setChildren(heroEl, ...(activeTab === "actual" ? heroActual() : heroPredict()));
}

// ----- Kalendář -----
function buildCalendar(kind, opts = {}) {
    const today = fmtDate(new Date());
    const amount = budgetData.amount || 0;
    const avgDaily = periodDays.length ? amount / periodDays.length : 0;
    const colorDaily = isCurrentPeriod() ? dailyBudget() : avgDaily;

    const grid = h("div", { class: "bx-cal-grid" });
    const lead = (periodStart.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) grid.append(h("div", { class: "bx-day bx-day-empty", "aria-hidden": "true" }));

    periodDays.forEach((date) => {
        let cls = "bx-day";
        let label = "";
        if (!opts.select) {
            if (kind === "actual") {
                const spent = daySpent(date);
                if (colorDaily > 0) {
                    if (spent === 0) cls += "";
                    else if (spent / colorDaily <= 1) cls += " ok";
                    else if (spent / colorDaily <= 1.5) cls += " warn";
                    else cls += " over";
                }
                if (spent > 0) label = fmtNum(spent) + " Kč";
            } else {
                const planned = dayPredicted(date);
                const actual = daySpent(date);
                const past = date <= today;
                if (avgDaily > 0) {
                    if (past && (planned > 0 || actual > 0)) {
                        const ref = planned > 0 ? planned : avgDaily;
                        const r = actual / ref;
                        cls += r <= 1 ? " ok" : r <= 1.5 ? " warn" : " over";
                    } else if (!past && planned > 0) {
                        const r = planned / avgDaily;
                        cls += r <= 1 ? " ok" : r <= 1.5 ? " warn" : " over";
                    }
                }
                if (past && actual > 0) label = fmtNum(actual) + " Kč";
                else if (planned > 0) label = "~" + fmtNum(planned) + " Kč";
            }
        }
        const selected = opts.select && opts.select.has(date);
        if (selected) cls += " sel";
        if (date === today) cls += " today";
        const dayNum = parseDate(date).getDate();
        const cell = h("button", {
            type: "button", class: cls,
            "aria-label": dayNum + ". " + (parseDate(date).getMonth() + 1) + ".",
            "aria-pressed": opts.select ? String(!!selected) : null,
            onclick: () => (opts.onPick ? opts.onPick(date) : openDaySheet(kind, date)),
        },
        h("span", { text: String(dayNum) }),
        selected ? h("small", {}, icon("check", 10)) : null,
        label ? h("small", { text: label }) : null,
        !opts.select && subsOn(date).length > 0 ? h("i", { class: "bx-sub-dot" }) : null);
        grid.append(cell);
    });

    return h("div", {},
        h("div", { class: "bx-cal-names" }, WEEKDAYS_SHORT.map((n) => h("span", { text: n }))),
        grid);
}

function renderCalendars() {
    setChildren(calendarEl, buildCalendar("actual"));
    setChildren(predictCalendarEl, buildCalendar("predict"));
    const avg = periodDays.length ? (budgetData.amount || 0) / periodDays.length : 0;
    predictAvgEl.textContent = avg > 0 ? "Průměr " + fmtMoney(Math.round(avg)) + " / den" : "";
}

// ----- Připnutá lišta -----
function renderSticky() {
    const amount = budgetData.amount || 0;
    let left;
    let right;
    let pct;
    let planPct = null;
    if (activeTab === "actual") {
        const spent = totalSpent();
        left = "Utraceno " + fmtMoney(spent);
        right = "Zůstatek " + fmtMoney(amount - spent);
        pct = amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;
    } else {
        const planned = totalPredicted();
        const actual = totalSpent();
        const denom = Math.max(amount, planned, actual, 1);
        left = "Plánováno " + fmtMoney(planned);
        right = "Volné " + fmtMoney(amount - planned);
        pct = (actual / denom) * 100;
        planPct = (planned / denom) * 100;
    }
    setChildren(stickyMid,
        h("span", { class: "bx-sticky-range", text: fmtRange() }),
        h("span", { class: "bx-sticky-bar" },
            planPct != null ? h("i", { class: "plan", style: "width:" + planPct + "%" }) : null,
            h("i", { style: "width:" + pct + "%" })),
        h("span", { class: "bx-sticky-nums" }, h("span", { text: left }), h("span", { text: right })));
    updateStickyVisibility();
}

function updateStickyVisibility() {
    const show = !!budgetData && heroEl.getBoundingClientRect().bottom < 8 && !sheet && !bulk && !subsOpen;
    stickyBar.classList.toggle("show", show);
    stickyBar.setAttribute("aria-hidden", String(!show));
    for (const el of [stickyPrev, stickyNext, stickyMid]) el.tabIndex = show ? 0 : -1;
}

let stickyTick = false;
window.addEventListener("scroll", () => {
    if (stickyTick) return;
    stickyTick = true;
    requestAnimationFrame(() => {
        stickyTick = false;
        updateStickyVisibility();
    });
}, { passive: true });

// ----- Karty pod kalendářem -----
function activeSubs() {
    const today = fmtDate(new Date());
    return subs.filter((s) => !s.until || s.until >= today);
}

function renderSubsCard() {
    const today = fmtDate(new Date());
    const active = activeSubs();
    const total = active.reduce((t, s) => t + s.amount, 0);
    const upcoming = active
        .map((s) => ({ s, date: logic.nextPaymentDate(s, today) }))
        .filter((x) => x.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);

    setChildren(subsCardEl,
        h("div", { class: "bx-sub-head" },
            h("button", {
                type: "button", class: "bx-sub-toggle", "aria-expanded": String(subsCardOpen),
                onclick: () => {
                    subsCardOpen = !subsCardOpen;
                    try { localStorage.setItem("recept.budget.subsCardOpen", subsCardOpen ? "1" : "0"); } catch { /* ignore */ }
                    renderSubsCard();
                },
            },
            h("span", { class: "bx-sub-icon" }, icon("repeat", 22)),
            h("span", { class: "bx-sub-title" },
                h("strong", { text: "Předplatná" }),
                h("span", { text: active.length
                    ? active.length + " " + plural(active.length, "platba", "platby", "plateb") + " · " + fmtMoney(total) + " / měs."
                    : "Zatím žádné předplatné" })),
            h("span", { class: "bx-chev" + (subsCardOpen ? " open" : "") }, icon("chev", 22))),
            h("button", { type: "button", class: "bx-btn bx-btn-soft", text: "Spravovat", onclick: openSubs })),
        subsCardOpen && upcoming.length ? h("div", { class: "bx-upcoming-label", text: "Nejbližší platby" }) : null,
        subsCardOpen ? upcoming.map((x) => h("div", { class: "bx-upcoming" },
            h("span", { class: "d", text: fmtShort(x.date) }),
            h("span", { class: "n", text: x.s.name }),
            h("span", { text: fmtMoney(x.s.amount) }))) : null,
        subsCardOpen && !upcoming.length ? h("p", { class: "bx-hint", text: "Žádné nadcházející platby." }) : null);
}

function renderBreakdown() {
    const items = [];
    const today = fmtDate(new Date());
    for (const day of periodDays) {
        for (const e of (budgetData.expenses && budgetData.expenses[day]) || []) items.push(e);
        for (const sub of subsOn(day)) {
            if (logic.subCharged(sub, day, today)) items.push({ desc: sub.name, amount: sub.amount });
        }
    }
    const groups = logic.aggregateByDesc(items);
    const max = groups.length ? groups[0].total || 1 : 1;
    setChildren(breakdownCardEl,
        h("div", { class: "bx-card-head" },
            h("h2", { text: "Podle popisu" }),
            h("span", { class: "bx-muted", text: groups.length + " " + plural(groups.length, "skupina", "skupiny", "skupin") })),
        groups.length === 0 ? h("p", { class: "bx-hint", text: "V tomto období zatím nejsou žádné výdaje." }) : null,
        groups.map((g) => h("div", { class: "bx-group" },
            h("div", { class: "bx-group-row" },
                h("span", {}, g.label, g.count > 1 ? h("small", { text: " · " + g.count + "×" }) : null),
                h("span", { text: fmtMoney(g.total) })),
            h("div", { class: "bx-group-bar" }, h("div", { style: "width:" + Math.max(2, Math.round((g.total / max) * 100)) + "%" })))));
}

// ----- Spodní panel (den / šablony) -----
function closeSheet() {
    sheet = null;
    sheetBack = null;
    editingEntryId = null;
    render();
}

function openDaySheet(kind, date) {
    sheet = { kind, date, mode: "day" };
    editingEntryId = null;
    render();
}

function relDay(date, today) {
    const diff = Math.round((parseDate(date) - parseDate(today)) / 86400000);
    let t;
    if (diff === 0) t = "Dnes";
    else if (diff === 1) t = "Zítra";
    else if (diff === -1) t = "Včera";
    else if (diff > 0) t = "Za " + diff + " " + plural(diff, "den", "dny", "dní");
    else t = "Před " + -diff + " dny";
    if (date === fmtDate(periodStart)) t += " · první den období";
    return t;
}

function dayLimit(date) {
    const amount = budgetData.amount || 0;
    if (!amount || !periodDays.length) return 0;
    if (isCurrentPeriod() && date >= fmtDate(new Date())) return dailyBudget();
    return amount / periodDays.length;
}

function sheetHead(title, sub, onClose) {
    return h("div", { class: "bx-sheet-head" },
        h("div", {}, h("h2", { text: title }), sub ? h("p", { text: sub }) : null),
        h("button", { type: "button", class: "bx-close", "aria-label": "Zavřít", onclick: onClose }, icon("close", 22)));
}

function weekStrip(date) {
    const dt = parseDate(date);
    const start = new Date(dt);
    start.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(fmtDate(d));
    }
    return h("div", { class: "bx-week" }, days.map((ds, i) => {
        const inPeriod = periodDays.includes(ds);
        return h("button", {
            type: "button", class: ds === date ? "sel" : "", disabled: !inPeriod,
            onclick: () => { sheet.date = ds; editingEntryId = null; render(); },
        },
        h("span", { text: WEEKDAYS_SHORT[i] }),
        h("b", { text: String(parseDate(ds).getDate()) }),
        inPeriod && subsOn(ds).length > 0 ? h("i", { class: "bx-sub-dot" }) : null);
    }));
}

function infoCard(label, value, cls = "") {
    return h("div", { class: "bx-info " + cls }, h("small", { text: label }), h("b", { text: value }));
}

function entryRow(kind, date, entry, ctx) {
    if (editingEntryId === entry.id) {
        const amt = h("input", { class: "bx-input", type: "number", inputmode: "numeric", min: "0", step: "1", "data-k": "ea", value: entry.amount, "aria-label": "Částka" });
        const desc = h("input", { class: "bx-input", type: "text", maxlength: "60", "data-k": "ed", value: entry.desc || "", "aria-label": "Popis" });
        const save = () => {
            const v = parseFloat(amt.value);
            if (!v || v <= 0) { amt.focus(); return; }
            ctx.update(date, entry.id, v, desc.value.trim());
        };
        [amt, desc].forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); }));
        return h("div", { class: "bx-entry bx-entry-edit" },
            amt, desc,
            h("button", { type: "button", class: "bx-btn bx-btn-primary", "aria-label": "Uložit", onclick: save }, icon("check", 20)),
            h("button", { type: "button", class: "bx-btn", "aria-label": "Zrušit úpravu", onclick: () => { editingEntryId = null; render(); } }, icon("close", 20)));
    }
    let extra = null;
    if (kind === "predict") {
        extra = entry.done
            ? h("span", { class: "bx-tag", text: "✓ převedeno" })
            : h("button", { type: "button", class: "bx-mini", text: "→ výdaj", title: "Převést na skutečný výdaj", onclick: () => ctx.complete(date, entry) });
    }
    return h("div", { class: "bx-entry" },
        h("span", { class: "n", text: entry.desc || "Bez popisu" }),
        extra,
        h("span", { class: "a", text: fmtMoney(entry.amount) }),
        h("button", { type: "button", class: "bx-icon-sm", "aria-label": "Upravit", onclick: () => { editingEntryId = entry.id; render(); } }, icon("pencil", 18)),
        h("button", { type: "button", class: "bx-icon-sm danger", "aria-label": "Smazat", onclick: () => ctx.remove(date, entry.id) }, icon("trash", 18)));
}

function daySheet() {
    const { kind, date } = sheet;
    const ctx = ctxFor(kind);
    const today = fmtDate(new Date());
    const dt = parseDate(date);
    const amount = budgetData.amount || 0;
    const avg = periodDays.length ? amount / periodDays.length : 0;
    const entries = ctx.entries(date);

    let info;
    if (kind === "actual") {
        if (!amount) {
            info = [infoCard("Denní limit", "Nenastaven"), infoCard("Utraceno", fmtMoney(daySpent(date)))];
        } else {
            const limit = dayLimit(date);
            const left = limit - daySpent(date);
            info = [
                infoCard("Denní limit", fmtMoney(Math.round(limit))),
                left >= 0 ? infoCard("Ještě můžeš", fmtMoney(Math.round(left)), "good") : infoCard("Přes limit", fmtMoney(Math.round(-left)), "bad"),
            ];
        }
    } else {
        info = [infoCard("Průměr / den", fmtMoney(Math.round(avg))), infoCard("Plán dne", fmtMoney(dayPredicted(date)))];
    }

    const subCards = subsOn(date).map((sub) => {
        const charged = logic.subCharged(sub, date, today);
        const manual = sub.paid && Object.prototype.hasOwnProperty.call(sub.paid, date);
        return h("div", { class: "bx-subcard" },
            h("div", { class: "bx-subcard-top" },
                h("span", { class: "bx-sub-icon" }, icon("repeat", 20)),
                h("div", {}, h("small", { text: "Předplatné" }), h("strong", { text: sub.name })),
                h("span", { class: "amt", text: fmtMoney(sub.amount) })),
            kind === "actual"
                ? h("div", { class: "bx-switch-row" },
                    h("div", {}, h("b", { text: "Zaplaceno" }), h("small", { text: manual ? "Nastaveno ručně" : "Automaticky: strhne se v den platby" })),
                    h("button", {
                        type: "button", class: "bx-switch", role: "switch", "aria-checked": String(charged), "aria-label": "Zaplaceno",
                        onclick: () => { if (!sub.paid) sub.paid = {}; sub.paid[date] = !charged; subsChanged(); },
                    }))
                : h("div", { class: "bx-switch-row" }, h("small", { text: "Do plánu se platba počítá vždy." })));
    });

    const submit = () => {
        const v = parseFloat(entryDraft.amount);
        if (!v || v <= 0) { document.querySelector('[data-k="amount"]')?.focus(); return; }
        const desc = entryDraft.desc.trim();
        entryDraft = { amount: "", desc: "" };
        ctx.add(date, v, desc);
    };
    const onKey = (e) => { if (e.key === "Enter") submit(); };
    const amtInput = h("input", {
        class: "bx-input", type: "number", inputmode: "numeric", min: "0", step: "1", placeholder: "0",
        "data-k": "amount", id: "f-amount", value: entryDraft.amount, onkeydown: onKey,
        oninput: (e) => { entryDraft.amount = e.target.value; },
    });
    const descInput = h("input", {
        class: "bx-input", type: "text", maxlength: "60", placeholder: "Např. oběd",
        "data-k": "desc", id: "f-desc", value: entryDraft.desc, onkeydown: onKey,
        oninput: (e) => { entryDraft.desc = e.target.value; },
    });

    const chips = h("div", { class: "bx-chips" },
        "Šablony:",
        templates.slice(0, 3).map((t) => h("button", {
            type: "button", class: "bx-chip", text: (t.name || "Šablona") + " · " + fmtMoney(t.amount),
            onclick: () => ctx.add(date, t.amount, t.name || ""),
        })),
        h("button", {
            type: "button", class: "bx-chip bx-chip-new", text: "+ Nová",
            onclick: () => {
                sheetBack = { kind, date, mode: "day" };
                tplDraft = { id: null, name: "", amount: "" };
                sheet = { kind, mode: "tplform" };
                render();
            },
        }));

    const total = entries.reduce((t, e) => t + (e.amount || 0), 0);
    const list = entries.length
        ? [
            h("div", { class: "bx-list-head" }, "Položky dne", h("span", { text: "Celkem " + fmtMoney(total) })),
            entries.map((e) => entryRow(kind, date, e, ctx)),
            kind === "predict" && entries.some((e) => !e.done)
                ? h("button", { type: "button", class: "bx-btn bx-btn-wide", style: "margin-top:0.8rem", text: "Převést vše na výdaje", onclick: () => ctx.completeAll(date) })
                : null,
        ]
        : h("div", { class: "bx-empty" },
            h("b", { text: kind === "actual" ? "Zatím žádné výdaje" : "Zatím žádný plán" }),
            h("span", { text: kind === "actual" ? "Výdaje, které přidáš, se objeví tady." : "Položky, které přidáš, se objeví tady." }));

    return [
        sheetHead(WEEKDAYS_FULL[dt.getDay()] + " " + dt.getDate() + ". " + MONTHS_GEN[dt.getMonth()], relDay(date, today), closeSheet),
        weekStrip(date),
        h("div", { class: "bx-info-row" }, info),
        subCards,
        h("div", { class: "bx-form-grid" },
            h("div", { class: "bx-field" }, h("label", { for: "f-amount", text: "Částka" }), h("div", { class: "bx-input-wrap" }, amtInput, h("span", { text: "Kč" }))),
            h("div", { class: "bx-field" }, h("label", { for: "f-desc", text: "Popis" }), descInput)),
        chips,
        h("button", { type: "button", class: "bx-submit", text: kind === "actual" ? "Přidat výdaj" : "Přidat do plánu", onclick: submit }),
        list,
    ];
}

function leaveTplForm() {
    if (sheetBack) {
        sheet = sheetBack;
        sheetBack = null;
    } else {
        sheet = { kind: sheet.kind, mode: "templates" };
    }
    render();
}

function templatesSheet() {
    const kind = sheet.kind;
    return [
        sheetHead("Šablony", "Klepnutím spustíš hromadné přidání", closeSheet),
        templates.length === 0
            ? h("div", { class: "bx-empty" }, h("b", { text: "Zatím žádné šablony" }), h("span", { text: "Šablona je předvyplněný výdaj, který půjde snadno přidat." }))
            : templates.map((t) => h("div", { class: "bx-tpl-row" },
                h("button", { type: "button", class: "use", onclick: () => startBulk(kind, t) },
                    h("span", { text: t.name || "Bez názvu" }), h("span", { text: fmtMoney(t.amount) })),
                h("button", {
                    type: "button", class: "bx-icon-sm", "aria-label": "Upravit šablonu",
                    onclick: () => { tplDraft = { id: t.id, name: t.name || "", amount: String(t.amount) }; sheetBack = null; sheet = { kind, mode: "tplform" }; render(); },
                }, icon("pencil", 18)),
                h("button", {
                    type: "button", class: "bx-icon-sm danger", "aria-label": "Smazat šablonu",
                    onclick: () => { templates = templates.filter((x) => x.id !== t.id); persistTemplates(); render(); },
                }, icon("trash", 18)))),
        h("button", {
            type: "button", class: "bx-btn bx-btn-wide", style: "margin-top:1rem",
            onclick: () => { tplDraft = { id: null, name: "", amount: "" }; sheetBack = null; sheet = { kind, mode: "tplform" }; render(); },
        }, icon("plus", 18), "Nová šablona"),
    ];
}

function tplFormSheet() {
    const save = () => {
        const v = parseFloat(tplDraft.amount);
        if (!v || v <= 0) { document.querySelector('[data-k="tamount"]')?.focus(); return; }
        const name = tplDraft.name.trim();
        if (tplDraft.id) {
            const t = templates.find((x) => x.id === tplDraft.id);
            if (t) { t.name = name; t.amount = v; }
        } else {
            templates.push({ id: genId(), name, amount: v });
        }
        persistTemplates();
        leaveTplForm();
    };
    const onKey = (e) => { if (e.key === "Enter") save(); };
    return [
        sheetHead(tplDraft.id ? "Upravit šablonu" : "Nová šablona", "Předvyplněný výdaj pro rychlé přidání", leaveTplForm),
        h("div", { class: "bx-field", style: "margin-bottom:0.7rem" },
            h("label", { for: "f-tname", text: "Název" }),
            h("input", { class: "bx-input", id: "f-tname", type: "text", maxlength: "60", placeholder: "Např. Snídaně", "data-k": "tname", value: tplDraft.name, onkeydown: onKey, oninput: (e) => { tplDraft.name = e.target.value; } })),
        h("div", { class: "bx-field", style: "margin-bottom:1rem" },
            h("label", { for: "f-tamount", text: "Částka" }),
            h("div", { class: "bx-input-wrap" },
                h("input", { class: "bx-input", id: "f-tamount", type: "number", inputmode: "numeric", min: "0", step: "1", placeholder: "0", "data-k": "tamount", value: tplDraft.amount, onkeydown: onKey, oninput: (e) => { tplDraft.amount = e.target.value; } }),
                h("span", { text: "Kč" }))),
        h("button", { type: "button", class: "bx-submit", text: "Uložit šablonu", onclick: save }),
    ];
}

function renderSheet() {
    if (sheet && sheet.mode === "day" && !periodDays.includes(sheet.date)) sheet = null;
    if (!sheet) {
        sheetBackdropEl.classList.add("hidden");
        return;
    }
    const top = sheetEl.scrollTop;
    const nodes = sheet.mode === "day" ? daySheet() : sheet.mode === "templates" ? templatesSheet() : tplFormSheet();
    setChildren(sheetEl, ...nodes.flat(Infinity).filter(Boolean));
    sheetBackdropEl.classList.remove("hidden");
    sheetEl.scrollTop = top;
}

// ----- Celoobrazovkové pohledy (historie = tlačítko Zpět funguje) -----
function pushView(name) {
    try { history.pushState({ bx: name }, ""); } catch { /* ignore */ }
}

function closeViews() {
    if (history.state && history.state.bx) {
        history.back();
    } else {
        bulk = null;
        subsOpen = false;
        subDraft = null;
        render();
    }
}

window.addEventListener("popstate", () => {
    if (bulk || subsOpen) {
        bulk = null;
        subsOpen = false;
        subDraft = null;
        subDeleteAsk = false;
        render();
    }
});

// ----- Hromadné přidání -----
function startBulk(kind, preset) {
    sheet = null;
    sheetBack = null;
    bulk = preset
        ? { kind, step: 2, amount: preset.amount, desc: preset.name || "", days: new Set() }
        : { kind, step: 1, amount: 0, desc: "", days: new Set() };
    bulkDraft = preset ? { amount: String(preset.amount), desc: preset.name || "" } : { amount: "", desc: "" };
    pushView("bulk");
    render();
}

function bulkGoNext() {
    const v = parseFloat(bulkDraft.amount);
    if (!v || v <= 0) { document.querySelector('[data-k="bamount"]')?.focus(); return; }
    bulk.amount = v;
    bulk.desc = bulkDraft.desc.trim();
    bulk.step = 2;
    render();
    viewBulkEl.scrollTop = 0;
}

function applyBulk() {
    if (!bulk || bulk.days.size === 0) return;
    const { kind, amount, desc } = bulk;
    const ctxData = kind === "actual" ? null : predictData;
    for (const d of bulk.days) {
        if (kind === "actual") {
            if (!budgetData.expenses) budgetData.expenses = {};
            if (!Array.isArray(budgetData.expenses[d])) budgetData.expenses[d] = [];
            budgetData.expenses[d].push({ id: genId(), amount, desc });
        } else {
            if (!Array.isArray(ctxData[d])) ctxData[d] = [];
            ctxData[d].push({ id: genId(), amount, desc });
        }
    }
    if (kind === "actual") debouncedSave();
    else debouncedPredictSave();
    bulk = null;
    render();
    closeViews();
}

function stepNode(num, label, state) {
    return h("div", { class: "bx-step " + state },
        h("i", {}, state === "done" ? icon("check", 16) : String(num)),
        h("span", { text: label }));
}

function renderBulk() {
    if (!bulk) {
        viewBulkEl.classList.add("hidden");
        return;
    }
    const wasHidden = viewBulkEl.classList.contains("hidden");
    const top = viewBulkEl.scrollTop;
    viewBulkEl.classList.remove("hidden");

    const header = h("div", { class: "bx-view-head" },
        h("h2", { text: "Hromadné přidání" }),
        h("button", { type: "button", class: "bx-link", text: "Zrušit", onclick: closeViews }));
    const steps = h("div", { class: "bx-steps" },
        stepNode(1, "Částka a popis", bulk.step === 1 ? "now" : "done"),
        stepNode(2, "Vyber dny", bulk.step === 2 ? "now" : ""));

    const nodes = [header, steps];
    if (bulk.step === 1) {
        const onKey = (e) => { if (e.key === "Enter") bulkGoNext(); };
        nodes.push(h("section", { class: "bx-card bx-form-card" },
            h("div", { class: "bx-form-grid" },
                h("div", { class: "bx-field" },
                    h("label", { for: "b-amount", text: "Částka" }),
                    h("div", { class: "bx-input-wrap" },
                        h("input", { class: "bx-input", id: "b-amount", type: "number", inputmode: "numeric", min: "0", step: "1", placeholder: "0", "data-k": "bamount", value: bulkDraft.amount, onkeydown: onKey, oninput: (e) => { bulkDraft.amount = e.target.value; } }),
                        h("span", { text: "Kč" }))),
                h("div", { class: "bx-field" },
                    h("label", { for: "b-desc", text: "Popis" }),
                    h("input", { class: "bx-input", id: "b-desc", type: "text", maxlength: "60", placeholder: "Např. snídaně", "data-k": "bdesc", value: bulkDraft.desc, onkeydown: onKey, oninput: (e) => { bulkDraft.desc = e.target.value; } }))),
            templates.length
                ? h("div", { class: "bx-chips" }, "Šablony:", templates.slice(0, 4).map((t) => h("button", {
                    type: "button", class: "bx-chip", text: (t.name || "Šablona") + " · " + fmtMoney(t.amount),
                    onclick: () => { bulkDraft = { amount: String(t.amount), desc: t.name || "" }; render(); },
                })))
                : null,
            h("button", { type: "button", class: "bx-submit", text: "Dál – vybrat dny", onclick: bulkGoNext })));
    } else {
        const count = bulk.days.size;
        nodes.push(
            h("div", { class: "bx-summary" },
                h("div", {}, h("small", { text: "Na každý vybraný den" }), h("strong", { text: (bulk.desc ? bulk.desc + " · " : "") + fmtMoney(bulk.amount) })),
                h("button", { type: "button", class: "bx-btn bx-btn-soft", text: "Upravit", onclick: () => { bulk.step = 1; bulkDraft = { amount: String(bulk.amount), desc: bulk.desc }; render(); } })),
            h("section", { class: "bx-card" },
                h("div", { class: "bx-card-head" }, h("strong", { text: fmtRange().replace(/ \d{4}$/, "") }), h("span", { class: "bx-muted", text: "Klepnutím vybereš den" })),
                buildCalendar(bulk.kind, {
                    select: bulk.days,
                    onPick: (d) => { if (bulk.days.has(d)) bulk.days.delete(d); else bulk.days.add(d); render(); },
                })));
        nodes.push(h("div", { class: "bx-bottom-bar" },
            h("div", { class: "bx-bottom-bar-inner" },
                h("div", {},
                    h("small", { text: count === 0 ? "Vyber alespoň 1 den" : "Vybráno " + count + " " + plural(count, "den", "dny", "dnů") }),
                    h("strong", { text: fmtMoney(bulk.amount * count) })),
                h("button", { type: "button", class: "bx-btn bx-btn-primary", text: "Přidat", disabled: count === 0, onclick: applyBulk })))); 
    }
    const inner = h("div", { class: "bx-view-inner" }, nodes.filter((n) => !n.classList.contains("bx-bottom-bar")));
    const bar = nodes.find((n) => n.classList.contains("bx-bottom-bar"));
    setChildren(viewBulkEl, inner);
    if (bar) viewBulkEl.append(bar);
    viewBulkEl.scrollTop = wasHidden ? 0 : top;
}

// ----- Správa předplatných -----
function newSubDraft() {
    return { id: null, name: "", amount: "", day: "", since: currentPeriodStart(), until: "", error: "" };
}

function openSubs() {
    subsOpen = true;
    subDraft = newSubDraft();
    subDeleteAsk = false;
    pushView("subs");
    render();
    viewSubsEl.scrollTop = 0;
}

function subsChanged() {
    persistSubs();
    render();
}

function fmtLong(dateStr) {
    const d = parseDate(dateStr);
    return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear();
}

function saveSub() {
    const name = subDraft.name.trim();
    const amount = parseFloat(subDraft.amount);
    const day = parseInt(subDraft.day, 10);
    let error = "";
    if (!name) error = "Zadej název předplatného.";
    else if (!amount || amount <= 0) error = "Zadej částku větší než 0.";
    else if (!day || day < 1 || day > 31) error = "Den v měsíci musí být 1–31.";
    else if (subDraft.until && subDraft.until < (subDraft.since || "")) error = "Datum Do nesmí být před datem Od.";
    if (error) {
        subDraft.error = error;
        render();
        return;
    }
    const since = subDraft.since || currentPeriodStart();
    if (subDraft.id) {
        const s = subs.find((x) => x.id === subDraft.id);
        if (s) {
            s.name = name; s.amount = amount; s.day = day; s.since = since;
            if (subDraft.until) s.until = subDraft.until; else delete s.until;
        }
    } else {
        subs.push({ id: genId(), name, amount, day, since, ...(subDraft.until ? { until: subDraft.until } : {}) });
    }
    subDraft = newSubDraft();
    subDeleteAsk = false;
    subsChanged();
}

function deleteSub() {
    subs = subs.filter((s) => s.id !== subDraft.id);
    subDraft = newSubDraft();
    subDeleteAsk = false;
    subsChanged();
}

function renderSubsView() {
    if (!subsOpen) {
        viewSubsEl.classList.add("hidden");
        return;
    }
    const wasHidden = viewSubsEl.classList.contains("hidden");
    const top = viewSubsEl.scrollTop;
    viewSubsEl.classList.remove("hidden");

    const today = fmtDate(new Date());
    const active = activeSubs();
    const total = active.reduce((t, s) => t + s.amount, 0);
    const amount = budgetData.amount || 0;
    const sorted = [...subs].sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "cs"));
    const editing = !!subDraft.id;

    const field = (label, key, props, wrapKc) => {
        const input = h("input", Object.assign({
            class: "bx-input", id: "s-" + key, "data-k": "s" + key, value: subDraft[key],
            oninput: (e) => { subDraft[key] = e.target.value; },
            onkeydown: (e) => { if (e.key === "Enter") saveSub(); },
        }, props));
        return h("div", { class: "bx-field" }, h("label", { for: "s-" + key, text: label }), wrapKc ? h("div", { class: "bx-input-wrap" }, input, h("span", { text: "Kč" })) : input);
    };

    const form = h("section", { class: "bx-card bx-form-card", id: "sub-form" },
        h("h3", { text: editing ? "Upravit předplatné" : "Nové předplatné" }),
        field("Název", "name", { type: "text", maxlength: "40", placeholder: "Např. Netflix" }),
        h("div", { class: "bx-form-two" },
            field("Částka", "amount", { type: "number", inputmode: "numeric", min: "0", step: "1", placeholder: "0" }, true),
            field("Den v měsíci", "day", { type: "number", inputmode: "numeric", min: "1", max: "31", step: "1", placeholder: "1–31" })),
        h("div", { class: "bx-form-two" },
            field("Od", "since", { type: "date" }),
            field("Do (nepovinné)", "until", { type: "date" })),
        h("p", { class: "bx-hint", text: "Pokud měsíc nemá zvolený den, platba se strhne poslední den měsíce. Pro ukončení se zachováním historie nastav datum Do." }),
        subDraft.error ? h("p", { class: "bx-hint", style: "color:#b3261e;font-weight:700", role: "alert", text: subDraft.error }) : null,
        h("button", { type: "button", class: "bx-submit", text: editing ? "Uložit změny" : "Přidat předplatné", onclick: saveSub }),
        editing
            ? h("div", { class: "bx-form-actions" },
                h("button", { type: "button", class: "bx-btn", text: "Zrušit úpravu", onclick: () => { subDraft = newSubDraft(); subDeleteAsk = false; render(); } }),
                subDeleteAsk
                    ? h("div", { class: "bx-danger-box" },
                        h("p", { text: "Smazáním se předplatné odstraní i z historie předchozích měsíců. Opravdu smazat?" }),
                        h("div", { class: "bx-confirm-actions" },
                            h("button", { type: "button", class: "bx-btn bx-btn-primary", text: "Smazat", onclick: deleteSub }),
                            h("button", { type: "button", class: "bx-btn", text: "Ponechat", onclick: () => { subDeleteAsk = false; render(); } })))
                    : h("button", { type: "button", class: "bx-btn bx-btn-danger", onclick: () => { subDeleteAsk = true; render(); } }, icon("trash", 18), "Smazat předplatné"))
            : null);

    const list = sorted.length
        ? h("section", { class: "bx-card" }, sorted.map((s) => {
            const next = logic.nextPaymentDate(s, today);
            return h("div", { class: "bx-sub-row" },
                h("span", { class: "bx-day-badge", text: s.day + "." }),
                h("div", { class: "t" },
                    h("strong", { text: s.name }),
                    h("small", { text: (next ? "Další platba " + fmtShort(next) : "Bez další platby") + " · od " + fmtLong(s.since) + (s.until ? " · do " + fmtLong(s.until) : "") })),
                h("span", { class: "amt", text: fmtMoney(s.amount) }),
                h("button", {
                    type: "button", class: "bx-icon-sm", "aria-label": "Upravit " + s.name,
                    onclick: () => {
                        subDraft = { id: s.id, name: s.name, amount: String(s.amount), day: String(s.day), since: s.since, until: s.until || "", error: "" };
                        subDeleteAsk = false;
                        render();
                        $("sub-form").scrollIntoView({ behavior: "smooth", block: "start" });
                    },
                }, icon("pencil", 20)));
        }))
        : null;

    setChildren(viewSubsEl, h("div", { class: "bx-view-inner" },
        h("div", { class: "bx-view-head" },
            h("button", { type: "button", class: "back", "aria-label": "Zpět", onclick: closeViews }, icon("left", 24), h("h2", { text: "Předplatná" }))),
        h("div", { class: "bx-total-card" },
            h("div", {}, h("small", { text: "Měsíčně celkem" }), h("strong", { text: fmtMoney(total) })),
            h("span", { text: active.length + " " + plural(active.length, "aktivní", "aktivní", "aktivních") + (amount > 0 && total > 0 ? " · " + fmtPct((total / amount) * 100) + " rozpočtu" : "") })),
        list,
        form));
    viewSubsEl.scrollTop = wasHidden ? 0 : top;
}

// ----- Události -----
function showNewMonthConfirm() {
    periodMenuOpen = false;
    updatePeriodMenu();
    newMonthConfirmEl.classList.remove("hidden");
}

function switchTab(tab) {
    activeTab = tab;
    sheet = null;
    sheetBack = null;
    editingEntryId = null;
    tabActual.classList.toggle("active", tab === "actual");
    tabPredict.classList.toggle("active", tab === "predict");
    tabActual.setAttribute("aria-selected", String(tab === "actual"));
    tabPredict.setAttribute("aria-selected", String(tab === "predict"));
    panelActual.classList.toggle("hidden", tab !== "actual");
    panelPredict.classList.toggle("hidden", tab !== "predict");
    render();
}

prevBtn.addEventListener("click", () => goToPeriod(periodOffset - 1));
nextBtn.addEventListener("click", () => goToPeriod(periodOffset + 1));
stickyPrev.addEventListener("click", () => goToPeriod(periodOffset - 1));
stickyNext.addEventListener("click", () => goToPeriod(periodOffset + 1));
stickyMid.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
periodLabelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    periodMenuOpen = !periodMenuOpen;
    updatePeriodMenu();
});
todayBtn.addEventListener("click", () => goToPeriod(0));
newMonthBtn.addEventListener("click", showNewMonthConfirm);
$("newmonth-yes").addEventListener("click", startNewMonth);
$("newmonth-no").addEventListener("click", hideNewMonthConfirm);
tabActual.addEventListener("click", () => switchTab("actual"));
tabPredict.addEventListener("click", () => switchTab("predict"));
quickAddBtn.addEventListener("click", () => { if (budgetData) openDaySheet("actual", fmtDate(new Date())); });
for (const kind of ["actual", "predict"]) {
    $("tpl-btn-" + kind).addEventListener("click", () => { if (budgetData) { sheet = { kind, mode: "templates" }; render(); } });
    $("bulk-btn-" + kind).addEventListener("click", () => { if (budgetData) startBulk(kind); });
}
sheetBackdropEl.addEventListener("click", (e) => { if (e.target === sheetBackdropEl) closeSheet(); });
document.addEventListener("click", (e) => {
    if (periodMenuOpen && !periodMenuEl.contains(e.target) && !periodLabelBtn.contains(e.target)) {
        periodMenuOpen = false;
        updatePeriodMenu();
    }
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (periodMenuOpen) { periodMenuOpen = false; updatePeriodMenu(); }
    else if (sheet) closeSheet();
});

prevBtn.append(icon("left", 22));
nextBtn.append(icon("right", 22));
stickyPrev.append(icon("left", 22));
stickyNext.append(icon("right", 22));
quickAddBtn.append(icon("plus", 18), "Výdaj dnes");
for (const kind of ["actual", "predict"]) {
    $("tpl-btn-" + kind).append(icon("layers", 18), "Šablony");
    $("bulk-btn-" + kind).append(icon("calcheck", 18), "Hromadně");
}
$("copy-prev-btn").append(icon("copy", 18), "Převzít plán z minulého období");
$("export-csv").append(icon("download", 18), "CSV období");
$("export-json").append(icon("download", 18), "Záloha (JSON)");

// ----- Inicializace -----
customStarts = loadCustomStartsLocal();
subs = loadSubsLocal();
templates = loadTemplatesLocal();
computePeriod(0);
updateNavBtns();
renderPeriod();

initNavigation("rozpocet", async (user) => {
    currentUser = user;
    if (user) {
        await withTimeout(loadCustomStartsFirestore(), 8000);
        computePeriod(periodOffset);
        updateNavBtns();
        Promise.all([loadSubsFirestore(), loadTemplatesFirestore()]).then(() => {
            if (budgetData) render();
        });
    }
    loadPeriodData();
});
