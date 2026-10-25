'use strict';
// ---------- Jackpot Tower: data a herní logika (bez DOM, aby šla simulovat i v Node) ----------
// Princip podle Neon Tower: automat uprostřed stolu brání proti vlnám kostek, karet a žetonů.
// Za žetony ($) se kupují vylepšení v běhu, za zlaťáky trvalá vylepšení v dílně, za diamanty talismany.

// ---------- pomocné funkce ----------
const SUF = ['', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S', 'O', 'N', 'D'];
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  let s;
  if (n < 1000) s = n < 10 && n % 1 > 0.005 ? n.toFixed(1) : String(Math.floor(n));
  else {
    const e = Math.floor(Math.log10(n) / 3);
    const v = n / Math.pow(1000, e);
    s = e < SUF.length ? (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUF[e] : n.toExponential(2);
  }
  return (neg ? '-' : '') + s;
}
const pct = v => (v * 100 < 10 ? (v * 100).toFixed(1) : Math.round(v * 100)) + ' %';
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function weighted(opts) { // [[hodnota, váha], ...]
  let tot = 0;
  for (const o of opts) tot += o[1];
  let r = Math.random() * tot;
  for (const o of opts) if ((r -= o[1]) <= 0) return o[0];
  return opts[opts.length - 1][0];
}

// ---------- vylepšení ----------
// f(L) = hodnota na úrovni L; cash = [základ, růst] cena v běhu; gold = [základ, růst] cena v dílně;
// unlock = [klíč, cena v zlaťácích] – skupina se musí nejdřív odemknout v dílně
const F = {
  num: v => fmt(v), pct, x: v => '×' + v.toFixed(2), s: v => v.toFixed(1) + ' s', int: v => String(Math.round(v)),
  ps: v => fmt(v) + '/s', cash: v => '$' + fmt(v), m: v => v.toFixed(1) + ' m', spd: v => v.toFixed(2) + '/s',
};
const STATS = [
  // ---- ÚTOK ----
  { id: 'damage', cat: 'atk', name: 'Poškození', desc: 'Poškození jednoho žetonu.', f: L => 4 + 1.6 * L + 0.04 * L * L, fmt: F.num, max: 1500, cash: [6, 1.1], gold: [6, 1.09] },
  { id: 'atkSpd', cat: 'atk', name: 'Rychlost útoku', desc: 'Hozené žetony za sekundu.', f: L => 1 + 0.04 * L, fmt: F.spd, max: 80, cash: [8, 1.17], gold: [10, 1.15] },
  { id: 'crit', cat: 'atk', name: 'Šance na šestku', desc: 'Šance, že kostka padne na 6 a zásah je kritický.', f: L => 0.03 + 0.01 * L, fmt: F.pct, max: 60, cash: [8, 1.17], gold: [10, 1.15] },
  { id: 'critMult', cat: 'atk', name: 'Krit. násobek', desc: 'Násobek poškození kritického zásahu.', f: L => 1.5 + 0.1 * L, fmt: F.x, max: 120, cash: [10, 1.13], gold: [10, 1.12] },
  { id: 'range', cat: 'atk', name: 'Dosah', desc: 'Jak daleko automat hází žetony.', f: L => 28 + 0.4 * L, fmt: F.m, max: 50, cash: [10, 1.18], gold: [12, 1.16], unlock: ['range', 40] },
  { id: 'multi', cat: 'atk', name: 'Rozhoz – šance', desc: 'Šance hodit žetony na více cílů naráz.', f: L => 0.012 * L, fmt: F.pct, max: 60, cash: [20, 1.17], gold: [25, 1.15], unlock: ['multi', 250] },
  { id: 'multiN', cat: 'atk', name: 'Rozhoz – cíle', desc: 'Počet cílů při rozhozu.', f: L => 2 + L, fmt: F.int, max: 5, cash: [150, 2.6], gold: [200, 2.5], unlock: ['multi', 250] },
  { id: 'bounce', cat: 'atk', name: 'Odraz – šance', desc: 'Šance, že se žeton odrazí na dalšího nepřítele.', f: L => 0.012 * L, fmt: F.pct, max: 60, cash: [30, 1.17], gold: [40, 1.15], unlock: ['bounce', 1200] },
  { id: 'bounceN', cat: 'atk', name: 'Odraz – počet', desc: 'Kolikrát se žeton odrazí.', f: L => 1 + L, fmt: F.int, max: 5, cash: [250, 2.6], gold: [300, 2.5], unlock: ['bounce', 1200] },

  // ---- OBRANA ----
  { id: 'health', cat: 'def', name: 'Zdraví', desc: 'Maximální HP automatu.', f: L => 40 + 8 * L + 0.12 * L * L, fmt: F.num, max: 1500, cash: [6, 1.1], gold: [6, 1.09] },
  { id: 'regen', cat: 'def', name: 'Regenerace', desc: 'HP obnovené za sekundu.', f: L => 0.4 + 0.15 * L + 0.006 * L * L, fmt: F.ps, max: 1500, cash: [8, 1.11], gold: [8, 1.1] },
  { id: 'defPct', cat: 'def', name: 'Obrana %', desc: 'Snižuje přijaté poškození o procento (max 80 %).', f: L => 0.006 * L, fmt: F.pct, max: 133, cash: [10, 1.15], gold: [12, 1.13], unlock: ['def', 60] },
  { id: 'defAbs', cat: 'def', name: 'Obrana absolutní', desc: 'Odečte pevnou hodnotu z každého zásahu.', f: L => 0.5 * L + 0.02 * L * L, fmt: F.num, max: 1000, cash: [10, 1.12], gold: [12, 1.11], unlock: ['def', 60] },
  { id: 'thorns', cat: 'def', name: 'Trny', desc: 'Útočník utrpí % svého max. HP (krupiér třetinu).', f: L => 0.01 * L, fmt: F.pct, max: 80, cash: [20, 1.16], gold: [25, 1.14], unlock: ['thorns', 400] },
  { id: 'knock', cat: 'def', name: 'Odhození – šance', desc: 'Šance, že zásah odhodí nepřítele zpět.', f: L => 0.01 * L, fmt: F.pct, max: 60, cash: [15, 1.16], gold: [20, 1.14], unlock: ['knock', 800] },
  { id: 'knockF', cat: 'def', name: 'Odhození – síla', desc: 'Jak daleko nepřítel odletí.', f: L => 3 + 0.4 * L, fmt: v => v.toFixed(1), max: 40, cash: [15, 1.16], gold: [20, 1.14], unlock: ['knock', 800] },
  { id: 'lifesteal', cat: 'def', name: 'Lifesteal', desc: 'Část způsobeného poškození vyléčí automat.', f: L => 0.001 * L, fmt: F.pct, max: 60, cash: [40, 1.17], gold: [50, 1.15], unlock: ['life', 2500] },

  // ---- UTILITA ----
  { id: 'cashBonus', cat: 'util', name: 'Žetonový bonus', desc: 'Násobek všech žetonů.', f: L => 1 + 0.02 * L, fmt: F.x, max: 150, cash: [8, 1.14], gold: [8, 1.12] },
  { id: 'cashWave', cat: 'util', name: 'Žetony / vlna', desc: 'Žetony za každou dokončenou vlnu.', f: L => 4 * L, fmt: F.cash, max: 200, cash: [8, 1.14], gold: [8, 1.12] },
  { id: 'goldKill', cat: 'util', name: 'Zlaťáky / výhra', desc: 'Násobek zlaťáků za poražené nepřátele.', f: L => 1 + 0.02 * L, fmt: F.x, max: 150, cash: [25, 1.17], gold: [15, 1.14], unlock: ['gold', 30] },
  { id: 'goldWave', cat: 'util', name: 'Zlaťáky / vlna', desc: 'Zlaťáky za každou dokončenou vlnu.', f: L => 1 + 0.5 * L, fmt: F.num, max: 150, cash: [20, 1.17], gold: [15, 1.14] },
  { id: 'interest', cat: 'util', name: 'Úrok / vlna', desc: 'Úrok z naspořených žetonů na konci vlny.', f: L => 0.004 * L, fmt: F.pct, max: 50, cash: [30, 1.17], gold: [40, 1.15], unlock: ['bank', 600] },
  { id: 'freeUpg', cat: 'util', name: 'Vylepšení zdarma', desc: 'Šance na vylepšení zdarma v každé kategorii po vlně.', f: L => 0.01 * L, fmt: F.pct, max: 50, cash: [40, 1.18], gold: [60, 1.16], unlock: ['free', 2000] },

  // ---- AUTOMAT ----
  { id: 'spinCd', cat: 'slot', name: 'Rychlost točení', desc: 'Jak často se automat sám zatočí.', f: L => Math.max(4, 14 - 0.2 * L), fmt: F.s, max: 50, cash: [12, 1.19], gold: [15, 1.16] },
  { id: 'luck', cat: 'slot', name: 'Štěstí', desc: 'Šance, že válec zopakuje symbol předchozího válce.', f: L => 0.1 + 0.008 * L, fmt: F.pct, max: 60, cash: [15, 1.18], gold: [20, 1.16] },
  { id: 'payout', cat: 'slot', name: 'Výplata', desc: 'Síla všech výher automatu.', f: L => 1 + 0.06 * L, fmt: F.x, max: 200, cash: [12, 1.15], gold: [15, 1.13] },
  { id: 'rouletteEdge', cat: 'slot', name: 'Krupiérova přízeň', desc: 'Bonus k výhrám v ruletě.', f: L => 1 + 0.01 * L, fmt: F.x, max: 25, cash: [50, 1.25], gold: [80, 1.2], unlock: ['roulette', 1500] },
];
const STAT_MAP = Object.fromEntries(STATS.map(d => [d.id, d]));
const CATS = [
  { id: 'atk', name: 'Útok', color: '#ff5d6c' },
  { id: 'def', name: 'Obrana', color: '#4fd6a0' },
  { id: 'util', name: 'Utilita', color: '#ffd166' },
  { id: 'slot', name: 'Automat', color: '#c8a2ff' },
];
const UNLOCKS = {};
for (const d of STATS) if (d.unlock) UNLOCKS[d.unlock[0]] = d.unlock[1];

// ---------- symboly automatu ----------
const SYMS = [
  { id: 'cherry', ch: '🍒', w: 30, name: 'Třešně', pair: 'žetony', triple: 'velká výplata žetonů' },
  { id: 'lemon', ch: '🍋', w: 24, name: 'Citróny', pair: 'zpomalení nepřátel', triple: 'silné zmrazení' },
  { id: 'bell', ch: '🔔', w: 18, name: 'Zvonky', pair: 'léčení 15 %', triple: 'léčení 50 %' },
  { id: 'bar', ch: 'BAR', w: 14, name: 'BAR', pair: 'rychlá palba ×2', triple: 'rychlá palba ×3' },
  { id: 'gem', ch: '💎', w: 9, name: 'Diamanty', pair: 'salva žetonů', triple: 'velká salva + diamant' },
  { id: 'seven', ch: '7', w: 5, name: 'Sedmičky', pair: 'zásah všech nepřátel', triple: 'JACKPOT – smete stůl' },
];
const SYM_MAP = Object.fromEntries(SYMS.map(s => [s.id, s]));

// ---------- nepřátelé (násobky základního nepřítele) ----------
const BASE_HP = 3, BASE_DMG = 2, BASE_SPD = 6;
const ENEMY_TYPES = {
  dice: { name: 'Kostka', hp: 1, dmg: 1, spd: 1, r: 2.6, cash: 1, gold: 1, rate: 1 },
  card: { name: 'Karta', hp: 0.7, dmg: 0.7, spd: 2, r: 2.4, cash: 1.3, gold: 1.5, rate: 0.8 },
  chips: { name: 'Sloupek žetonů', hp: 4, dmg: 2.5, spd: 0.55, r: 3.6, cash: 3, gold: 3, rate: 1.4 },
  ball: { name: 'Kulička', hp: 0.9, dmg: 1.3, spd: 1.1, r: 2.1, cash: 1.5, gold: 2, rate: 2.2, stop: 18 },
  joker: { name: 'Žolík', hp: 7, dmg: 1.5, spd: 0.8, r: 3.4, cash: 5, gold: 5, rate: 1.2, elite: true },
  thief: { name: 'Podvodník', hp: 3, dmg: 0, spd: 1.6, r: 2.9, cash: 4, gold: 4, rate: 1, elite: true },
  boss: { name: 'Krupiér', hp: 25, dmg: 4, spd: 0.4, r: 6, cash: 12, gold: 12, rate: 2, boss: true },
};

// ---------- stoly (obtížnosti) ----------
const TIERS = [
  { name: 'Hospoda', hp: 1, dmg: 1, gold: 1 },
  { name: 'Herna', hp: 3.5, dmg: 2.6, gold: 1.8 },
  { name: 'Kasino', hp: 12, dmg: 7, gold: 2.8 },
  { name: 'Monte Carlo', hp: 40, dmg: 18, gold: 4 },
  { name: 'Las Vegas', hp: 130, dmg: 45, gold: 5.5 },
  { name: 'Macao', hp: 420, dmg: 110, gold: 7.2 },
  { name: 'High Roller', hp: 1400, dmg: 270, gold: 9.2 },
  { name: 'VIP salonek', hp: 4500, dmg: 650, gold: 12 },
];
const TIER_UNLOCK_WAVE = 40;

// ---------- perky (rozdané karty každých 5 vln) ----------
const PERKS = [
  { id: 'dmg', name: 'Poškození ×1,2', max: 5, suit: '♠' },
  { id: 'hp', name: 'Max. HP ×1,25', max: 5, suit: '♥' },
  { id: 'crit', name: '+5 % šance na šestku', max: 4, suit: '♦' },
  { id: 'cash', name: 'Žetony ×1,2', max: 5, suit: '♦' },
  { id: 'spin', name: 'Automat točí o 15 % rychleji', max: 3, suit: '♣' },
  { id: 'luck', name: '+6 % štěstí automatu', max: 3, suit: '♣' },
  { id: 'regen', name: 'Regenerace ×1,6', max: 4, suit: '♥' },
  { id: 'def', name: '+4 % obrana', max: 4, suit: '♠' },
  { id: 'gold', name: 'Zlaťáky ×1,15', max: 4, suit: '♦' },
  { id: 'asp', name: 'Rychlost útoku ×1,1', max: 4, suit: '♠' },
  { id: 'tAllIn', name: 'All-in: poškození ×1,8, ale max. HP −40 %', max: 1, suit: '🃏', trade: true },
  { id: 'tStakes', name: 'Vysoké sázky: zlaťáky ×1,6, ale nepřátelé +30 % HP', max: 1, suit: '🃏', trade: true },
  { id: 'tDealer', name: 'Krupiérův trik: výplata automatu ×2, ale točí o 50 % pomaleji', max: 1, suit: '🃏', trade: true },
  { id: 'tRisky', name: 'Riskantní hra: krit. násobek ×1,6, ale obrana −50 %', max: 1, suit: '🃏', trade: true },
];
const PERK_MAP = Object.fromEntries(PERKS.map(p => [p.id, p]));
const PERK_EVERY = 5;

// ---------- talismany (z herního automatu za diamanty) ----------
const TAL_RARITY = {
  common: { name: 'Běžný', color: '#9fb3c8', w: 68 },
  rare: { name: 'Vzácný', color: '#5ab0ff', w: 26 },
  epic: { name: 'Epický', color: '#d48cff', w: 6 },
};
const TALISMANS = [
  { id: 'dice', icon: '🎲', name: 'Zlatá kostka', rarity: 'common', vals: [1.25, 1.5, 1.8, 2.2, 2.7], desc: v => `Poškození ×${v}` },
  { id: 'heart', icon: '❤️', name: 'Rubínové srdce', rarity: 'common', vals: [1.25, 1.5, 1.8, 2.2, 2.7], desc: v => `Max. HP ×${v}` },
  { id: 'hat', icon: '🎩', name: 'Cylindr', rarity: 'common', vals: [1.15, 1.3, 1.45, 1.6, 1.8], desc: v => `Žetony ×${v}` },
  { id: 'pig', icon: '🐷', name: 'Prasátko', rarity: 'common', vals: [1.5, 2, 2.5, 3, 4], desc: v => `Strop úroku ×${v}` },
  { id: 'bell', icon: '🔔', name: 'Zvonek', rarity: 'common', vals: [1.3, 1.6, 1.9, 2.2, 2.6], desc: v => `Regenerace ×${v}` },
  { id: 'clover', icon: '🍀', name: 'Čtyřlístek', rarity: 'rare', vals: [3, 5, 7, 9, 12], desc: v => `+${v} % šance na šestku` },
  { id: 'cat', icon: '🐈‍⬛', name: 'Černá kočka', rarity: 'rare', vals: [8, 12, 16, 20, 25], desc: v => `Nepřátelé pomalejší o ${v} %` },
  { id: 'purse', icon: '💰', name: 'Měšec', rarity: 'rare', vals: [1.15, 1.3, 1.45, 1.6, 1.8], desc: v => `Zlaťáky ×${v}` },
  { id: 'lever', icon: '🕹️', name: 'Zlatá páka', rarity: 'rare', vals: [10, 15, 20, 25, 30], desc: v => `Automat točí o ${v} % rychleji` },
  { id: 'seven', icon: '7️⃣', name: 'Šťastná sedmička', rarity: 'epic', vals: [1.5, 2, 2.5, 3, 4], desc: v => `Sedmičky padají ×${v} častěji` },
  { id: 'ace', icon: '🂡', name: 'Eso v rukávu', rarity: 'epic', vals: [30, 40, 50, 60, 75], desc: v => `Jednou za hru tě vrátí do hry s ${v} % HP` },
];
const TAL_MAP = Object.fromEntries(TALISMANS.map(t => [t.id, t]));
const TAL_LEVEL_REQ = [1, 3, 6, 10, 15]; // celkové kopie pro level 1..5
const TAL_SPIN_COST = 10;

// ---------- ruleta (evropská, 37 políček) ----------
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const numColor = n => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
const BETS = [
  { id: 'red', name: 'Červená', pay: 2, win: n => numColor(n) === 'red' },
  { id: 'black', name: 'Černá', pay: 2, win: n => numColor(n) === 'black' },
  { id: 'even', name: 'Sudá', pay: 2, win: n => n > 0 && n % 2 === 0 },
  { id: 'odd', name: 'Lichá', pay: 2, win: n => n % 2 === 1 },
  { id: 'd1', name: '1–12', pay: 3, win: n => n >= 1 && n <= 12 },
  { id: 'd2', name: '13–24', pay: 3, win: n => n >= 13 && n <= 24 },
  { id: 'd3', name: '25–36', pay: 3, win: n => n >= 25 },
  { id: 'zero', name: 'Zelená 0', pay: 36, win: n => n === 0 },
];

// ---------- uložení ----------
const SAVE_KEY = 'jackpotTowerSave_v1';
let save;
function defaultSave() {
  return {
    gold: 0, gems: 20, ws: {}, unlocks: {}, maxTier: 1, tier: 1, best: {}, gemMs: {},
    tal: {}, equipped: [], speed: 1,
    stats: { runs: 0, kills: 0, bosses: 0, jackpots: 0, spins: 0, goldTotal: 0, rouletteBest: 0, rouletteSpins: 0, rouletteWon: 0, rouletteLost: 0, bestWave: 0 },
    run: null,
  };
}
function loadSave() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { o = null; }
  const d = defaultSave();
  save = o ? { ...d, ...o, stats: { ...d.stats, ...(o.stats || {}) } } : d;
}
function writeSave() {
  try {
    if (game.run && !game.run.over) save.run = snapshotRun(game.run);
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) { /* plné úložiště nebo soukromé okno */ }
}

