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
import * as logic from "./budget-logic.js?v=c61516c0";
const { fmtDate } = logic;

const REQUIRED_IDS = ["breakdown-box", "copy-prev-btn", "export-csv", "subs-until", "bulk-bar", "subs-box", "tpl-btn-actual", "tpl-btn-predict", "bulk-btn-actual", "bulk-btn-predict", "newmonth-confirm"];
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

function setChildren(el, ...nodes) {
    el.textContent = "";
    nodes.forEach((n) => el.appendChild(n));
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

// ----- Stav -----
let currentUser = null;
let unsubscribeBudget = null;
let budgetData = null; // { amount, expenses: { "YYYY-MM-DD": [{id, amount, desc}] } }
let predictData = {};  // { "YYYY-MM-DD": [{id, amount, desc}] } — plánované výdaje
let periodStart = null;
let periodEnd = null;
let periodDays = [];
let periodOffset = 0; // 0 = aktuální, -1 = předchozí, …
let openDay = null;
let openPredictDay = null;
let editingEntryId = null;
let activeTab = "actual";
let customStarts = [];

// ----- DOM -----
const periodEl = document.getElementById("budget-period");
const prevBtn = document.getElementById("period-prev");
const nextBtn = document.getElementById("period-next");
const todayBtn = document.getElementById("period-today");
const amountEl = document.getElementById("budget-amount");
const calendarEl = document.getElementById("budget-calendar");
const statTotalEl = document.getElementById("stat-total");
const statSpentEl = document.getElementById("stat-spent");
const statRemainingValueEl = document.getElementById("stat-remaining-value");
const statRemainingArrowEl = document.getElementById("stat-remaining-arrow");
const statDailyEl = document.getElementById("stat-daily");
const breakdownSummaryEl = document.getElementById("breakdown-summary");
const breakdownListEl = document.getElementById("breakdown-list");
const newMonthBtn = document.getElementById("new-month-btn");
const newMonthConfirmEl = document.getElementById("newmonth-confirm");
const newMonthYesBtn = document.getElementById("newmonth-yes");
const newMonthNoBtn = document.getElementById("newmonth-no");
const tabActual = document.getElementById("tab-actual");
const tabPredict = document.getElementById("tab-predict");
const panelActual = document.getElementById("panel-actual");
const panelPredict = document.getElementById("panel-predict");
const predictCalendarEl = document.getElementById("predict-calendar");
const predStatPlannedEl = document.getElementById("pred-stat-planned");
const predStatActualEl = document.getElementById("pred-stat-actual");
const predStatDiffEl = document.getElementById("pred-stat-diff");
const predStatUnplannedEl = document.getElementById("pred-stat-unplanned");

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

// ----- Navigace mezi obdobími -----
function periodExists(offset) {
    const b = buildBoundaries();
    const i = findCurrentIndex(b) + offset;
    return i >= 0 && i < b.length;
}

function updateNavBtns() {
    prevBtn.disabled = !periodExists(periodOffset - 1);
    nextBtn.disabled = !periodExists(periodOffset + 1);
}

function goToPeriod(offset) {
    if (!periodExists(offset)) return;
    periodOffset = offset;
    openDay = null;
    openPredictDay = null;
    editingEntryId = null;
    bulk = null;
    renderBulkBar();
    hideNewMonthConfirm();
    computePeriod(periodOffset);

    todayBtn.classList.toggle("hidden", isCurrentPeriod());
    updateNewMonthBtn();
    updateNavBtns();

    loadPeriodData();
}

function updateNewMonthBtn() {
    const today = fmtDate(new Date());
    const isFirst = today === fmtDate(periodStart);
    newMonthBtn.classList.toggle("hidden", !isCurrentPeriod() || isFirst);
}

function showCalendarLoading() {
    for (const el of [calendarEl, predictCalendarEl]) {
        const wrap = document.createElement("div");
        wrap.className = "budget-loading";
        wrap.setAttribute("role", "status");
        wrap.setAttribute("aria-label", "Načítání");
        const spinner = document.createElement("div");
        spinner.className = "budget-spinner";
        wrap.appendChild(spinner);
        setChildren(el, wrap);
    }
}

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
                if (activeTab === "predict") renderPredictPanel();
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
                amountEl.value = budgetData.amount || "";
                render();
            },
            (err) => {
                console.error("Firestore chyba:", err);
                budgetData = defaultBudget();
                amountEl.value = "";
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
        amountEl.value = budgetData.amount || "";
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

// ----- Záložky -----
function placeSubsBox() {
    const target = document.getElementById(activeTab === "actual" ? "budget-summary" : "predict-summary");
    target.after(document.getElementById("subs-box"));
}

function switchTab(tab) {
    activeTab = tab;
    placeSubsBox();
    bulk = null;
    openDay = null;
    openPredictDay = null;
    editingEntryId = null;
    renderBulkBar();
    tabActual.classList.toggle("active", tab === "actual");
    tabPredict.classList.toggle("active", tab === "predict");
    tabActual.setAttribute("aria-selected", tab === "actual");
    tabPredict.setAttribute("aria-selected", tab === "predict");
    panelActual.classList.toggle("hidden", tab !== "actual");
    panelPredict.classList.toggle("hidden", tab !== "predict");
    if (tab === "predict") renderPredictPanel();
}

// ----- Vykreslení -----
function render() {
    keepModalInputs = true;
    try {
        renderPeriod();
        renderSummary();
        renderCalendar();
        if (activeTab === "predict") renderPredictPanel();
    } finally {
        keepModalInputs = false;
    }
}

function renderPeriod() {
    periodEl.textContent =
        fmtDateCZ(fmtDate(periodStart)) + " – " + fmtDateCZ(fmtDate(periodEnd));
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
    breakdownSummaryEl.textContent = "Výdaje podle popisu" + (groups.length ? " · " + groups.length : "");
    setChildren(breakdownListEl);
    if (groups.length === 0) {
        const p = document.createElement("p");
        p.className = "budget-modal-hint";
        p.textContent = "V tomto období zatím nejsou žádné výdaje.";
        breakdownListEl.appendChild(p);
        return;
    }
    const max = groups[0].total || 1;
    groups.forEach((g) => {
        const row = document.createElement("div");
        row.className = "breakdown-row";
        const label = document.createElement("span");
        label.className = "breakdown-label";
        label.textContent = g.label + (g.count > 1 ? " (" + g.count + "×)" : "");
        const value = document.createElement("strong");
        value.textContent = fmtMoney(g.total);
        const bar = document.createElement("div");
        bar.className = "breakdown-bar";
        const fill = document.createElement("div");
        fill.className = "breakdown-fill";
        fill.style.width = Math.max(2, Math.round((g.total / max) * 100)) + "%";
        bar.appendChild(fill);
        row.appendChild(label);
        row.appendChild(value);
        row.appendChild(bar);
        breakdownListEl.appendChild(row);
    });
}

function renderSummary() {
    renderBreakdown();
    const total = budgetData.amount || 0;
    const spent = totalSpent();
    const remaining = total - spent;
    const daily = dailyBudget();

    statTotalEl.textContent = fmtMoney(total);
    statSpentEl.textContent = fmtMoney(spent);
    statRemainingValueEl.textContent = fmtMoney(remaining);
    statDailyEl.textContent = fmtMoney(Math.round(daily));

    const expected = expectedRemainingToday();
    if (total > 0) {
        statRemainingArrowEl.classList.remove("hidden");
        if (remaining < expected) {
            statRemainingArrowEl.textContent = "▼";
            statRemainingArrowEl.className = "budget-arrow arrow-down";
        } else {
            statRemainingArrowEl.textContent = "▲";
            statRemainingArrowEl.className = "budget-arrow arrow-up";
        }
    } else {
        statRemainingArrowEl.classList.add("hidden");
    }
}

function renderCalendar() {
    calendarEl.innerHTML = "";
    const today = fmtDate(new Date());
    const daily = dailyBudget();

    const dayNames = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
    const headerRow = document.createElement("div");
    headerRow.className = "budget-cal-header";
    dayNames.forEach((name) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-dayname";
        cell.textContent = name;
        headerRow.appendChild(cell);
    });
    calendarEl.appendChild(headerRow);

    const grid = document.createElement("div");
    grid.className = "budget-cal-grid";

    const firstDayOfWeek = periodStart.getDay();
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "budget-cal-cell budget-cal-empty";
        grid.appendChild(empty);
    }

    // Pro historické období: poměr k průměrnému dennímu budgetu
    const avgDaily = periodDays.length > 0 ? budgetData.amount / periodDays.length : 0;
    const colorDaily = isCurrentPeriod() ? daily : avgDaily;

    periodDays.forEach((dateStr) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-cell";

        const spent = daySpent(dateStr);
        const dayNum = parseInt(dateStr.split("-")[2]);

        if (colorDaily > 0) {
            const ratio = spent / colorDaily;
            if (spent === 0) {
                cell.classList.add("budget-day-neutral");
            } else if (ratio <= 1) {
                cell.classList.add("budget-day-ok");
            } else if (ratio <= 1.5) {
                cell.classList.add("budget-day-warn");
            } else {
                cell.classList.add("budget-day-over");
            }
        }

        if (dateStr === today) cell.classList.add("budget-day-today");

        const numEl = document.createElement("span");
        numEl.className = "budget-cal-num";
        numEl.textContent = dayNum;
        cell.appendChild(numEl);
        if (subsOn(dateStr).length > 0) {
            const dot = document.createElement("span");
            dot.className = "budget-sub-dot";
            dot.title = "Předplatné";
            cell.appendChild(dot);
        }

        if (spent > 0) {
            const spentEl = document.createElement("span");
            spentEl.className = "budget-cal-spent";
            spentEl.textContent = fmtMoney(spent);
            cell.appendChild(spentEl);
            const count = (budgetData.expenses[dateStr] || []).length;
            if (count > 1) {
                const badge = document.createElement("span");
                badge.className = "budget-cal-count";
                badge.textContent = count + "×";
                cell.appendChild(badge);
            }
        }

        cell.addEventListener("click", (e) => {
            e.stopPropagation();
            onDayClick("actual", dateStr);
        });

        if (openDay === dateStr) cell.classList.add("budget-cell-open");
        if (isBulkSelected("actual", dateStr)) cell.classList.add("budget-day-selected");

        grid.appendChild(cell);
    });

    calendarEl.appendChild(grid);
    syncModal();
}

