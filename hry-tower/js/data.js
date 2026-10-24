'use strict';
// ---------- herní data a balanc (podle The Tower wiki) ----------

const F = {
  num: v => fmt(v),
  pct: v => pctFmt(v),
  x: v => 'x' + (v < 100 ? v.toFixed(2) : fmt(v)),
  m: v => v.toFixed(1) + 'm',
  s: v => v.toFixed(1) + 's',
  int: v => String(Math.round(v)),
  ps: v => fmt(v) + '/s',
  pm: v => 'x' + (1 + v).toFixed(3) + '/m',
  cash: v => '$' + fmt(v),
};

const MAX_SPEED = 500;
const SPEEDS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];
const WAVE_SPAWN = 26, WAVE_COOLDOWN = 9; // délka vlny a pauza mezi vlnami (s)

// Pozdní exponenciální růst, aby statistiky stíhaly nepřátele na vysokých vlnách
const xg = L => Math.pow(1.01, Math.max(0, L - 50));

// ---------- vylepšení dílny / runu ----------
// ws: klíč cenové tabulky z wiki (cena v coinech za další level), cash: [základ, růst] cena v runu
// unlock: {key, cost, after} – odemyká se v dílně za coiny v pořadí podle wiki
const STAT_DEFS = [
  // ---- ÚTOK ----
  { id: 'damage', cat: 'atk', name: 'Poškození', desc: 'Poškození jedné střely.', f: L => Math.round((16 + 4 * L + 0.05 * L * L) * xg(L)), fmt: F.num, max: 6000, ws: 'Damage_Cost', cash: [10, 1.19] },
  { id: 'attackSpeed', cat: 'atk', name: 'Rychlost útoku', desc: 'Počet výstřelů za sekundu.', f: L => 1 + 0.05 * L, fmt: v => v.toFixed(2), max: 99, ws: 'Attack_Speed_Cost', cash: [5, 1.4] },
  { id: 'critChance', cat: 'atk', name: 'Šance na krit', desc: 'Šance, že střela způsobí kritický zásah.', f: L => 0.01 * (L + 1), fmt: F.pct, max: 79, ws: 'Critical_Hits_Costs_Critical_Chance', cash: [4, 1.3] },
  { id: 'critFactor', cat: 'atk', name: 'Krit. násobek', desc: 'Násobek poškození kritického zásahu.', f: L => 1.2 + 0.1 * L, fmt: F.x, max: 150, ws: 'Critical_Hits_Costs_Critical_Factor', cash: [10, 1.25] },
  { id: 'range', cat: 'atk', name: 'Dosah', desc: 'Vzdálenost, na kterou věž střílí.', f: L => 30 + 0.5 * L, fmt: F.m, max: 79, ws: 'Range_Cost', cash: [10, 1.3], unlock: { key: 'range', cost: 50 } },
  { id: 'dmgMeter', cat: 'atk', name: 'Poškození / metr', desc: 'Bonus k poškození za každý metr vzdálenosti cíle.', f: L => L ? 0.059 * Math.pow(L / 200, 0.8) : 0, fmt: F.pm, max: 200, ws: 'Damage_Per_Meter_Cost', cash: [20, 1.25], unlock: { key: 'range', cost: 50 } },
  { id: 'multiChance', cat: 'atk', name: 'Multishot šance', desc: 'Šance vystřelit na více cílů naráz.', f: L => 0.005 * L, fmt: F.pct, max: 99, ws: 'Multishot_Cost_Multishot_Chance', cash: [25, 1.25], unlock: { key: 'multi', cost: 400, after: 'range' } },
  { id: 'multiTargets', cat: 'atk', name: 'Multishot cíle', desc: 'Počet cílů při multishotu.', f: L => 2 + L, fmt: F.int, max: 7, ws: 'Multishot_Cost_Multishot_Targets', cash: [100, 2.5], unlock: { key: 'multi', cost: 400, after: 'range' } },
  { id: 'rapidChance', cat: 'atk', name: 'Rapid fire šance', desc: 'Šance, že výstřel spustí 4x rychlou palbu.', f: L => 0.004 * L, fmt: F.pct, max: 85, ws: 'Rapid_Fire_Cost_Rapid_Fire_Chance', cash: [30, 1.25], unlock: { key: 'rapid', cost: 1500, after: 'multi' } },
  { id: 'rapidDur', cat: 'atk', name: 'Rapid fire trvání', desc: 'Délka rychlé palby.', f: L => 0.6 + 0.05 * L, fmt: F.s, max: 99, ws: 'Rapid_Fire_Cost_Rapid_Fire_Duration', cash: [30, 1.25], unlock: { key: 'rapid', cost: 1500, after: 'multi' } },
  { id: 'bounceChance', cat: 'atk', name: 'Odraz šance', desc: 'Šance, že se střela odrazí na další nepřátele.', f: L => 0.008 * L, fmt: F.pct, max: 85, ws: 'Bounce_Shot_Cost_Bounce_Shot_Chance', cash: [40, 1.25], unlock: { key: 'bounce', cost: 10000, after: 'rapid' } },
  { id: 'bounceTargets', cat: 'atk', name: 'Odraz cíle', desc: 'Počet odrazů.', f: L => 1 + L, fmt: F.int, max: 7, ws: 'Bounce_Shot_Cost_Bounce_Shot_Targets', cash: [200, 2.3], unlock: { key: 'bounce', cost: 10000, after: 'rapid' } },
  { id: 'bounceRange', cat: 'atk', name: 'Odraz dosah', desc: 'Vzdálenost, na kterou se střela odrazí.', f: L => 4 + 0.2 * L, fmt: F.m, max: 60, ws: 'Bounce_Shot_Cost_Bounce_Shot_Range', cash: [30, 1.2], unlock: { key: 'bounce', cost: 10000, after: 'rapid' } },
  { id: 'superCritChance', cat: 'atk', name: 'Super krit šance', desc: 'Šance na super krit, když padne krit.', f: L => 0.002 * L, fmt: F.pct, max: 100, ws: 'Super_Critical_Cost_Super_Critical_Chance', cash: [500, 1.3], unlock: { key: 'superCrit', cost: 100e6, after: 'bounce' } },
  { id: 'superCritMult', cat: 'atk', name: 'Super krit násobek', desc: 'Super krit = krit. násobek × tento násobek.', f: L => 1.2 + 0.1 * L, fmt: F.x, max: 120, ws: 'Super_Critical_Cost_Super_Critical_Multi', cash: [500, 1.3], unlock: { key: 'superCrit', cost: 100e6, after: 'bounce' } },
  { id: 'rendChance', cat: 'atk', name: 'Rend armor šance', desc: 'Šance, že zásah trvale zvýší poškození, které nepřítel dostává.', f: L => 0.001 * (L + 1), fmt: F.pct, max: 299, ws: 'Rend_Armor_Cost_Rend_Armor_Chance', cash: [2000, 1.35], unlock: { key: 'rend', cost: 500e9, after: 'superCrit' } },
  { id: 'rendMult', cat: 'atk', name: 'Rend armor násobek', desc: 'O kolik se zvýší poškození při každém rendu (max 8x).', f: L => 0.001 * (L + 1), fmt: v => '+' + v.toFixed(3) + 'x', max: 299, ws: 'Rend_Armor_Cost_Rend_Armor_Mult', cash: [2000, 1.35], unlock: { key: 'rend', cost: 500e9, after: 'superCrit' } },

  // ---- OBRANA ----
  { id: 'health', cat: 'def', name: 'Zdraví', desc: 'Maximální HP věže.', f: L => Math.round((20 + 5 * L + 0.06 * L * L) * xg(L)), fmt: F.num, max: 6000, ws: 'Health_Cost', cash: [10, 1.19] },
  { id: 'regen', cat: 'def', name: 'Regenerace', desc: 'HP obnovené za sekundu.', f: L => Math.round((0.5 + 0.15 * L + 0.004 * L * L) * xg(L) * 100) / 100, fmt: F.ps, max: 6000, ws: 'Health_Regen_Cost', cash: [10, 1.22] },
  { id: 'defPct', cat: 'def', name: 'Obrana %', desc: 'Snižuje přijaté poškození o procento (max 98 %).', f: L => 0.005 * L, fmt: F.pct, max: 99, ws: 'Defense_Cost', cash: [10, 1.22], unlock: { key: 'def', cost: 75 } },
  { id: 'defAbs', cat: 'def', name: 'Obrana absolutní', desc: 'Odečte pevnou hodnotu z každého zásahu (po obraně %).', f: L => Math.round((L + 0.05 * L * L) * xg(L)), fmt: F.num, max: 5000, ws: 'Defense_Abs_Cost', cash: [12, 1.22], unlock: { key: 'def', cost: 75 } },
  { id: 'thorns', cat: 'def', name: 'Trny', desc: 'Útočník utrpí % svého max. HP (bossové 50 %).', f: L => 0.01 * L, fmt: F.pct, max: 99, ws: 'Thorn_Damage_Cost', cash: [20, 1.25], unlock: { key: 'thorns', cost: 500, after: 'def' } },
  { id: 'lifesteal', cat: 'def', name: 'Lifesteal', desc: 'Část způsobeného poškození vyléčí věž.', f: L => 0.000558 * L, fmt: F.pct, max: 80, ws: 'Lifesteal_Cost', cash: [40, 1.25], unlock: { key: 'life', cost: 2000, after: 'thorns' } },
  { id: 'knockChance', cat: 'def', name: 'Odhození šance', desc: 'Šance, že zásah odhodí nepřítele.', f: L => 0.01 * L, fmt: F.pct, max: 80, ws: 'Knockback_Cost_Knockback_Chance', cash: [15, 1.25], unlock: { key: 'knock', cost: 5000, after: 'life' } },
  { id: 'knockForce', cat: 'def', name: 'Odhození síla', desc: 'Síla odhození (dělí se hmotností nepřítele).', f: L => 0.4 + 0.142 * L, fmt: v => v.toFixed(2), max: 40, ws: 'Knockback_Cost_Knockback_Force', cash: [15, 1.25], unlock: { key: 'knock', cost: 5000, after: 'life' } },
  { id: 'orbs', cat: 'def', name: 'Orby', desc: 'Orby kolem věže okamžitě ničí běžné nepřátele.', f: L => L, fmt: F.int, max: 4, ws: 'Orbs_Cost_Orbs', cash: [2000, 5], unlock: { key: 'orbs', cost: 15000, after: 'knock' } },
  { id: 'orbSpeed', cat: 'def', name: 'Rychlost orbů', desc: 'Rychlost otáčení orbů.', f: L => 0.4 + 0.15 * L, fmt: v => v.toFixed(2), max: 38, ws: 'Orbs_Cost_Orb_Speed', cash: [50, 1.25], unlock: { key: 'orbs', cost: 15000, after: 'knock' } },
  { id: 'shockSize', cat: 'def', name: 'Rázová vlna velikost', desc: 'Velikost rázové vlny, která odhazuje nepřátele.', f: L => 0.6 + 0.05 * L, fmt: v => v.toFixed(2), max: 35, ws: 'Shockwave_Cost_Shockwave_Size', cash: [40, 1.25], unlock: { key: 'shock', cost: 100000, after: 'orbs' } },
  { id: 'shockFreq', cat: 'def', name: 'Rázová vlna interval', desc: 'Jak často se rázová vlna spustí (min. 7 s).', f: L => 20 - 0.15 * L, fmt: F.s, max: 40, ws: 'Shockwave_Cost_Shockwave_Frequency', cash: [40, 1.25], unlock: { key: 'shock', cost: 100000, after: 'orbs' } },
  { id: 'mineChance', cat: 'def', name: 'Miny šance', desc: 'Šance, že zabitý nepřítel zanechá minu.', f: L => 0.006 * L, fmt: F.pct, max: 50, ws: 'Land_Mine_Cost_Land_Mine_Chance', cash: [50, 1.25], unlock: { key: 'mine', cost: 400000, after: 'shock' } },
  { id: 'mineDmg', cat: 'def', name: 'Miny poškození', desc: 'Poškození miny jako násobek poškození věže.', f: L => 1 + 0.1 * L, fmt: F.pct, max: 200, ws: 'Land_Mine_Cost_Land_Mine_Damage', cash: [50, 1.22], unlock: { key: 'mine', cost: 400000, after: 'shock' } },
  { id: 'mineRadius', cat: 'def', name: 'Miny radius', desc: 'Velikost výbuchu miny.', f: L => 0.5 + 0.02 * L, fmt: v => v.toFixed(2), max: 50, ws: 'Land_Mine_Cost_Land_Mine_Radius', cash: [50, 1.25], unlock: { key: 'mine', cost: 400000, after: 'shock' } },
  { id: 'deathDefy', cat: 'def', name: 'Vzdor smrti', desc: 'Šance ignorovat smrtící zásah.', f: L => 0.004 * L, fmt: F.pct, max: 75, ws: 'Death_Defy_Cost', cash: [200, 1.3], unlock: { key: 'defy', cost: 1.5e6, after: 'mine' } },
  { id: 'wallHealth', cat: 'def', name: 'Zeď – zdraví', desc: 'Zeď blokuje nepřátele; HP v % zdraví věže.', f: L => 0.2 + 0.001 * L, fmt: F.pct, max: 1800, ws: 'Wall_Cost_Wall_Health', cash: [500, 1.2], unlock: { key: 'wall', cost: 500e6, after: 'defy' } },
  { id: 'wallRebuild', cat: 'def', name: 'Zeď – obnova', desc: 'Čas obnovy zničené zdi (min. 150 s).', f: L => 1200 - 2 * L, fmt: v => Math.round(v) + 's', max: 300, ws: 'Wall_Cost_Wall_Rebuild', cash: [500, 1.2], unlock: { key: 'wall', cost: 500e6, after: 'defy' } },

  // ---- UTILITA ----
  { id: 'cashBonus', cat: 'util', name: 'Cash bonus', desc: 'Násobek veškerého cashe.', f: L => 1 + 0.01 * L, fmt: F.x, max: 149, ws: 'Cash_Bonus_Cost', cash: [8, 1.2], unlock: { key: 'cash', cost: 40 } },
  { id: 'cashWave', cat: 'util', name: 'Cash / vlna', desc: 'Cash za každou dokončenou vlnu.', f: L => 4 * L, fmt: F.cash, max: 149, ws: 'Cash_Per_Wave_Cost', cash: [8, 1.2], unlock: { key: 'cash', cost: 40 } },
  { id: 'coinKill', cat: 'util', name: 'Coiny / zabití', desc: 'Násobek coinů za zabití.', f: L => 1 + 0.01 * L, fmt: F.x, max: 149, ws: 'Coins_Per_Kill_Cost', cash: [30, 1.25], unlock: { key: 'coins', cost: 100, after: 'cash' } },
  { id: 'coinWave', cat: 'util', name: 'Coiny / vlna', desc: 'Coiny za každou dokončenou vlnu.', f: L => L ? 1 + L : 0, fmt: F.num, max: 149, ws: 'Coins_Per_Wave_Cost', cash: [20, 1.25], unlock: { key: 'coins', cost: 100, after: 'cash' } },
  { id: 'freeAtk', cat: 'util', name: 'Free útok upg.', desc: 'Šance na zdarma vylepšení útoku každou vlnu.', f: L => 0.005 * L, fmt: F.pct, max: 99, ws: 'Free_Upgrade_Cost_Attack', cash: [40, 1.27], unlock: { key: 'free', cost: 800, after: 'coins' } },
  { id: 'freeDef', cat: 'util', name: 'Free obrana upg.', desc: 'Šance na zdarma vylepšení obrany každou vlnu.', f: L => 0.005 * L, fmt: F.pct, max: 99, ws: 'Free_Upgrade_Cost_Defense', cash: [40, 1.27], unlock: { key: 'free', cost: 800, after: 'coins' } },
  { id: 'freeUtil', cat: 'util', name: 'Free utilita upg.', desc: 'Šance na zdarma vylepšení utility každou vlnu.', f: L => 0.005 * L, fmt: F.pct, max: 99, ws: 'Free_Upgrade_Cost_Utility', cash: [40, 1.27], unlock: { key: 'free', cost: 800, after: 'coins' } },
  { id: 'interest', cat: 'util', name: 'Úrok / vlna', desc: 'Úrok z cashe na konci vlny (strop z labu Max. úrok).', f: L => 0.0006 * L, fmt: F.pct, max: 99, ws: 'Interest_Per_Wave_Cost', cash: [30, 1.25], unlock: { key: 'interest', cost: 5000, after: 'free' } },
  { id: 'recoveryAmount', cat: 'util', name: 'Léčení balíčku', desc: 'Kolik % max. HP balíček obnoví.', f: L => 0.14 + 0.004 * L, fmt: F.pct, max: 300, ws: 'Recovery_Packages_Cost_Recovery_Amount', cash: [30, 1.25], unlock: { key: 'pack', cost: 1.5e6, after: 'interest' } },
  { id: 'maxRecovery', cat: 'util', name: 'Max. léčení', desc: 'Balíčky mohou léčit až na násobek max. HP.', f: L => 1 + 0.031 * L, fmt: F.x, max: 500, ws: 'Recovery_Packages_Cost_Max_Recovery', cash: [30, 1.25], unlock: { key: 'pack', cost: 1.5e6, after: 'interest' } },
  { id: 'packChance', cat: 'util', name: 'Šance balíčku', desc: 'Šance na léčivý balíček každou vlnu.', f: L => 0.06 + 0.004 * L, fmt: F.pct, max: 60, ws: 'Recovery_Packages_Cost_Package_Chance', cash: [30, 1.25], unlock: { key: 'pack', cost: 1.5e6, after: 'interest' } },
  { id: 'elsAtk', cat: 'util', name: 'Přeskok úrovně útoku', desc: 'Šance, že nepřátelům po vlně nevzroste útok.', f: L => 0.0005 * (L + 1), fmt: F.pct, max: 699, ws: 'Enemy_Level_Skip_Cost_Attack_Level_Skips', cash: [1000, 1.3], unlock: { key: 'els', cost: 1e9, after: 'pack' } },
  { id: 'elsHp', cat: 'util', name: 'Přeskok úrovně zdraví', desc: 'Šance, že nepřátelům po vlně nevzroste zdraví.', f: L => 0.0005 * (L + 1), fmt: F.pct, max: 699, ws: 'Enemy_Level_Skip_Cost_Health_Level_Skips', cash: [1000, 1.3], unlock: { key: 'els', cost: 1e9, after: 'pack' } },
];
const STAT_MAP = Object.fromEntries(STAT_DEFS.map(d => [d.id, d]));
const CATS = [
  { id: 'atk', name: 'ÚTOK', color: '#38f2e6' },
  { id: 'def', name: 'OBRANA', color: '#ff4d8d' },
  { id: 'util', name: 'UTILITA', color: '#ffd23d' },
];
const UNLOCK_GROUPS = {};
for (const d of STAT_DEFS) if (d.unlock) UNLOCK_GROUPS[d.unlock.key] = d.unlock;