// ---------- výpočet statistik ----------
const isUnlocked = d => !d.unlock || !!save.unlocks[d.unlock[0]];
const wsLevel = id => save.ws[id] || 0;
const runLevel = (id, R) => (R && R.lv[id]) || 0;
const statLevel = (id, R) => Math.min(STAT_MAP[id].max, wsLevel(id) + runLevel(id, R));
const atMax = (id, R) => wsLevel(id) + runLevel(id, R) >= STAT_MAP[id].max;
const raw = (id, R) => STAT_MAP[id].f(isUnlocked(STAT_MAP[id]) ? statLevel(id, R) : 0);
const cashCost = (d, R) => Math.round(d.cash[0] * Math.pow(d.cash[1], runLevel(d.id, R)));
const goldCost = d => Math.round(d.gold[0] * Math.pow(d.gold[1], wsLevel(d.id)));

const talCount = id => save.tal[id] || 0;
function talLevel(id) { let l = 0; for (let i = 0; i < 5; i++) if (talCount(id) >= TAL_LEVEL_REQ[i]) l = i + 1; return l; }
const talV = id => save.equipped.includes(id) && talLevel(id) ? TAL_MAP[id].vals[talLevel(id) - 1] : 0;
const talSlots = () => Math.min(6, 1 + save.maxTier);
const perkN = (R, id) => (R && R.perks[id]) || 0;