// ----- Predikční panel -----
function renderPredictPanel() {
    renderPredictSummary();
    renderPredictCalendar();
}

function renderPredictSummary() {
    const planned = totalPredicted();
    const actual = totalSpent();
    const diff = actual - planned;
    const budget = budgetData.amount || 0;
    const unplanned = Math.max(0, budget - planned);

    predStatPlannedEl.textContent = fmtMoney(planned);
    predStatActualEl.textContent = fmtMoney(actual);

    predStatDiffEl.textContent = (diff >= 0 ? "+" : "") + fmtMoney(diff);
    predStatDiffEl.className = "budget-stat-value pred-diff" +
        (diff > 0 ? " pred-diff-over" : diff < 0 ? " pred-diff-under" : "");

    predStatUnplannedEl.textContent = fmtMoney(unplanned);
}

function renderPredictCalendar() {
    predictCalendarEl.innerHTML = "";
    const today = fmtDate(new Date());

    const dayNames = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
    const headerRow = document.createElement("div");
    headerRow.className = "budget-cal-header";
    dayNames.forEach((name) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-dayname";
        cell.textContent = name;
        headerRow.appendChild(cell);
    });
    predictCalendarEl.appendChild(headerRow);

    const grid = document.createElement("div");
    grid.className = "budget-cal-grid";

    const firstDayOfWeek = periodStart.getDay();
    const calOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    for (let i = 0; i < calOffset; i++) {
        const empty = document.createElement("div");
        empty.className = "budget-cal-cell budget-cal-empty";
        grid.appendChild(empty);
    }

    const avgDaily = periodDays.length > 0 ? (budgetData.amount || 0) / periodDays.length : 0;

    periodDays.forEach((dateStr) => {
        const cell = document.createElement("div");
        cell.className = "budget-cal-cell";

        const predicted = dayPredicted(dateStr);
        const actual = daySpent(dateStr);
        const isPast = dateStr < today;
        const isToday = dateStr === today;
        const dayNum = parseInt(dateStr.split("-")[2]);

        // Barevné kódování: minulé dny → porovnej plán vs skutečnost
        //                   budoucí dny → porovnej plán vs průměrný denní budget
        if (avgDaily > 0) {
            if (isPast || isToday) {
                if (predicted === 0 && actual === 0) {
                    cell.classList.add("budget-day-neutral");
                } else {
                    const ref = predicted > 0 ? predicted : avgDaily;
                    const ratio = actual / ref;
                    if (ratio <= 1) cell.classList.add("budget-day-ok");
                    else if (ratio <= 1.5) cell.classList.add("budget-day-warn");
                    else cell.classList.add("budget-day-over");
                }
            } else {
                if (predicted === 0) {
                    cell.classList.add("budget-day-neutral");
                } else {
                    const ratio = predicted / avgDaily;
                    if (ratio <= 1) cell.classList.add("budget-day-ok");
                    else if (ratio <= 1.5) cell.classList.add("budget-day-warn");
                    else cell.classList.add("budget-day-over");
                }
            }
        }

        if (isToday) cell.classList.add("budget-day-today");

        const numEl = document.createElement("span");
        numEl.className = "budget-cal-num";
        numEl.textContent = dayNum;
        cell.appendChild(numEl);
        if (subsOn(dateStr).length > 0) {
            const dot = document.createElement("span");
            dot.className = "budget-sub-dot";
            dot.title = "Předplatné";
            cell.appendChild(dot);
        }

        // Zobraz predikci (a pro minulé dny i skutečnost)
        if (predicted > 0 || (isPast && actual > 0)) {
            const lineEl = document.createElement("span");
            lineEl.className = "budget-cal-spent";
            if (isPast && actual > 0 && predicted > 0) {
                lineEl.textContent = fmtMoney(actual) + " / " + fmtMoney(predicted);
                lineEl.className = "budget-cal-spent pred-both";
            } else if (isPast && actual > 0) {
                lineEl.textContent = fmtMoney(actual);
            } else if (predicted > 0) {
                lineEl.textContent = "~ " + fmtMoney(predicted);
                lineEl.className = "budget-cal-spent pred-planned";
            }
            cell.appendChild(lineEl);
        }

        cell.addEventListener("click", (e) => {
            e.stopPropagation();
            onDayClick("predict", dateStr);
        });

        if (openPredictDay === dateStr) cell.classList.add("budget-cell-open");
        if (isBulkSelected("predict", dateStr)) cell.classList.add("budget-day-selected");

        grid.appendChild(cell);
    });

    predictCalendarEl.appendChild(grid);
    syncModal();
}