// ---------- Vylepšení dílny+ (Workshop Enhancements, tier 12 vlna 60) ----------
const ENH_DEFS = [
  { id: 'damage', cat: 'atk', name: 'Poškození', t: 'Workshop_Enhancement_Attack_Damage', per: 0.01, max: 400 },
  { id: 'attackSpeed', cat: 'atk', name: 'Rychlost útoku', t: 'Workshop_Enhancement_Attack_Attack_Speed', per: 0.01, max: 75 },
  { id: 'critFactor', cat: 'atk', name: 'Krit. násobek', t: 'Workshop_Enhancement_Attack_Critical_Factor', per: 0.01, max: 400 },
  { id: 'dmgMeter', cat: 'atk', name: 'Poškození / metr', t: 'Workshop_Enhancement_Attack_Damage_Per_Meter', per: 0.01, max: 400 },
  { id: 'superCritMult', cat: 'atk', name: 'Super krit násobek', t: 'Workshop_Enhancement_Attack_Super_Crit_Mult', per: 0.01, max: 400 },
  { id: 'rendMax', cat: 'atk', name: 'Max. rend', t: 'Workshop_Enhancement_Attack_Rend_Max', per: 0.01, max: 400 },
  { id: 'health', cat: 'def', name: 'Zdraví', t: 'Workshop_Enhancement_Defense_Health', per: 0.01, max: 400 },
  { id: 'regen', cat: 'def', name: 'Regenerace', t: 'Workshop_Enhancement_Defense_Health_Regen', per: 0.01, max: 400 },
  { id: 'defAbs', cat: 'def', name: 'Obrana absolutní', t: 'Workshop_Enhancement_Defense_Defense_Absolute', per: 0.01, max: 400 },
  { id: 'mineDmg', cat: 'def', name: 'Poškození min', t: 'Workshop_Enhancement_Defense_Land_Mine_Damage', per: 0.06, max: 400 },
  { id: 'orbSize', cat: 'def', name: 'Velikost orbů', t: 'Workshop_Enhancement_Defense_Orb_Size', per: 0.01, max: 200 },
  { id: 'wallHealth', cat: 'def', name: 'Zdraví zdi', t: 'Workshop_Enhancement_Defense_Wall_Health', per: 0.01, max: 400 },
  { id: 'cashBonus', cat: 'util', name: 'Cash bonus', t: 'Workshop_Enhancement_Utility_Cash_Bonus', per: 0.01, max: 400 },
  { id: 'coinBonus', cat: 'util', name: 'Coin bonus', t: 'Workshop_Enhancement_Utility_Coin_Bonus', per: 0.01, max: 200 },
  { id: 'els', cat: 'util', name: 'Přeskoky úrovní', t: 'Workshop_Enhancement_Utility_Enemy_Level_Skips', per: 0.01, max: 60 },
  { id: 'freeUpgrades', cat: 'util', name: 'Free vylepšení', t: 'Workshop_Enhancement_Utility_Free_Upgrades', per: 0.01, max: 100 },
  { id: 'packages', cat: 'util', name: 'Balíčky', t: 'Workshop_Enhancement_Utility_Packages', per: 0.01, max: 300 },
];

// ---------- Nepřátelé (násobky vůči základnímu nepříteli podle wiki) ----------
const BASE_HP = 12, BASE_DMG = 4, BASE_SPD = 6;
const ENEMY_TYPES = {
  basic: { name: 'Základní', hp: 1, dmg: 1, spd: 1, r: 1.6, cash: 1, coin: 1, color: '#ff4d6d', sides: 4, atk: 'melee', rate: 1, cat: 'normal' },
  fast: { name: 'Rychlý', hp: 1, dmg: 0.75, spd: 2.1, r: 1.3, cash: 1.5, coin: 2, color: '#ffd23d', sides: 3, atk: 'melee', rate: 0.8, cat: 'normal' },
  tank: { name: 'Tank', hp: 5, dmg: 3, spd: 0.6, r: 2.7, cash: 3, coin: 4, color: '#4dff9a', sides: 4, atk: 'melee', rate: 1.5, cat: 'normal' },
  ranged: { name: 'Střelec', hp: 1, dmg: 1.5, spd: 1.2, r: 1.6, cash: 1.5, coin: 2, color: '#c77dff', sides: 0, atk: 'shoot', rate: 2.2, stop: 26, cat: 'normal' },
  protector: { name: 'Ochránce', hp: 0.6, dmg: 1, spd: 0.4, r: 2, cash: 1.5, coin: 3, color: '#7fb2ff', sides: 8, atk: 'melee', rate: 1.5, cat: 'normal', shield: 12 },
  boss: { name: 'Boss', hp: 20, dmg: 3.5, spd: 0.4, r: 4.8, cash: 5, coin: 5, color: '#ff3dc8', sides: 6, atk: 'melee', rate: 2, cat: 'boss', boss: true },
  vampire: { name: 'Upír', hp: 2, dmg: 0, spd: 0.4, r: 2.1, cash: 3, coin: 4, color: '#ff2a2a', sides: 4, atk: 'drain', rate: 0.5, stop: 20, cat: 'elite', elite: true },
  ray: { name: 'Paprsek', hp: 1, dmg: 2, spd: 0.4, r: 2.1, cash: 3, coin: 4, color: '#fff36b', sides: 5, atk: 'ray', rate: 30, stop: 34, cat: 'elite', elite: true, noKnock: true },
  scatter: { name: 'Rozptylovač', hp: 2, dmg: 1, spd: 0.6, r: 2.3, cash: 3, coin: 4, color: '#00f5d4', sides: 5, atk: 'melee', rate: 1, cat: 'elite', elite: true },
  saboteur: { name: 'Sabotér', hp: 20, dmg: 0.5, spd: 2.1, r: 3.2, cash: 3, coin: 4, color: '#ff8c1a', sides: 7, atk: 'sabotage', rate: 2, cat: 'fleet', fleet: true, noKnock: true },
  commander: { name: 'Velitel', hp: 20, dmg: 1, spd: 0.2, r: 3.4, cash: 3, coin: 4, color: '#9dff3d', sides: 9, atk: 'melee', rate: 2, cat: 'fleet', fleet: true, noKnock: true },
  overcharge: { name: 'Přebíječ', hp: 20, dmg: 1, spd: 0.2, r: 3.2, cash: 3, coin: 4, color: '#3dd5ff', sides: 10, atk: 'overcharge', rate: 4, stop: 30, cat: 'fleet', fleet: true, noKnock: true },
};
const FLEET_COMPANION = { saboteur: 'fast', commander: 'tank', overcharge: 'ranged' };

// ---------- Tiery 1–24 ----------
const TIER_COIN = [1, 1.8, 2.6, 3.4, 4.2, 5.0, 5.8, 6.6, 7.5, 8.7, 10.3, 12.2, 14.7, 17.6, 21.3, 25.2, 29.1, 33.0, 40.0, 48.0, 60.0, 72.0, 86.0, 103.0];
const ELITE_BASE = [500, 450, 405, 365, 328, 295, 266, 239, 215, 194, 174, 157, 141, 127, 114, 41, 37, 33, 30, 27, 24, 21, 19, 17];
const TIERS = TIER_COIN.map((coin, i) => {
  const t = i + 1;
  const hp = t <= 10 ? [1, 3, 8, 20, 50, 120, 300, 700, 1600, 4000][i] : 4000 * Math.pow(2.5, t - 10);
  const dmg = t <= 10 ? [1, 2.2, 5, 11, 24, 50, 100, 200, 400, 800][i] : 800 * Math.pow(2.2, t - 10);
  return {
    t, coin, hp, dmg, eliteBase: ELITE_BASE[i],
    bossEvery: t < 14 ? 10 : [9, 8, 7, 6][t - 14] || 5,
    protectorCd: t < 2 ? 0 : t < 4 ? 10 : t < 7 ? 9 : t < 10 ? 8 : 7,
    unlockWave: t < 15 ? 100 : 300,
  };
});
// Flotily: [první vlna, každých N vln, počet flotil]
const FLEET_SCHEDULE = { 14: [2495, 1000, 1], 15: [1495, 750, 1], 16: [995, 500, 1], 17: [495, 250, 1], 18: [95, 100, 1], 19: [45, 50, 1], 20: [5, 10, 1], 21: [5, 10, 2], 22: [5, 10, 3], 23: [5, 10, 3], 24: [5, 10, 3] };
const fleetLowTier = t => 15000 - 250 * (t - 1);

// Bitevní podmínky tierů 14+ (podle tabulky wiki)
// orb/dr/thorns/plasma = % účinnosti, skip = odečet ELS, knock = % síly odhození, armor = blokované zásahy,
// prot/tank = sekund ultimátu z 300 s, ray/scatter/vamp = % zesílení, fast = počet posílených, boss = % přeléčení, mass = % hmotnosti / vlna, sab = % průniku zdí
const TIER_BC = {
  14: { orb: 50, dr: 50, thorns: 80, plasma: 80, skip: 2.5 },
  15: { orb: 40, dr: 40, thorns: 70, plasma: 70, skip: 5, knock: 60, armor: 10 },
  16: { orb: 30, dr: 30, thorns: 60, plasma: 60, skip: 7.5, knock: 50, armor: 20, prot: 60 },
  17: { orb: 20, dr: 20, thorns: 50, plasma: 50, skip: 10, knock: 40, armor: 30, prot: 105, tank: 60 },
  18: { orb: 10, dr: 10, thorns: 40, plasma: 40, skip: 12.5, knock: 30, armor: 40, prot: 150, tank: 105, ray: 40, scatter: 40, vamp: 40 },
  19: { orb: 5, dr: 5, thorns: 30, plasma: 30, skip: 20, knock: 20, armor: 50, prot: 195, tank: 150, ray: 70, scatter: 70, vamp: 70, fast: 2 },
  20: { orb: 5, dr: 5, thorns: 20, plasma: 20, skip: 27.5, knock: 10, armor: 60, prot: 240, tank: 195, ray: 100, scatter: 100, vamp: 100, fast: 4, boss: 20 },
  21: { orb: 5, dr: 5, thorns: 10, plasma: 10, skip: 35, knock: 5, armor: 70, prot: 285, tank: 240, ray: 130, scatter: 130, vamp: 130, fast: 5, boss: 35, mass: 50 },
  22: { orb: 5, dr: 5, thorns: 5, plasma: 5, skip: 37.5, knock: 5, armor: 80, prot: 285, tank: 285, ray: 160, scatter: 160, vamp: 160, fast: 7, boss: 50, mass: 70, sab: 10 },
  23: { orb: 5, dr: 5, thorns: 5, plasma: 5, skip: 40, knock: 5, armor: 90, prot: 285, tank: 285, ray: 190, scatter: 190, vamp: 190, fast: 8, boss: 65, mass: 100, sab: 17.5, cmd: 60 },
  24: { orb: 5, dr: 5, thorns: 5, plasma: 5, skip: 42.5, knock: 5, armor: 95, prot: 285, tank: 285, ray: 190, scatter: 190, vamp: 190, fast: 10, boss: 80, mass: 130, sab: 25, cmd: 105, oc: 0.1 },
};
const BC_NAMES = {
  orb: 'Odolnost vůči orbům', dr: 'Odolnost vůči paprsku smrti', thorns: 'Odolnost vůči trnům', plasma: 'Odolnost vůči plazmovému dělu',
  skip: 'Snížení přeskoků úrovní', knock: 'Odolnost vůči odhození', armor: 'Obrnění nepřátelé', prot: 'Ultimát ochránce', tank: 'Ultimát tanku',
  ray: 'Ultimát paprsku', scatter: 'Ultimát rozptylovače', vamp: 'Ultimát upíra', fast: 'Ultimát rychlých', boss: 'Ultimát bosse',
  mass: 'Vynucení hmotnosti', sab: 'Ultimát sabotéra', cmd: 'Ultimát velitele', oc: 'Ultimát přebíječe', speed: 'Rychlost nepřátel',
  more: 'Více nepřátel', atkSpd: 'Rychlost útoku nepřátel', dd: 'Oslabený vzdor smrti', es: 'Oslabený štít',
};
const bcDesc = (k, v) => ({
  orb: `orby berou ${v} % HP místo zabití`, dr: `paprsek bere ${v} % HP`, thorns: `trny působí ${v} %`, plasma: `plazma působí ${v} %`,
  skip: `přeskoky -${v} %`, knock: `odhození ${v} %`, armor: `${v} zásahů blokováno`, prot: `${v}s / 300s`, tank: `${v}s / 300s`,
  ray: `+${v} % rychlost`, scatter: `+${v} % HP`, vamp: `+${v} % sání`, fast: `${v} posílených`, boss: `+${v} % HP`, mass: `+${v} % hmotnost/vlna`,
  sab: `${v} % přes zeď`, cmd: `${v}s / 300s`, oc: `+${v} násobek`, speed: `+${v} %`, more: `+${v} %`, atkSpd: `+${v} %`, dd: `-${v} %`, es: `+${v} % nabíjení`,
}[k] || v);