function computeStats(R) {
  const p = id => perkN(R, id);
  const T = TIERS[(R ? R.tier : save.tier) - 1];
  const S = {};
  S.damage = raw('damage', R) * (talV('dice') || 1) * Math.pow(1.2, p('dmg')) * (p('tAllIn') ? 1.8 : 1);
  S.atkSpd = raw('atkSpd', R) * Math.pow(1.1, p('asp'));
  S.crit = Math.min(0.95, raw('crit', R) + talV('clover') / 100 + 0.05 * p('crit'));
  S.critMult = raw('critMult', R) * (p('tRisky') ? 1.6 : 1);
  S.range = raw('range', R);
  S.multi = raw('multi', R); S.multiN = raw('multiN', R);
  S.bounce = raw('bounce', R); S.bounceN = raw('bounceN', R);
  S.maxHp = raw('health', R) * (talV('heart') || 1) * Math.pow(1.25, p('hp')) * (p('tAllIn') ? 0.6 : 1);
  S.regen = raw('regen', R) * (talV('bell') || 1) * Math.pow(1.6, p('regen'));
  S.defPct = Math.min(0.8, (raw('defPct', R) + 0.04 * p('def')) * (p('tRisky') ? 0.5 : 1));
  S.defAbs = raw('defAbs', R) * (p('tRisky') ? 0.5 : 1);
  S.thorns = raw('thorns', R);
  S.knock = raw('knock', R); S.knockF = raw('knockF', R);
  S.lifesteal = raw('lifesteal', R);
  S.cashMult = raw('cashBonus', R) * (talV('hat') || 1) * Math.pow(1.2, p('cash'));
  S.cashWave = raw('cashWave', R);
  S.goldMult = raw('goldKill', R) * (talV('purse') || 1) * Math.pow(1.15, p('gold')) * (p('tStakes') ? 1.6 : 1) * T.gold;
  S.goldWave = raw('goldWave', R) * T.gold;
  S.interest = raw('interest', R);
  S.interestCap = (talV('pig') || 1);
  S.freeUpg = raw('freeUpg', R);
  S.spinCd = raw('spinCd', R) * (1 - talV('lever') / 100) * Math.pow(0.85, p('spin')) * (p('tDealer') ? 1.5 : 1);
  S.luck = Math.min(0.9, raw('luck', R) + 0.06 * p('luck'));
  S.payout = raw('payout', R) * (p('tDealer') ? 2 : 1);
  S.sevenW = talV('seven') || 1;
  S.slowAll = talV('cat') / 100;
  S.rouletteEdge = raw('rouletteEdge', R);
  S.enemyHp = p('tStakes') ? 1.3 : 1;
  return S;
}

