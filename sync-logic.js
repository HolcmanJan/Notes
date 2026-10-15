// Čistá logika synchronizace (bez DOM a Firebase) – testovatelná pod Node.
// Z rozdílu mezi posledním uloženým a aktuálním stavem dokumentu sestaví „patch“ pro setDoc(..., { merge: true }),
// takže se na server pošlou jen změněná pole a souběžné úpravy z jiného zařízení se nepřepíšou.
// Mapy (objekty) se porovnávají po klíčích do hloubky, pole a jednoduché hodnoty se posílají celé.

function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// Vrací null, když se nic nezměnilo; jinak patch, ve kterém null znamená „smazat pole“.
export function diffDoc(prev, next) {
    const patch = {};
    let changed = false;
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
    for (const key of keys) {
        const a = prev ? prev[key] : undefined;
        const b = next ? next[key] : undefined;
        if (isPlainObject(a) && isPlainObject(b)) {
            const sub = diffDoc(a, b);
            if (sub) { patch[key] = sub; changed = true; }
            continue;
        }
        if (same(a, b)) continue;
        patch[key] = b === undefined ? null : b;
        changed = true;
    }
    return changed ? patch : null;
}

// Nahradí null v patchi zadanou hodnotou (v aplikaci deleteField() z Firestore).
export function mapDeletes(patch, deleteValue) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
        if (v === null) out[k] = deleteValue;
        else if (isPlainObject(v)) out[k] = mapDeletes(v, deleteValue);
        else out[k] = v;
    }
    return out;
}

// Pole položek s id ↔ mapa { id: položka } s pořadím v poli _order.
// V mapě jde každou položku sloučit zvlášť, takže dvě zařízení mohou přidávat do stejného seznamu.
export function listToMap(list) {
    const out = {};
    (list || []).forEach((item, i) => {
        if (item && item.id != null) out[item.id] = { ...item, _order: i };
    });
    return out;
}

export function mapToList(value) {
    if (Array.isArray(value)) return value; // starší formát
    if (!isPlainObject(value)) return [];
    return Object.entries(value)
        .map(([id, item]) => ({ id, ...item }))
        .sort((a, b) => (a._order ?? 0) - (b._order ?? 0))
        .map(({ _order, ...item }) => item);
}