const predictCtx = {
    title: "Plán",
    entries: (d) => predictData[d] || [],
    add: (d, amount, desc) => {
        if (!Array.isArray(predictData[d])) predictData[d] = [];
        predictData[d].push({ id: genId(), amount, desc });
        afterPredictChange();
    },
    update: (d, id, amount, desc) => {
        const entry = (predictData[d] || []).find((e) => e.id === id);
        if (!entry) return;
        entry.amount = amount;
        entry.desc = desc;
        editingEntryId = null;
        afterPredictChange();
    },
    remove: (d, id) => {
        predictData[d] = (predictData[d] || []).filter((e) => e.id !== id);
        if (predictData[d].length === 0) delete predictData[d];
        afterPredictChange();
    },
    rerender: () => renderPredictCalendar(),
    complete: (d, entry) => completePrediction(d, entry),
    completeAll: (d) => (predictData[d] || []).filter((e) => !e.done).forEach((e) => completePrediction(d, e)),
};

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

function afterPredictChange() {
    debouncedPredictSave();
    renderPredictSummary();
    renderPredictCalendar();
}

// ----- Inline bublina (+/- ovládání) -----
const expenseCtx = {
    title: "Výdaje",
    entries: (d) => (budgetData.expenses && budgetData.expenses[d]) || [],
    add: (d, amount, desc) => addEntry(d, amount, desc),
    update: (d, id, amount, desc) => updateEntry(d, id, amount, desc),
    remove: (d, id) => removeEntry(d, id),
    rerender: () => renderCalendar(),
};