// ---------- běh hry ----------
const VIEW_R = 48, SPAWN_R = 52, TOWER_R = 6, STEP = 1 / 30;
const WAVE_SPAWN = 22, WAVE_COOLDOWN = 6;
const game = { run: null, paused: false, modalPause: false };

function startRun(tier) {
  const R = {
    tier, wave: 1, phase: 'spawn', phaseT: 0, spawnAcc: 0, time: 0, hp: 0, cash: 0, lv: {}, perks: {},
    enemies: [], bullets: [], ebullets: [], fx: [], nextId: 1,
    atkT: 0, rapidT: 0, rapidMult: 1, slowT: 0, slowAmt: 0, shake: 0, flash: 0,
    slot: { t: 0, spin: 0, reels: ['seven', 'seven', 'seven'], res: null, last: null },
    perkOffer: null, aceUsed: false, risk: false, over: false,
    kills: 0, cashEarned: 0, goldEarned: 0, gemsEarned: 0, jackpots: 0, spins: 0,
  };
  R.S = computeStats(R);
  R.hp = R.S.maxHp;
  game.run = R;
  save.run = null;
  onWaveStart(R);
  return R;
}
function snapshotRun(R) {
  const o = {};
  for (const k in R) if (!['S', 'fx', 'bullets', 'ebullets'].includes(k)) o[k] = R[k];
  return JSON.parse(JSON.stringify(o));
}
function restoreRun(snap) {
  const R = { ...snap, fx: [], bullets: [], ebullets: [] };
  R.S = computeStats(R);
  game.run = R;
  return R;
}
function refreshStats(R) {
  const oldMax = R.S ? R.S.maxHp : 0;
  R.S = computeStats(R);
  if (oldMax && R.S.maxHp > oldMax) R.hp += R.S.maxHp - oldMax;
  R.hp = Math.min(R.hp, R.S.maxHp);
}

