// Synchronizace uložené hry přes Firebase (users/{uid}/hry/tower), když je uživatel přihlášený v aplikaci Notes.
// Hra sama ukládá do localStorage; tento modul před startem hry stáhne novější verzi z cloudu
// a potom při ukládání posílá stav nahoru. Bez přihlášení se hraje jen lokálně jako dřív.
//
// Každý zápis nese náhodné označení verze (rev). Zařízení si pamatuje rev, kterou s cloudem naposledy sdílelo;
// jiná rev v cloudu = mezitím zapsalo jiné zařízení → jeho postup se převezme místo přepsání.
// (Dřív se porovnával savedAt, jenže ten pochází z hodin různých zařízení a ty se rozcházejí.)
// Hra běží sama i bez hraní, proto do cloudu zapisuje jen zařízení, na kterém se od načtení/návratu
// opravdu hrálo (dotyk, klávesa) – jinak by se dvě otevřená zařízení navzájem přepisovala.
import { auth, db, onAuthStateChanged } from "../../firebase-init.js";
import { doc, getDoc, getDocFromServer, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const SYNCED_KEY = "neonTowerCloudAt";      // savedAt poslední sdílené verze (jen pro staré dokumenty bez rev)
const REV_KEY = "neonTowerCloudRev";        // rev poslední verze, kterou toto zařízení s cloudem sdílí
const FORCE_KEY = "neonTowerCloudForce";    // po importu/resetu: lokální stav přepíše cloud
const ADOPTED_KEY = "neonTowerCloudAdopted"; // po převzetí z cloudu ukázat po načtení hlášku
const PUSH_INTERVAL_MS = 30000;
const READ_TIMEOUT_MS = 4000;
const CHECK_TIMEOUT_MS = 8000;
const MAX_SIZE = 900000;                    // Firestore má limit 1 MiB na dokument

let ref = null;
let lastPush = 0;
let pushedWhileHidden = document.hidden;    // stránka načtená na pozadí nezapisuje, dokud se neukáže
let armed = false;                          // smí toto zařízení zapisovat (hrálo se na něm)?
let busy = false;

const syncedAt = () => Number(localStorage.getItem(SYNCED_KEY)) || 0;
const localRev = () => localStorage.getItem(REV_KEY) || "";
const newRev = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function readLocal() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function readCloud(fromServer, ms) {
    const snap = await withTimeout(fromServer ? getDocFromServer(ref) : getDoc(ref), ms);
    if (!snap.exists()) return null;
    const d = snap.data();
    return { savedAt: d.savedAt || 0, rev: d.rev || "", data: JSON.parse(d.data) };
}

// Zapsalo do cloudu od posledního sdílení jiné zařízení?
function cloudIsNewer(cloud) {
    if (!cloud) return false;
    if (cloud.rev && localRev()) return cloud.rev !== localRev();
    return cloud.savedAt > syncedAt(); // přechod ze starší verze synchronizace
}

function adopt(cloud) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(cloud.data));
    localStorage.setItem(SYNCED_KEY, String(cloud.savedAt));
    localStorage.setItem(REV_KEY, cloud.rev);
    // Hra už mezitím naběhla z lokálního uložení (záložní spuštění v main.js) → načíst znovu
    if (gameStarted) {
        sessionStorage.setItem(ADOPTED_KEY, "1");
        window.__noSave = true;
        location.reload();
    }
}

async function write(json) {
    const prevRev = localRev(), prevAt = syncedAt();
    const rev = newRev();
    // rev se uloží hned – zápis se při zavírání stránky nemusí stihnout potvrdit
    localStorage.setItem(REV_KEY, rev);
    localStorage.setItem(SYNCED_KEY, String(save.savedAt));
    try {
        await setDoc(ref, { data: json, savedAt: save.savedAt, rev, updated: Date.now() });
    } catch (e) {
        console.error(e);
        localStorage.setItem(REV_KEY, prevRev);
        localStorage.setItem(SYNCED_KEY, String(prevAt));
    }
}

// Volá writeSave() ve state.js. force = konec běhu, zavření nebo skrytí stránky.
function push(force) {
    if (!ref || window.__noSave || !armed || busy) return;
    // Skrytá karta hraje dál, ale do cloudu pošle jen první zápis po skrytí
    if (document.hidden) {
        if (pushedWhileHidden) return;
        pushedWhileHidden = true;
    } else if (!force && Date.now() - lastPush < PUSH_INTERVAL_MS) return;
    const json = JSON.stringify(save);
    if (json.length > MAX_SIZE) { console.warn("Uložená hra je moc velká pro cloud:", json.length); return; }
    lastPush = Date.now();
    busy = true;
    // Před zápisem ověřit, že cloud mezitím nezměnilo jiné zařízení. Offline se nezapisuje –
    // zkusí se to znovu při dalším ukládání, až bude spojení.
    readCloud(true, CHECK_TIMEOUT_MS)
        .then((cloud) => { if (cloudIsNewer(cloud)) adopt(cloud); else return write(json); })
        .catch((e) => console.warn("Cloud se nepodařilo ověřit, zápis se odkládá:", e))
        .finally(() => { busy = false; });
}

// Pokud mezitím někdo hrál na jiném zařízení, převezme jeho postup; jinak smí toto zařízení zapisovat.
let checking = false;
async function checkAndArm() {
    if (armed || checking || !ref) return;
    checking = true;
    try {
        const cloud = await readCloud(true, CHECK_TIMEOUT_MS);
        if (cloudIsNewer(cloud)) { adopt(cloud); return; } // hra už běží → adopt stránku načte znovu
    } catch (e) {
        console.warn("Kontrola cloudu selhala:", e); // offline: hrát se dá, zápis stejně ověří cloud
    } finally { checking = false; }
    armed = true;
}

async function syncBeforeStart(user) {
    ref = doc(db, "users", user.uid, "hry", "tower");
    if (localStorage.getItem(FORCE_KEY)) {
        localStorage.removeItem(FORCE_KEY);
        armed = true;
        return true;
    }
    try {
        const cloud = await readCloud(false, READ_TIMEOUT_MS);
        if (!cloud) { armed = true; return true; }
        const local = readLocal();
        const playTime = (s) => (s && s.stats && s.stats.playTime) || 0;
        // Zařízení, které se s cloudem ještě nesynchronizovalo: vyhraje uložení s delší dobou hraní.
        const never = !localRev() && syncedAt() === 0;
        const takeCloud = never ? playTime(cloud.data) >= playTime(local) : cloudIsNewer(cloud);
        if (takeCloud) { adopt(cloud); return false; }
        if (never) { armed = true; return true; }
        return false;
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
    if (sessionStorage.getItem(ADOPTED_KEY)) {
        sessionStorage.removeItem(ADOPTED_KEY);
        setTimeout(() => { if (typeof toast === "function") toast("Načten postup z jiného zařízení"); }, 500);
    }
    if (pushNow) writeSave(true);
    if (!user) return;
    // první dotyk / klávesa po načtení nebo návratu → zkontrolovat cloud a povolit zápis
    for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, checkAndArm, true);
    const regain = () => {
        // lastPush posune další průběžný zápis, ať nepřepíše cloud dřív, než se zkontroluje
        pushedWhileHidden = false; lastPush = Date.now();
        armed = false; checkAndArm();
    };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) regain(); });
    window.addEventListener("focus", () => { if (!document.hidden && Date.now() - lastPush > 2000) regain(); });
});