// ---------- Ultimátní zbraně (hodnoty a ceny z wiki) ----------
const UW_DEFS = [
  { id: 'chainLightning', wiki: 'Chain_Lightning', name: 'Řetězový blesk', icon: 'ϟ', color: '#7df9ff', desc: 'Zásah má šanci vyvolat blesky, které přeskakují mezi nepřáteli.', stats: [['dmg', 'Poškození', F.x], ['qty', 'Počet', F.int], ['chance', 'Šance', v => v.toFixed(1) + '%']] },
  { id: 'smartMissiles', wiki: 'Smart_Missiles', name: 'Chytré rakety', icon: '➶', color: '#ffb347', desc: 'Vypálí samonaváděcí rakety, které vybuchují při dopadu.', stats: [['dmg', 'Poškození', F.x], ['qty', 'Počet', F.int], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'deathWave', wiki: 'Death_Wave', name: 'Vlna smrti', icon: '◎', color: '#ff4d6d', desc: 'Vlna, která se šíří přes celé bojiště a zasáhne všechny nepřátele.', stats: [['dmg', 'Poškození', F.x], ['qty', 'Počet vln', F.int], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'chronoField', wiki: 'Chrono_Field', name: 'Chrono pole', icon: '⧗', color: '#4dd2ff', desc: 'Pole, které zpomalí všechny nepřátele v dosahu.', stats: [['dur', 'Trvání', v => v + 's'], ['slow', 'Zpomalení', v => v + '%'], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'innerMines', wiki: 'Inner_Land_Mines', name: 'Vnitřní miny', icon: '✲', color: '#ff9f43', desc: 'Miny obíhající těsně kolem věže, vybuchují při kontaktu.', stats: [['dmg', 'Poškození', F.x], ['qty', 'Počet', F.int], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'goldenTower', wiki: 'Golden_Tower', name: 'Zlatá věž', icon: '♛', color: '#ffd700', desc: 'Dočasně znásobí cash i coiny ze zabití.', stats: [['mult', 'Bonus', F.x], ['dur', 'Trvání', v => v + 's'], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'poisonSwamp', wiki: 'Poison_Swamp', name: 'Jedovatá bažina', icon: '☣', color: '#8bff3d', desc: 'Bažina, která každou sekundu zraňuje a zpomaluje nepřátele.', stats: [['dmg', 'Poškození', F.x], ['dur', 'Trvání', v => v + 's'], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'blackHole', wiki: 'Black_Hole', name: 'Černá díra', icon: '◉', color: '#b45cff', desc: 'Vtahuje a pohlcuje běžné nepřátele (ne bosse, elity a flotily).', stats: [['size', 'Velikost', v => v + 'm'], ['dur', 'Trvání', v => v + 's'], ['cd', 'Cooldown', v => v + 's']] },
  { id: 'spotlight', wiki: 'Spotlight', name: 'Reflektor', icon: '✺', color: '#fff5a5', desc: 'Rotující paprsky – nepřátelé v nich dostávají násobné poškození.', stats: [['bonus', 'Bonus', F.x], ['angle', 'Úhel', v => v + '°'], ['qty', 'Počet', F.int]] },
];
for (const u of UW_DEFS) {
  const cols = WIKI.uw[u.wiki];
  u.stats = u.stats.map(([id, name, fm], i) => ({ id, name, fmt: fm, vals: cols[i].v, costs: cols[i].c, max: cols[i].v.length - 1 }));
}
const UW_MAP = Object.fromEntries(UW_DEFS.map(d => [d.id, d]));
const UW_UNLOCK_COSTS = [5, 50, 150, 300, 800, 1250, 1750, 2400, 3000];
const UWP_UNLOCK_COSTS = [500, 625, 750, 975, 1250, 1650, 2200, 2900, 3800];
const uwpLevelCost = L => 100 + 75 * L;
const UW_PLUS = {
  deathWave: { name: 'Zabijácká zeď', desc: L => `Každý zásah efektové vlny zesílí vlnu smrti o +${(10 * (L + 1))} %` },
  goldenTower: { name: 'Zlaté kombo', desc: L => `Po zlaté věži každé zabití zvýší bonus o ${(0.03 * (L + 1)).toFixed(2)} %` },
  blackHole: { name: 'Pohlcení', desc: L => `Na konci díra udělí ${(2 + L)}× HP vlny všem pohlceným` },
  chainLightning: { name: 'Úder', desc: L => `Blesk má šanci udělit ${(1 + L * 0.5)}× HP vlny` },
  smartMissiles: { name: 'Krycí palba', desc: L => `Raketa každých ${Math.max(1, 10 - 0.8 * L).toFixed(1)}s` },
  chronoField: { name: 'Chrono smyčka', desc: L => `Nepřátelé v poli krouží kolem věže (${(0.2 + 0.1 * L).toFixed(1)} rad/s)` },
  spotlight: { name: 'Světelný dosah', desc: L => `Bonus reflektoru +${(5 * (L + 1))} % z poškození/metr` },
  poisonSwamp: { name: 'Plíživá smrt', desc: L => `Každý tik bažiny silnější o ${(5 * (L + 1))} %` },
  innerMines: { name: 'Nabitá mina', desc: L => `Poškození min roste o ${(0.5 * (L + 1)).toFixed(1)}× za sekundu` },
};
// Polovylepšené zbraně z perku „Náhodná ultimátní zbraň“ (podle wiki)
const UW_PERK_STATS = {
  chainLightning: { dmg: 46, qty: 3, chance: 15.5 }, smartMissiles: { dmg: 43, qty: 11, cd: 110 }, deathWave: { dmg: 46, qty: 2, cd: 210 },
  chronoField: { dur: 22, slow: 40, cd: 120 }, innerMines: { dmg: 43, qty: 5, cd: 130 }, goldenTower: { mult: 9, dur: 30, cd: 230 },
  poisonSwamp: { dmg: 43, dur: 50, cd: 90 }, blackHole: { size: 50, dur: 20, cd: 130 }, spotlight: { bonus: 27.6, angle: 45, qty: 1 },
};

// ---------- Karty (32 karet podle wiki) ----------
const CARD_RARITY = {
  common: { name: 'Běžná', color: '#38f2e6', weight: 80 },
  rare: { name: 'Vzácná', color: '#4d8dff', weight: 17 },
  epic: { name: 'Epická', color: '#c45cff', weight: 3 },
};
const xv = v => 'x' + v; const pv = v => '+' + v + '%';
const CARD_DEFS = [
  { id: 'damage', name: 'Poškození', icon: '🗡', rarity: 'common', desc: v => `Poškození x${v}`, vals: [1.5, 2, 2.4, 2.8, 3.2, 3.6, 4] },
  { id: 'attackSpeed', name: 'Rychlost útoku', icon: '⏩', rarity: 'common', desc: v => `Rychlost útoku x${v}`, vals: [1.25, 1.4, 1.55, 1.7, 1.85, 2, 2.15] },
  { id: 'health', name: 'Zdraví', icon: '♥', rarity: 'common', desc: v => `Max. HP x${v}`, vals: [1.5, 2, 2.4, 2.8, 3.2, 3.6, 4] },
  { id: 'regen', name: 'Regenerace', icon: '✚', rarity: 'common', desc: v => `Regenerace x${v}`, vals: [1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6] },
  { id: 'range', name: 'Dosah', icon: '◎', rarity: 'common', desc: v => `Dosah x${v}`, vals: [1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45] },
  { id: 'cash', name: 'Cash', icon: '$', rarity: 'common', desc: v => `Veškerý cash x${v}`, vals: [1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4] },
  { id: 'coins', name: 'Coiny', icon: '©', rarity: 'common', desc: v => `Veškeré coiny x${v}`, vals: [1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45] },
  { id: 'slowAura', name: 'Zpomalující aura', icon: '❄', rarity: 'common', desc: v => `Nepřátelé v dosahu pomalejší o ${v} %`, vals: [13, 16, 19, 22, 25, 28, 31] },
  { id: 'critChance', name: 'Kritická šance', icon: '✦', rarity: 'common', desc: v => `+${v} % šance na krit`, vals: [5, 6, 7, 8, 9, 10, 11] },
  { id: 'enemyBalance', name: 'Rovnováha nepřátel', icon: '⚖', rarity: 'common', locked: true, desc: v => `80 % základních nepřátel přivede druhého; cash za zabití x${v}`, vals: [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9] },
  { id: 'extraDefense', name: 'Extra obrana', icon: '⛨', rarity: 'common', desc: v => `+${v} % obrana`, vals: [5, 6, 7, 8, 9, 10, 11] },
  { id: 'fortress', name: 'Pevnost', icon: '🏰', rarity: 'common', desc: v => `Obrana absolutní x${v}`, vals: [1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2] },
  { id: 'freeUpgrades', name: 'Free vylepšení', icon: '⇪', rarity: 'rare', desc: v => `+${v} % šance na free vylepšení`, vals: [4, 5, 6, 7, 8, 9, 10] },
  { id: 'extraOrb', name: 'Extra orb', icon: '◌', rarity: 'rare', desc: v => `Druhý prstenec orbů, rychlost ${v}`, vals: [2.6, 3, 3.4, 3.9, 4.3, 4.7, 5.1] },
  { id: 'plasmaCannon', name: 'Plazmové dělo', icon: '☄', rarity: 'rare', locked: true, desc: v => `Každý boss dostane zásah za ${v} % max. HP`, vals: [30, 34, 38, 42, 46, 50, 54] },
  { id: 'criticalCoin', name: 'Kritická mince', icon: '🪙', rarity: 'rare', desc: v => `${v} % základních nepřátel nese minci navíc`, vals: [15, 18, 21, 24, 27, 30, 33] },
  { id: 'waveSkip', name: 'Přeskok vlny', icon: '⤼', rarity: 'rare', desc: v => `${v} % šance přeskočit vlnu`, vals: [9, 10, 11, 13, 15, 17, 19] },
  { id: 'introSprint', name: 'Úvodní sprint', icon: '⏭', rarity: 'rare', locked: true, desc: v => `Prvních ${v} vln skáče po 10 (bez coinů)`, vals: [20, 30, 40, 50, 60, 80, 100] },
  { id: 'landMineStun', name: 'Omračující miny', icon: '💫', rarity: 'rare', ms: [7, 250], desc: v => `40 % šance omráčit na ${v}s`, vals: [1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8] },
  { id: 'packageChance', name: 'Šance balíčku', icon: '✉', rarity: 'rare', ms: [2, 750], desc: v => `+${v} % šance na balíček`, vals: [15, 18, 21, 24, 27, 30, 33] },
  { id: 'cells', name: 'Buňky', icon: '⬣', rarity: 'rare', ms: [4, 40], desc: v => `+${v} buněk za elitu`, vals: [2, 4, 6, 8, 10, 12, 14] },
  { id: 'deathRay', name: 'Paprsek smrti', icon: '⚡', rarity: 'epic', desc: v => `Každých 11s paprsek na ${v}s ničí nepřátele`, vals: [2.3, 2.7, 3.1, 3.5, 3.9, 4.4, 4.9] },
  { id: 'energyNet', name: 'Energetická síť', icon: '#', rarity: 'epic', locked: true, desc: v => `Znehybní každého bosse na ${v}s`, vals: [2.5, 2.8, 3.1, 3.4, 3.7, 4, 4.3] },
  { id: 'superTower', name: 'Super věž', icon: '⬆', rarity: 'epic', locked: true, desc: v => `15s poškození x${v} (každých 45s)`, vals: [2.5, 2.9, 3.3, 3.7, 4.1, 4.5, 5] },
  { id: 'secondWind', name: 'Druhý dech', icon: '☯', rarity: 'epic', locked: true, desc: v => `Oživení s 50 % HP, nesmrtelnost ${v}s`, vals: [10, 15, 20, 25, 30, 35, 40] },
  { id: 'demonMode', name: 'Démonský mód', icon: '☠', rarity: 'epic', locked: true, manual: true, desc: v => `Tlačítko: ${v}s poškození x300 a nesmrtelnost`, vals: [180, 200, 220, 240, 260, 280, 300] },
  { id: 'energyShield', name: 'Energetický štít', icon: '⬡', rarity: 'epic', locked: true, desc: v => `Blokuje zásah, dobíjí se ${v} min`, vals: [20, 18, 16, 14, 12, 10, 8] },
  { id: 'waveAccelerator', name: 'Urychlovač vln', icon: '⏱', rarity: 'epic', locked: true, desc: v => `Pauza mezi vlnami -${v} %`, vals: [30, 34, 38, 42, 46, 50, 54] },
  { id: 'berserker', name: 'Berserker', icon: '😡', rarity: 'epic', desc: v => `Poškození +${v} % pohlceného poškození (max x8)`, vals: [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4] },
  { id: 'ultimateCrit', name: 'Ultimátní krit', icon: '✸', rarity: 'epic', ms: [14, 50], desc: v => `Zbraně mají ${v} % šanci na krit`, vals: [1, 1.33, 1.66, 2, 2.33, 2.66, 3] },
  { id: 'nuke', name: 'Atomovka', icon: '☢', rarity: 'epic', locked: true, manual: true, ms: [11, 10], desc: v => `Tlačítko: zničí ${v} % nepřátel, 15s nesmrtelnost`, vals: [25, 35, 45, 55, 65, 80, 100] },
  { id: 'areaOfEffect', name: 'Plošný účinek', icon: '💥', rarity: 'epic', ms: [20, 80], desc: v => `+${v} % poškození raket, min, bažiny a ohnivého bota`, vals: [5, 8, 11, 14, 17, 20, 25] },
];
const CARD_MAP = Object.fromEntries(CARD_DEFS.map(d => [d.id, d]));
const CARD_LEVEL_REQ = [1, 3, 8, 16, 28, 48, 80]; // celkové kopie pro level 1..7
const CARD_COST = 20;
const CARD_SLOT_COSTS = [50, 100, 200, 300, 400, 500, 600, 750, 1000, 1200, 1400, 1600, 1800, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 10000];
const CARD_MASTERY = {
  damage: ['Poškození+', 750, [1.4, 5], 'x'], attackSpeed: ['Rychlost útoku+', 750, [1.03, 1.3], 'x'], health: ['Zdraví+', 750, [1.2, 3], 'x'],
  regen: ['Regenerace+', 750, [1.4, 5], 'x'], range: ['Poškození / metr+', 750, [1.2, 3], 'x'], coins: ['Coiny+', 1250, [1.03, 1.3], 'x'],
  critChance: ['Super krit šance+', 750, [1, 10], '%'], extraDefense: ['Extra obrana+', 1000, [0.7, 7], '%'], waveSkip: ['Dvojitý přeskok', 1000, [10, 55], '%'],
  berserker: ['Vikingský pohřeb', 750, [30, 300], 's'], demonMode: ['Démonská pomsta', 1000, [1.5, 6], 'x'], secondWind: ['Andělská křídla', 1000, [1.9, 10], 'x'],
  criticalCoin: ['Dvojité mince', 1000, [10, 100], '%'], areaOfEffect: ['Zóna výbuchu', 1000, [2.5, 25], '%'], nuke: ['Radiace', 750, [5, 50], '%'],
};

// ---------- Perky (wiki) ----------
const PERK_DEFS = [
  // standardní
  { id: 'maxHealth', type: 'std', name: 'x1.20 max. zdraví', max: 5, mul: 0.2 },
  { id: 'damage', type: 'std', name: 'x1.15 poškození', max: 5, mul: 0.15 },
  { id: 'coins', type: 'std', name: 'x1.15 všechny coin bonusy', max: 5, mul: 0.15 },
  { id: 'defAbs', type: 'std', name: 'x1.15 obrana absolutní', max: 5, mul: 0.15 },
  { id: 'cash', type: 'std', name: 'x1.15 cash bonus', max: 5, mul: 0.15 },
  { id: 'regen', type: 'std', name: 'x1.75 regenerace', max: 5, mul: 0.75 },
  { id: 'interest', type: 'std', name: 'Úrok x1.50', max: 5, mul: 0.5 },
  { id: 'mineDmg', type: 'std', name: 'Poškození min x3.50', max: 5, mul: 2.5, need: 'mine' },
  { id: 'freeUpg', type: 'std', name: '+5 % free vylepšení', max: 5, add: 0.05 },
  { id: 'defPct', type: 'std', name: '+4 % obrana', max: 5, add: 0.04 },
  { id: 'bounce', type: 'std', name: '+2 odrazy', max: 3, add: 2, need: 'bounce', noBonus: true },
  { id: 'perkWave', type: 'std', name: '-20 % vln potřebných na perk', max: 3, add: 0.2 },
  { id: 'orbs', type: 'std', name: '+1 orb', max: 2, add: 1, need: 'orbs', noBonus: true },
  { id: 'randomUw', type: 'std', name: 'Odemkni náhodnou ultimátní zbraň', max: 1 },
  { id: 'gameSpeed', type: 'std', name: '+1 max. rychlost hry', max: 1, add: 1 },
  // ultimátní zbraně
  { id: 'uwSm', type: 'uw', uw: 'smartMissiles', name: '+4 chytré rakety', max: 1 },
  { id: 'uwPs', type: 'uw', uw: 'poisonSwamp', name: 'Radius bažiny x1.5', max: 1 },
  { id: 'uwDw', type: 'uw', uw: 'deathWave', name: '+1 vlna smrti', max: 1 },
  { id: 'uwIlm', type: 'uw', uw: 'innerMines', name: 'Další sada vnitřních min', max: 1 },
  { id: 'uwGt', type: 'uw', uw: 'goldenTower', name: 'Bonus zlaté věže x1.5', max: 1 },
  { id: 'uwCl', type: 'uw', uw: 'chainLightning', name: 'Poškození blesku x2', max: 1 },
  { id: 'uwCf', type: 'uw', uw: 'chronoField', name: 'Chrono pole +5s', max: 1 },
  { id: 'uwBh', type: 'uw', uw: 'blackHole', name: 'Černá díra +12s', max: 1 },
  { id: 'uwSl', type: 'uw', uw: 'spotlight', name: 'Bonus reflektoru x1.5', max: 1 },
  // trade-off
  { id: 'tDmgBoss', type: 'trade', name: 'x1.50 poškození, ale bossové mají 8x HP', max: 1 },
  { id: 'tCoinHp', type: 'trade', name: 'x1.80 coiny, ale max. HP -70 %', max: 1 },
  { id: 'tEnemyHp', type: 'trade', name: 'Nepřátelé -50 % HP, ale regenerace a lifesteal -90 %', max: 1 },
  { id: 'tEnemyDmg', type: 'trade', name: 'Nepřátelé -50 % poškození, ale věž -50 % poškození', max: 1 },
  { id: 'tRanged', type: 'trade', name: 'Střelci blíž, ale poškození střelců x3', max: 1 },
  { id: 'tSpeed', type: 'trade', name: 'Nepřátelé -40 % rychlost, ale poškození x2.5', max: 1 },
  { id: 'tCashWave', type: 'trade', name: 'x12 cash/vlna, ale zabití nedávají cash', max: 1 },
  { id: 'tRegen', type: 'trade', name: 'Regenerace x8, ale max. HP -60 %', max: 1 },
  { id: 'tBoss', type: 'trade', name: 'Bossové -70 % HP, ale +50 % rychlost', max: 1 },
  { id: 'tLife', type: 'trade', name: 'Lifesteal x2.5, ale síla odhození -70 %', max: 1 },
];
const PERK_MAP = Object.fromEntries(PERK_DEFS.map(d => [d.id, d]));

// ---------- Laboratoře (ceny, časy a hodnoty z wiki) ----------
// [wiki klíč, název, skupina, efekt, měřítko hodnoty, formát]
const LAB_META = [
  ['Lab_Lab_Speed', 'Rychlost laboratoří', 'main', 'labSpeed', 1, 'x'],
  ['Lab_Labs_Coin_Discount', 'Sleva laboratoří', 'main', 'labDiscount', 0.01, '%'],
  ['Lab_Starting_Cash', 'Startovní cash', 'main', 'startCash', 1, '$'],
  ['Lab_Workshop_Attack_Discount', 'Sleva dílny – útok', 'main', 'wsDiscAtk', 0.01, '%'],
  ['Lab_Workshop_Defense_Discount', 'Sleva dílny – obrana', 'main', 'wsDiscDef', 0.01, '%'],
  ['Lab_Workshop_Utility_Discount', 'Sleva dílny – utilita', 'main', 'wsDiscUtil', 0.01, '%'],
  ['Lab_Buy_Multiplier', 'Násobič nákupu', 'main', 'buyMult', 1, 'n'],
  ['Lab_More_Round_Stats', 'Více statistik runu', 'main', 'moreStats', 1, 'u'],
  ['Target_Priority', 'Priorita cílů', 'main', 'targetPriority', 1, 'n'],
  ['Card_Presets', 'Předvolby', 'main', 'presets', 1, 'n'],
  ['Workshop_Respec', 'Respec dílny', 'main', 'respec', 1, 'u'],
  ['Daily_Missions', 'Přehození denní mise', 'main', 'missionReroll', 1, 'u'],
  ['Workshop_Enhancement', 'Vylepšení dílny+', 'main', 'enhance', 1, 'u'],
  ['Lab_Enhancement_Coin_Discount', 'Sleva vylepšení+', 'main', 'enhDiscount', 0.01, '%'],
  ['Lab_Damage', 'Poškození', 'atk', 'dmg', 1, 'x'],
  ['Lab_Attack_Speed', 'Rychlost útoku', 'atk', 'atkSpd', 1, 'x'],
  ['Lab_Critical_Factor', 'Krit. násobek', 'atk', 'critFactor', 1, 'x'],
  ['Lab_Range', 'Dosah', 'atk', 'range', 1, 'x'],
  ['Lab_Damage_Per_Meter', 'Poškození / metr', 'atk', 'dmgMeter', 1, 'x'],
  ['Lab_Super_Crit_Chance', 'Šance super kritu', 'atk', 'scChance', 0.002, '%'],
  ['Lab_Super_Crit_Mult', 'Násobek super kritu', 'atk', 'scMult', 1, 'x'],
  ['Lab_Rend_Armor_Max', 'Max. rend armor', 'atk', 'rendMax', 0.01, 'x'],
  ['Lab_Light_Speed_Shots', 'Střely rychlostí světla', 'atk', 'lightSpeed', 1, 'u'],
  ['Lab_Health', 'Zdraví', 'def', 'hp', 1, 'x'],
  ['Lab_Health_Regen', 'Regenerace', 'def', 'regen', 1, 'x'],
  ['Lab_Defense_Absolute', 'Obrana absolutní', 'def', 'defAbs', 1, 'x'],
  ['Lab_Defense_Percent', 'Obrana %', 'def', 'defPct', 0.01, '%'],
  ['Lab_Orb_Speed', 'Rychlost orbů', 'def', 'orbSpeed', 1, '+'],
  ['Lab_Orb_Boss_Hit', 'Orby proti bossům', 'def', 'orbBoss', 0.01, '%'],
  ['Lab_Extra_Extra_Orbs', 'Extra extra orby', 'def', 'extraOrbs', 1, '+'],
  ['Lab_Land_Mine_Damage', 'Poškození min', 'def', 'mineDmg', 0.01, '%'],
  ['Lab_Land_Mine_Decay', 'Výdrž min', 'def', 'mineDecay', 1, 's'],
  ['Lab_Shockwave_Size', 'Velikost rázové vlny', 'def', 'shockSize', 1, '+'],
  ['Lab_Garlic_Thorns', 'Česnekové trny', 'def', 'garlic', 0.01, '%'],
  ['Wall_Labs_Wall_Health', 'Zdraví zdi', 'def', 'wallHp', 0.01, '%'],
  ['Wall_Labs_Wall_Rebuild', 'Obnova zdi', 'def', 'wallRebuild', 1, 's'],
  ['Wall_Labs_Wall_Regen', 'Regenerace zdi', 'def', 'wallRegen', 0.01, '%'],
  ['Wall_Labs_Wall_Thorns', 'Trny zdi', 'def', 'wallThorns', 0.01, '%'],
  ['Wall_Labs_Wall_Invincibility', 'Nesmrtelnost zdi', 'def', 'wallInv', 1, 's'],
  ['Wall_Labs_Wall_Fortification', 'Opevnění zdi', 'def', 'wallFort', 0.01, '%'],
  ['Lab_Cash_Bonus', 'Cash bonus', 'util', 'cashBonus', 1, 'x'],
  ['Lab_Cash_Per_Wave', 'Cash / vlna', 'util', 'cashWave', 1, 'x'],
  ['Lab_Coins_Per_Kill_Bonus', 'Coiny / zabití', 'util', 'coinKill', 1, 'x'],
  ['Lab_Coins_Per_Wave', 'Coiny / vlna', 'util', 'coinWave', 1, 'x'],
  ['Lab_Interest', 'Úrok', 'util', 'interest', 1, 'x'],
  ['Lab_Max_Interest', 'Max. úrok', 'util', 'maxInterest', 1, '$'],
  ['Lab_Package_After_Boss', 'Balíček po bossovi', 'util', 'packAfterBoss', 1, 'u'],
  ['Lab_Recovery_Package_Amount', 'Léčení balíčku', 'util', 'packAmount', 0.01, '%'],
  ['Lab_Recovery_Package_Max', 'Max. léčení balíčku', 'util', 'packMax', 0.01, '%'],
  ['Lab_Recovery_Package_Chance', 'Šance balíčku', 'util', 'packChance', 0.01, '%'],
  ['Lab_Enemy_Attack_Level_Skip', 'Přeskok úrovně útoku', 'util', 'elsAtk', 0.01, '%'],
  ['Lab_Enemy_Health_Level_Skip', 'Přeskok úrovně zdraví', 'util', 'elsHp', 0.01, '%'],
  ['Lab_Missile_Despawn_Time', 'Výdrž raket', 'uw', 'smDespawn', 1, 's'],
  ['Lab_Missiles_Explosion', 'Výbuch raket', 'uw', 'smExplosion', 1, 'u'],
  ['Lab_Missiles_Radius', 'Radius raket', 'uw', 'smRadius', 1, '+'],
  ['Lab_Missile_Amplifier', 'Zesilovač raket', 'uw', 'smAmp', 0.01, '%'],
  ['Lab_Missile_Barrage', 'Raketová palba', 'uw', 'barrage', 1, 'u'],
  ['Lab_Missile_Barrage_Quantity', 'Raketová palba – počet', 'uw', 'barrageQty', 1, 'n'],
  ['Lab_Chrono_Field_Duration', 'Trvání chrono pole', 'uw', 'cfDur', 1, 's'],
  ['Lab_Chrono_Field_Damage_Reduction', 'Chrono pole – redukce poškození', 'uw', 'cfDmgRed', 1, 'u'],
  ['Lab_Chrono_Field_Reduction_Percentage', 'Chrono pole – redukce %', 'uw', 'cfRed', 0.01, '%'],
  ['Lab_Chrono_Field_Range', 'Dosah chrono pole', 'uw', 'cfRange', 0.01, '%'],
  ['Lab_Swamp_Radius', 'Radius bažiny', 'uw', 'psRadius', 1, '+'],
  ['Lab_Poison_Swamp_Stun', 'Omráčení bažinou', 'uw', 'psStun', 1, 'u'],
  ['Lab_Swamp_Stun_Chance', 'Šance omráčení bažinou', 'uw', 'psStunChance', 0.01, '%'],
  ['Lab_Swamp_Stun_Time', 'Délka omráčení bažinou', 'uw', 'psStunTime', 1, 's'],
  ['Lab_Swamp_Rend_-_Basic_Enemies', 'Bažina – rend', 'uw', 'psRend', 0.01, '%'],
  ['Lab_Golden_Tower_Bonus', 'Bonus zlaté věže', 'uw', 'gtBonus', 1, '+'],
  ['Lab_Golden_Tower_Duration', 'Trvání zlaté věže', 'uw', 'gtDur', 1, 's'],
  ['Lab_Chain_Lightning_Shock', 'Šok blesku', 'uw', 'clShock', 1, 'u'],
  ['Lab_Shock_Chance', 'Šance šoku', 'uw', 'clShockChance', 0.01, '%'],
  ['Lab_Shock_Multiplier', 'Násobek šoku', 'uw', 'clShockMult', 1, 'x'],
  ['Lab_Chain_Thunder', 'Hromový řetěz', 'uw', 'clThunder', 0.01, '%'],
  ['Lab_Lightning_Amplifier_-_Scatter', 'Blesk proti rozptylovačům', 'uw', 'clScatter', 1, 'x'],
  ['Lab_Death_Wave_Health', 'Vlna smrti – výdrž', 'uw', 'dwPool', 0.01, '%'],
  ['Lab_Death_Wave_Coins_Bonus', 'Vlna smrti – coiny', 'uw', 'dwCoin', 1, 'x'],
  ['Lab_Death_Wave_Damage_Amplifier', 'Vlna smrti – zesilovač', 'uw', 'dwAmp', 0.01, '%'],
  ['Lab_Death_Wave_Armor_Stripping', 'Vlna smrti – strhávání brnění', 'uw', 'dwStrip', 1, 'n'],
  ['Lab_Death_Wave_Cell_Bonus', 'Vlna smrti – buňky', 'uw', 'dwCell', 1, 'x'],
  ['Lab_Inner_Mine_Blast_Radius', 'Radius vnitřních min', 'uw', 'ilmRadius', 1, '+'],
  ['Lab_Inner_Mine_Rotation_Speed', 'Rotace vnitřních min', 'uw', 'ilmRot', 1, '+'],
  ['Lab_Inner_Mine_Stun', 'Omráčení vnitřními minami', 'uw', 'ilmStun', 1, 'u'],
  ['Lab_Black_Hole_Damage', 'Poškození černé díry', 'uw', 'bhDmg', 0.01, '%'],
  ['Lab_Extra_Black_Hole', 'Extra černá díra', 'uw', 'bhExtra', 1, 'u'],
  ['Lab_Black_Hole_Coin_Bonus', 'Coiny z černé díry', 'uw', 'bhCoin', 1, 'x'],
  ['Lab_Black_Hole_Disable_Range_Enemies', 'Díra vypíná střelce', 'uw', 'bhDisable', 1, 'u'],
  ['Lab_Spotlight_Coin_Bonus', 'Coiny z reflektoru', 'uw', 'slCoin', 1, 'x'],
  ['Lab_Spotlight_Missiles', 'Rakety z reflektoru', 'uw', 'slMissile', 1, 's'],
  ['Second_Wind_Labs_Second_Wind_Blast', 'Výbuch druhého dechu', 'card', 'swBlast', 0.01, '%'],
  ['Second_Wind_Labs_Recharge_Second_Wind', 'Dobíjení druhého dechu', 'card', 'swRecharge', 1, 'w'],
  ['Lab_Double_Death_Ray', 'Dvojitý paprsek smrti', 'card', 'drDouble', 0.01, '%'],
  ['Lab_Energy_Shield', 'Štít – extra zásahy', 'card', 'esExtra', 1, '+'],
  ['Lab_Super_Tower_Bonus', 'Bonus super věže', 'card', 'stBonus', 1, 'x'],
  ['Lab_Recharge_Demon_Mode', 'Dobíjení démonského módu', 'card', 'dmRecharge', 1, 'w'],
  ['Lab_Recharge_Nuke', 'Dobíjení atomovky', 'card', 'nukeRecharge', 1, 'w'],
  ['Perk_Labs_Unlock_Perks', 'Odemknout perky', 'perk', 'perks', 1, 'u'],
  ['Perk_Labs_Waves_Required', 'Vlny na perk', 'perk', 'perkWaves', 1, '+'],
  ['Perk_Labs_Standard_Perk_Bonus', 'Bonus standardních perků', 'perk', 'perkBonus', 0.01, '%'],
  ['Perk_Labs_Perk_Option_Quantity', 'Počet nabízených perků', 'perk', 'perkOptions', 1, '+'],
  ['Perk_Labs_First_Perk_Choice', 'Volba prvního perku', 'perk', 'firstPerk', 1, 'u'],
  ['Perk_Labs_Auto_Perk_Pick', 'Automatický výběr perků', 'perk', 'autoPerk', 1, 'u'],
  ['Perk_Labs_Auto_Pick_Ranking', 'Pořadí automatického výběru', 'perk', 'perkRanking', 1, 'n'],
  ['Perk_Labs_Ban_Perks', 'Zakázané perky', 'perk', 'perkBans', 1, 'n'],
  ['Perk_Labs_Improve_Trade-Off_Perks', 'Lepší trade-off perky', 'perk', 'tradeBonus', 0.01, '%'],
  ['Lab_Flame_Bot_Cooldown', 'Ohnivý bot – cooldown', 'bot', 'cdFlame', 1, 's'],
  ['Lab_Flame_Bot_Frequency', 'Ohnivý bot – frekvence', 'bot', 'flameFreq', 1, 's'],
  ['Lab_Thunder_Bot_Cooldown', 'Hromový bot – cooldown', 'bot', 'cdThunder', 1, 's'],
  ['Lab_Thunder_Bot_Linger_Time', 'Hromový bot – doznívání', 'bot', 'thunderLinger', 1, 's'],
  ['Lab_Golden_Bot_Cooldown', 'Zlatý bot – cooldown', 'bot', 'cdGolden', 1, 's'],
  ['Lab_Golden_Bot_Duration', 'Zlatý bot – trvání', 'bot', 'durGolden', 1, 's'],
  ['Lab_Amplify_Bot_Cooldown', 'Zesilovací bot – cooldown', 'bot', 'cdAmplify', 1, 's'],
  ['Lab_Amplify_Bot_Duration', 'Zesilovací bot – trvání', 'bot', 'durAmplify', 1, 's'],
  ['Lab_Bot_Bot_Cooldown', 'Bot bot – cooldown', 'bot', 'cdBotbot', 1, 's'],
  ['Lab_Bot_Bot_Duration', 'Bot bot – trvání', 'bot', 'durBotbot', 1, 's'],
  ['Lab_Common_Enemy_Health', 'Základní nepřítel – zdraví', 'enemy', 'eHp_basic', 0.01, '%'],
  ['Lab_Common_Enemy_Attack', 'Základní nepřítel – útok', 'enemy', 'eAtk_basic', 0.01, '%'],
  ['Lab_Fast_Enemy_Health', 'Rychlý – zdraví', 'enemy', 'eHp_fast', 0.01, '%'],
  ['Lab_Fast_Enemy_Attack', 'Rychlý – útok', 'enemy', 'eAtk_fast', 0.01, '%'],
  ['Lab_Fast_Enemy_Speed', 'Rychlý – rychlost', 'enemy', 'eSpd_fast', 0.01, '%'],
  ['Lab_Tank_Enemy_Health', 'Tank – zdraví', 'enemy', 'eHp_tank', 0.01, '%'],
  ['Lab_Tank_Enemy_Attack', 'Tank – útok', 'enemy', 'eAtk_tank', 0.01, '%'],
  ['Lab_Ranged_Enemy_Health', 'Střelec – zdraví', 'enemy', 'eHp_ranged', 0.01, '%'],
  ['Lab_Ranged_Enemy_Attack', 'Střelec – útok', 'enemy', 'eAtk_ranged', 0.01, '%'],
  ['Lab_Boss_Health', 'Boss – zdraví', 'enemy', 'eHp_boss', 0.01, '%'],
  ['Lab_Boss_Attack', 'Boss – útok', 'enemy', 'eAtk_boss', 0.01, '%'],
  ['Lab_Protector_Health', 'Ochránce – zdraví', 'enemy', 'eHp_protector', 0.01, '%'],
  ['Lab_Protector_Radius', 'Ochránce – radius', 'enemy', 'protRadius', 0.01, '%'],
  ['Lab_Protector_Damage_Reduction', 'Ochránce – redukce', 'enemy', 'protRed', 0.01, '%'],
  ['Lab_Ray_Enemy_Health', 'Paprsek – zdraví', 'enemy', 'eHp_ray', 0.01, '%'],
  ['Lab_Ray_Enemy_Attack', 'Paprsek – útok', 'enemy', 'eAtk_ray', 0.01, '%'],
  ['Lab_Scatter_Enemy_Health', 'Rozptylovač – zdraví', 'enemy', 'eHp_scatter', 0.01, '%'],
  ['Lab_Scatter_Enemy_Attack', 'Rozptylovač – útok', 'enemy', 'eAtk_scatter', 0.01, '%'],
  ['Lab_Vampire_Enemy_Attack', 'Upír – útok', 'enemy', 'eAtk_vampire', 0.01, '%'],
  ['Lab_Vampire_Enemy_Defense', 'Upír – obrana', 'enemy', 'eHp_vampire', 0.01, '%'],
  ['Module_Labs_Common_Drop_Chance', 'Šance na běžný modul', 'mod', 'modCommon', 0.01, '%'],
  ['Module_Labs_Rare_Drop_Chance', 'Šance na vzácný modul', 'mod', 'modRare', 0.01, '%'],
  ['Module_Labs_Reroll_Shards', 'Úlomky z bossů', 'mod', 'rerollShards', 1, '+'],
  ['Module_Labs_Daily_Mission_Shards', 'Úlomky z misí', 'mod', 'dmShards', 1, '+'],
  ['Module_Labs_Module_Shard_Cost', 'Sleva úlomků modulů', 'mod', 'modShardCost', -0.01, '%'],
  ['Module_Labs_Module_Coin_Cost', 'Sleva coinů modulů', 'mod', 'modCoinCost', -0.01, '%'],
  ['Module_Labs_Unmerge_Module', 'Rozpojení modulů', 'mod', 'unmerge', 1, 'u'],
  ['Lab_Shatter_Shards', 'Úlomky z rozbití', 'mod', 'shatterBonus', 0.01, '%'],
  ['Module_Labs_Cannon_Effect_Bans', 'Zákazy efektů – dělo', 'mod', 'banCannon', 1, 'n'],
  ['Module_Labs_Armor_Effect_Bans', 'Zákazy efektů – pancíř', 'mod', 'banArmor', 1, 'n'],
  ['Module_Labs_Generator_Effect_Bans', 'Zákazy efektů – generátor', 'mod', 'banGenerator', 1, 'n'],
  ['Module_Labs_Core_Effect_Bans', 'Zákazy efektů – jádro', 'mod', 'banCore', 1, 'n'],
  ['Lab_Battle_Condition_Reduction', 'Snížení bitevních podmínek', 'bc', 'bcRed', 0.01, '%'],
];
const LAB_GROUPS = { main: 'Hlavní', atk: 'Útok', def: 'Obrana', util: 'Utilita', uw: 'Ultimátní zbraně', card: 'Karty', perk: 'Perky', bot: 'Boti', enemy: 'Nepřátelé', mod: 'Moduly', bc: 'Bitevní podmínky' };
// laby ultimátních zbraní vyžadují vlastnictví zbraně
const LAB_NEEDS_UW = {
  smDespawn: 'smartMissiles', smExplosion: 'smartMissiles', smRadius: 'smartMissiles', smAmp: 'smartMissiles', barrage: 'smartMissiles', barrageQty: 'smartMissiles', slMissile: 'spotlight',
  cfDur: 'chronoField', cfDmgRed: 'chronoField', cfRed: 'chronoField', cfRange: 'chronoField', psRadius: 'poisonSwamp', psStun: 'poisonSwamp', psStunChance: 'poisonSwamp', psStunTime: 'poisonSwamp', psRend: 'poisonSwamp',
  gtBonus: 'goldenTower', gtDur: 'goldenTower', clShock: 'chainLightning', clShockChance: 'chainLightning', clShockMult: 'chainLightning', clThunder: 'chainLightning', clScatter: 'chainLightning',
  dwPool: 'deathWave', dwCoin: 'deathWave', dwAmp: 'deathWave', dwStrip: 'deathWave', dwCell: 'deathWave', ilmRadius: 'innerMines', ilmRot: 'innerMines', ilmStun: 'innerMines',
  bhDmg: 'blackHole', bhExtra: 'blackHole', bhCoin: 'blackHole', bhDisable: 'blackHole', slCoin: 'spotlight',
};
const LAB_NEEDS_CARD = { swBlast: 'secondWind', swRecharge: 'secondWind', drDouble: 'deathRay', esExtra: 'energyShield', stBonus: 'superTower', dmRecharge: 'demonMode', nukeRecharge: 'nuke' };
const LAB_NEEDS_LAB = { perkWaves: 'perks', perkBonus: 'perks', perkOptions: 'perks', firstPerk: 'perks', autoPerk: 'perks', perkRanking: 'autoPerk', perkBans: 'perks', tradeBonus: 'perks', barrageQty: 'barrage', psStunChance: 'psStun', psStunTime: 'psStun', clShockChance: 'clShock', clShockMult: 'clShock', enhDiscount: 'enhance' };
const LAB_NEEDS_BOT = { cdFlame: 'flame', flameFreq: 'flame', cdThunder: 'thunder', thunderLinger: 'thunder', cdGolden: 'golden', durGolden: 'golden', cdAmplify: 'amplify', durAmplify: 'amplify', cdBotbot: 'botbot', durBotbot: 'botbot' };
const LAB_DEFS = LAB_META.filter(m => WIKI.labs[m[0]]).map(([key, name, group, eff, scale, unit]) => {
  const w = WIKI.labs[key];
  const d = { id: eff, key, name, group, scale, unit, unlock: w.u, max: w.l[w.l.length - 1] };
  d.costRows = w.l.map((l, i) => [l, w.c[i]]);
  d.timeRows = w.l.map((l, i) => [l, w.t[i] || 1]);
  d.valRows = w.l.map((l, i) => [l, w.v[i] === null ? l : w.v[i]]);
  return d;
});
const LAB_MAP = Object.fromEntries(LAB_DEFS.map(d => [d.id, d]));
const LAB_SLOT_COSTS = [0, 100, 400, 1400, 3000];
// Cena urychlení labu v gemech (wiki): 1h 8, 1d 163, 1t 1000, 30d 3550, 90d 8000, 360d 25000
const RUSH_ROWS = [[60, 1], [3600, 8], [86400, 163], [604800, 1000], [2592000, 3550], [7776000, 8000], [31104000, 25000]];
// Zrychlení labů buňkami: [násobek, cena za 1h]
const LAB_BOOSTS = [[1.5, 15], [2, 100], [3, 840], [4, 3360], [5, 11900], [6, 60000], [7, 250000], [8, 1000000]];

// ---------- Moduly ----------
const MOD_RARITIES = [
  { name: 'Běžný', color: '#b8c0ff', maxLv: 20, subs: 1, sub: 0 },
  { name: 'Vzácný', color: '#4d8dff', maxLv: 30, subs: 2, sub: 1 },
  { name: 'Vzácný+', color: '#4d8dff', maxLv: 40, subs: 2, sub: 1 },
  { name: 'Epický', color: '#c45cff', maxLv: 60, subs: 3, sub: 2 },
  { name: 'Epický+', color: '#c45cff', maxLv: 80, subs: 3, sub: 2 },
  { name: 'Legendární', color: '#ffb000', maxLv: 100, subs: 3, sub: 3 },
  { name: 'Legendární+', color: '#ffb000', maxLv: 120, subs: 4, sub: 3 },
  { name: 'Mýtický', color: '#ff3d6e', maxLv: 140, subs: 4, sub: 4 },
  { name: 'Mýtický+', color: '#ff3d6e', maxLv: 160, subs: 5, sub: 4 },
  { name: 'Prastarý', color: '#3dffb0', maxLv: 200, subs: 6, sub: 5 },
  { name: 'Prastarý 1★', color: '#3dffb0', maxLv: 220, subs: 7, sub: 5 },
  { name: 'Prastarý 2★', color: '#3dffb0', maxLv: 240, subs: 7, sub: 5 },
  { name: 'Prastarý 3★', color: '#3dffb0', maxLv: 260, subs: 8, sub: 5 },
  { name: 'Prastarý 4★', color: '#3dffb0', maxLv: 280, subs: 8, sub: 5 },
  { name: 'Prastarý 5★', color: '#3dffb0', maxLv: 300, subs: 8, sub: 5 },
];
const R = { COMMON: 0, RARE: 1, RAREP: 2, EPIC: 3, EPICP: 4, LEG: 5, LEGP: 6, MYTH: 7, MYTHP: 8, ANC: 9 };
const SUB_RARITY_NAMES = ['Běžný', 'Vzácný', 'Epický', 'Legendární', 'Mýtický', 'Prastarý'];
const SUB_RARITY_COLORS = ['#b8c0ff', '#4d8dff', '#c45cff', '#ffb000', '#ff3d6e', '#3dffb0'];
const SUB_RARITY_W = [61.2, 25, 10, 2.5, 1, 0.3];
const SUB_UNLOCK_LV = [41, 101, 141, 161, 201, 241];
const MOD_TYPES = {
  cannon: { name: 'Dělo', icon: '⌖', main: 'Poškození', per: 0.05, shard: 'cannon' },
  armor: { name: 'Pancíř', icon: '⛨', main: 'Zdraví', per: 0.05, shard: 'armor' },
  generator: { name: 'Generátor', icon: '⚡', main: 'Coin bonus', per: 0.005, shard: 'generator' },
  core: { name: 'Jádro', icon: '✹', main: 'Poškození zbraní', per: 0.04, shard: 'core' },
};
const RARITY_EFF = [0.5, 0.7, 0.75, 0.85, 0.9, 1, 1.03, 1.08, 1.1, 1.15, 1.15 * 1.04, 1.15 * 1.08, 1.15 * 1.12, 1.15 * 1.16, 1.15 * 1.2];
// Substaty: [klíč, název, hodnoty pro běžný..prastarý (null = nedostupné), formát]
const SUBSTATS = {
  cannon: [
    ['atkSpd', 'Rychlost útoku', [0.3, 0.5, 0.7, 1, 3, 5], '+'], ['critChance', 'Šance na krit', [2, 3, 4, 6, 8, 10], '%'], ['critFactor', 'Krit. násobek', [2, 4, 6, 8, 12, 15], '+'],
    ['range', 'Dosah', [2, 4, 8, 12, 20, 30], 'm'], ['dmgMeter', 'Poškození / metr', [0.005, 0.01, 0.025, 0.04, 0.075, 0.15], '+'], ['multiChance', 'Multishot šance', [null, 3, 5, 7, 10, 13], '%'],
    ['multiTargets', 'Multishot cíle', [null, null, 1, 2, 3, 4], '+'], ['rapidChance', 'Rapid fire šance', [null, 2, 4, 6, 9, 12], '%'], ['rapidDur', 'Rapid fire trvání', [null, 0.4, 0.8, 1.4, 2.5, 3.5], 's'],
    ['bounceChance', 'Odraz šance', [null, 2, 3, 5, 9, 12], '%'], ['bounceTargets', 'Odraz cíle', [null, null, 1, 2, 3, 4], '+'], ['bounceRange', 'Odraz dosah', [null, 0.5, 0.8, 1.2, 1.8, 2], 'm'],
    ['scChance', 'Super krit šance', [null, null, 3, 5, 7, 10], '%'], ['scMult', 'Super krit násobek', [null, null, 2, 3, 5, 7], '+'], ['rendChance', 'Rend šance', [null, null, null, 2, 5, 8], '%'],
    ['rendMult', 'Rend násobek', [null, null, null, 0.02, 0.05, 0.08], '+'], ['rendMax', 'Max. rend', [null, null, null, 2, 3, 5], '+'],
  ],
  armor: [
    ['regenPct', 'Regenerace', [20, 40, 60, 100, 200, 400], '%'], ['defPct', 'Obrana %', [1, 2, 3, 5, 6, 8], '%'], ['defAbsPct', 'Obrana absolutní', [15, 25, 40, 100, 500, 1000], '%'],
    ['thorns', 'Trny', [null, null, 2, 4, 7, 10], '%'], ['lifesteal', 'Lifesteal', [null, null, 0.3, 0.5, 1.5, 2], '%'], ['knockChance', 'Odhození šance', [null, null, 2, 4, 6, 9], '%'],
    ['knockForce', 'Odhození síla', [null, null, 0.1, 0.4, 0.9, 1.5], '+'], ['orbSpeed', 'Rychlost orbů', [null, null, 1, 1.5, 2, 3], '+'], ['orbs', 'Orby', [null, null, null, null, 1, 2], '+'],
    ['shockSize', 'Rázová vlna velikost', [null, null, 0.1, 0.3, 0.7, 1], '+'], ['shockFreq', 'Rázová vlna interval', [null, null, -1, -2, -3, -4], 's'], ['mineDmg', 'Poškození min', [null, 30, 50, 150, 500, 800], '%'],
    ['mineChance', 'Šance min', [null, 1.5, 3, 6, 9, 12], '%'], ['mineRadius', 'Radius min', [null, 0.1, 0.15, 0.3, 0.75, 1], '+'], ['deathDefy', 'Vzdor smrti', [null, null, null, 1.5, 3.5, 5], '%'],
    ['wallHp', 'Zdraví zdi', [null, null, 20, 40, 90, 120], '%'], ['wallRebuild', 'Obnova zdi', [null, null, -20, -40, -80, -100], 's'],
  ],
  generator: [
    ['cashBonus', 'Cash bonus', [0.1, 0.2, 0.3, 0.5, 1.2, 2.5], '+'], ['cashWave', 'Cash / vlna', [30, 50, 100, 200, 500, 1000], '+'], ['coinKill', 'Coiny / zabití', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], '+'],
    ['coinWave', 'Coiny / vlna', [20, 35, 60, 120, 200, 350], '+'], ['freeAtk', 'Free útok', [2, 4, 6, 8, 10, 12], '%'], ['freeDef', 'Free obrana', [2, 4, 6, 8, 10, 12], '%'], ['freeUtil', 'Free utilita', [2, 4, 6, 8, 10, 12], '%'],
    ['interest', 'Úrok', [null, null, 2, 4, 6, 8], '%'], ['packAmount', 'Léčení balíčku', [null, null, 3, 5, 7, 10], '%'], ['maxRecovery', 'Max. léčení', [null, null, 0.4, 0.7, 1, 1.5], '+'],
    ['packChance', 'Šance balíčku', [null, null, 5, 8, 11, 15], '%'], ['elsAtk', 'Přeskok útoku', [null, null, 2, 4, 6, 8], '%'], ['elsHp', 'Přeskok zdraví', [null, null, 2, 4, 6, 8], '%'],
  ],
  core: [
    ['gtBonus', 'Zlatá věž – bonus', [null, null, 1, 2, 3, 4], '+'], ['gtDur', 'Zlatá věž – trvání', [null, null, null, 2, 4, 7], 's'], ['gtCd', 'Zlatá věž – cooldown', [null, null, null, -5, -8, -12], 's'],
    ['bhSize', 'Černá díra – velikost', [2, 4, 6, 8, 10, 12], 'm'], ['bhDur', 'Černá díra – trvání', [null, null, null, 2, 3, 4], 's'], ['bhCd', 'Černá díra – cooldown', [null, null, null, -2, -3, -4], 's'],
    ['slBonus', 'Reflektor – bonus', [1.2, 2.5, 3.5, 10, 15, 20], '+'], ['slAngle', 'Reflektor – úhel', [null, null, 3, 6, 11, 15], '°'], ['cfDur', 'Chrono – trvání', [null, null, null, 4, 7, 10], 's'],
    ['cfSlow', 'Chrono – zpomalení', [null, null, 3, 8, 11, 15], '%'], ['cfCd', 'Chrono – cooldown', [null, null, null, -4, -7, -10], 's'], ['dwDmg', 'Vlna smrti – poškození', [8, 15, 25, 50, 100, 250], '+'],
    ['dwQty', 'Vlna smrti – počet', [null, null, null, 1, 2, 3], '+'], ['dwCd', 'Vlna smrti – cooldown', [null, null, null, -6, -10, -13], 's'], ['smDmg', 'Rakety – poškození', [8, 15, 25, 50, 100, 250], '+'],
    ['smQty', 'Rakety – počet', [null, null, 1, 2, 4, 5], '+'], ['smCd', 'Rakety – cooldown', [null, null, null, -2, -4, -6], 's'], ['ilmDmg', 'Vnitřní miny – poškození', [8, 15, 25, 50, 100, 250], '+'],
    ['ilmQty', 'Vnitřní miny – počet', [null, null, null, 1, 2, 3], '+'], ['ilmCd', 'Vnitřní miny – cooldown', [null, null, -5, -8, -10, -13], 's'], ['psDmg', 'Bažina – poškození', [8, 15, 25, 50, 100, 250], '+'],
    ['psDur', 'Bažina – trvání', [null, null, null, 2, 5, 10], 's'], ['psCd', 'Bažina – cooldown', [null, -2, -4, -6, -8, -10], 's'], ['clDmg', 'Blesk – poškození', [8, 15, 25, 50, 100, 250], '+'],
    ['clQty', 'Blesk – počet', [null, null, 1, 2, 3, 4], '+'], ['clChance', 'Blesk – šance', [2, 4, 6, 9, 12, 15], '%'],
  ],
};
// Unikátní epické moduly: [id, název, popis s {x}, hodnoty pro epický/legendární/mýtický/prastarý]
const MOD_UNIQUES = {
  cannon: [
    ['astral', 'Astrální vysvobození', 'Dosah odrazu +3 % dosahu věže, každý odraz +{x} % poškození', [20, 40, 60, 80]],
    ['annihilator', 'Anihilátor', '+{x} % super krit šance; po super kritu dalších 5 střel super krit', [5, 7, 10, 14]],
    ['deathPenalty', 'Trest smrti', '{x} % šance označit nepřítele – první zásah ho zničí', [5, 8, 11, 15]],
    ['havoc', 'Ničitel', '{x} % šance, že rend okamžitě dosáhne maxima', [10, 13, 15, 20]],
    ['shrinkRay', 'Zmenšovací paprsek', '1 % šance snížit hmotnost nepřítele o {x} %', [10, 20, 30, 40]],
    ['ampStrike', 'Zesilující úder', 'Zabití bosse/elity: poškození x5 na {x}s', [5, 11, 18, 26]],
    ['gildedSniper', 'Pozlacený odstřelovač', '{x} % šance, že zabití dostane všechny coin bonusy', [10, 20, 30, 40]],
  ],
  armor: [
    ['antiCube', 'Anti-kostkový portál', 'Nepřátelé zasažení rázovou vlnou berou {x}x poškození 7s', [10, 15, 20, 25]],
    ['negMass', 'Projektor záporné hmoty', 'Orb, který nezabije, sníží poškození a rychlost o {x} % (max 50 %)', [1, 1.5, 2, 2.5]],
    ['wormhole', 'Červí díra', 'Regenerace může léčit až do {x} % max. léčení balíčků', [25, 50, 75, 100]],
    ['spaceDisplacer', 'Prostorový posunovač', 'Miny mají {x} % šanci stát se vnitřní minou', [15, 20, 25, 30]],
    ['sharpFort', 'Ostrá pevnost', 'Zdraví a regenerace zdi x{x}', [1.25, 1.5, 2, 2.5]],
    ['orbital', 'Orbitální augment', '{x} elektronů kolem věže bere 15 % zbývajícího HP', [2, 4, 6, 8]],
    ['sentry', 'Strážní protokol', 'Orby stojí a střílí {x} mini orby', [1, 2, 3, 4]],
  ],
  generator: [
    ['singularity', 'Postroj singularity', 'Dosah botů +{x}m', [5, 8, 11, 15]],
    ['galaxy', 'Galaktický kompresor', 'Balíček zkrátí cooldown zbraní o {x}s', [10, 13, 17, 20]],
    ['pulsar', 'Pulsarový sběrač', '{x} % šance, že zásah sníží úroveň nepřítele', [1, 1.5, 2, 2.5]],
    ['bhDigestor', 'Trávič černých děr', '+{x} % coinů za každé free vylepšení ve vlně', [3, 5, 7, 10]],
    ['funding', 'Financování projektu', 'Poškození x(1 + {x} % × počet číslic cashe)', [12.5, 25, 50, 100]],
    ['restorative', 'Obnovující bonus', 'Balíček dá +50 % rychlost útoku na {x}s', [15, 20, 25, 30]],
    ['infinity', 'Práh nekonečna', 'Free vylepšení mohou překročit limit o {x} úrovní', [1000, 2000, 3000, 4000]],
  ],
  core: [
    ['omChip', 'Om čip', 'Reflektor míří na bosse; okolí bosse bere x{x}', [2, 4, 7, 15]],
    ['harmony', 'Dirigent harmonie', 'Otrávení nepřátelé mají {x} % šanci minout', [15, 20, 25, 30]],
    ['dimension', 'Dimenzionální jádro', 'Blesk zasáhne i původní cíl, šok x2, max {x} stacků', [5, 10, 15, 20]],
    ['multiverse', 'Multivesmírné nexus', 'Vlna smrti, zlatá věž a černá díra se spouští spolu (±{x}s)', [20, 10, 1, -10]],
    ['magneticHook', 'Magnetický hák', '{x} vnitřních min vystřeleno na bosse a flotily', [1, 2, 3, 4]],
    ['primordial', 'Prapůvodní kolaps', 'Extra černá díra; nepřátelé v ní dávají o {x} % méně poškození', [60, 65, 75, 90]],
    ['tactical', 'Taktická palba', 'Radius raket x2; naváděná raketa každých {x}s', [14, 10, 6, 2]],
  ],
};
const MOD_DRAW_COST = 20;
const MOD_DRAW_RATES = [[R.COMMON, 68.5], [R.RARE, 29], [R.EPIC, 2.5]];
const MOD_SHATTER = { 0: 5, 1: 10, 2: 30 }; // + epic sloučené 90
const MOD_REROLL_COST = [10, 40, 160, 500, 1000, 1600, 2250, 3000];
const MOD_SLOT_ROWS = { shard: [[1, 7], [11, 20], [21, 40], [31, 75], [41, 120], [51, 180], [61, 250], [71, 350], [81, 500], [91, 700], [101, 1000], [111, 1300], [121, 1800], [131, 2500], [141, 3000], [151, 4000], [161, 5000], [171, 6250], [181, 7500], [191, 8750], [201, 10000], [221, 15000], [241, 20000], [261, 30000], [281, 40000], [300, 49500]] };
MOD_SLOT_ROWS.coin = (WIKI.ws.Modules_Cost || [[1, 10000], [300, 8.86e20]]);
// Recepty slučování: [výchozí rarita, potřebný materiál (same = stejný modul / any = stejný typ), počet, rarita materiálu, výsledek]
const MERGE_RECIPES = [
  [R.RARE, 'same', 2, R.RARE, R.RAREP], [R.RAREP, 'any', 2, R.RAREP, R.EPIC], [R.EPIC, 'same', 1, R.EPIC, R.EPICP], [R.EPICP, 'any', 2, R.EPICP, R.LEG],
  [R.LEG, 'same', 1, R.EPICP, R.LEGP], [R.LEGP, 'any', 1, R.LEGP, R.MYTH], [R.MYTH, 'any', 1, R.LEGP, R.MYTHP], [R.MYTHP, 'same', 2, R.EPICP, R.ANC],
  [9, 'same', 1, R.EPICP, 10], [10, 'same', 1, R.EPICP, 11], [11, 'same', 1, R.EPICP, 12], [12, 'same', 1, R.EPICP, 13], [13, 'same', 1, R.EPICP, 14],
];

// ---------- Boti (event obchod, medaile) ----------
const BOT_DEFS = [
  { id: 'flame', name: 'Ohnivý bot', icon: '🔥', color: '#ff6a2a', desc: 'Pálí nepřátele v okolí a snižuje jejich poškození.', stats: [['red', 'Redukce poškození', L => 0.2 + 0.03 * L, 25, F.pct], ['cd', 'Cooldown', L => 75 - 3 * L, 15, F.s], ['dmg', 'Poškození', L => 50 + 8 * L, 30, F.x], ['range', 'Dosah', L => 30 + 4 * L, 15, F.m]] },
  { id: 'thunder', name: 'Hromový bot', icon: '⚡', color: '#7df9ff', desc: 'Omráčí nepřátele v okolí, pak je zpomalí.', stats: [['stun', 'Omráčení', L => 5 + 0.25 * L, 20, F.s], ['cd', 'Cooldown', L => 120 - 3 * L, 15, F.s], ['linger', 'Doznívání', L => 0.2 + 0.02 * L, 20, F.pct], ['range', 'Dosah', L => 25 + 2 * L, 15, F.m]] },
  { id: 'golden', name: 'Zlatý bot', icon: '💰', color: '#ffd700', desc: 'Nepřátelé zničení v jeho dosahu dávají více coinů.', stats: [['dur', 'Trvání', L => 20 + 0.5 * L, 30, F.s], ['cd', 'Cooldown', L => 120 - 3 * L, 15, F.s], ['bonus', 'Bonus', L => 2 + 0.2 * L, 30, F.x], ['range', 'Dosah', L => 20 + 2 * L, 20, F.m]] },
  { id: 'amplify', name: 'Zesilovací bot', icon: '📡', color: '#ff5ce1', desc: 'Nepřátelé v jeho dosahu dostávají více poškození.', stats: [['dur', 'Trvání', L => 20 + 0.5 * L, 30, F.s], ['cd', 'Cooldown', L => 120 - 3 * L, 15, F.s], ['bonus', 'Bonus', L => 3.5 + 0.4 * L, 30, F.x], ['range', 'Dosah', L => 25 + 2 * L, 18, F.m]] },
  { id: 'botbot', name: 'Bot bot', icon: '🤖', color: '#9dff3d', desc: 'Zesiluje efekty ostatních botů v dosahu.', stats: [['dur', 'Trvání', L => 20 + 0.5 * L, 30, F.s], ['cd', 'Cooldown', L => 120 - 3 * L, 15, F.s], ['bonus', 'Bonus', L => 1.05 + 0.05 * L, 30, F.x], ['range', 'Dosah', L => 25 + 2 * L, 18, F.m]] },
];
const BOT_MAP = Object.fromEntries(BOT_DEFS.map(d => [d.id, d]));
const BOT_UNLOCK = [150, 300, 600, 900, 1200];
const botUpCost = L => 100 + 40 * L;

// ---------- Guardian a čipy (gilda) ----------
const CHIP_DEFS = [
  { id: 'ally', name: 'Spojenec', icon: '✚', base: true, desc: 'Promění nejbližšího nepřítele v léčivý balíček.', stats: [['amount', 'Léčení', L => 0.01 * (L + 1), 49, F.pct], ['cd', 'Cooldown', L => 120 - L, 60, F.s], ['max', 'Max. léčení', L => 1.1 + 0.1 * L, 40, F.x]] },
  { id: 'attack', name: 'Útok', icon: '⚔', base: true, desc: 'Útočí na nejvíce zraněné nepřátele – % ztraceného HP.', stats: [['pct', 'Procento', L => 0.01 * (L + 1), 19, F.pct], ['cd', 'Cooldown', L => 120 - L, 60, F.s], ['targets', 'Cíle', L => 1 + L, 9, F.int]] },
  { id: 'bounty', name: 'Odměna', icon: '🎯', cost: 50, desc: 'Označí elity/bosse – zabití dá násobek coinů.', stats: [['mult', 'Násobek', L => 1.01 + 0.01 * L, 99, F.x], ['cd', 'Cooldown', L => 120 - L, 60, F.s], ['targets', 'Cíle', L => 1 + L, 9, F.int]] },
  { id: 'fetch', name: 'Aport', icon: '🐕', cost: 75, desc: 'Najde ukrytou kořist: coiny, gemy, medaile, úlomky, moduly.', stats: [['cd', 'Cooldown', L => 120 - L, 60, F.s], ['find', 'Šance nálezu', L => 0.1 + 0.01 * L, 60, F.pct], ['double', 'Dvojitý nález', L => 0.02 + 0.01 * L, 48, F.pct]] },
  { id: 'summon', name: 'Vyvolání', icon: '🌀', cost: 100, desc: 'Vyvolá nepřátele (2/s) a dá bonus k cashi za zabití.', stats: [['cd', 'Cooldown', L => 140 - L, 60, F.s], ['dur', 'Trvání', L => 5 + L, 30, F.s], ['cash', 'Cash bonus', L => 1 + L, 9, F.x]] },
  { id: 'scout', name: 'Průzkum', icon: '🔭', cost: 100, desc: 'Nepřátelé se počítají jako vzdálenější (poškození/metr).', stats: [['cd', 'Cooldown', L => 105 - L, 60, F.s], ['range', 'Násobek vzdálenosti', L => 2 + 0.1 * L, 40, F.x], ['dur', 'Trvání', L => 5 + L, 30, F.s]] },
];
const CHIP_MAP = Object.fromEntries(CHIP_DEFS.map(d => [d.id, d]));
const chipUpCost = L => 5 + 5 * L;
const GUARDIAN_UNLOCK = 200; // bitů
const GUILD_CHESTS = [[100, 10, 10, 1, 5], [250, 20, 25, 2, 10], [500, 40, 50, 3, 15], [750, 80, 100, 5, 30]]; // [příspěvek, tokeny, bity, coiny x, gemy]

// ---------- Turnaje ----------
// eq = ekvivalent tieru (síla nepřátel), boss = boss každých N vln, bcs = počet náhodných podmínek, skipMul = násobek přeskoků úrovní
const LEAGUES = [
  { name: 'Měď', color: '#d48a4d', eq: 1.5, boss: 10, bcs: 0, skipMul: 1, bot: 60, rew: [[1, 100, 20], [2, 80, 18], [4, 65, 16], [6, 50, 12], [8, 45, 10], [10, 40, 9], [12, 30, 8], [15, 20, 7], [22, 15, 6], [30, 10, 5]] },
  { name: 'Stříbro', color: '#c9d3e6', eq: 3.5, boss: 9, bcs: 1, skipMul: 1, bot: 130, rew: [[1, 200, 40], [2, 150, 35], [4, 100, 30], [6, 75, 20], [8, 65, 19], [10, 60, 18], [12, 55, 17], [15, 50, 16], [22, 45, 14], [30, 40, 12]] },
  { name: 'Zlato', color: '#ffd23d', eq: 6, boss: 8, bcs: 2, skipMul: 0.9, bot: 260, rew: [[1, 300, 80], [2, 250, 70], [4, 200, 60], [6, 150, 40], [8, 125, 30], [10, 100, 28], [12, 90, 26], [15, 80, 24], [22, 70, 22], [30, 50, 20]] },
  { name: 'Platina', color: '#7df9ff', eq: 8.5, boss: 7, bcs: 3, skipMul: 0.75, bot: 420, demote: true, rew: [[1, 425, 180], [2, 400, 160], [4, 375, 140], [6, 275, 80], [8, 260, 70], [10, 245, 60], [12, 230, 56], [15, 215, 53], [24, 200, 50], [30, 100, 20]] },
  { name: 'Šampion', color: '#ff5ce1', eq: 11.5, boss: 6, bcs: 4, skipMul: 0.6, bot: 650, demote: true, rew: [[1, 550, 300], [2, 525, 280], [4, 500, 260], [6, 375, 180], [8, 360, 170], [10, 345, 160], [12, 330, 150], [15, 315, 125], [24, 300, 100], [30, 175, 20]] },
  { name: 'Legenda', color: '#ff3d3d', eq: 14.5, boss: 5, bcs: 5, skipMul: 0.45, bot: 950, demote: true, keys: [25, 20, 15, 10, 8, 6, 4, 2, 1, 0], rew: [[1, 675, 375], [2, 650, 350], [4, 625, 325], [6, 475, 275], [8, 460, 260], [10, 445, 245], [12, 430, 230], [15, 415, 215], [24, 400, 200], [30, 250, 100]] },
  { name: 'Mýtus', color: '#b45cff', eq: 17.5, boss: 5, bcs: 6, skipMul: 0.4, bot: 1300, demote: true, keys: [50, 45, 40, 37, 34, 31, 28, 25, 20, 8], rew: [[1, 900, 475], [2, 800, 450], [4, 700, 425], [6, 650, 400], [8, 600, 385], [10, 575, 370], [12, 550, 355], [15, 525, 340], [24, 500, 325], [30, 335, 225]] },
];
const TOURNEY_BC_POOL = ['orb', 'dr', 'thorns', 'plasma', 'knock', 'armor', 'speed', 'more', 'atkSpd', 'boss', 'mass', 'fast'];
const TOURNEY_BADGES = ['Copper Badge', 'Silver Badge', 'Gold Badge', 'Platinum Badge', 'Champion Badge', 'Tower Master', 'Mythic Tower'];
const BOT_NAMES = ['HexLord', 'Tvrz', 'NeonKing', 'Orbinator', 'Pepa_T', 'Vlnolam', 'Krit99', 'Bastion', 'SquareHater', 'IdleGod', 'Vez_007', 'Kocour', 'LabRat', 'CoinFarmer', 'DeathWave', 'eHP_Enjoyer', 'Bouncer', 'Gemík', 'TankMan', 'Zuzka', 'Tower4Life', 'Mína', 'Spotlight', 'Chrono', 'Nováček', 'Ultimát', 'Bossbuster', 'Lukáš', 'Tier10', 'Blackhole', 'OrbDevo', 'SMax', 'Hybrid', 'GTfarmer'];

// ---------- Denní mise (wiki) ----------
// [stat, text, cíle, podmínka]
const MISSION_DEFS = [
  ['kill_boss', 'Zabij {x} bossů', [1, 2, 3, 4, 5]],
  ['kill_basic', 'Zabij {x} základních nepřátel', [50, 75, 100, 150, 200]],
  ['kill_fast', 'Zabij {x} rychlých nepřátel', [20, 35, 50], () => save.maxTier >= 2],
  ['kill_tank', 'Zabij {x} tanků', [20, 35, 50], () => save.maxTier >= 3],
  ['kill_ranged', 'Zabij {x} střelců', [2, 4, 6], () => save.maxTier >= 4],
  ['gems_tapped', 'Seber {x} plovoucích gemů', [1, 2, 3]],
  ['waves', 'Projdi celkem {x} vln', [30, 50, 70]],
  ['runs', 'Spusť {x} bitvu', [1]],
  ['crits', 'Zasáhni {x} nepřátel kritem', [100, 150, 200], () => save.maxTier >= 4],
  ['bounces', 'Odraz střely přes {x} nepřátel', [100, 150, 200], () => save.unlocks.bounce],
  ['supercrits', 'Zasáhni {x} nepřátel super kritem', [10, 20, 30], () => save.unlocks.superCrit],
  ['knockbacks', 'Odhoď {x} nepřátel', [40, 60, 80], () => save.unlocks.knock],
  ['orb_kills', 'Zabij {x} nepřátel orby', [60, 80, 100, 120], () => save.unlocks.orbs],
  ['mine_kills', 'Zabij {x} nepřátel minami', [60, 80, 100, 120], () => save.unlocks.mine],
  ['els', 'Přeskoč úroveň nepřátel {x}x', [3, 5, 7, 10], () => save.unlocks.els],
  ['ws_buys', 'Kup {x} vylepšení v dílně', [1]],
  ['run_buys', 'Kup {x} vylepšení v bitvě', [10, 20, 30]],
  ['cl_hits', 'Zasáhni {x} nepřátel řetězovým bleskem', [25, 40, 60, 80], () => save.uw.chainLightning],
  ['dw_kills', 'Zabij {x} nepřátel vlnou smrti', [15, 25, 35, 50], () => save.uw.deathWave],
  ['ps_poison', 'Otrav {x} nepřátel bažinou', [60, 100, 150, 200], () => save.uw.poisonSwamp],
  ['sm_kills', 'Zabij {x} nepřátel raketami', [25, 40, 60, 80], () => save.uw.smartMissiles],
  ['gt_kills', 'Zabij {x} nepřátel během zlaté věže', [50, 75, 100, 150], () => save.uw.goldenTower],
  ['cf_kills', 'Zabij {x} nepřátel zpomalených chrono polem', [50, 75, 100, 150], () => save.uw.chronoField],
  ['ilm_kills', 'Zabij {x} nepřátel vnitřními minami', [15, 25, 35, 50], () => save.uw.innerMines],
  ['sl_kills', 'Zabij {x} nepřátel v reflektoru', [15, 25, 35, 50], () => save.uw.spotlight],
  ['wave_skips', 'Přeskoč celkem {x} vln', [3, 5, 7, 10], () => save.cards.waveSkip],
  ['dr_kills', 'Zabij {x} nepřátel paprskem smrti', [50, 75, 100, 150], () => save.cards.deathRay],
  ['net_hits', 'Zasáhni bosse sítí {x}x', [1, 2, 3, 4, 5], () => save.cards.energyNet],
  ['demon_kills', 'Zabij {x} nepřátel v démonském módu', [40, 60, 80, 100], () => save.cards.demonMode],
  ['cards_bought', 'Kup {x} kartu', [1], () => isFeature('cards')],
];
const MISSION_COINS = [25, 100, 1000, 10000, 25000, 80000, 250000, 500000, 1e6, 3e6, 5e6, 8e6, 15e6, 30e6, 75e6, 150e6, 300e6, 500e6, 750e6, 1.25e9, 2e9, 10e9, 50e9, 100e9];
const MISSION_SHARDS = [1, 3, 5, 8, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105];
// Týdenní boxy: [mise, coiny x, gemy, medaile, kameny, tokeny]
const WEEKLY_BOXES = [[5, 3, 10, 0, 0, 5], [10, 4, 15, 10, 0, 5], [15, 5, 20, 15, 0, 5], [20, 7, 25, 20, 0, 5], [25, 10, 30, 25, 10, 5], [30, 15, 35, 30, 15, 5], [35, 20, 50, 35, 20, 5]];

// ---------- Eventy ----------
const EVENT_EPOCH = Date.UTC(2026, 0, 5); // pondělí; eventy se střídají po 14 dnech
const EVENT_MISSION_DEFS = [
  ['kill_basic', 'Zabij {x} základních nepřátel', [50000, 200000, 900000]],
  ['kill_fast', 'Zabij {x} rychlých nepřátel', [6000, 20000, 150000]],
  ['kill_ranged', 'Zabij {x} střelců', [4000, 15000, 100000]],
  ['kill_boss', 'Zabij {x} bossů', [150, 500, 2500]],
  ['kill_vampire', 'Zabij {x} upírů', [150, 500, 2500]],
  ['kill_scatter', 'Zabij {x} rozptylovačů', [4500, 15000, 75000]],
  ['kill_ray', 'Zabij {x} paprsků', [150, 500, 2500]],
  ['best_wave', 'Dosáhni vlny {x} na libovolném tieru', [600, 2000, 3500]],
  ['gems_tapped', 'Seber {x} plovoucích gemů', [12, 24, 50]],
  ['ws_buys', 'Kup {x} vylepšení v dílně', [50, 150, 400]],
  ['crits', 'Zasáhni {x} nepřátel kritem', [15000, 400000, 30e6]],
  ['free_upgrades', 'Získej {x} free vylepšení', [3000, 6000, 15000]],
  ['mine_hits', 'Zasáhni {x} nepřátel minami', [3000, 10000, 40000]],
  ['orb_kills', 'Zabij {x} nepřátel orby', [1000, 4000, 40000]],
  ['packages', 'Získej {x} léčivých balíčků', [400, 2000, 6000]],
  ['cards_bought', 'Kup {x} karet', [20, 40, 80]],
  ['modules_got', 'Získej {x} modulů', [40, 80, 160]],
  ['dw_kills', 'Zabij {x} nepřátel vlnou smrti', [250, 2500, 25000]],
  ['gt_kills', 'Zabij {x} nepřátel během zlaté věže', [4000, 25000, 250000]],
  ['sl_kills', 'Zabij {x} nepřátel v reflektoru', [5000, 50000, 500000]],
  ['cl_hits', 'Zasáhni {x} nepřátel bleskem', [3000, 20000, 400000]],
  ['sm_kills', 'Zabij {x} nepřátel raketami', [250, 1000, 15000]],
  ['wave_skips', 'Přeskoč celkem {x} vln', [30, 100, 500]],
  ['tourneys', 'Zúčastni se {x} turnajů', [1, 2, 3]],
];
const EVENT_TIER_MEDALS = [10, 15, 20];
const EVENT_RELIC_STEPS = [[350, 0, false], [550, 1, true], [700, 2, false], [1100, 3, true]]; // [medaile, index relikvie, premium]
const EVENT_SHOP_COSTS = [40, 65, 90, 130, 175, 230, 380, 380];
// eventy z wiki (podle relikvií)
const EVENT_NAMES = (() => {
  const out = [];
  for (const r of WIKI.relics) {
    const m = /^Event(?: Premium)?: Earn \d+ medals during(?: the)? "([^"]+)"/i.exec(r[3]);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
})();

// ---------- Relikvie (wiki) ----------
const RELIC_EFFECTS = [
  [/tower damage by ([\d.]+)%/i, 'dmg'], [/tower health by ([\d.]+)%/i, 'hp'], [/coins earned by ([\d.]+)%/i, 'coins'], [/critical factor by ([\d.]+)%/i, 'critFactor'],
  [/Defense Absolute by ([\d.]+)%/i, 'defAbs'], [/damage \/ meter by ([\d.]+)%/i, 'dmgMeter'], [/lab speed by ([\d.]+)%/i, 'labSpeed'], [/ultimate damage by ([\d.]+)%/i, 'uwDmg'],
  [/attack speed by ([\d.]+)%/i, 'atkSpd'], [/health regen by ([\d.]+)%/i, 'regen'], [/cash bonus by ([\d.]+)%/i, 'cash'], [/free attack upgrade by ([\d.]+)%/i, 'freeAtk'],
  [/free defense upgrade by ([\d.]+)%/i, 'freeDef'], [/free utility upgrade by ([\d.]+)%/i, 'freeUtil'], [/recovery amount by ([\d.]+)%/i, 'packAmount'], [/critical chance by ([\d.]+)%/i, 'critChance'],
  [/super critical chance by ([\d.]+)%/i, 'scChance'], [/super critical mult by ([\d.]+)%/i, 'scMult'], [/thorns by ([\d.]+)%/i, 'thorns'], [/orb speed by ([\d.]+)%/i, 'orbSpeed'],
  [/knockback force by ([\d.]+)%/i, 'knockForce'], [/defense percent by ([\d.]+)%/i, 'defPct'], [/bot range by ([\d.]+)m/i, 'botRange'], [/wall rebuild time by ([\d.]+)s/i, 'wallRebuild'],
  [/enemy attack level skip by ([\d.]+)%/i, 'elsAtk'], [/enemy health skip by ([\d.]+)%/i, 'elsHp'], [/rend armor mult by ([\d.]+)%/i, 'rendMult'],
];
const RELICS = WIKI.relics.map((r, i) => {
  const [name, rarity, text, source] = r;
  let eff = null, val = 0;
  for (const [re, k] of RELIC_EFFECTS) { const m = re.exec(text); if (m) { eff = k; val = parseFloat(m[1]); break; } }
  let src = { type: 'other' };
  let m;
  if ((m = /Milestone: Beat Wave 4500 in\s+tier (\d+)/i.exec(source))) src = { type: 'ms', tier: +m[1] };
  else if ((m = /Event( Premium)?: Earn (\d+) medals during(?: the)? "([^"]+)"/i.exec(source))) src = { type: 'event', premium: !!m[1], medals: +m[2], event: m[3] };
  else if ((m = /Purchase: (\d+) medals during(?: the)? "([^"]+)"/i.exec(source))) src = { type: 'eventShop', medals: +m[1], event: m[2] };
  else if (/Tournament/i.test(source)) src = { type: 'tourney' };
  else if ((m = /Guild: Spend (\d+) tokens/i.exec(source))) src = { type: 'guild', tokens: +m[1] };
  else if ((m = /Play for (\d+) year/i.exec(source))) src = { type: 'years', years: +m[1] };
  return { id: 'r' + i, name: name.replace(/Previously known as.*$/, ''), rarity, text, source, eff, val, src };
}).filter(r => r.eff);
const RELIC_EFF_NAMES = { dmg: 'Poškození', hp: 'Zdraví', coins: 'Coiny', critFactor: 'Krit. násobek', defAbs: 'Obrana abs.', dmgMeter: 'Poškození/metr', labSpeed: 'Rychlost labů', uwDmg: 'Poškození zbraní', atkSpd: 'Rychlost útoku', regen: 'Regenerace', cash: 'Cash', freeAtk: 'Free útok', freeDef: 'Free obrana', freeUtil: 'Free utilita', packAmount: 'Léčení balíčku', critChance: 'Krit. šance', scChance: 'Super krit šance', scMult: 'Super krit násobek', thorns: 'Trny', orbSpeed: 'Rychlost orbů', knockForce: 'Síla odhození', defPct: 'Obrana %', botRange: 'Dosah botů', wallRebuild: 'Obnova zdi', elsAtk: 'Přeskok útoku', elsHp: 'Přeskok zdraví', rendMult: 'Rend násobek' };

// ---------- Trezor (Vault, klíče) ----------
const VAULT_POWER_COSTS = [10, 20, 40, 70, 110];
const VAULT_POWER = [
  ['atk', 'dmg', 'Poškození', 5, '%'], ['atk', 'atkSpd', 'Rychlost útoku', 5, '%'], ['atk', 'critChance', 'Krit. šance', 1, '%'], ['atk', 'critFactor', 'Krit. násobek', 5, '%'],
  ['atk', 'dmgMeter', 'Poškození / metr', 5, '%'], ['atk', 'multiChance', 'Multishot šance', 4, '%'], ['atk', 'rapidChance', 'Rapid fire šance', 4, '%'], ['atk', 'bounceChance', 'Odraz šance', 4, '%'],
  ['atk', 'scChance', 'Super krit šance', 2, '%'], ['atk', 'scMult', 'Super krit násobek', 5, '%'], ['atk', 'rendChance', 'Rend šance', 4, '%'], ['atk', 'rendMult', 'Rend násobek', 5, '%'],
  ['def', 'hp', 'Zdraví', 5, '%'], ['def', 'regen', 'Regenerace', 5, '%'], ['def', 'defAbs', 'Obrana absolutní', 5, '%'], ['def', 'thorns', 'Trny', 5, '%'], ['def', 'knockChance', 'Odhození šance', 1, '%'],
  ['def', 'knockForce', 'Odhození síla', 5, '%'], ['def', 'orbSpeed', 'Rychlost orbů', 5, '%'], ['def', 'shockSize', 'Rázová vlna', 5, '%'], ['def', 'deathDefy', 'Vzdor smrti', 2, '%'], ['def', 'wallHp', 'Zdraví zdi', 5, '%'],
  ['util', 'cash', 'Cash bonus', 5, '%'], ['util', 'cashWave', 'Cash / vlna', 100, '%'], ['util', 'coinKill', 'Coiny / zabití', 5, '%'], ['util', 'coinWave', 'Coiny / vlna', 100, '%'],
  ['util', 'freeAtk', 'Free útok', 5, '%'], ['util', 'freeDef', 'Free obrana', 5, '%'], ['util', 'freeUtil', 'Free utilita', 5, '%'], ['util', 'interest', 'Úrok', 100, '%'], ['util', 'packAmount', 'Léčení balíčku', 5, '%'],
  ['uw', 'uwDmg', 'Poškození zbraní', 5, '%'], ['uw', 'clDmg', 'Blesk – poškození', 5, '%'], ['uw', 'smDmg', 'Rakety – poškození', 5, '%'], ['uw', 'dwDmg', 'Vlna smrti – poškození', 5, '%'],
  ['uw', 'ilmDmg', 'Vnitřní miny – poškození', 5, '%'], ['uw', 'gtBonus', 'Zlatá věž – bonus', 1, '%'], ['uw', 'psDmg', 'Bažina – poškození', 5, '%'], ['uw', 'slBonus', 'Reflektor – bonus', 5, '%'], ['uw', 'bhSize', 'Černá díra – velikost', 5, '%'],
];
const VAULT_HARMONY = [
  ['autoRestart', 'Automatický restart runu', 20, 'Po pádu věže se automaticky spustí nový run.'],
  ['adGemStack', 'Hromadění reklamních gemů', 10, 'Reklamní gemy se hromadí až 5x (1 level).'],
  ['cardSlot1', 'Extra slot karty I', 5, '+1 slot karty'], ['cardSlot2', 'Extra slot karty II', 10, '+1 slot karty'], ['cardSlot3', 'Extra slot karty III', 20, '+1 slot karty'],
  ['demonAuto', 'Automatický démonský mód', 10, 'Démonský mód se spustí sám, když je připravený.'], ['smartDemon', 'Chytrý démonský mód', 25, 'Démonský mód zachrání věž před smrtí.'],
  ['nukeAuto', 'Automatická atomovka', 10, 'Atomovka se spustí sama, když je připravená.'], ['smartNuke', 'Chytrá atomovka', 25, 'Atomovka zachrání věž před smrtí.'],
  ['barrageAuto', 'Automatická raketová palba', 10, 'Raketová palba se spustí sama.'],
  ['missionReroll', 'Přehazování misí zdarma', 15, 'Neomezené přehazování denních misí zdarma.'],
  ['enhDisc', 'Sleva vylepšení+', 18, '-20 % cena vylepšení dílny+'],
  ['botRange', 'Dosah botů', 20, '+8m dosah botů'],
];
const VAULT_ENEMY = [['basic', 'Základní'], ['fast', 'Rychlý'], ['tank', 'Tank'], ['ranged', 'Střelec'], ['boss', 'Boss'], ['protector', 'Ochránce']];
const vaultEnemyCost = L => Math.round(25 * Math.pow(1.048, L));

// ---------- Motivy (skiny), pozadí, menu, písně ----------
const TOWER_SKINS = [
  { id: 'neon', name: 'Neon', color: '#3d8bff', shape: 6, src: 'Výchozí' },
  ...[['Shuriken', '#c0c0ff', 4], ['Jin-Jang', '#ffffff', 0], ['Smajlík', '#ffe45e', 0], ['Hvězda', '#ffe45e', 5], ['Ovečka', '#f0f0f0', 8], ['Volské oko', '#ffd23d', 0], ['Želva', '#3dff9e', 6],
    ['Sýr', '#ffcf3d', 3], ['Lebka', '#e6e6e6', 6], ['Strašidelný klaun', '#ff3d6e', 7], ['Strom techniky', '#3dffb0', 6], ['Kaktus', '#4dff6a', 5], ['Nosorožec', '#a0a0b0', 4], ['Atom', '#7df9ff', 0], ['Zatmění', '#ffb000', 0], ['Vír', '#b45cff', 8], ['Vesmír', '#9d7dff', 12]]
    .map(([name, color, shape], i) => ({ id: 'ms' + i, name, color, shape, src: 'ms' })),
  ...[['Rubín', '#ff3d6e', 6], ['Smaragd', '#3dff9e', 6], ['Fialka', '#b45cff', 6], ['Zlato', '#ffb000', 6], ['Led', '#9fe8ff', 8], ['Láva', '#ff6a2a', 5]].map(([name, color, shape], i) => ({ id: 'ev' + i, name, color, shape, src: 'event' })),
];
const SKIN_MS_TIERS = { ms0: 1, ms1: 3, ms2: 4, ms3: 5, ms4: 6, ms5: 7, ms6: 9, ms7: 10, ms8: 12, ms9: 13, ms10: 15, ms11: 16, ms12: 18, ms13: 19, ms14: 21, ms15: 22, ms16: 24 };
const BACKGROUNDS = [
  { id: 'space', name: 'Vesmír', bg: '#0d0f2b', src: 'Výchozí' },
  { id: 'ocean', name: 'Oceán', bg: '#041826' }, { id: 'lava', name: 'Láva', bg: '#1f0806' }, { id: 'forest', name: 'Les', bg: '#06180c' },
  { id: 'night', name: 'Noc', bg: '#120a26' }, { id: 'desert', name: 'Poušť', bg: '#1a1306' }, { id: 'snow', name: 'Sněhová bouře', bg: '#101c2a' },
];
const MENU_THEMES = [{ id: 'm0', name: 'Klasické menu' }, { id: 'm1', name: 'Neonové menu' }, { id: 'm2', name: 'Retro menu' }];
const SONGS = [{ id: 's0', name: 'Synthwave' }, { id: 's1', name: 'Chiptune' }, { id: 's2', name: 'Ambient' }];
const THEME_BONUS = { skin: 0.004, bg: 0.008, menu: 0.006, song: 0.006 };

// ---------- Obchod (ukázka – bez skutečných plateb) ----------
const SHOP_ITEMS = [
  { id: 'starter', name: 'STARTER PACK', color: '#38f2e6', mult: 2, gems: 150, desc: 'x2.0 všech získaných coinů – navždy' },
  { id: 'epic', name: 'EPIC PACK', color: '#ff3dc8', mult: 3, gems: 750, desc: 'x3.0 všech získaných coinů – navždy' },
  { id: 'noAds', name: 'BEZ REKLAM', color: '#38f2e6', mult: 1.5, gems: 0, desc: 'Bonusy už nevyžadují reklamu · x1.5 coin bonus je vždy aktivní' },
];
const GEM_PACKS = [[100, 'Hrst gemů'], [550, 'Váček gemů'], [1200, 'Truhla gemů'], [6500, 'Hora gemů']];
const STONE_PACK = 1000;
const AD_BONUS_MIN = 15;
const AD_GEMS = 6, AD_GEM_COOLDOWN = 10 * 60000, AD_GEMS_PER_DAY = 60, DAILY_FREE_GEMS = 20;

// ---------- Disonance ----------
const DISSO_CATS = [['atk', 'Útok', 5], ['def', 'Obrana', 5], ['util', 'Utilita', 3], ['uw', 'Ultimátní zbraně', 5]];
const dissoBoost = (max, wave) => 1 + (max - 1) * Math.pow(Math.min(wave, 5000) / 5000, 1.75);

// ---------- Systémy odemykané milníky ----------
const FEATURE_MS = {
  labs: [1, 30, 'Laboratoře'], tourney: [1, 60, 'Turnaje'], events: [1, 70, 'Eventy'], guilds: [3, 10, 'Gildy'], modules: [2, 90, 'Moduly'],
  dissonance: [4, 90, 'Disonance'], mastery: [16, 100, 'Mistrovství karet'], assist: [19, 40, 'Asistenční moduly'],
};