function tick(realDt) {
  const R = game.run;
  if (!R || R.over || game.paused || game.modalPause) return;
  let t = Math.min(realDt, 0.25) * save.speed;
  while (t > 0 && !R.over) {
    const dt = Math.min(STEP, t);
    step(R, dt);
    t -= dt;
  }
}

function step(R, dt) {
  const S = R.S;
  R.time += dt;
  R.phaseT += dt;
  if (R.phase === 'spawn') {
    R.spawnAcc += dt;
    const iv = spawnInterval(R);
    while (R.spawnAcc >= iv) { R.spawnAcc -= iv; spawnNormal(R); }
    if (R.phaseT >= WAVE_SPAWN) { R.phase = 'cool'; R.phaseT = 0; }
  } else if (R.phaseT >= WAVE_COOLDOWN) {
    endWave(R);
    R.wave++;
    R.phase = 'spawn'; R.phaseT = 0;
    onWaveStart(R);
  }
  R.hp = Math.min(S.maxHp, R.hp + S.regen * dt);
  if (R.rapidT > 0) R.rapidT -= dt;
  if (R.slowT > 0) R.slowT -= dt;
  R.shake = Math.max(0, R.shake - dt * 3);
  R.flash = Math.max(0, R.flash - dt * 1.5);
  updateSlot(R, dt);
  updateEnemies(R, dt);
  updateEnemyBullets(R, dt);
  R.atkT += dt;
  const iv = 1 / (S.atkSpd * (R.rapidT > 0 ? R.rapidMult : 1));
  if (R.atkT >= iv) { if (fire(R)) R.atkT = 0; else R.atkT = iv; }
  updateBullets(R, dt);
  updateFx(R, dt);
}

const spawnInterval = R => Math.max(0.25, 1.6 - 0.011 * Math.min(R.wave, 120));
const hpScale = R => TIERS[R.tier - 1].hp * (1 + 0.12 * R.wave) * Math.pow(1.045, R.wave) * R.S.enemyHp;
const dmgScale = R => TIERS[R.tier - 1].dmg * (1 + 0.08 * R.wave) * Math.pow(1.04, R.wave);
const killCash = R => 1 + 0.06 * R.wave;

function onWaveStart(R) {
  if (R.wave % 10 === 0) spawnAt(R, 'boss');
  const eliteFrom = Math.max(4, 16 - 3 * (R.tier - 1));
  if (R.wave >= eliteFrom && Math.random() < 0.35 + 0.004 * R.wave) spawnAt(R, 'joker');
  if (R.wave >= eliteFrom + 6 && Math.random() < 0.3 + 0.004 * R.wave) spawnAt(R, 'thief');
}

function endWave(R) {
  const S = R.S;
  addCash(R, S.cashWave * S.cashMult);
  addGold(R, S.goldWave);
  if (S.interest > 0) {
    const cap = (40 + 25 * R.wave) * S.cashMult * S.interestCap;
    const v = Math.min(R.cash * S.interest, cap);
    if (v >= 1) { addCash(R, v); fxText(R, 0, -10, `Úrok +$${fmt(v)}`, '#ffd166', 1.6); }
  }
  if (S.freeUpg > 0) for (const c of ['atk', 'def', 'util']) {
    if (Math.random() >= S.freeUpg) continue;
    const opts = STATS.filter(d => d.cat === c && isUnlocked(d) && !atMax(d.id, R));
    if (!opts.length) continue;
    const d = pick(opts);
    R.lv[d.id] = runLevel(d.id, R) + 1;
    fxText(R, rand(-8, 8), 8, `Zdarma: ${d.name}`, '#4fd6a0', 1.8);
    refreshStats(R);
  }
  if (R.wave % PERK_EVERY === 0) offerPerks(R);
  updateBest(R);
}