function createBubble(dateStr, ctx) {
    const card = document.createElement("div");
    card.className = "budget-modal-card";

    const head = document.createElement("div");
    head.className = "budget-modal-head";
    const title = document.createElement("strong");
    title.textContent = ctx.title + " – " + fmtDateCZ(dateStr);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "budget-entry-del";
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Zavřít");
    closeBtn.addEventListener("click", closeAllPopups);
    head.appendChild(title);
    head.appendChild(closeBtn);
    card.appendChild(head);

    const form = document.createElement("div");
    form.className = "budget-entry-form";

    const amtInput = document.createElement("input");
    amtInput.type = "number";
    amtInput.className = "budget-entry-amt";
    amtInput.placeholder = "Kč";
    amtInput.min = "0";
    amtInput.step = "1";
    amtInput.inputMode = "numeric";

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.className = "budget-entry-desc";
    descInput.placeholder = "Popis…";
    descInput.maxLength = 60;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "budget-entry-add";
    addBtn.textContent = "Přidat";

    const doAdd = (e) => {
        e.stopPropagation();
        const amount = parseFloat(amtInput.value);
        if (!amount || amount <= 0) { amtInput.focus(); return; }
        ctx.add(dateStr, amount, descInput.value.trim());
    };

    addBtn.addEventListener("click", doAdd);
    [amtInput, descInput].forEach((inp) => {
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(e); });
        inp.addEventListener("click", (e) => e.stopPropagation());
    });

    form.appendChild(amtInput);
    form.appendChild(descInput);
    form.appendChild(addBtn);
    card.appendChild(form);

    const entries = ctx.entries(dateStr);
    if (ctx.completeAll && entries.some((e) => !e.done)) {
        const all = document.createElement("button");
        all.type = "button";
        all.className = "budget-entry-cancel budget-complete-all";
        all.textContent = "Převést vše na výdaje";
        all.addEventListener("click", (e) => { e.stopPropagation(); ctx.completeAll(dateStr); });
        card.appendChild(all);
    }
    const subRows = subsOn(dateStr);
    if (entries.length > 0 || subRows.length > 0) {
        const list = document.createElement("div");
        list.className = "budget-entry-list";
        subRows.forEach((sub) => {
            const row = document.createElement("div");
            row.className = "budget-entry-row budget-entry-sub";
            const info = document.createElement("span");
            info.className = "budget-entry-info";
            info.textContent = "🔁 " + fmtMoney(sub.amount) + " – " + sub.name;
            row.appendChild(info);
            if (ctx.title === "Výdaje") {
                const charged = logic.subCharged(sub, dateStr, fmtDate(new Date()));
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "budget-entry-cancel budget-sub-paid" + (charged ? " is-paid" : "");
                toggle.textContent = charged ? "✓ zaplaceno" : "nezaplaceno";
                toggle.title = "Přepnout stav platby";
                toggle.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (!sub.paid) sub.paid = {};
                    sub.paid[dateStr] = !charged;
                    subsChanged();
                });
                row.appendChild(toggle);
            }
            list.appendChild(row);
        });
        entries.forEach((entry) => {
            if (editingEntryId === entry.id) {
                list.appendChild(createEditRow(dateStr, entry, ctx));
                return;
            }
            const row = document.createElement("div");
            row.className = "budget-entry-row";

            const info = document.createElement("span");
            info.className = "budget-entry-info";
            info.textContent = fmtMoney(entry.amount) + (entry.desc ? " – " + entry.desc : "");

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "budget-entry-del budget-entry-edit";
            editBtn.textContent = "✎";
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                editingEntryId = entry.id;
                ctx.rerender();
            });

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "budget-entry-del";
            delBtn.textContent = "✕";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                ctx.remove(dateStr, entry.id);
            });

            row.appendChild(info);
            if (ctx.complete) {
                if (entry.done) {
                    const tag = document.createElement("span");
                    tag.className = "budget-done-tag";
                    tag.textContent = "✓ převedeno";
                    row.appendChild(tag);
                } else {
                    const done = document.createElement("button");
                    done.type = "button";
                    done.className = "budget-entry-cancel budget-sub-paid";
                    done.textContent = "→ výdaj";
                    done.title = "Převést na skutečný výdaj";
                    done.addEventListener("click", (e) => {
                        e.stopPropagation();
                        ctx.complete(dateStr, entry);
                    });
                    row.appendChild(done);
                }
            }
            row.appendChild(editBtn);
            row.appendChild(delBtn);
            list.appendChild(row);
        });
        card.appendChild(list);
    }

    card.addEventListener("click", (e) => e.stopPropagation());
    return card;
}

function createEditRow(dateStr, entry, ctx) {
    const row = document.createElement("div");
    row.className = "budget-entry-row budget-entry-editing";

    const amt = document.createElement("input");
    amt.type = "number";
    amt.className = "budget-entry-amt";
    amt.min = "0";
    amt.step = "1";
    amt.inputMode = "numeric";
    amt.value = entry.amount;

    const desc = document.createElement("input");
    desc.type = "text";
    desc.className = "budget-entry-desc";
    desc.maxLength = 60;
    desc.value = entry.desc || "";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "budget-entry-add";
    save.textContent = "✓";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "budget-entry-cancel";
    cancel.textContent = "✕";

    const doSave = (e) => {
        e.stopPropagation();
        const v = parseFloat(amt.value);
        if (!v || v <= 0) { amt.focus(); return; }
        ctx.update(dateStr, entry.id, v, desc.value.trim());
    };
    save.addEventListener("click", doSave);
    cancel.addEventListener("click", (e) => {
        e.stopPropagation();
        editingEntryId = null;
        ctx.rerender();
    });
    [amt, desc].forEach((inp) => {
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(e); });
        inp.addEventListener("click", (e) => e.stopPropagation());
    });

    row.appendChild(amt);
    row.appendChild(desc);
    row.appendChild(save);
    row.appendChild(cancel);
    return row;
}

