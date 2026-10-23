'use strict';
// ---------- uložení hry ----------
const SAVE_KEY = 'neonTowerSave_v1';
let save;

function defaultSave() {
  return {
    v: 2, created: Date.now(), savedAt: 0,
    coins: 0, gems: 0, stones: 0, medals: 0, cells: 0, keys: 0, bits: 0, tokens: 0,
    shards: { reroll: 0, cannon: 0, armor: 0, generator: 0, core: 0 },
    ws: {}, unlocks: {}, enh: {},
    labs: {}, labSlots: 1, labActive: [], labAuto: {}, labBoost: { until: 0, mult: 1 },
    uw: {}, uwPlus: {}, uwOffer: null, uwOff: {},
    cards: {}, cardSlots: 1, cardEquip: [], cardPresets: [[], [], [], [], []], cardPreset: 0, cardMastery: {}, cardsVisited: false,
    modules: [], modEquip: { cannon: null, armor: null, generator: null, core: null }, modSlots: { cannon: 0, armor: 0, generator: 0, core: 0 },
    modUid: 1, modPity: 0, modTickets: 0, modFirstEpic: false, assist: {},
    tier: 1, maxTier: 1, best: {}, msReached: {}, msClaimed: {}, premiumPass: {},
    tourney: { league: 0, extraBought: 0, cur: null, last: null, badges: [] },
    missions: { list: [], lastBatch: 0, week: 0, weekDone: 0, boxes: [], rerolls: 0 },
    event: { idx: -1, base: {}, tiers: {}, medalsEarned: 0, boost: false, relicsGot: [], shopBuys: 0, shopSkin: false, shopBg: false },
    bots: {}, botsBought: 0,
    guild: { joined: false, name: '', members: [], week: 0, contribMine: 0, chests: [], season: 0, spent: 0, store: {} },
    guardian: { unlocked: false, chips: {}, equip: [], slots: 1 },
    vault: { harmony: {}, power: {}, enemy: {}, sections: {} },
    relics: [],
    themes: { skins: ['neon'], skin: 'neon', bgs: ['space'], bg: 'space', menus: [], songs: [] },
    shop: { starter: false, epic: false, noAds: false }, adBonusUntil: 0, adGems: { last: 0, day: 0, count: 0 }, dailyGems: 0,
    disso: {}, perkCfg: { bans: [], first: null, ranking: [], auto: false },
    stats: { runs: 0, t1Runs: 0, kills: 0, coins: 0, bosses: 0, playTime: 0 },
    ctr: {}, history: [],
    run: null, speed: 1, bulk: 1, wsBulk: 1, glow: true, targetPrio: 'nearest',
  };
}

function loadSave() {
  save = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) migrate(JSON.parse(raw));
  } catch (e) { console.warn(e); }
}

// převede uložení ze starší verze hry (zachová měny, dílnu a postup)
function migrate(o) {
  const d = defaultSave();
  for (const k in d) if (o[k] !== undefined && typeof d[k] !== 'object') d[k] = o[k];
  for (const k of ['shards', 'unlocks', 'ws', 'enh', 'labs', 'labAuto', 'uwPlus', 'uwOff', 'cardMastery', 'best', 'msReached', 'msClaimed', 'premiumPass', 'tourney', 'missions', 'event', 'bots', 'guild', 'guardian', 'vault', 'themes', 'shop', 'adGems', 'disso', 'perkCfg', 'stats', 'ctr', 'modEquip', 'modSlots', 'labBoost', 'assist']) {
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) d[k] = Object.assign(d[k] || {}, o[k]);
  }
  for (const k of ['labActive', 'cardEquip', 'cardPresets', 'modules', 'relics', 'history']) if (Array.isArray(o[k])) d[k] = o[k];
  if (o.cards && typeof o.cards === 'object') d.cards = o.cards;
  if (o.uw && typeof o.uw === 'object') d.uw = o.uw;
  if (o.v !== 2) {
    // stará verze: shards bylo číslo, laby/karty/moduly měly jiný formát
    if (typeof o.shards === 'number') d.shards = Object.assign(defaultSave().shards, { reroll: o.shards });
    d.labs = {}; d.labActive = []; d.uw = {}; d.modules = []; d.modEquip = defaultSave().modEquip;
    d.cards = Object.fromEntries(Object.entries(o.cards || {}).filter(([k]) => CARD_MAP[k]));
    d.cardEquip = (o.cardEquip || []).filter(k => CARD_MAP[k]);
    d.cardSlots = Math.max(1, Math.min(o.cardSlots || 1, 3));
    for (const [t, w] of Object.entries(o.best || {})) for (const m of MS_WAVES) if (w >= m) d.msReached[t + '-' + m] = true;
    d.run = null;
    // staré klíče odemčení dílny → nové pořadí podle wiki
    const u = o.unlocks || {};
    if (u.defPct || u.defAbs) d.unlocks.def = true;
    if (u.dmgMeter || (o.ws && o.ws.range)) d.unlocks.range = true;
    if (o.ws && (o.ws.cashBonus || o.ws.cashWave)) d.unlocks.cash = true;
    if (o.ws && (o.ws.coinKill || o.ws.coinWave)) d.unlocks.coins = true;
    // za staré ultimátní zbraně a laby (jiný systém) vrátíme kameny a coiny
    d.stones += Object.keys(o.uw || {}).length * 10;
    d.gems = Math.max(d.gems, o.gems || 0);
  } else d.run = o.run || null;
  d.labActive = d.labActive.filter(a => LAB_MAP[a.id]);
  d.cardEquip = d.cardEquip.filter(k => CARD_MAP[k]);
  if (!Array.isArray(d.themes.skins)) d.themes = defaultSave().themes;
  d.v = 2;
  save = d;
}