function offerPerks(R) {
  const avail = PERKS.filter(p => perkN(R, p.id) < p.max);
  if (!avail.length) return;
  const out = [];
  while (out.length < 3 && out.length < avail.length) {
    const p = pick(avail);
    if (!out.includes(p.id)) out.push(p.id);
  }
  R.perkOffer = out;
}
function choosePerk(R, id) {
  if (!R.perkOffer || !R.perkOffer.includes(id)) return;
  R.perks[id] = perkN(R, id) + 1;
  R.perkOffer = null;
  refreshStats(R);
}

function updateBest(R) {
  const b = save.best[R.tier] || 0;
  if (R.wave > b) save.best[R.tier] = R.wave;
  save.stats.bestWave = Math.max(save.stats.bestWave, R.wave);
  if (R.wave >= TIER_UNLOCK_WAVE && R.tier === save.maxTier && save.maxTier < TIERS.length) {
    save.maxTier++;
    fxText(R, 0, -18, `Odemčen stůl: ${TIERS[save.maxTier - 1].name}!`, '#ffd166', 3);
  }
  // diamanty za každých 10 vln, poprvé na daném stole
  const key = R.tier + '-' + R.wave;
  if (R.wave % 10 === 0 && !save.gemMs[key]) { save.gemMs[key] = 1; addGems(R, 2 + R.tier); }
}

// ---------- nepřátelé ----------
function makeEnemy(R, type, x, y) {
  const T = ENEMY_TYPES[type];
  const hp = BASE_HP * T.hp * hpScale(R);
  const e = {
    id: R.nextId++, type, x, y, hp, maxHp: hp, dmg: BASE_DMG * T.dmg * dmgScale(R), spd: BASE_SPD * T.spd, r: T.r,
    atkT: 0, kb: 0, face: randInt(1, 6), rot: rand(0, 6.28), spin: rand(-2, 2), suit: pick(['♠', '♥', '♦', '♣']), stolen: 0,
    boss: !!T.boss, elite: !!T.elite, hitT: 0,
  };
  R.enemies.push(e);
  return e;
}
function spawnAt(R, type) {
  const a = rand(0, Math.PI * 2);
  return makeEnemy(R, type, Math.cos(a) * SPAWN_R, Math.sin(a) * SPAWN_R);
}
function spawnNormal(R) {
  const w = R.wave;
  const type = weighted([['dice', 60], ['card', w >= 3 ? 22 : 0], ['chips', w >= 6 ? 12 : 0], ['ball', w >= 9 ? 11 : 0]]);
  spawnAt(R, type);
}

function updateEnemies(R, dt) {
  const S = R.S;
  const slow = (1 - S.slowAll) * (R.slowT > 0 ? 1 - R.slowAmt : 1);
  for (const e of R.enemies) {
    const T = ENEMY_TYPES[e.type];
    const d = Math.hypot(e.x, e.y) || 0.01;
    const nx = e.x / d, ny = e.y / d;
    e.rot += e.spin * dt;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.kb > 0) {
      const m = Math.min(e.kb, 40 * dt);
      e.x += nx * m; e.y += ny * m; e.kb -= m;
      continue;
    }
    const stop = (T.stop || 0) + TOWER_R + e.r;
    if (d > stop) {
      const mv = Math.min(d - stop, e.spd * slow * dt);
      e.x -= nx * mv; e.y -= ny * mv;
    } else {
      e.atkT += dt * slow;
      if (e.atkT >= T.rate) { e.atkT = 0; enemyAttack(R, e); }
    }
  }
  R.enemies = R.enemies.filter(e => e.hp > 0);
}

function enemyAttack(R, e) {
  const S = R.S;
  if (e.type === 'ball') {
    const d = Math.hypot(e.x, e.y);
    R.ebullets.push({ x: e.x, y: e.y, vx: -e.x / d * 30, vy: -e.y / d * 30, dmg: e.dmg });
    return;
  }
  if (e.type === 'thief') {
    const s = Math.min(R.cash, Math.max(2, R.cash * 0.04));
    if (s > 0) { R.cash -= s; e.stolen += s; fxText(R, e.x, e.y - 3, `−$${fmt(s)}`, '#ff5d6c', 1); }
    return;
  }
  hurtTower(R, e.dmg);
  if (S.thorns > 0) damageEnemy(R, e, e.maxHp * S.thorns * (e.boss ? 0.33 : 1), { noLife: true });
}

function updateEnemyBullets(R, dt) {
  for (const b of R.ebullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x, b.y) < TOWER_R + 0.5) { b.dead = true; hurtTower(R, b.dmg); }
  }
  R.ebullets = R.ebullets.filter(b => !b.dead);
}

function hurtTower(R, raw) {
  const S = R.S;
  const dmg = Math.max(0, raw * (1 - S.defPct) - S.defAbs);
  if (dmg <= 0) return;
  R.hp -= dmg;
  R.shake = Math.min(1, R.shake + 0.15);
  if (R.hp > 0) return;
  const ace = talV('ace');
  if (ace && !R.aceUsed) {
    R.aceUsed = true;
    R.hp = S.maxHp * ace / 100;
    R.flash = 1;
    fxText(R, 0, -12, '🂡 Eso v rukávu!', '#ffd166', 2.5);
    return;
  }
  R.hp = 0;
  endRun(R);
}

function damageEnemy(R, e, dmg, o = {}) {
  if (e.hp <= 0) return;
  const dealt = Math.min(dmg, e.hp);
  e.hp -= dmg;
  e.hitT = 0.12;
  if (!o.noLife && R.S.lifesteal > 0) R.hp = Math.min(R.S.maxHp, R.hp + dealt * R.S.lifesteal);
  if (e.hp <= 0) killEnemy(R, e);
}

