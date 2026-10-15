import test from "node:test";
import assert from "node:assert/strict";
import { diffDoc, mapDeletes, listToMap, mapToList } from "../sync-logic.js";

test("beze změny vrací null", () => {
    const d = { amount: 100, expenses: { "2026-10-15": [{ id: "a", amount: 5 }] } };
    assert.equal(diffDoc(d, structuredClone(d)), null);
});

test("pošle jen změněný den, ostatní dny nechá být", () => {
    const prev = { amount: 100, expenses: { "2026-10-14": [{ id: "a" }], "2026-10-15": [] } };
    const next = { amount: 100, expenses: { "2026-10-14": [{ id: "a" }], "2026-10-15": [{ id: "b" }] } };
    assert.deepEqual(diffDoc(prev, next), { expenses: { "2026-10-15": [{ id: "b" }] } });
});

test("smazaný den a změněná částka", () => {
    const prev = { amount: 100, expenses: { "2026-10-14": [{ id: "a" }] } };
    const next = { amount: 200, expenses: {} };
    assert.deepEqual(diffDoc(prev, next), { amount: 200, expenses: { "2026-10-14": null } });
});

test("souběžné úpravy dvou zařízení se po sloučení nepřepíšou", () => {
    const base = { amount: 100, expenses: { "2026-10-14": [{ id: "a" }] } };
    const phone = structuredClone(base); phone.expenses["2026-10-15"] = [{ id: "p" }];
    const laptop = structuredClone(base); laptop.expenses["2026-10-16"] = [{ id: "l" }];
    // Simulace setDoc(merge): hluboké sloučení map, null maže
    const merge = (doc, patch) => {
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) delete doc[k];
            else if (v && typeof v === "object" && !Array.isArray(v)) merge(doc[k] ??= {}, v);
            else doc[k] = v;
        }
        return doc;
    };
    const server = structuredClone(base);
    merge(server, diffDoc(base, phone));
    merge(server, diffDoc(base, laptop));
    assert.deepEqual(Object.keys(server.expenses).sort(), ["2026-10-14", "2026-10-15", "2026-10-16"]);
});

test("mapDeletes nahradí null i ve vnořených mapách", () => {
    const DEL = Symbol("del");
    const out = mapDeletes({ a: null, b: { c: null, d: [1] } }, DEL);
    assert.equal(out.a, DEL);
    assert.equal(out.b.c, DEL);
    assert.deepEqual(out.b.d, [1]);
});

test("listToMap a mapToList zachovají pořadí a obsah", () => {
    const list = [{ id: "b", name: "B" }, { id: "a", name: "A" }];
    assert.deepEqual(mapToList(listToMap(list)), list);
    assert.deepEqual(mapToList(list), list); // starší formát pole projde beze změny
    assert.deepEqual(mapToList(undefined), []);
});