// force = poslat do cloudu hned (konec běhu, zavření stránky), jinak cloud.js zápisy ředí
function writeSave(force) {
  try {
    save.run = game.run && !game.run.over ? snapshotRun(game.run) : null;
    save.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    if (window.towerCloudPush) window.towerCloudPush(force);
  } catch (e) { console.warn(e); }
}

const markDirty = () => { if (game.run) game.run.dirty = true; };
const bestAny = () => Math.max(0, ...Object.values(save.best));
const ctr = k => save.ctr[k] || 0;
function track(k, n = 1) { save.ctr[k] = (save.ctr[k] || 0) + n; if (game.run) game.run.ctr[k] = (game.run.ctr[k] || 0) + n; }

// ---------- milníky ----------
const MS_WAVES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 4500];
const msKey = (t, w) => t + '-' + w;
const msClaimed = (t, w) => !!save.msClaimed[msKey(t, w)];
function msReward(t, w, premium) {
  const row = (WIKI.ms[t] || {})[w];
  return row ? (premium ? row[1] : row[0]) : '';
}
function isFeature(f) {
  if (f === 'cards') return save.stats.t1Runs >= 2 || bestAny() >= 30;
  if (f === 'missions') return save.stats.t1Runs >= 3;
  if (f === 'uw') return isFeature('tourney') || save.stones > 0 || Object.keys(save.uw).length > 0;
  if (f === 'vault') return save.tourney.league >= 5 || save.keys > 0;
  if (f === 'perks') return !!save.labs.perks;
  const m = FEATURE_MS[f];
  return m ? msClaimed(m[0], m[1]) : true;
}
// laboratoř je dostupná, pokud je odemčený její milník a případně zbraň/karta/bot
function labAvailable(d) {
  if (!isFeature('labs')) return false;
  if (d.unlock && !msClaimed(d.unlock[0], d.unlock[1])) return false;
  if (LAB_NEEDS_UW[d.id] && !save.uw[LAB_NEEDS_UW[d.id]]) return false;
  if (LAB_NEEDS_CARD[d.id] && !save.cards[LAB_NEEDS_CARD[d.id]]) return false;
  if (LAB_NEEDS_LAB[d.id] && !save.labs[LAB_NEEDS_LAB[d.id]]) return false;
  if (LAB_NEEDS_BOT[d.id] && !(save.bots[LAB_NEEDS_BOT[d.id]] || {}).owned) return false;
  if (d.group === 'enemy' && save.maxTier < 9) return false;
  if (d.group === 'mod' && !isFeature('modules')) return false;
  return true;
}

// ---------- hodnoty z jednotlivých systémů ----------
function statUnlocked(d) { return !d.unlock || !!save.unlocks[d.unlock.key]; }
function statLevel(id, R) {
  const d = STAT_MAP[id];
  const extra = R && R.lv[id] ? R.lv[id] : 0;
  const cap = R && R.over ? 0 : (R && R.infinity && ['damage', 'health', 'regen'].includes(id) ? R.infinity : 0);
  return Math.min(d.max + cap, (save.ws[id] || 0) + extra);
}
function rawStat(id, R) {
  const d = STAT_MAP[id];
  return d.f(statUnlocked(d) ? statLevel(id, R) : 0);
}