function updateEntry(dateStr, entryId, amount, desc) {
    const list = budgetData.expenses && budgetData.expenses[dateStr];
    if (!Array.isArray(list)) return;
    const entry = list.find((e) => e.id === entryId);
    if (!entry) return;
    entry.amount = amount;
    entry.desc = desc;
    editingEntryId = null;
    debouncedSave();
    renderSummary();
    renderCalendar();
}

function addEntry(dateStr, amount, desc) {
    if (!budgetData.expenses) budgetData.expenses = {};
    if (!Array.isArray(budgetData.expenses[dateStr])) budgetData.expenses[dateStr] = [];
    budgetData.expenses[dateStr].push({ id: genId(), amount, desc });
    debouncedSave();
    renderSummary();
    renderCalendar();
}

function removeEntry(dateStr, entryId) {
    if (!budgetData.expenses || !Array.isArray(budgetData.expenses[dateStr])) return;
    budgetData.expenses[dateStr] = budgetData.expenses[dateStr].filter((e) => e.id !== entryId);
    if (budgetData.expenses[dateStr].length === 0) delete budgetData.expenses[dateStr];
    debouncedSave();
    renderSummary();
    renderCalendar();
}

function closeAllPopups() {
    const hadDay = openDay !== null;
    const hadPredict = openPredictDay !== null;
    const hadBulkForm = bulk && bulk.step === "form";
    tplMenuKind = null;
    tplFormKind = null;
    tplEditId = null;
    renderTplMenus();
    openDay = null;
    openPredictDay = null;
    editingEntryId = null;
    if (hadBulkForm) bulk = null;
    if (hadDay) renderCalendar();
    if (hadPredict) renderPredictCalendar();
    if (hadBulkForm) { renderCalendar(); renderPredictCalendar(); }
    syncModal();
    renderBulkBar();
}

document.addEventListener("click", closeAllPopups);

// ----- Modální okno (pevná pozice, klávesnice s ním nehýbe) -----
const modalHost = document.createElement("div");
modalHost.className = "budget-modal-backdrop hidden";
document.body.appendChild(modalHost);

function syncModal() {
    let card = null;
    if (tplFormKind) card = createTemplateForm();
    else if (bulk && bulk.step === "form") card = createBulkForm();
    else if (!bulk && activeTab === "actual" && openDay) card = createBubble(openDay, expenseCtx);
    else if (!bulk && activeTab === "predict" && openPredictDay) card = createBubble(openPredictDay, predictCtx);

    if (!card) {
        modalHost.classList.add("hidden");
        setChildren(modalHost);
        return;
    }
    const isDayPopup = !tplFormKind && !bulk;
    modalHost.classList.toggle("budget-modal-passthrough", isDayPopup);
    const saved = keepModalInputs ? captureModalInputs() : null;
    setChildren(modalHost, card);
    modalHost.classList.remove("hidden");
    if (saved) restoreModalInputs(saved);
}

let keepModalInputs = false;

function captureModalInputs() {
    const inputs = [...modalHost.querySelectorAll("input")];
    if (inputs.length === 0) return null;
    return { values: inputs.map((i) => i.value), focus: inputs.indexOf(document.activeElement) };
}

function restoreModalInputs(saved) {
    const inputs = [...modalHost.querySelectorAll("input")];
    if (inputs.length !== saved.values.length) return;
    inputs.forEach((inp, i) => { inp.value = saved.values[i]; });
    if (saved.focus >= 0) inputs[saved.focus].focus();
}

// ----- Hromadné přidání -----
let bulk = null; // { kind, step: "form" | "select", amount, desc, days: Set }
const bulkBarEl = document.getElementById("bulk-bar");

function isBulkSelected(kind, dateStr) {
    return !!(bulk && bulk.step === "select" && bulk.kind === kind && bulk.days.has(dateStr));
}

function rerenderKind(kind) {
    if (kind === "actual") renderCalendar();
    else renderPredictCalendar();
}

function onDayClick(kind, dateStr) {
    if (bulk) {
        if (bulk.step !== "select" || bulk.kind !== kind) return;
        if (bulk.days.has(dateStr)) bulk.days.delete(dateStr);
        else bulk.days.add(dateStr);
        rerenderKind(kind);
        renderBulkBar();
        return;
    }
    editingEntryId = null;
    if (kind === "actual") {
        openDay = openDay === dateStr ? null : dateStr;
        renderCalendar();
    } else {
        openPredictDay = openPredictDay === dateStr ? null : dateStr;
        renderPredictCalendar();
    }
}

function startBulk(kind, preset) {
    openDay = null;
    openPredictDay = null;
    editingEntryId = null;
    tplMenuKind = null;
    tplFormKind = null;
    bulk = preset
        ? { kind, step: "select", amount: preset.amount, desc: preset.name, days: new Set() }
        : { kind, step: "form", amount: 0, desc: "", days: new Set() };
    renderTplMenus();
    renderCalendar();
    renderPredictCalendar();
    renderBulkBar();
}

function cancelBulk() {
    if (!bulk) return;
    bulk = null;
    renderCalendar();
    renderPredictCalendar();
    renderBulkBar();
}

