// Synchronizace uložené hry přes Firebase (users/{uid}/hry/tower), když je uživatel přihlášený v aplikaci Notes.
// Hra sama ukládá do localStorage; tento modul před startem hry stáhne novější verzi z cloudu
// a potom při ukládání posílá stav nahoru. Bez přihlášení se hraje jen lokálně jako dřív.
import { auth, db, onAuthStateChanged } from "../../firebase-init.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const SYNCED_KEY = "neonTowerCloudAt";      // savedAt poslední verze, kterou toto zařízení s cloudem sdílí
const FORCE_KEY = "neonTowerCloudForce";    // po importu/resetu: lokální stav přepíše cloud
const PUSH_INTERVAL_MS = 30000;
const READ_TIMEOUT_MS = 4000;
const MAX_SIZE = 900000;                    // Firestore má limit 1 MiB na dokument

let ref = null;
let lastPush = 0;
let pushedWhileHidden = false;

const syncedAt = () => Number(localStorage.getItem(SYNCED_KEY)) || 0;

function readLocal() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function readCloud() {
    const snap = await withTimeout(getDoc(ref), READ_TIMEOUT_MS);
    if (!snap.exists()) return null;
    const d = snap.data();
    return { savedAt: d.savedAt || 0, data: JSON.parse(d.data) };
}

function adopt(cloud) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cloud.data));
    localStorage.setItem(SYNCED_KEY, String(cloud.savedAt));
    // Hra už mezitím naběhla z lokálního uložení (záložní spuštění v main.js) → načíst znovu
    if (gameStarted) { window.__noSave = true; location.reload(); }
}

// Volá writeSave() ve state.js. force = konec běhu, zavření nebo skrytí stránky.
function push(force) {
    if (!ref || window.__noSave) return;
    // Skrytá karta hraje dál, ale do cloudu pošle jen první zápis po skrytí, aby nepřepsala
    // postup z jiného zařízení, na kterém se mezitím hraje.
    if (document.hidden) {
        if (pushedWhileHidden) return;
        pushedWhileHidden = true;
    } else if (!force && Date.now() - lastPush < PUSH_INTERVAL_MS) return;
    const json = JSON.stringify(save);
    if (json.length > MAX_SIZE) { console.warn("Uložená hra je moc velká pro cloud:", json.length); return; }
    lastPush = Date.now();
    localStorage.setItem(SYNCED_KEY, String(save.savedAt));
    // Bez await: offline se zápis odešle po připojení, do té doby čeká ve frontě Firestore.
    setDoc(ref, { data: json, savedAt: save.savedAt, updated: Date.now() }).catch((e) => console.error(e));
}

// Pokud mezitím někdo hrál na jiném zařízení, převezme jeho postup.
async function pullIfNewer() {
    try {
        const cloud = await readCloud();
        if (cloud && cloud.savedAt > syncedAt()) adopt(cloud); // hra už běží → adopt stránku načte znovu
    } catch (e) { console.warn("Kontrola cloudu selhala:", e); }
}

async function syncBeforeStart(user) {
    ref = doc(db, "users", user.uid, "hry", "tower");
    if (localStorage.getItem(FORCE_KEY)) {
        localStorage.removeItem(FORCE_KEY);
        return true;
    }
    try {
        const cloud = await readCloud();
        if (!cloud) return true;
        const local = readLocal();
        const playTime = (s) => (s && s.stats && s.stats.playTime) || 0;
        // Zařízení, které se s cloudem ještě nesynchronizovalo: vyhraje uložení s delší dobou hraní.
        const takeCloud = syncedAt() === 0 ? playTime(cloud.data) >= playTime(local) : cloud.savedAt > syncedAt();
        if (takeCloud) { adopt(cloud); return false; }
        return true;
    } catch (e) {
        console.warn("Cloud není dostupný, hraje se z lokálního uložení:", e);
        return false;
    }
}

const unsub = onAuthStateChanged(auth, async (user) => {
    unsub();
    let pushNow = false;
    if (user) pushNow = await syncBeforeStart(user);
    window.towerCloudPush = push;
    startGame();
    if (pushNow) writeSave(true);
    if (!user) return;
    document.addEventListener("visibilitychange", () => {
        // lastPush posune další průběžný zápis, ať nepřepíše cloud dřív, než se zkontroluje
        if (!document.hidden) { pushedWhileHidden = false; lastPush = Date.now(); pullIfNewer(); }
    });
});
