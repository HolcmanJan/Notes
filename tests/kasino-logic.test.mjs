import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../hry-kasino/js/logic.js";
import { PERMA, REBOOT_AT } from "../hry-kasino/js/data.js";

test("první automat jde koupit ze startovních žetonů", () => {
    const S = L.newState();
    assert.ok(L.buyMachine(S, 0, "cherry"));
    assert.equal(S.run.floor[0].t, "cherry");
    assert.ok(L.machineCost(S, "cherry") > 15);
});

test("digitální automaty jsou zamčené do Digitálního věku", () => {
    const S = L.newState();
    S.chips = 1e12;
    assert.equal(L.buyMachine(S, 0, "clover"), false);
    L.buyMachine(S, 0, "diamond");
    assert.ok(L.unlockDigital(S));
    assert.ok(L.buyMachine(S, 1, "clover"));
});

test("sousední automaty stejného typu dávají bonus", () => {
    const S = L.newState();
    S.chips = 1e6;
    L.buyMachine(S, 0, "cherry");
    L.buyMachine(S, 1, "cherry");
    L.buyMachine(S, 4, "cherry");
    assert.equal(L.adjacency(S, 0), 1.2);
    L.moveMachine(S, 4, 5);
    assert.equal(L.adjacency(S, 0), 1.1);
    assert.equal(S.stats.moves, 1);
});

test("hráč točí, usne a jde probudit", () => {
    const S = L.newState();
    S.chips = 1e6;
    L.buyMachine(S, 0, "cherry");
    assert.ok(L.hireGambler(S));
    assert.equal(L.canHire(S), false, "víc hráčů než automatů nejde");
    for (let i = 0; i < 2000; i++) L.tick(S, 0.1);
    assert.equal(L.sleepingCount(S), 1);
    assert.ok(S.run.earned > 0);
    assert.ok(L.wakeAt(S, 0));
    assert.equal(S.stats.wakes, 1);
});

test("Reboot vyžaduje 50K, resetuje běh a drží permanentní vylepšení", () => {
    const S = L.newState();
    assert.equal(L.reboot(S), false);
    S.chips = 1e9;
    L.buyMachine(S, 0, "cherry");
    L.buyMachineUp(S, "cherry", "pay");
    L.addChips(S, REBOOT_AT * 100);
    assert.equal(L.rebootBonus(S), 2);
    S.perma.bpCherry = true;
    S.perma.permaCherry = true;
    assert.ok(L.reboot(S));
    assert.equal(S.stats.reboots, 1);
    assert.equal(S.ram, 2);
    assert.equal(S.run.floor[0].t, "cherry");
    assert.equal(S.run.mUp.cherry.pay, 1);
    assert.equal(S.chips, 15);
});

test("strom: nákup jen po Rebootu a s odemčenými předchůdci", () => {
    const S = L.newState();
    S.ram = 100;
    assert.equal(L.buyPerma(S, "rebirth"), false);
    S.stats.reboots = 1;
    assert.equal(L.buyPerma(S, "cherryLegend"), false);
    assert.ok(L.buyPerma(S, "rebirth"));
    assert.ok(L.buyPerma(S, "cherryLegend"));
    assert.equal(S.run.reservoir.cherry, 2, "legenda navýší rezervoár i v běhu");
    const total = PERMA.reduce((a, p) => a + p.cost, 0);
    assert.ok(total > 60, "strom má být na několik Rebootů");
});

test("CraptoMachine: vyhodnocení linií a plné linie", () => {
    const P = "poop", D = "dia";
    const grid = [[P, P, P, P, P], [D, D, P, D, D], [D, P, D, P, D]];
    const r = L.craptoEvaluate(grid, ["top", "mid"], 5);
    const poop = r.wins.find((w) => w.sym === P);
    assert.equal(poop.count, 6);
    assert.equal(poop.x, 5);
    assert.equal(poop.mult, 2);
    const dia = r.wins.find((w) => w.sym === D);
    assert.equal(dia.x, 3);
    assert.equal(dia.mult, 1);
    const all = L.craptoEvaluate([[P, P, P, P, P], [P, P, P, P, P], [P, P, P, P, P]], ["top", "mid", "bot", "v", "a"], 5);
    assert.equal(all.wins[0].x, 15);
    assert.equal(all.wins[0].mult, 32);
});

test("CraptoMachine vrací Craptoměnou méně, než stojí", () => {
    const S = L.newState();
    S.stats.reboots = 1;
    Object.assign(S.perma, { crapto: true, lines2: true, lines3: true, plunger: true });
    S.poop = 1e9;
    const start = S.poop;
    let spins = 0;
    for (; spins < 20000; spins++) L.craptoSpin(S);
    assert.ok(S.poop < start, "návratnost Craptoměny musí být pod 100 %");
    assert.equal(S.stats.craptoSpins, spins);
});

test("uložení a načtení zachová postup", () => {
    const S = L.newState();
    S.chips = 1e5;
    L.buyMachine(S, 2, "bell");
    L.hireGambler(S);
    S.ach.pocket = 1;
    const T = L.deserialize(L.serialize(S));
    assert.equal(T.run.floor[2].t, "bell");
    assert.equal(T.run.gamblers.length, 1);
    assert.equal(T.run.gamblers[0].m, 2);
    assert.ok(T.ach.pocket);
    assert.equal(L.deserialize("nesmysl").chips, 15);
});

test("formátování čísel", () => {
    assert.equal(L.fmt(999), "999");
    assert.equal(L.fmt(1500), "1,5K");
    assert.equal(L.fmt(2e9), "2B");
    assert.equal(L.fmt(1.234e6), "1,23M");
});