function labV(eff) {
  const d = LAB_MAP[eff];
  if (!d) return 0;
  const L = save.labs[eff] || 0;
  if (!L) return d.unit === 'x' ? 1 : 0;
  if (d.unit === 'u') return 1;
  return interpRows(d.valRows, L) * d.scale;
}
function labCost(d, L) { return Math.round(interpRows(d.costRows, L + 1) * (1 - labV('labDiscount'))); }
function labSpeedMult() {
  const boost = Date.now() < save.labBoost.until ? save.labBoost.mult : 1;
  return labV('labSpeed') * (1 + relicV('labSpeed') / 100) * boost;
}
function labTime(d, L) { return interpRows(d.timeRows, L + 1) / labSpeedMult(); }

const WS_DISC = { atk: 'wsDiscAtk', def: 'wsDiscDef', util: 'wsDiscUtil' };
const wsTables = {};
function wsCost(d, L) {
  // cena dalšího levelu z tabulky wiki (L+1)
  const rows = wsTables[d.id] || (wsTables[d.id] = (WIKI.ws[d.ws] || [[1, 30], [100, 1e5]]).map(r => [r[0], r[1]]));
  return Math.round(interpRows(rows, L + 1) * (1 - labV(WS_DISC[d.cat])));
}
const costMemo = {};
function steppedCost(key, base, g, L) {
  const a = costMemo[key] || (costMemo[key] = [base]);
  while (a.length <= L) {
    const p = a[a.length - 1];
    a.push(p < 1e9 ? Math.max(p + 1, Math.round(p * g)) : p * g);
  }
  return a[L];
}
function cashCost(d, runL) { return steppedCost('c' + d.id, d.cash[0], d.cash[1], runL); }
function enhCost(e, L) {
  const rows = WIKI.ws[e.t] || [[1, 5e9], [400, 3e20]];
  return Math.round(interpRows(rows, L + 1) * (1 - labV('enhDiscount')) * (save.vault.harmony.enhDisc ? 0.8 : 1));
}
const enhV = id => 1 + (save.enh[id] || 0) * ENH_DEFS.find(e => e.id === id).per;

// karty
const cardLevel = id => { const c = save.cards[id] || 0; let l = 0; for (let i = 0; i < 7; i++) if (c >= CARD_LEVEL_REQ[i]) l = i + 1; return l; };
function cardV(id, R) {
  const eq = R ? R.cardsEq : save.cardEquip;
  if (!eq.includes(id)) return null;
  const l = cardLevel(id);
  return l ? CARD_MAP[id].vals[l - 1] : null;
}
function masteryV(id, R) {
  const m = CARD_MASTERY[id];
  if (!m || save.cardMastery[id] === undefined || cardV(id, R) === null) return null;
  const L = save.cardMastery[id];
  return m[2][0] + (m[2][1] - m[2][0]) * L / 9;
}

// relikvie, trezor, motivy
function relicV(eff) {
  let s = 0;
  for (const id of save.relics) { const r = RELICS.find(x => x.id === id); if (r && r.eff === eff) s += r.val; }
  return s;
}
const vaultP = key => { const d = VAULT_POWER.find(v => v[1] === key); return d ? (save.vault.power[key] || 0) * d[3] : 0; };
function themeBonus() {
  const t = save.themes;
  return (t.skins.length - 1) * THEME_BONUS.skin + (t.bgs.length - 1) * THEME_BONUS.bg + t.menus.length * THEME_BONUS.menu + t.songs.length * THEME_BONUS.song;
}
const adBonusActive = () => save.shop.noAds || Date.now() < save.adBonusUntil;
const shopCoinMult = () => (save.shop.starter ? 2 : 1) * (save.shop.epic ? 3 : 1) * (adBonusActive() ? 1.5 : 1);

// moduly
const modByUid = uid => save.modules.find(m => m.uid === uid);
function modLevel(m) { return Math.min(save.modSlots[m.type] || 0, MOD_RARITIES[m.rarity].maxLv); }
function modMain(m) { return 1 + MOD_TYPES[m.type].per * modLevel(m) * RARITY_EFF[m.rarity]; }
function modActiveSubs(m) {
  const lv = modLevel(m);
  let n = m.rarity === 0 ? 1 : 2;
  for (const t of SUB_UNLOCK_LV) if (lv >= t) n++;
  return m.subs.slice(0, Math.min(n, MOD_RARITIES[m.rarity].subs));
}
function subValue(type, s) {
  const def = SUBSTATS[type].find(x => x[0] === s.k);
  return def ? def[2][s.r] || 0 : 0;
}
function uniqueTier(r) { return r >= R.ANC ? 3 : r >= R.MYTH ? 2 : r >= R.LEG ? 1 : 0; }
function uniqueV(type, id) {
  const m = modByUid(save.modEquip[type]);
  if (!m || m.unique !== id) return null;
  const u = MOD_UNIQUES[type].find(x => x[0] === id);
  return u[3][uniqueTier(m.rarity)];
}
function moduleBonuses() {
  const b = { main: { cannon: 1, armor: 1, generator: 1, core: 1 } };
  for (const type in save.modEquip) {
    const m = modByUid(save.modEquip[type]);
    if (!m) continue;
    b.main[type] = modMain(m);
    for (const s of modActiveSubs(m)) b[s.k] = (b[s.k] || 0) + subValue(type, s);
  }
  // asistenční moduly: slabší kopie hlavního efektu a substatů
  for (const type in save.assist) {
    const a = save.assist[type];
    const m = a && modByUid(a.uid);
    if (!m || m.uid === save.modEquip[type]) continue;
    b.main[type] *= 1 + (modMain(m) - 1) * (a.main || 0.01);
    for (const s of modActiveSubs(m)) b[s.k] = (b[s.k] || 0) + subValue(type, s) * (a.sub || 0.01);
  }
  return b;
}