function killEnemy(R, e) {
  const T = ENEMY_TYPES[e.type];
  const S = R.S;
  R.kills++; save.stats.kills++;
  addCash(R, T.cash * killCash(R) * S.cashMult);
  addGold(R, T.gold * 0.25 * S.goldMult);
  if (e.stolen > 0) { addCash(R, e.stolen * 1.5); fxText(R, e.x, e.y, `Vráceno $${fmt(e.stolen * 1.5)}`, '#4fd6a0', 1.4); }
  if (e.boss) { save.stats.bosses++; addGems(R, 1); fxText(R, e.x, e.y - 4, '+1 💎', '#7fe7ff', 1.8); R.shake = 1; }
  if (e.type === 'joker') {
    for (let i = 0; i < 3; i++) {
      const c = makeEnemy(R, 'card', e.x + rand(-3, 3), e.y + rand(-3, 3));
      c.hp = c.maxHp = c.maxHp * 2;
    }
  }
  R.fx.push({ k: 'burst', x: e.x, y: e.y, life: 0.5, max: 0.5, color: e.boss ? '#ffd166' : '#f4e3b0', n: e.boss ? 24 : 7 });
}

function addCash(R, v) { if (v > 0) { R.cash += v; R.cashEarned += v; } }
function addGold(R, v) { if (v > 0) { save.gold += v; R.goldEarned += v; save.stats.goldTotal += v; } }
function addGems(R, v) { save.gems += v; R.gemsEarned += v; }