function createBulkForm() {
    const card = document.createElement("div");
    card.className = "budget-modal-card";

    const head = document.createElement("div");
    head.className = "budget-modal-head";
    const title = document.createElement("strong");
    title.textContent = "Hromadné přidání – " + (bulk.kind === "actual" ? "výdaje" : "plán");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "budget-entry-del";
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Zavřít");
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); cancelBulk(); });
    head.appendChild(title);
    head.appendChild(closeBtn);
    card.appendChild(head);

    const form = document.createElement("div");
    form.className = "budget-entry-form";

    const amt = document.createElement("input");
    amt.type = "number";
    amt.className = "budget-entry-amt";
    amt.placeholder = "Kč";
    amt.min = "0";
    amt.step = "1";
    amt.inputMode = "numeric";
    if (bulk.amount) amt.value = bulk.amount;

    const desc = document.createElement("input");
    desc.type = "text";
    desc.className = "budget-entry-desc";
    desc.placeholder = "Popis…";
    desc.maxLength = 60;
    desc.value = bulk.desc;

    form.appendChild(amt);
    form.appendChild(desc);
    card.appendChild(form);

    const hint = document.createElement("p");
    hint.className = "budget-modal-hint";
    hint.textContent = "Po kliknutí na Dál označ v kalendáři dny, kterým se částka přidá.";
    card.appendChild(hint);

    const actions = document.createElement("div");
    actions.className = "budget-confirm-actions";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "budget-entry-add";
    next.textContent = "Dál – vybrat dny";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "budget-entry-cancel";
    cancel.textContent = "Zrušit";

    const goNext = (e) => {
        e.stopPropagation();
        const v = parseFloat(amt.value);
        if (!v || v <= 0) { amt.focus(); return; }
        bulk.amount = v;
        bulk.desc = desc.value.trim();
        bulk.step = "select";
        syncModal();
        renderBulkBar();
    };
    next.addEventListener("click", goNext);
    cancel.addEventListener("click", (e) => { e.stopPropagation(); cancelBulk(); });
    [amt, desc].forEach((inp) => {
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") goNext(e); });
        inp.addEventListener("click", (e) => e.stopPropagation());
    });
    actions.appendChild(next);
    actions.appendChild(cancel);
    card.appendChild(actions);

    card.addEventListener("click", (e) => e.stopPropagation());
    return card;
}

function renderBulkBar() {
    if (!bulk || bulk.step !== "select") {
        bulkBarEl.classList.add("hidden");
        setChildren(bulkBarEl);
        document.body.classList.remove("bulk-active");
        return;
    }
    const count = bulk.days.size;

    const info = document.createElement("div");
    info.className = "bulk-bar-info";
    const line1 = document.createElement("strong");
    line1.textContent = fmtMoney(bulk.amount) + (bulk.desc ? " – " + bulk.desc : "");
    const line2 = document.createElement("span");
    line2.textContent = count === 0
        ? "Klikni v kalendáři na dny (min. 1)"
        : "Vybráno dnů: " + count + " · celkem " + fmtMoney(bulk.amount * count);
    info.appendChild(line1);
    info.appendChild(line2);

    const actions = document.createElement("div");
    actions.className = "budget-confirm-actions";

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "budget-entry-add";
    apply.textContent = "Přidat";
    apply.disabled = count === 0;
    apply.addEventListener("click", (e) => { e.stopPropagation(); applyBulk(); });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "budget-entry-cancel";
    edit.textContent = "Upravit";
    edit.addEventListener("click", (e) => { e.stopPropagation(); bulk.step = "form"; syncModal(); renderBulkBar(); });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "budget-entry-cancel";
    cancel.textContent = "Zrušit";
    cancel.addEventListener("click", (e) => { e.stopPropagation(); cancelBulk(); });

    actions.appendChild(apply);
    actions.appendChild(edit);
    actions.appendChild(cancel);

    setChildren(bulkBarEl, info, actions);
    bulkBarEl.classList.remove("hidden");
    document.body.classList.add("bulk-active");
}

function applyBulk() {
    if (!bulk || bulk.days.size === 0) return;
    const { kind, amount, desc } = bulk;
    const days = [...bulk.days];
    if (kind === "actual") {
        if (!budgetData.expenses) budgetData.expenses = {};
        for (const d of days) {
            if (!Array.isArray(budgetData.expenses[d])) budgetData.expenses[d] = [];
            budgetData.expenses[d].push({ id: genId(), amount, desc });
        }
        debouncedSave();
    } else {
        for (const d of days) {
            if (!Array.isArray(predictData[d])) predictData[d] = [];
            predictData[d].push({ id: genId(), amount, desc });
        }
        debouncedPredictSave();
    }
    bulk = null;
    renderSummary();
    renderCalendar();
    renderPredictSummary();
    renderPredictCalendar();
    renderBulkBar();
}