// disonance: boost na tieru + ozvěna z ostatních tierů
function dissoMult(cat, tier) {
  let own = 1, echo = 0;
  const echoPct = 0.005 + (save.labs.echo ? 0 : 0);
  for (const t in save.disso) {
    const v = save.disso[t][cat] || 1;
    if (+t === tier) own = v; else echo += (v - 1) * echoPct;
  }
  return own + echo;
}

// ---------- výpočet všech statistik věže ----------
function computeStats(R) {
  const P = id => (R && R.perks[id]) || 0;
  const spb = 1 + labV('perkBonus');
  const stdM = (id, base) => P(id) ? (1 + base * P(id)) * spb : 1;
  const stdA = (id, base) => base * P(id) * spb;
  const trade = id => P(id) > 0;
  const tb = 1 + labV('tradeBonus');
  const mb = moduleBonuses();
  const mod = k => mb[k] || 0;
  const raw = id => rawStat(id, R);
  const card = id => cardV(id, R);
  const cm = (id, def = 1) => { const v = card(id); return v === null ? def : v; };
  const mast = id => masteryV(id, R);
  const tier = R ? R.tier : save.tier;
  const diss = R && R.disso;
  const S = { tier };

  // ---- útok ----
  const relic = k => 1 + relicV(k) / 100;
  S.damage = raw('damage') * labV('dmg') * cm('damage') * (mast('damage') || 1) * mb.main.cannon * enhV('damage') * relic('dmg') * (1 + vaultP('dmg') / 100)
    * stdM('damage', 0.15) * (trade('tDmgBoss') ? 1 + 0.5 * tb : 1) * (trade('tEnemyDmg') ? 0.5 : 1) * dissoMult('atk', tier);
  S.atkSpeed = (raw('attackSpeed') + mod('atkSpd')) * labV('atkSpd') * cm('attackSpeed') * (mast('attackSpeed') || 1) * enhV('attackSpeed') * relic('atkSpd') * (1 + vaultP('atkSpd') / 100);
  S.critChance = Math.min(1, raw('critChance') + cm('critChance', 0) / 100 + mod('critChance') / 100 + relicV('critChance') / 100 + vaultP('critChance') / 100 + (mast('critChance') || 0) / 100);
  S.critFactor = (raw('critFactor') + mod('critFactor')) * labV('critFactor') * enhV('critFactor') * relic('critFactor') * (1 + vaultP('critFactor') / 100);
  S.scChance = Math.min(1, raw('superCritChance') + labV('scChance') + mod('scChance') / 100 + relicV('scChance') / 100 + vaultP('scChance') / 100 + (mast('critChance') || 0) / 100);
  S.scMult = (raw('superCritMult') + mod('scMult')) * labV('scMult') * enhV('superCritMult') * relic('scMult') * (1 + vaultP('scMult') / 100) * (1 + (mast('critChance') || 0) / 100);
  const baseRange = raw('range') + mod('range') + (labV('range') - 1) * 10;
  S.range = Math.min(68, baseRange * cm('range'));
  S.dmgMeter = (raw('dmgMeter') + mod('dmgMeter') / 100) * labV('dmgMeter') * enhV('dmgMeter') * relic('dmgMeter') * (1 + vaultP('dmgMeter') / 100) * (mast('range') || 1);
  S.multiChance = Math.min(1, raw('multiChance') + mod('multiChance') / 100 + vaultP('multiChance') / 100);
  S.multiTargets = raw('multiTargets') + mod('multiTargets');
  S.rapidChance = Math.min(1, raw('rapidChance') + mod('rapidChance') / 100 + vaultP('rapidChance') / 100);
  S.rapidDur = raw('rapidDur') + mod('rapidDur');
  S.bounceChance = Math.min(1, raw('bounceChance') + mod('bounceChance') / 100 + vaultP('bounceChance') / 100);
  S.bounceTargets = raw('bounceTargets') + mod('bounceTargets') + 2 * P('bounce');
  S.bounceRange = raw('bounceRange') + mod('bounceRange');
  S.rendChance = save.unlocks.rend ? Math.min(1, raw('rendChance') + mod('rendChance') / 100 + vaultP('rendChance') / 100) : 0;
  S.rendMult = raw('rendMult') * (1 + vaultP('rendMult') / 100) * relic('rendMult') + mod('rendMult');
  S.rendMax = (8 + mod('rendMax')) * (labV('rendMax') > 0 ? labV('rendMax') / 8.25 : 1) * enhV('rendMax');

  // ---- obrana ----
  S.maxHp = raw('health') * labV('hp') * cm('health') * (mast('health') || 1) * mb.main.armor * enhV('health') * relic('hp') * (1 + vaultP('hp') / 100)
    * stdM('maxHealth', 0.2) * (trade('tCoinHp') ? 0.3 : 1) * (trade('tRegen') ? 0.4 : 1) * dissoMult('def', tier);
  S.regen = raw('regen') * labV('regen') * cm('regen') * (mast('regen') || 1) * enhV('regen') * relic('regen') * (1 + vaultP('regen') / 100) * (1 + mod('regenPct') / 100)
    * stdM('regen', 0.75) * (trade('tRegen') ? 8 * tb : 1) * (trade('tEnemyHp') ? 0.1 : 1);
  S.defPct = Math.min(0.98, raw('defPct') + labV('defPct') + cm('extraDefense', 0) / 100 + (mast('extraDefense') || 0) / 100 + mod('defPct') / 100 + relicV('defPct') / 100 + stdA('defPct', 0.04));
  S.defAbs = raw('defAbs') * labV('defAbs') * cm('fortress') * enhV('defAbs') * relic('defAbs') * (1 + vaultP('defAbs') / 100) * (1 + mod('defAbsPct') / 100) * stdM('defAbs', 0.15);
  S.thorns = (raw('thorns') + mod('thorns') / 100) * relic('thorns') * (1 + vaultP('thorns') / 100);
  S.lifesteal = (raw('lifesteal') + mod('lifesteal') / 100) * (trade('tLife') ? 2.5 * tb : 1) * (trade('tEnemyHp') ? 0.1 : 1);
  S.knockChance = Math.min(1, raw('knockChance') + mod('knockChance') / 100 + vaultP('knockChance') / 100);
  S.knockForce = (raw('knockForce') + mod('knockForce')) * relic('knockForce') * (1 + vaultP('knockForce') / 100) * (trade('tLife') ? 0.3 : 1);
  S.orbs = raw('orbs') + mod('orbs') + P('orbs');
  S.orbSpeed = (raw('orbSpeed') + labV('orbSpeed') + mod('orbSpeed')) * relic('orbSpeed') * (1 + vaultP('orbSpeed') / 100);
  S.orbSize = enhV('orbSize');
  S.orbBoss = labV('orbBoss');
  S.extraOrb = card('extraOrb');
  S.extraOrbs = 1 + labV('extraOrbs');
  S.shockOn = !!save.unlocks.shock;
  S.shockSize = (raw('shockSize') + labV('shockSize') + mod('shockSize')) * (1 + vaultP('shockSize') / 100);
  S.shockFreq = Math.max(7, raw('shockFreq') + mod('shockFreq'));
  S.mineOn = !!save.unlocks.mine;
  S.mineChance = raw('mineChance') + mod('mineChance') / 100;
  S.mineDmg = raw('mineDmg') * (1 + labV('mineDmg')) * (1 + mod('mineDmg') / 100) * enhV('mineDmg') * stdM('mineDmg', 2.5) * (1 + cm('areaOfEffect', 0) / 100);
  S.mineRadius = raw('mineRadius') + mod('mineRadius');
  S.mineDecay = 10 + labV('mineDecay');
  S.mineStun = card('landMineStun');
  S.deathDefy = Math.min(0.9, raw('deathDefy') + mod('deathDefy') / 100 + vaultP('deathDefy') / 100);
  S.wallOn = !!save.unlocks.wall;
  S.wallHp = (raw('wallHealth') + mod('wallHp') / 100 + labV('wallHp')) * S.maxHp * enhV('wallHealth') * (1 + vaultP('wallHp') / 100) * (uniqueV('armor', 'sharpFort') || 1) * (1 + labV('wallFort'));
  S.wallRebuild = Math.max(150, raw('wallRebuild') + labV('wallRebuild') + mod('wallRebuild') - relicV('wallRebuild') - (mast('fortress') || 0));
  S.wallRegen = labV('wallRegen') * (uniqueV('armor', 'sharpFort') || 1);
  S.wallThorns = labV('wallThorns');
  S.wallInv = labV('wallInv');

  // ---- utilita ----
  S.cashMult = (raw('cashBonus') + mod('cashBonus')) * labV('cashBonus') * cm('cash') * enhV('cashBonus') * relic('cash') * (1 + vaultP('cash') / 100) * stdM('cash', 0.15) * (diss === 'util' ? 0 : 1);
  S.cashWave = (raw('cashWave') + mod('cashWave')) * labV('cashWave') * (1 + vaultP('cashWave') / 100) * (trade('tCashWave') ? 12 * tb : 1);
  S.noKillCash = trade('tCashWave');
  S.coinKill = (raw('coinKill') + mod('coinKill')) * labV('coinKill') * (1 + vaultP('coinKill') / 100);
  S.coinWave = (raw('coinWave') + mod('coinWave')) * labV('coinWave') * (1 + vaultP('coinWave') / 100);
  S.coinMult = cm('coins') * (mast('coins') || 1) * mb.main.generator * enhV('coinBonus') * relic('coins') * (1 + themeBonus()) * shopCoinMult()
    * stdM('coins', 0.15) * (trade('tCoinHp') ? 1 + 0.8 * tb : 1) * TIERS[tier - 1].coin * (diss === 'util' ? 0 : 1);
  S.interest = (raw('interest') + mod('interest') / 100) * labV('interest') * (1 + vaultP('interest') / 100) * stdM('interest', 0.5);
  S.maxInterest = 100 + labV('maxInterest');
  const freeExtra = cm('freeUpgrades', 0) / 100 + stdA('freeUpg', 0.05);
  const fe = enhV('freeUpgrades');
  S.free = {
    atk: (raw('freeAtk') + mod('freeAtk') / 100 + relicV('freeAtk') / 100 + vaultP('freeAtk') / 100 + freeExtra) * fe,
    def: (raw('freeDef') + mod('freeDef') / 100 + relicV('freeDef') / 100 + vaultP('freeDef') / 100 + freeExtra) * fe,
    util: (raw('freeUtil') + mod('freeUtil') / 100 + relicV('freeUtil') / 100 + vaultP('freeUtil') / 100 + freeExtra) * fe,
  };
  if (!save.unlocks.free) S.free = { atk: freeExtra, def: freeExtra, util: freeExtra };
  S.packOn = !!save.unlocks.pack || card('packageChance') !== null;
  S.packChance = Math.min(1, (save.unlocks.pack ? raw('packChance') : 0) + labV('packChance') + mod('packChance') / 100 + cm('packageChance', 0) / 100) * enhV('packages');
  S.packAmount = (raw('recoveryAmount') + labV('packAmount') + mod('packAmount') / 100) * relic('packAmount') * (1 + vaultP('packAmount') / 100);
  S.maxRecovery = (raw('maxRecovery') + mod('maxRecovery')) * (1 + labV('packMax'));
  S.packAfterBoss = !!save.labs.packAfterBoss;
  const elsE = enhV('els');
  const bcSkip = R && R.bc.skip ? R.bc.skip / 100 : 0;
  const skipMul = R && R.tourney !== null ? LEAGUES[R.tourney].skipMul : 1;
  S.elsAtk = save.unlocks.els ? Math.max(0, (raw('elsAtk') + labV('elsAtk') + mod('elsAtk') / 100 + relicV('elsAtk') / 100) * elsE * skipMul - bcSkip) : 0;
  S.elsHp = save.unlocks.els ? Math.max(0, (raw('elsHp') + labV('elsHp') + mod('elsHp') / 100 + relicV('elsHp') / 100) * elsE * skipMul - bcSkip) : 0;
  S.startCash = labV('startCash');
  S.maxSpeed = MAX_SPEED + P('gameSpeed');

  // ---- ultimátní zbraně ----
  S.uwDmgMult = mb.main.core * relic('uwDmg') * (1 + vaultP('uwDmg') / 100) * dissoMult('uw', tier);
  S.uwCrit = card('ultimateCrit') !== null ? card('ultimateCrit') / 100 : 0;
  S.aoe = 1 + cm('areaOfEffect', 0) / 100 * (1 + (mast('areaOfEffect') || 0) / 100);
  S.uw = {};
  const owned = Object.assign({}, save.uw);
  if (R && R.perkUw) owned[R.perkUw] = 'perk';
  for (const u of UW_DEFS) {
    if (!owned[u.id] || (R && R.uwOff[u.id]) || diss === 'uw') continue;
    const o = {};
    for (const st of u.stats) {
      let L = owned[u.id] === 'perk' ? null : (owned[u.id][st.id] || 0);
      if (R && R.sabotage && R.sabotage[u.id]) L = Math.max(0, (L || 0) - R.sabotage[u.id]);
      o[st.id] = L === null ? UW_PERK_STATS[u.id][st.id] : st.vals[Math.min(L, st.max)];
    }
    S.uw[u.id] = o;
  }
  const U = S.uw;
  if (U.chainLightning) { U.chainLightning.dmg = (U.chainLightning.dmg + mod('clDmg')) * (1 + vaultP('clDmg') / 100) * (P('uwCl') ? 2 : 1); U.chainLightning.qty += mod('clQty'); U.chainLightning.chance = (U.chainLightning.chance + mod('clChance')) / 100; }
  if (U.smartMissiles) { U.smartMissiles.dmg = (U.smartMissiles.dmg + mod('smDmg')) * (1 + vaultP('smDmg') / 100) * S.aoe; U.smartMissiles.qty += mod('smQty') + 4 * P('uwSm'); U.smartMissiles.cd = Math.max(10, U.smartMissiles.cd + mod('smCd')); }
  if (U.deathWave) { U.deathWave.dmg = (U.deathWave.dmg + mod('dwDmg')) * (1 + vaultP('dwDmg') / 100); U.deathWave.qty += mod('dwQty') + P('uwDw'); U.deathWave.cd = Math.max(20, U.deathWave.cd + mod('dwCd')); }
  if (U.chronoField) { U.chronoField.dur += labV('cfDur') + mod('cfDur') + 5 * P('uwCf'); U.chronoField.slow = Math.min(90, U.chronoField.slow + mod('cfSlow')) / 100; U.chronoField.cd = Math.max(20, U.chronoField.cd + mod('cfCd')); U.chronoField.radius = (1 + labV('cfRange')); }
  if (U.innerMines) { U.innerMines.dmg = (U.innerMines.dmg + mod('ilmDmg')) * (1 + vaultP('ilmDmg') / 100) * S.aoe; U.innerMines.qty += mod('ilmQty') + (P('uwIlm') ? U.innerMines.qty : 0); U.innerMines.cd = Math.max(37, U.innerMines.cd + mod('ilmCd')); }
  if (U.goldenTower) { U.goldenTower.mult = (U.goldenTower.mult + labV('gtBonus') + mod('gtBonus')) * (1 + vaultP('gtBonus') / 100) * (P('uwGt') ? 1.5 : 1); U.goldenTower.dur += labV('gtDur') + mod('gtDur'); U.goldenTower.cd = Math.max(30, U.goldenTower.cd + mod('gtCd')); }
  if (U.poisonSwamp) { U.poisonSwamp.dmg = (U.poisonSwamp.dmg + mod('psDmg')) * (1 + vaultP('psDmg') / 100) * S.aoe; U.poisonSwamp.dur += mod('psDur'); U.poisonSwamp.cd = Math.max(20, U.poisonSwamp.cd + mod('psCd')); U.poisonSwamp.radius = (5 + labV('psRadius') * 4) * (P('uwPs') ? 1.5 : 1); }
  if (U.blackHole) { U.blackHole.size = (U.blackHole.size + mod('bhSize')) * (1 + vaultP('bhSize') / 100); U.blackHole.dur += mod('bhDur') + 12 * P('uwBh'); U.blackHole.cd = Math.max(20, U.blackHole.cd + mod('bhCd')); }
  if (U.spotlight) { U.spotlight.bonus = (U.spotlight.bonus + mod('slBonus')) * (1 + vaultP('slBonus') / 100) * (P('uwSl') ? 1.5 : 1); U.spotlight.angle = Math.min(90, U.spotlight.angle + mod('slAngle')); }

  // ---- karty ----
  S.slowAura = cm('slowAura', 0) / 100;
  S.enemyBalance = card('enemyBalance');
  S.plasma = card('plasmaCannon') !== null ? card('plasmaCannon') / 100 : 0;
  S.critCoin = cm('criticalCoin', 0) / 100;
  S.critCoinDouble = (mast('criticalCoin') || 0) / 100;
  S.waveSkip = cm('waveSkip', 0) / 100;
  S.doubleSkip = (mast('waveSkip') || 0) / 100;
  S.introSprint = card('introSprint') || 0;
  S.cellsFlat = cm('cells', 0);
  S.deathRay = card('deathRay') || 0;
  S.drDouble = labV('drDouble');
  S.energyNet = card('energyNet') || 0;
  S.superTower = card('superTower') ? card('superTower') * labV('stBonus') : 0;
  S.secondWind = card('secondWind') || 0;
  S.swBlast = labV('swBlast');
  S.demonMode = card('demonMode') || 0;
  S.demonRevenge = mast('demonMode') || 1;
  S.energyShield = card('energyShield') || 0;
  S.esCharges = 1 + labV('esExtra');
  S.waveAccel = cm('waveAccelerator', 0) / 100;
  S.berserker = cm('berserker', 0) / 100;
  S.nuke = card('nuke') || 0;
  S.recharge = { secondWind: labV('swRecharge'), demonMode: labV('dmRecharge'), nuke: labV('nukeRecharge') };

  // ---- perky a trade-offy, nepřátelé ----
  S.enemyHpMult = trade('tEnemyHp') ? 1 - 0.5 * tb : 1;
  S.enemyDmgMult = (trade('tEnemyDmg') ? 1 - 0.5 * tb : 1) * (trade('tSpeed') ? 2.5 : 1);
  S.enemySpdMult = trade('tSpeed') ? 1 - 0.4 * tb : 1;
  S.bossHpMult = (trade('tDmgBoss') ? 8 : 1) * (trade('tBoss') ? 1 - 0.7 * (1 + (tb - 1) / 2) : 1);
  S.bossSpdMult = trade('tBoss') ? 1.5 : 1;
  S.rangedDmgMult = trade('tRanged') ? 3 : 1;
  S.rangedStop = trade('tRanged') ? 14 : 26;
  S.perkWaveMult = Math.max(0.2, 1 - stdA('perkWave', 0.2));
  S.eHp = {}; S.eAtk = {};
  for (const t of Object.keys(ENEMY_TYPES)) {
    const ve = save.vault.enemy[t] || {};
    S.eHp[t] = (1 + labV('eHp_' + t)) * (1 - (ve.hp || 0) / 100);
    S.eAtk[t] = (1 + labV('eAtk_' + t)) * (1 - (ve.atk || 0) / 100);
  }
  S.fastSpd = 1 + labV('eSpd_fast');
  S.protRadius = 1 + labV('protRadius');
  S.protRed = 0.4 + labV('protRed');

  // ---- moduly – unikátní efekty ----
  S.uniq = {};
  for (const type in MOD_UNIQUES) for (const u of MOD_UNIQUES[type]) { const v = uniqueV(type, u[0]); if (v !== null) S.uniq[u[0]] = v; }
  if (S.uniq.astral) S.bounceRange += S.range * 0.03;
  if (S.uniq.annihilator) S.scChance = Math.min(1, S.scChance + S.uniq.annihilator / 100);
  if (S.uniq.tactical && U.smartMissiles) U.smartMissiles.radiusMult = 2;

  // ---- boti ----
  S.bots = [];
  const botRange = relicV('botRange') + (S.uniq.singularity || 0) + (save.vault.harmony.botRange ? 8 : 0);
  for (const b of BOT_DEFS) {
    const st = save.bots[b.id];
    if (!st || !st.owned || st.off) continue;
    const o = { id: b.id };
    for (const [k, , f, max] of b.stats) o[k] = f(Math.min(st.lv[k] || 0, max));
    const cap = b.id[0].toUpperCase() + b.id.slice(1);
    if (o.cd) o.cd = Math.max(20, o.cd + labV('cd' + cap));
    if (o.dur) o.dur += labV('dur' + cap);
    if (b.id === 'thunder') o.lingerT = 3.5 + labV('thunderLinger');
    o.range = (o.range + botRange) * 0.3;
    S.bots.push(o);
  }

  // ---- guardian ----
  S.chips = [];
  if (save.guardian.unlocked && save.guild.joined) {
    for (const id of save.guardian.equip) {
      const c = CHIP_MAP[id], st = save.guardian.chips[id];
      if (!c || !st) continue;
      const o = { id };
      for (const [k, , f, max] of c.stats) o[k] = f(Math.min(st[k] || 0, max));
      S.chips.push(o);
    }
  }

  // ---- disonance: omezení kategorie ----
  if (diss === 'atk') { S.damage = 1; S.range = 30; S.atkSpeed = 1; }
  if (diss === 'def') { S.maxHp = 1; S.regen = 1; S.defPct = 0; S.defAbs = 0; S.thorns = 0; S.lifesteal = 0; S.orbs = 0; S.shockOn = false; S.mineOn = false; S.deathDefy = 0; S.wallOn = false; S.knockChance = 0; }
  if (diss === 'util') { S.cashWave = 0; S.interest = 0; S.packChance = 0; S.free = { atk: 0, def: 0, util: 0 }; S.elsAtk = 0; S.elsHp = 0; S.coinWave = 0; }
  return S;
}