// ---------- střelba ----------
function nearest(R, x, y, maxD, exclude) {
  let best = null, bd = maxD;
  for (const e of R.enemies) {
    if (e.hp <= 0 || (exclude && exclude.includes(e.id))) continue;
    const d = Math.hypot(e.x - x, e.y - y) - e.r;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function fire(R) {
  const S = R.S;
  const first = nearest(R, 0, 0, S.range);
  if (!first) return false;
  const targets = [first];
  if (S.multi > 0 && Math.random() < S.multi) {
    const rest = R.enemies.filter(e => e !== first && e.hp > 0 && Math.hypot(e.x, e.y) - e.r < S.range)
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    targets.push(...rest.slice(0, Math.round(S.multiN) - 1));
  }
  for (const t of targets) shoot(R, 0, 0, t, Math.random() < S.bounce ? Math.round(S.bounceN) : 0, []);
  return true;
}
function shoot(R, x, y, target, bounces, hit, mult = 1) {
  R.bullets.push({ x, y, t: target, bounces, hit, mult, col: pick(['#ff5d6c', '#4f8bff', '#2b2b2b', '#4fd6a0', '#ffd166']) });
}
function rollHit(R, mult) {
  const S = R.S;
  let dmg = S.damage * mult;
  const crit = Math.random() < S.crit;
  if (crit) dmg *= S.critMult;
  return { dmg, crit };
}
function updateBullets(R, dt) {
  for (const b of R.bullets) {
    const e = b.t;
    if (!e || e.hp <= 0) {
      const n = nearest(R, b.x, b.y, 30, b.hit);
      if (!n) { b.dead = true; continue; }
      b.t = n;
      continue;
    }
    const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy);
    const mv = 70 * dt;
    if (d <= mv + e.r * 0.6) {
      b.dead = true;
      const h = rollHit(R, b.mult);
      if (h.crit) fxText(R, e.x, e.y - 2, '⚅ ' + fmt(h.dmg), '#ffd166', 0.8);
      if (R.S.knock > 0 && !e.boss && Math.random() < R.S.knock) e.kb += R.S.knockF / (e.elite ? 2 : 1);
      damageEnemy(R, e, h.dmg);
      if (b.bounces > 0) {
        const n = nearest(R, e.x, e.y, 14, [...b.hit, e.id]);
        if (n) shoot(R, e.x, e.y, n, b.bounces - 1, [...b.hit, e.id], b.mult);
      }
    } else { b.x += dx / d * mv; b.y += dy / d * mv; }
  }
  R.bullets = R.bullets.filter(b => !b.dead);
}

// ---------- automat ----------
function rollReels(S) {
  const opts = SYMS.map(s => [s.id, s.w * (s.id === 'seven' ? S.sevenW : 1)]);
  const r0 = weighted(opts);
  const r1 = Math.random() < S.luck ? r0 : weighted(opts);
  const r2 = Math.random() < S.luck ? r1 : weighted(opts);
  return [r0, r1, r2];
}
function slotResult(reels) {
  const cnt = {};
  for (const r of reels) cnt[r] = (cnt[r] || 0) + 1;
  let best = null;
  for (const k in cnt) if (cnt[k] >= 2) best = { sym: k, n: cnt[k] };
  return best;
}
function updateSlot(R, dt) {
  const sl = R.slot;
  if (sl.spin > 0) {
    sl.spin -= dt;
    if (sl.spin <= 0) { sl.spin = 0; applySlot(R, sl.res); }
    return;
  }
  sl.t += dt;
  if (sl.t >= R.S.spinCd && R.enemies.length) spinSlot(R);
}
function spinSlot(R) {
  const sl = R.slot;
  sl.t = 0;
  sl.reels = rollReels(R.S);
  sl.res = slotResult(sl.reels);
  sl.spin = 1.3;
  R.spins++; save.stats.spins++;
}
function applySlot(R, res) {
  const S = R.S, P = S.payout;
  R.slot.last = res ? { ...res, at: R.time } : { sym: null, at: R.time };
  if (!res) return;
  const big = res.n === 3;
  const wc = 18 * killCash(R) * S.cashMult;
  const sym = SYM_MAP[res.sym];
  let label = `${sym.ch} ${sym.ch}${big ? ' ' + sym.ch : ''}`;
  switch (res.sym) {
    case 'cherry': {
      const v = wc * (big ? 6 : 1) * P;
      addCash(R, v); label += ` +$${fmt(v)}`;
      R.fx.push({ k: 'coins', x: 0, y: 0, life: 1, max: 1, n: big ? 30 : 10 });
      break;
    }
    case 'lemon':
      R.slowAmt = big ? 0.65 : 0.4; R.slowT = (big ? 8 : 4) * Math.sqrt(P); label += ' zpomalení';
      break;
    case 'bell': {
      const v = S.maxHp * Math.min(1, (big ? 0.5 : 0.15) * P);
      R.hp = Math.min(S.maxHp, R.hp + v); label += ` +${fmt(v)} HP`;
      break;
    }
    case 'bar':
      R.rapidMult = big ? 3 : 2; R.rapidT = big ? 10 : 5; label += ` palba ×${R.rapidMult}`;
      break;
    case 'gem': {
      const n = big ? 20 : 6;
      for (let i = 0; i < n; i++) {
        const t = pick(R.enemies.filter(e => e.hp > 0));
        if (t) shoot(R, 0, 0, t, 0, [], 4 * P);
      }
      if (big) { addGems(R, 1); label += ' +1 💎'; } else label += ' salva';
      break;
    }
    case 'seven':
      R.flash = big ? 1 : 0.5; R.shake = 1;
      if (big) {
        R.jackpots++; save.stats.jackpots++;
        for (const e of R.enemies) {
          if (e.boss || e.elite) damageEnemy(R, e, e.maxHp * 0.3, { noLife: true });
          else damageEnemy(R, e, e.hp + 1, { noLife: true });
        }
        const v = wc * 20 * P;
        addCash(R, v); addGold(R, 2 * R.wave * S.goldMult * 0.12 * 5);
        label = `JACKPOT 777  +$${fmt(v)}`;
        R.fx.push({ k: 'coins', x: 0, y: 0, life: 1.6, max: 1.6, n: 60 });
      } else {
        for (const e of [...R.enemies]) damageEnemy(R, e, S.damage * 10 * P, { noLife: true });
        label += ' zásah všech';
      }
      break;
  }
  fxText(R, 0, -9, label, res.sym === 'seven' ? '#ffd166' : '#fff3d6', big ? 2.4 : 1.6);
}

// ---------- nákup ----------
function buyRun(R, id) {
  const d = STAT_MAP[id];
  if (!isUnlocked(d) || atMax(id, R)) return null;
  const c = cashCost(d, R);
  if (R.cash < c) return null;
  R.cash -= c;
  let gain = 1, roll = 0;
  if (R.risk) { roll = randInt(1, 6); gain = roll >= 4 ? 2 : 0; }
  gain = Math.min(gain, d.max - wsLevel(id) - runLevel(id, R));
  if (gain > 0) R.lv[id] = runLevel(id, R) + gain;
  refreshStats(R);
  return { gain, roll };
}
function buyWs(id) {
  const d = STAT_MAP[id];
  if (!isUnlocked(d) || wsLevel(id) >= d.max) return false;
  const c = goldCost(d);
  if (save.gold < c) return false;
  save.gold -= c;
  save.ws[id] = wsLevel(id) + 1;
  return true;
}
function buyUnlock(key) {
  const c = UNLOCKS[key];
  if (save.unlocks[key] || save.gold < c) return false;
  save.gold -= c;
  save.unlocks[key] = 1;
  return true;
}

// ---------- ruleta ----------
// vrátí {n, win, payout}; sázka se odečte hned
function playRoulette(R, betId, amount) {
  const bet = BETS.find(b => b.id === betId);
  amount = Math.min(amount, R.cash);
  if (!bet || amount <= 0) return null;
  R.cash -= amount;
  const n = WHEEL[Math.floor(Math.random() * WHEEL.length)];
  const win = bet.win(n);
  const payout = win ? amount * bet.pay * R.S.rouletteEdge : 0;
  if (win) { R.cash += payout; save.stats.rouletteWon += payout - amount; save.stats.rouletteBest = Math.max(save.stats.rouletteBest, payout - amount); }
  else save.stats.rouletteLost += amount;
  save.stats.rouletteSpins++;
  return { n, win, payout, amount };
}

// ---------- talismany ----------
function spinTalisman() {
  if (save.gems < TAL_SPIN_COST) return null;
  save.gems -= TAL_SPIN_COST;
  const rar = weighted(Object.entries(TAL_RARITY).map(([k, v]) => [k, v.w]));
  const t = pick(TALISMANS.filter(x => x.rarity === rar));
  const before = talLevel(t.id);
  save.tal[t.id] = talCount(t.id) + 1;
  if (!before && save.equipped.length < talSlots()) save.equipped.push(t.id);
  return { t, levelUp: talLevel(t.id) > before, isNew: !before };
}
function toggleTalisman(id) {
  const i = save.equipped.indexOf(id);
  if (i >= 0) save.equipped.splice(i, 1);
  else if (talLevel(id) && save.equipped.length < talSlots()) save.equipped.push(id);
  else return false;
  if (game.run) refreshStats(game.run);
  return true;
}

// ---------- efekty a konec ----------
function fxText(R, x, y, text, color, life = 1.2) { R.fx.push({ k: 'txt', x, y, text, color, life, max: life }); }
function updateFx(R, dt) {
  for (const f of R.fx) { f.life -= dt; if (f.k === 'txt') f.y -= 5 * dt; }
  R.fx = R.fx.filter(f => f.life > 0);
}
function endRun(R) {
  if (R.over) return;
  R.over = true;
  save.stats.runs++;
  updateBest(R);
  save.run = null;
}

if (typeof module !== 'undefined') module.exports = { STATS, STAT_MAP, TIERS, game, get save() { return save; }, set save(v) { save = v; }, defaultSave, startRun, tick, buyRun, buyWs, buyUnlock, cashCost, goldCost, choosePerk, isUnlocked, atMax, wsLevel, UNLOCKS, step, STEP };
