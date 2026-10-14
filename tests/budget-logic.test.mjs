import test from "node:test";
import assert from "node:assert/strict";
import {
    fmtDate, buildBoundaries, findCurrentIndex, migrateEntries, subsOn,
    subCharged, aggregateByDesc, buildCsv, mapPredictionsToPeriod, nextPaymentDate,
} from "../budget-logic.js";

let n = 0;
const gen = () => "id" + ++n;

test("fmtDate doplní nuly", () => {
    assert.equal(fmtDate(new Date(2026, 0, 5)), "2026-01-05");
});

test("období začínají 14. v měsíci", () => {
    const b = buildBoundaries(new Date(2026, 9, 12), []);
    const i = findCurrentIndex(b, "2026-10-12");
    assert.equal(b[i], "2026-09-14");
    assert.equal(b[i + 1], "2026-10-14");
    assert.equal(findCurrentIndex(b, "2026-10-14"), i + 1);
});

test("vlastní začátek nahradí nejbližší přirozené 14.", () => {
    const b = buildBoundaries(new Date(2026, 9, 12), ["2026-10-12"]);
    assert.ok(b.includes("2026-10-12"));
    assert.ok(!b.includes("2026-10-14"));
    assert.equal(b[findCurrentIndex(b, "2026-10-12")], "2026-10-12");
});

test("migrace: číslo -> položka, pole zachová done, nuly zahodí", () => {
    const out = migrateEntries({
        "2026-10-01": 100,
        "2026-10-02": 0,
        "2026-10-03": [{ amount: 5, desc: "x", done: true }, { id: "k", amount: 7 }],
    }, gen);
    assert.equal(out["2026-10-01"][0].amount, 100);
    assert.equal(out["2026-10-02"], undefined);
    assert.equal(out["2026-10-03"][0].done, true);
    assert.equal(out["2026-10-03"][1].id, "k");
    assert.equal(out["2026-10-03"][1].done, undefined);
    assert.deepEqual(migrateEntries(null, gen), {});
});

test("předplatné: den, zkrácený měsíc, od/do", () => {
    const subs = [{ id: "a", name: "N", amount: 199, day: 31, since: "2026-01-01", until: "2026-06-30" }];
    assert.equal(subsOn(subs, "2026-02-28").length, 1);
    assert.equal(subsOn(subs, "2026-02-27").length, 0);
    assert.equal(subsOn(subs, "2026-03-31").length, 1);
    assert.equal(subsOn(subs, "2026-07-31").length, 0);
    assert.equal(subsOn(subs, "2025-12-31").length, 0);
    assert.equal(subsOn([], "2026-03-31").length, 0);
});

test("zaúčtování předplatného: datum a ruční přepis", () => {
    const s = { paid: { "2026-10-20": false, "2026-11-05": true } };
    assert.equal(subCharged({}, "2026-10-10", "2026-10-14"), true);
    assert.equal(subCharged({}, "2026-10-20", "2026-10-14"), false);
    assert.equal(subCharged(s, "2026-10-20", "2026-10-30"), false);
    assert.equal(subCharged(s, "2026-11-05", "2026-10-30"), true);
});

test("agregace podle popisu", () => {
    const r = aggregateByDesc([
        { desc: "Oběd", amount: 100 }, { desc: " oběd ", amount: 50 },
        { desc: "", amount: 300 }, { desc: "Káva", amount: 60 },
    ]);
    assert.deepEqual(r.map((x) => [x.label, x.total, x.count]), [["Bez popisu", 300, 1], ["Oběd", 150, 2], ["Káva", 60, 1]]);
});

test("CSV escapuje středníky a uvozovky", () => {
    const csv = buildCsv([{ date: "2026-10-01", type: "Výdaj", amount: 10, desc: 'a;"b"' }]);
    assert.ok(csv.startsWith("﻿Datum;Typ;Částka;Popis"));
    assert.ok(csv.includes('"a;""b"""'));
});

test("převzetí plánu mapuje podle čísla dne", () => {
    const days = ["2026-10-14", "2026-10-15", "2026-11-13"];
    const { map, count } = mapPredictionsToPeriod({
        "2026-09-15": [{ amount: 100, desc: "a", done: true }],
        "2026-09-13": [{ amount: 5, desc: "b" }],
        "2026-09-31": [{ amount: 1, desc: "c" }],
    }, days, gen);
    assert.equal(count, 2);
    assert.equal(map["2026-10-15"][0].amount, 100);
    assert.equal(map["2026-10-15"][0].done, undefined);
    assert.equal(map["2026-11-13"][0].desc, "b");
});

test("nejbližší platba předplatného", () => {
    const sub = { id: "a", name: "N", amount: 1, day: 5, since: "2026-01-01" };
    assert.equal(nextPaymentDate(sub, "2026-10-14"), "2026-11-05");
    assert.equal(nextPaymentDate(sub, "2026-11-05"), "2026-11-05");
    assert.equal(nextPaymentDate({ ...sub, until: "2026-10-31" }, "2026-10-14"), null);
    assert.equal(nextPaymentDate({ ...sub, since: "2027-01-01" }, "2026-10-14"), "2027-01-05");
});