function fmtMoney(n) {
    return n.toLocaleString("cs-CZ") + " Kč";
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

function hideNewMonthConfirm() {
    newMonthConfirmEl.classList.add("hidden");
}

function showNewMonthConfirm() {
    newMonthConfirmEl.classList.remove("hidden");
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
    amountEl.value = budgetData.amount || "";
    await persistBudgetData();

    loadPeriodData();
}

// ----- Změna rozpočtu -----
function onBudgetAmountChange() {
    if (!budgetData) return;
    budgetData.amount = parseFloat(amountEl.value) || 0;
    renderSummary();
    renderCalendar();
    debouncedSave();
}

// ----- Předplatná (opakující se měsíční platby) -----
const SUBS_KEY = "recept.budget.subs.v1";
let subs = []; // [{ id, name, amount, day, since }]
let editingSubId = null;

const subsSummaryEl = document.getElementById("subs-summary");
const subsListEl = document.getElementById("subs-list");
const subsNameEl = document.getElementById("subs-name");
const subsAmountEl = document.getElementById("subs-amount");
const subsDayEl = document.getElementById("subs-day");
const subsSinceEl = document.getElementById("subs-since");
const subsUntilEl = document.getElementById("subs-until");
const subsAddBtn = document.getElementById("subs-add");

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

function subsChanged() {
    persistSubs();
    renderSubs();
    if (budgetData) render();
}

function renderSubs() {
    const total = subs.reduce((t, s) => t + s.amount, 0);
    subsSummaryEl.textContent = "Předplatná" + (subs.length ? " · " + subs.length + " · " + fmtMoney(total) + " / měs." : "");

    setChildren(subsListEl);
    [...subs].sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "cs")).forEach((sub) => {
        if (editingSubId === sub.id) {
            subsListEl.appendChild(createSubEditRow(sub));
            return;
        }
        const row = document.createElement("div");
        row.className = "budget-entry-row";

        const info = document.createElement("span");
        info.className = "budget-entry-info";
        info.textContent = sub.name + " – " + fmtMoney(sub.amount) + " (" + sub.day + ". v měsíci" + (sub.until ? ", do " + fmtDateCZ(sub.until) : "") + ")";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "budget-entry-del budget-entry-edit";
        editBtn.textContent = "✎";
        editBtn.addEventListener("click", () => { editingSubId = sub.id; renderSubs(); });

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "budget-entry-del";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => {
            subs = subs.filter((s) => s.id !== sub.id);
            subsChanged();
        });

        row.appendChild(info);
        row.appendChild(editBtn);
        row.appendChild(delBtn);
        subsListEl.appendChild(row);
    });
}

