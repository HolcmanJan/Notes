// Čistá logika rozpočtu (bez DOM a Firebase) – testovatelná pod Node.

export function fmtDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

export function buildBoundaries(now, customStarts) {
    const natural = new Set();
    for (let m = -36; m <= 24; m++) {
        natural.add(fmtDate(new Date(now.getFullYear(), now.getMonth() + m, 14)));
    }
    for (const cs of customStarts) {
        const [y, mo, d] = cs.split("-").map(Number);
        const csDate = new Date(y, mo - 1, d);
        if (csDate.getDate() === 14) continue;
        const next14 = csDate.getDate() < 14
            ? new Date(csDate.getFullYear(), csDate.getMonth(), 14)
            : new Date(csDate.getFullYear(), csDate.getMonth() + 1, 14);
        natural.delete(fmtDate(next14));
    }
    return [...new Set([...natural, ...customStarts])].sort();
}

export function findCurrentIndex(boundaries, todayStr) {
    for (let i = boundaries.length - 1; i >= 0; i--) {
        if (boundaries[i] <= todayStr) return i;
    }
    return 0;
}

// Převede různé historické formáty na [{ id, amount, desc, done? }] pro každý den.
export function migrateEntries(expenses, genId) {
    if (!expenses) return {};
    const out = {};
    for (const [key, val] of Object.entries(expenses)) {
        if (Array.isArray(val)) {
            out[key] = val.map((e) => {
                const item = { id: e.id || genId(), amount: e.amount || 0, desc: e.desc || "" };
                if (e.done) item.done = true;
                return item;
            });
        } else if (typeof val === "number" && val > 0) {
            out[key] = [{ id: genId(), amount: val, desc: "" }];
        }
    }
    return out;
}

// Předplatná, jejichž platba připadá na daný den.
export function subsOn(subs, dateStr) {
    if (!subs || subs.length === 0) return [];
    const [y, m, d] = dateStr.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    return subs.filter((s) =>
        dateStr >= s.since &&
        (!s.until || dateStr <= s.until) &&
        d === Math.min(s.day, dim));
}

// Je platba už zaúčtovaná? Ruční stav (sub.paid) má přednost před datem.
export function subCharged(sub, dateStr, todayStr) {
    if (sub.paid && Object.prototype.hasOwnProperty.call(sub.paid, dateStr)) return !!sub.paid[dateStr];
    return dateStr <= todayStr;
}

// Součty podle popisu (bez ohledu na velikost písmen), od největšího.
export function aggregateByDesc(items) {
    const map = new Map();
    for (const it of items) {
        const label = (it.desc || "").trim() || "Bez popisu";
        const key = label.toLowerCase();
        const cur = map.get(key) || { label, total: 0, count: 0 };
        cur.total += it.amount || 0;
        cur.count += 1;
        map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "cs"));
}

function csvCell(v) {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function buildCsv(rows) {
    const lines = [["Datum", "Typ", "Částka", "Popis"], ...rows.map((r) => [r.date, r.type, r.amount, r.desc])];
    return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
}

// Přenese plán z jiného období na stejná čísla dnů v aktuálním období.
export function mapPredictionsToPeriod(prevPredict, periodDays, genId) {
    const out = {};
    let count = 0;
    for (const [date, entries] of Object.entries(prevPredict || {})) {
        if (!Array.isArray(entries)) continue;
        const day = Number(date.slice(8, 10));
        const target = periodDays.find((d) => Number(d.slice(8, 10)) === day);
        if (!target) continue;
        out[target] = out[target] || [];
        for (const e of entries) {
            out[target].push({ id: genId(), amount: e.amount || 0, desc: e.desc || "" });
            count++;
        }
    }
    return { map: out, count };
}