function createSubEditRow(sub) {
    const row = document.createElement("div");
    row.className = "budget-entry-row budget-entry-editing";

    const name = document.createElement("input");
    name.type = "text";
    name.className = "budget-entry-desc";
    name.maxLength = 40;
    name.value = sub.name;

    const amt = document.createElement("input");
    amt.type = "number";
    amt.className = "budget-entry-amt";
    amt.min = "0";
    amt.inputMode = "numeric";
    amt.value = sub.amount;

    const day = document.createElement("input");
    day.type = "number";
    day.className = "budget-entry-amt";
    day.min = "1";
    day.max = "31";
    day.inputMode = "numeric";
    day.value = sub.day;

    const until = document.createElement("input");
    until.type = "date";
    until.className = "budget-entry-desc";
    until.title = "Platí do (nepovinné)";
    until.value = sub.until || "";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "budget-entry-add";
    save.textContent = "✓";
    save.addEventListener("click", () => {
        const a = parseFloat(amt.value);
        const d = parseInt(day.value, 10);
        const n = name.value.trim();
        if (!n) { name.focus(); return; }
        if (!a || a <= 0) { amt.focus(); return; }
        if (!d || d < 1 || d > 31) { day.focus(); return; }
        sub.name = n;
        sub.amount = a;
        sub.day = d;
        if (until.value) sub.until = until.value;
        else delete sub.until;
        editingSubId = null;
        subsChanged();
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "budget-entry-cancel";
    cancel.textContent = "✕";
    cancel.addEventListener("click", () => { editingSubId = null; renderSubs(); });

    row.appendChild(name);
    row.appendChild(amt);
    row.appendChild(day);
    row.appendChild(until);
    row.appendChild(save);
    row.appendChild(cancel);
    return row;
}

function addSubscription() {
    const name = subsNameEl.value.trim();
    const amount = parseFloat(subsAmountEl.value);
    const day = parseInt(subsDayEl.value, 10);
    if (!name) { subsNameEl.focus(); return; }
    if (!amount || amount <= 0) { subsAmountEl.focus(); return; }
    if (!day || day < 1 || day > 31) { subsDayEl.focus(); return; }
    subs.push({
        id: genId(),
        name,
        amount,
        day,
        since: subsSinceEl.value || currentPeriodStart(),
        ...(subsUntilEl.value ? { until: subsUntilEl.value } : {}),
    });
    subsNameEl.value = "";
    subsAmountEl.value = "";
    subsDayEl.value = "";
    subsSinceEl.value = currentPeriodStart();
    subsUntilEl.value = "";
    subsChanged();
}

subsAddBtn.addEventListener("click", addSubscription);
[subsNameEl, subsAmountEl, subsDayEl].forEach((el) =>
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") addSubscription(); }));

// ----- Šablony útrat -----
const TPL_KEY = "recept.budget.templates.v1";
let templates = []; // [{ id, name, amount }]
let tplMenuKind = null;
let tplFormKind = null;
let tplEditId = null;

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

function renderTplMenus() {
    ["actual", "predict"].forEach((kind) => {
        const menu = document.getElementById("tpl-menu-" + kind);
        setChildren(menu);
        menu.classList.toggle("hidden", tplMenuKind !== kind);
        if (tplMenuKind !== kind) return;

        if (templates.length === 0) {
            const empty = document.createElement("p");
            empty.className = "budget-modal-hint";
            empty.textContent = "Zatím žádné šablony.";
            menu.appendChild(empty);
        }
        templates.forEach((t) => {
            const item = document.createElement("div");
            item.className = "tpl-item";

            const use = document.createElement("button");
            use.type = "button";
            use.className = "tpl-use";
            use.textContent = (t.name ? t.name + " – " : "") + fmtMoney(t.amount);
            use.addEventListener("click", (e) => { e.stopPropagation(); startBulk(kind, t); });

            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "budget-entry-del budget-entry-edit";
            edit.textContent = "✎";
            edit.setAttribute("aria-label", "Upravit šablonu");
            edit.addEventListener("click", (e) => {
                e.stopPropagation();
                tplEditId = t.id;
                tplFormKind = kind;
                tplMenuKind = null;
                renderTplMenus();
                syncModal();
            });

            const del = document.createElement("button");
            del.type = "button";
            del.className = "budget-entry-del";
            del.textContent = "✕";
            del.setAttribute("aria-label", "Smazat šablonu");
            del.addEventListener("click", (e) => {
                e.stopPropagation();
                templates = templates.filter((x) => x.id !== t.id);
                persistTemplates();
                renderTplMenus();
            });

            item.appendChild(use);
            item.appendChild(edit);
            item.appendChild(del);
            menu.appendChild(item);
        });

        const add = document.createElement("button");
        add.type = "button";
        add.className = "tpl-new";
        add.textContent = "＋ Nová šablona";
        add.addEventListener("click", (e) => {
            e.stopPropagation();
            tplEditId = null;
            tplFormKind = kind;
            tplMenuKind = null;
            renderTplMenus();
            syncModal();
        });
        menu.appendChild(add);
        menu.addEventListener("click", (e) => e.stopPropagation());
    });
}

function toggleTplMenu(kind) {
    const open = tplMenuKind === kind;
    closeAllPopups();
    tplMenuKind = open ? null : kind;
    renderTplMenus();
}

function createTemplateForm() {
    const kind = tplFormKind;
    const editing = tplEditId ? templates.find((t) => t.id === tplEditId) : null;
    const card = document.createElement("div");
    card.className = "budget-modal-card";

    const head = document.createElement("div");
    head.className = "budget-modal-head";
    const title = document.createElement("strong");
    title.textContent = editing ? "Upravit šablonu" : "Nová šablona";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "budget-entry-del";
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Zavřít");
    closeBtn.addEventListener("click", closeAllPopups);
    head.appendChild(title);
    head.appendChild(closeBtn);
    card.appendChild(head);

    const form = document.createElement("div");
    form.className = "budget-entry-form";

    const amt = document.createElement("input");
    amt.type = "number";
    amt.className = "budget-entry-amt";
    amt.placeholder = "Kč";
    amt.min = "0";
    amt.step = "1";
    amt.inputMode = "numeric";

    const name = document.createElement("input");
    name.type = "text";
    name.className = "budget-entry-desc";
    name.placeholder = "Název / popis…";
    name.maxLength = 60;
    if (editing) {
        amt.value = editing.amount;
        name.value = editing.name || "";
    }

    const save = document.createElement("button");
    save.type = "button";
    save.className = "budget-entry-add";
    save.textContent = "Uložit";

    const doSave = (e) => {
        e.stopPropagation();
        const v = parseFloat(amt.value);
        if (!v || v <= 0) { amt.focus(); return; }
        if (editing) {
            editing.name = name.value.trim();
            editing.amount = v;
        } else {
            templates.push({ id: genId(), name: name.value.trim(), amount: v });
        }
        persistTemplates();
        tplEditId = null;
        tplFormKind = null;
        tplMenuKind = kind;
        renderTplMenus();
        syncModal();
    };
    save.addEventListener("click", doSave);
    [amt, name].forEach((inp) => {
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(e); });
        inp.addEventListener("click", (e) => e.stopPropagation());
    });

    form.appendChild(amt);
    form.appendChild(name);
    form.appendChild(save);
    card.appendChild(form);

    card.addEventListener("click", (e) => e.stopPropagation());
    return card;
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
        amountEl.value = prevAmount;
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

// ----- Event listeners -----
amountEl.addEventListener("input", onBudgetAmountChange);
prevBtn.addEventListener("click", () => goToPeriod(periodOffset - 1));
nextBtn.addEventListener("click", () => goToPeriod(periodOffset + 1));
todayBtn.addEventListener("click", () => goToPeriod(0));
newMonthBtn.addEventListener("click", showNewMonthConfirm);
newMonthYesBtn.addEventListener("click", startNewMonth);
newMonthNoBtn.addEventListener("click", hideNewMonthConfirm);
tabActual.addEventListener("click", () => switchTab("actual"));
tabPredict.addEventListener("click", () => switchTab("predict"));
document.getElementById("tpl-btn-actual").addEventListener("click", (e) => { e.stopPropagation(); toggleTplMenu("actual"); });
document.getElementById("tpl-btn-predict").addEventListener("click", (e) => { e.stopPropagation(); toggleTplMenu("predict"); });
document.getElementById("bulk-btn-actual").addEventListener("click", (e) => { e.stopPropagation(); startBulk("actual"); });
document.getElementById("bulk-btn-predict").addEventListener("click", (e) => { e.stopPropagation(); startBulk("predict"); });

// ----- Inicializace -----
customStarts = loadCustomStartsLocal();
subs = loadSubsLocal();
templates = loadTemplatesLocal();
computePeriod(0);
subsSinceEl.value = currentPeriodStart();
renderSubs();
updateNewMonthBtn();
updateNavBtns();

initNavigation("rozpocet", async (user) => {
    currentUser = user;
    if (user) {
        await withTimeout(loadCustomStartsFirestore(), 8000);
        computePeriod(periodOffset);
        updateNewMonthBtn();
        updateNavBtns();
        Promise.all([loadSubsFirestore(), loadTemplatesFirestore()]).then(() => {
            renderSubs();
            renderTplMenus();
            if (budgetData) render();
        });
    }
    loadPeriodData();
});
