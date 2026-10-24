'use strict';
// ---------- herní engine (simulace runu) ----------
const VIEW_R = 66, SPAWN_R = 80, TOWER_R = 3.2, STEP = 1 / 30, WALL_R = 8.5;
const EBULLET_SPD = 25, MISSILE_SPD = 35;

const game = { run: null, cv: null, ctx: null, cw: 0, ch: 0, dpr: 1, scale: 1, userPaused: false, stars: [], fxQ: [] };

// přiblížení bojiště podle dosahu věže – při menším dosahu jsou věž i nepřátelé větší
function fitScale(snap) {
  const R = game.run;
  const viewR = R && R.S ? Math.min(VIEW_R, Math.max(38, R.S.range * 1.12 + 4)) : VIEW_R;
  const target = Math.min(game.cw, game.ch) / 2 / viewR;
  game.scale = snap || !game.scale ? target : game.scale + (target - game.scale) * 0.08;
  return game.scale;
}

const SNAP_KEYS = ['tier', 'tourney', 'disso', 'bc', 'wave', 'hpLv', 'atkLv', 'time', 'hp', 'cash', 'lv', 'perks', 'perkCount', 'nextPerkWave', 'perkUw', 'perkFirstDone', 'cardsEq', 'uwOff', 'uwToggles',
  'kills', 'coinsEarned', 'cashEarned', 'bossKills', 'gemsEarned', 'stonesEarned', 'cellsEarned', 'card', 'uwT', 'golden', 'chrono', 'speed', 'gemCount', 'gemNext', 'ctr', 'introLeft', 'wallState', 'protCd', 'demonRevengeWave', 'barrageUsed', 'infinity'];

function tierScale(t) {
  // podpora necelých tierů (turnajové ligy)
  const i = Math.floor(t), f = t - i;
  const a = TIERS[clamp(i, 1, 24) - 1], b = TIERS[clamp(i + 1, 1, 24) - 1];
  const lerp = (x, y) => x * Math.pow(y / x, f);
  return { hp: lerp(a.hp, b.hp), dmg: lerp(a.dmg, b.dmg) };
}

function makeRunObj(tier, league, disso) {
  const isT = league !== undefined && league !== null;
  return {
    tier, tourney: isT ? league : null, disso: disso || null, bc: {},
    wave: 1, phase: 'spawn', waveT: 0, spawnAcc: 0, time: 0, hpLv: 1, atkLv: 1,
    hp: 1, cash: 0, lv: {}, perks: {}, perkCount: 0, nextPerkWave: 0, perkChoices: null, perkUw: null, perkFirstDone: false,
    cardsEq: save.cardEquip.slice(), uwOff: {}, uwToggles: 0, uwT: {}, sabotage: {},
    kills: 0, coinsEarned: 0, cashEarned: 0, bossKills: 0, gemsEarned: 0, stonesEarned: 0, cellsEarned: 0, ctr: {},
    atkT: 0, rapidT: 0, shockT: 0, orbA: 0, extraOrbA: 0, spotA: 0, commanderT: 0,
    card: { swUsed: false, swW: 0, demonUsed: false, demonW: 0, demonT: 0, nukeUsed: false, nukeW: 0, invT: 0, es: 0, esT: 0, superT: 0, drT: 0, drOn: 0, drA: 0, drA2: 0, absorbed: 0 },
    golden: 0, goldenKills: 0, comboT: 0, comboMult: 1, chrono: 0, gemCount: 0, gemNext: 0, gem: null,
    enemies: [], bullets: [], ebullets: [], mines: [], ilms: [], fx: [], missiles: [], rings: [], holes: [], swamps: [], botsState: [], chipT: {},
    introLeft: 0, wallState: null, protCd: 0, demonRevengeWave: 0, barrageUsed: false, freeThisWave: 0, pkgBoostT: 0, ampT: 0, annT: 0,
    dwMult: 1, coverT: 0, slMissT: 0, tacT: 0, summonT: 0, scoutT: 0, infinity: 0,
    paused: false, over: false, dirty: false, statT: 0, speed: save.speed || 1,
  };
}

function buildBC(R) {
  if (R.tourney !== null) {
    const lg = LEAGUES[R.tourney];
    const rng = mulberry32(hashStr('bc' + (save.tourney.cur ? save.tourney.cur.id : 0)));
    const pool = TOURNEY_BC_POOL.slice();
    const bc = {};
    for (let i = 0; i < lg.bcs && pool.length; i++) {
      const k = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const s = (R.tourney + 1) / 7;
      bc[k] = { orb: Math.round(60 - 50 * s), dr: Math.round(60 - 50 * s), thorns: Math.round(80 - 60 * s), plasma: Math.round(80 - 60 * s), knock: Math.round(70 - 60 * s), armor: Math.round(10 + 60 * s),
        speed: Math.round(10 + 40 * s), more: Math.round(10 + 40 * s), atkSpd: Math.round(10 + 40 * s), boss: Math.round(10 + 60 * s), mass: Math.round(5 + 50 * s), fast: Math.round(1 + 6 * s) }[k];
    }
    if (R.tourney >= 3) { if (rng() < 0.5) bc.dd = 20 + 10 * R.tourney; else bc.es = 25 * R.tourney; }
    return bc;
  }
  const b = Object.assign({}, TIER_BC[R.tier] || {});
  // laboratoř snižuje sílu podmínek
  const red = labV('bcRed');
  if (red) for (const k in b) {
    if (['orb', 'dr', 'thorns', 'plasma', 'knock'].includes(k)) b[k] = Math.min(100, b[k] + (100 - b[k]) * red);
    else b[k] = b[k] * (1 - red);
  }
  return b;
}

function startRun(tier, league, disso) {
  const R = makeRunObj(tier, league, disso);
  R.bc = buildBC(R);
  R.S = computeStats(R);
  R.hp = R.S.maxHp;
  R.cash = R.S.startCash;
  R.speed = clamp(save.speed || 1, 1, R.S.maxSpeed);
  R.card.es = R.S.energyShield ? R.S.esCharges : 0;
  R.introLeft = R.S.introSprint ? Math.min(R.S.introSprint * ((masteryV('introSprint', R) || 1)), Math.max(0, (save.best[tier] || 0) - 10)) : 0;
  R.nextPerkWave = perkStep(R, 0);
  R.gemNext = 10;
  R.infinity = R.S.uniq.infinity || 0;
  R.wallState = R.S.wallOn ? { hp: R.S.wallHp, max: R.S.wallHp, rebuild: 0, inv: 0 } : null;
  game.run = R;
  game.userPaused = false;
  save.stats.runs++;
  if (tier === 1 && league === undefined) save.stats.t1Runs++;
  track('runs');
  onWaveStart(R);
  writeSave();
  return R;
}

function snapshotRun(R) {
  const o = {};
  for (const k of SNAP_KEYS) o[k] = R[k];
  return JSON.parse(JSON.stringify(o));
}

function restoreRun(snap) {
  const R = makeRunObj(snap.tier, snap.tourney, snap.disso);
  Object.assign(R, snap);
  R.S = computeStats(R);
  R.hp = Math.min(R.hp, R.S.maxHp * Math.max(1, R.S.maxRecovery));
  game.run = R;
  game.userPaused = true;
  return R;
}

function refreshStats(R) {
  const old = R.S;
  R.S = computeStats(R);
  if (old && R.S.maxHp > old.maxHp) R.hp += R.S.maxHp - old.maxHp;
  if (R.wallState && old && R.S.wallHp > R.wallState.max) { R.wallState.hp += R.S.wallHp - R.wallState.max; R.wallState.max = R.S.wallHp; }
  if (!R.wallState && R.S.wallOn) R.wallState = { hp: R.S.wallHp, max: R.S.wallHp, rebuild: 0, inv: 0 };
  R.speed = clamp(R.speed, 1, R.S.maxSpeed);
}

// ---------- hlavní smyčka ----------
// Na vysokých rychlostech (až 500×) by simulace zahltila snímek – každý tick má časový rozpočet,
// nestihnutý zbytek se přenese do dalšího (max. 0,5 s reálného času), takže prohlížeč nezamrzne.
function tick(realDt, budgetMs = 10) {
  const R = game.run;
  if (!R || R.over) return;
  if (R.dirty || (R.statT += realDt) > 1) { refreshStats(R); R.statT = 0; R.dirty = false; }
  if (R.paused || game.userPaused) { R.simDebt = 0; return; }
  save.stats.playTime += realDt;
  const want = realDt * R.speed;
  let gdt = want + (R.simDebt || 0);
  const t0 = performance.now();
  let done = 0;
  const stepLen = R.speed >= 100 ? STEP * 1.5 : STEP; // od 100× delší krok = o třetinu méně výpočtů
  while (gdt > 1e-6 && !R.over && !R.paused) {
    const d = Math.min(stepLen, gdt);
    step(R, d);
    gdt -= d; done += d;
    if (performance.now() - t0 > budgetMs) break;
  }
  R.simDebt = R.paused || R.over ? 0 : Math.min(Math.max(0, gdt), R.speed * 0.5);
  // skutečně dosažená rychlost (vyhlazená) pro HUD
  if (realDt > 0) R.effSpeed = (R.effSpeed || R.speed) * 0.9 + (done / realDt) * 0.1;
}

function step(R, dt) {
  const S = R.S;
  R.time += dt;
  R.waveT += dt;
  if (R.phase === 'spawn') {
    R.spawnAcc += dt;
    const iv = spawnInterval(R);
    while (R.spawnAcc >= iv) { R.spawnAcc -= iv; spawnNormal(R); }
    if (R.waveT >= WAVE_SPAWN) { R.phase = 'cool'; R.waveT = 0; }
  } else if (R.waveT >= waveCooldown(R)) {
    endWave(R);
    if (R.over) return;
    R.phase = 'spawn'; R.waveT = 0; R.spawnAcc = 0;
    onWaveStart(R);
  }

  updateCards(R, dt);
  // regenerace (upír a trade-off ji blokují)
  const vamp = R.enemies.some(e => e.draining);
  if (!vamp) {
    const cap = S.maxHp * (S.uniq.wormhole ? Math.max(1, S.maxRecovery * S.uniq.wormhole / 100) : 1);
    if (R.hp < cap) R.hp = Math.min(cap, R.hp + S.regen * dt);
  }
  if (R.wallState) updateWall(R, dt);
  if (R.rapidT > 0) R.rapidT -= dt;
  if (R.pkgBoostT > 0) R.pkgBoostT -= dt;
  if (R.ampT > 0) R.ampT -= dt;

  // střelba věže
  if (!R.stunTower || (R.stunTower -= dt) <= 0) {
    R.atkT += dt * S.atkSpeed * (R.rapidT > 0 ? 4 : 1) * (R.pkgBoostT > 0 ? 1.5 : 1);
    let guard = 0;
    while (R.atkT >= 1 && guard++ < 50) {
      if (!fire(R)) { R.atkT = 1; break; }
      R.atkT -= 1;
    }
  }

  updateProtectors(R);
  updateBullets(R, dt);
  updateEnemies(R, dt);
  updateEnemyBullets(R, dt);
  updateOrbs(R, dt);
  updateShock(R, dt);
  updateMines(R, dt);
  updateUW(R, dt);
  updateBots(R, dt);
  updateChips(R, dt);
  updateFx(R, dt);
  updateGem(R, dt);

  if (R.enemies.some(e => e.dead)) R.enemies = R.enemies.filter(e => !e.dead);
  if (R.bullets.some(b => b.dead)) R.bullets = R.bullets.filter(b => !b.dead);

  if (!R.perkChoices && R.tourney === null && S && isFeature('perks') && R.wave >= R.nextPerkWave) offerPerks(R);
}

const spawnInterval = R => Math.max(0.3, 1.3 - 0.007 * Math.min(R.wave, 140)) / (1 + (R.bc.more || 0) / 100) / (R.summonT > 0 ? 2 : 1);
const waveCooldown = R => WAVE_COOLDOWN * (1 - R.S.waveAccel) * (R.tourney !== null ? 0.5 : 1);
const isBossWave = (R, w) => w % (R.tourney !== null ? LEAGUES[R.tourney].boss : TIERS[R.tier - 1].bossEvery) === 0;

// ---------- vlny ----------
function onWaveStart(R) {
  const S = R.S;
  R.freeThisWave = 0;
  // přeskok vlny (karta) – může se řetězit
  while (S.waveSkip > 0 && R.wave > 1 && Math.random() < S.waveSkip) {
    skipWave(R, 1);
    if (!(S.doubleSkip > 0 && Math.random() < S.doubleSkip)) break;
  }
  if (isBossWave(R, R.wave) || R.introLeft > 0) spawnSpecial(R, 'boss');
  // ochránce (od tieru 2)
  const pc = R.tourney !== null ? 8 : TIERS[R.tier - 1].protectorCd;
  if (pc && --R.protCd <= 0 && Math.random() < 0.5) { spawnSpecial(R, 'protector'); R.protCd = pc; }
  // elity podle tabulky wiki
  const base = R.tourney !== null ? ELITE_BASE[Math.min(23, Math.round(LEAGUES[R.tourney].eq) - 1)] : TIERS[R.tier - 1].eliteBase;
  const steps = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16];
  const chance = k => { let c = 0; steps.forEach((m, i) => { if (R.wave >= m * base + k * base * 15) c = Math.pow(i + 1, 2) / 100; }); return c; };
  if (Math.random() < chance(0)) spawnSpecial(R, pick(['vampire', 'ray', 'scatter']));
  if (Math.random() < chance(1)) spawnSpecial(R, pick(['vampire', 'ray', 'scatter']));
  // flotily
  const fs = FLEET_SCHEDULE[R.tier];
  let fleets = 0;
  if (R.tourney === null) {
    if (fs && R.wave >= fs[0] && (R.wave - fs[0]) % fs[1] === 0) fleets = fs[2];
    const low = fleetLowTier(R.tier);
    if (R.wave >= low && (R.wave - low) % 100 === 0) fleets++;
  } else if (R.tourney >= 5 && R.wave >= 895 && (R.wave - 895) % 30 === 0) fleets = 1;
  for (let i = 0; i < fleets; i++) spawnFleet(R);
  if (R.tourney === null && !R.disso) updateBest(R);
}

function skipWave(R, n) {
  const S = R.S;
  for (let i = 0; i < n; i++) {
    R.wave++;
    R.hpLv++; R.atkLv++;
    addCash(R, S.cashWave * S.cashMult);
    if (S.coinWave > 0 && !R.introLeft) addCoins(R, S.coinWave * S.coinMult);
    rollFreeUpgrades(R);
    track('wave_skips');
  }
  fxText(R, 0, -10, 'PŘESKOK VLNY', '#c45cff');
}

function endWave(R) {
  const S = R.S;
  track('waves');
  addCash(R, S.cashWave * S.cashMult);
  if (S.interest > 0) addCash(R, Math.min(R.cash * S.interest, S.maxInterest * Math.max(1, R.wave / 10)));
  if (S.coinWave > 0 && !R.introLeft) addCoins(R, S.coinWave * S.coinMult);
  if (S.packOn && Math.random() < S.packChance) givePackage(R);
  rollFreeUpgrades(R);
  // přeskok úrovně nepřátel
  const inc = R.introLeft > 0 ? 10 : 1;
  if (Math.random() < S.elsHp) { track('els'); fxText(R, -8, -14, 'HP SKIP', '#9dff3d', 0.8); } else R.hpLv += inc;
  if (Math.random() < S.elsAtk) { track('els'); fxText(R, 8, -14, 'ATK SKIP', '#9dff3d', 0.8); } else R.atkLv += inc;
  R.wave += inc;
  if (R.introLeft > 0) R.introLeft = Math.max(0, R.introLeft - inc);
  // dobíjení karet po vlnách
  for (const k of ['sw', 'demon', 'nuke']) if (R.card[k + 'W'] > 0) R.card[k + 'W'] -= inc;
  if (R.card.swW <= 0 && R.card.swUsed && S.recharge.secondWind) R.card.swUsed = false;
  if (R.card.demonW <= 0 && R.card.demonUsed && S.recharge.demonMode) R.card.demonUsed = false;
  if (R.card.nukeW <= 0 && R.card.nukeUsed && S.recharge.nuke) R.card.nukeUsed = false;
  // úbytek mincí a nárůst hmotnosti přeživších nepřátel
  for (const e of R.enemies) e.mass *= 1.04 + (R.bc.mass || 0) / 100;
}

function rollFreeUpgrades(R) {
  const S = R.S;
  for (const cat of ['atk', 'def', 'util']) {
    let ch = S.free[cat];
    while (ch > 0) {
      if (Math.random() < ch) {
        const opts = STAT_DEFS.filter(d => d.cat === cat && statUnlocked(d) && statLevel(d.id, R) < d.max + (R.infinity && ['damage', 'health', 'regen'].includes(d.id) ? R.infinity : 0)
          && !(S.uniq.bhDigestor && d.id === 'range'));
        if (opts.length) {
          const d = pick(opts);
          R.lv[d.id] = (R.lv[d.id] || 0) + 1;
          R.dirty = true;
          R.freeThisWave++;
          track('free_upgrades');
        }
      }
      ch -= 1;
    }
  }
}

function givePackage(R, mult = 1) {
  const S = R.S;
  const cap = S.maxHp * S.maxRecovery;
  if (R.hp < cap) R.hp = Math.min(cap, R.hp + S.maxHp * S.packAmount * mult);
  fxText(R, 0, -6, '+HP', '#4dff9a');
  track('packages');
  if (S.uniq.galaxy) for (const id in R.uwT) if (id !== 'poisonSwamp') R.uwT[id] = Math.max(0, R.uwT[id] - S.uniq.galaxy);
  if (S.uniq.restorative) R.pkgBoostT = S.uniq.restorative;
}

function perkStep(R, n) {
  // vlny potřebné na další perk (wiki: 200, po 20/30/40 perkách 250/300/350; lab a perk snižují)
  const base = n < 20 ? 200 : n < 30 ? 250 : n < 40 ? 300 : 350;
  const req = Math.max(5, Math.floor((base + labV('perkWaves')) * (R.S ? R.S.perkWaveMult : 1)));
  return (R.nextPerkWave || 0) + req;
}

function offerPerks(R) {
  const S = R.S;
  const owned = Object.keys(S.uw);
  const nOpt = 2 + labV('perkOptions');
  const bans = save.perkCfg.bans || [];
  const avail = p => (R.perks[p.id] || 0) < p.max && !bans.includes(p.id) && (!p.need || save.unlocks[p.need])
    && (p.type !== 'uw' || owned.includes(p.uw)) && (p.id !== 'randomUw' || UW_DEFS.some(u => !save.uw[u.id] && u.id !== R.perkUw));
  const choices = [];
  if (!R.perkFirstDone && save.labs.firstPerk && save.perkCfg.first && avail(PERK_MAP[save.perkCfg.first])) choices.push(save.perkCfg.first);
  let guard = 0;
  while (choices.length < nOpt && guard++ < 100) {
    const r = Math.random();
    const hasUw = PERK_DEFS.some(p => p.type === 'uw' && avail(p) && !choices.includes(p.id));
    const type = hasUw ? (r < 0.2 ? 'uw' : r < 0.32 ? 'trade' : 'std') : (r < 0.15 ? 'trade' : 'std');
    const opts = PERK_DEFS.filter(p => p.type === type && avail(p) && !choices.includes(p.id));
    if (opts.length) choices.push(pick(opts).id);
    else if (!PERK_DEFS.some(p => avail(p) && !choices.includes(p.id))) break;
  }
  R.perkFirstDone = true;
  if (!choices.length) { R.nextPerkWave = perkStep(R, R.perkCount + 1); return; }
  if (R.randomUwPick === undefined) R.randomUwPick = pick(UW_DEFS.filter(u => !save.uw[u.id]).map(u => u.id).concat([null]).filter(Boolean)) || null;
  R.perkChoices = choices;
  // automatický výběr perků (lab)
  if (save.labs.autoPerk && save.perkCfg.auto) {
    const rank = save.perkCfg.ranking || [];
    const best = choices.slice().sort((a, b) => (rank.indexOf(a) + 1 || 999) - (rank.indexOf(b) + 1 || 999))[0];
    choosePerk(R, best);
    return;
  }
  R.paused = true;
  if (typeof showPerkModal === 'function') showPerkModal(R);
}

function choosePerk(R, id) {
  R.perks[id] = (R.perks[id] || 0) + 1;
  R.perkCount++;
  R.perkChoices = null;
  R.paused = false;
  if (id === 'randomUw') R.perkUw = R.randomUwPick || pick(UW_DEFS.filter(u => !save.uw[u.id])).id;
  R.nextPerkWave = perkStep(R, R.perkCount);
  refreshStats(R);
}

function updateBest(R) {
  const t = R.tier;
  if (R.wave > (save.best[t] || 0)) save.best[t] = R.wave;
  if (t === save.maxTier && t < 24 && R.wave >= TIERS[t - 1].unlockWave) {
    // tier se odemyká přes milník – stačí dosáhnout, odemkne se při převzetí
  }
  for (const w of MS_WAVES) {
    const key = msKey(t, w);
    if (R.wave >= w && !save.msReached[key]) {
      save.msReached[key] = true;
      if (typeof onMilestoneReached === 'function') onMilestoneReached(t, w);
    }
  }
}

// ---------- nepřátelé ----------
function pickNormal(R) {
  const w = R.wave;
  const opts = [['basic', 1]];
  if (w >= 3) opts.push(['fast', Math.min(0.35, 0.1 + w * 0.004)]);
  if (w >= 8) opts.push(['tank', Math.min(0.25, 0.06 + w * 0.002)]);
  if (w >= 15) opts.push(['ranged', Math.min(0.25, 0.06 + w * 0.002)]);
  return weighted(opts);
}

function enemyScale(R) {
  const ts = R.tourney !== null ? tierScale(LEAGUES[R.tourney].eq) : TIERS[R.tier - 1];
  const hl = R.hpLv, al = R.atkLv;
  const tm = R.tourney !== null ? 1.15 : 1; // turnaj = tier+ (rychlejší škálování)
  return {
    hp: ts.hp * (1 + 0.07 * hl) * Math.pow(1.024 * tm, hl),
    dmg: ts.dmg * (1 + 0.05 * al) * Math.pow(1.02 * tm, al),
  };
}

function makeEnemy(R, type, x, y, opts = {}) {
  const T = ENEMY_TYPES[type], S = R.S;
  const sc = opts.scale || enemyScale(R);
  let hp = BASE_HP * T.hp * sc.hp * S.enemyHpMult * S.eHp[type];
  let dmg = BASE_DMG * T.dmg * sc.dmg * S.enemyDmgMult * S.eAtk[type];
  let spd = BASE_SPD * T.spd * S.enemySpdMult * (1 + (R.bc.speed || 0) / 100);
  if (T.boss) { hp *= S.bossHpMult * (1 + (R.bc.boss || 0) / 100); spd *= S.bossSpdMult; }
  if (type === 'fast') spd *= S.fastSpd * (R.wave > 750 ? 1.85 : 1);
  if (type === 'ranged') dmg *= S.rangedDmgMult;
  if (type === 'scatter' && R.bc.scatter) hp *= 1 + R.bc.scatter / 100;
  if (type === 'overcharge') dmg = BASE_DMG * TIERS[R.tier - 1].dmg * 1.2;
  const e = {
    type, x, y, r: T.r, hp, maxHp: hp, dmg, spd, mass: 1, heat: 1,
    cash: T.cash * (1 + 0.03 * Math.min(R.wave, 500)), coin: T.coin,
    atkT: 0, rot: rand(0, 6.28), boss: !!T.boss, elite: !!T.elite, fleet: !!T.fleet, gen: 0, orbCd: 0, dead: false,
    spawnWave: R.wave, armor: R.bc.armor ? Math.round(R.bc.armor) : 0, rend: 1, shock: 1, stun: 0, slowT: 0, netT: 0, burnT: 0, prot: false,
    plasmaDone: false, netDone: false, poisoned: false, dwHit: false, bounty: 1, cmdStacks: 0, ocMult: 1, miss: 0, debuff: 0,
  };
  if (S.critCoin > 0 && type === 'basic' && Math.random() < S.critCoin) e.critCoin = true;
  if (S.uniq.deathPenalty && !e.boss && !e.fleet && Math.random() < S.uniq.deathPenalty / 100) e.marked = true;
  return e;
}

function spawnAt(R, type, opts) {
  const a = rand(0, Math.PI * 2);
  const e = makeEnemy(R, type, Math.cos(a) * SPAWN_R, Math.sin(a) * SPAWN_R, opts);
  R.enemies.push(e);
  return e;
}

function spawnNormal(R) {
  const normals = R.enemies.filter(e => !e.boss && !e.elite && !e.fleet).length;
  if (normals >= 120) return;
  const type = pickNormal(R);
  const e = spawnAt(R, type);
  if (R.bc.fast && type === 'fast') e.spd *= 1.2;
  // Rovnováha nepřátel: 80 % šance na druhého základního
  if (type === 'basic' && R.S.enemyBalance && Math.random() < 0.8) spawnAt(R, 'basic');
}

function spawnSpecial(R, type) {
  const e = spawnAt(R, type);
  if (type === 'boss' && R.bc.boss) e.hp = e.maxHp * (1 + R.bc.boss / 100);
  return e;
}

function spawnFleet(R) {
  const type = pick(['saboteur', 'commander', 'overcharge']);
  const lead = spawnSpecial(R, type);
  const n = randInt(10, 15);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(lead.y, lead.x) + rand(-0.3, 0.3);
    R.enemies.push(makeEnemy(R, FLEET_COMPANION[type], Math.cos(a) * (SPAWN_R + rand(0, 8)), Math.sin(a) * (SPAWN_R + rand(0, 8))));
  }
  fxText(R, 0, -20, 'FLOTILA: ' + ENEMY_TYPES[type].name.toUpperCase(), ENEMY_TYPES[type].color, 2);
}

function nearestEnemy(R, x, y, maxD, exclude) {
  let best = null, bd = maxD * maxD;
  for (const e of R.enemies) {
    if (e.dead || (exclude && exclude.has(e))) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function updateProtectors(R) {
  const prots = R.enemies.filter(e => e.type === 'protector' && !e.dead);
  for (const e of R.enemies) e.prot = false;
  if (!prots.length) return;
  const rad = ENEMY_TYPES.protector.shield * R.S.protRadius;
  for (const p of prots) for (const e of R.enemies) if (e !== p && !e.prot && Math.hypot(e.x - p.x, e.y - p.y) < rad) e.prot = true;
}

function canInstaKill(e) { return !e.boss && !e.elite && !e.fleet && !e.prot; }

function updateEnemies(R, dt) {
  const S = R.S;
  const wallUp = R.wallState && R.wallState.hp > 0;
  const cfR = S.uw.chronoField ? S.range * (S.uw.chronoField.radius || 1) : 0;
  const plus = save.uwPlus;
  for (const e of R.enemies) {
    if (e.dead) continue;
    const T = ENEMY_TYPES[e.type];
    const d = Math.hypot(e.x, e.y) || 0.001;
    if (e.stun > 0) { e.stun -= dt; continue; }
    if (e.netT > 0) { e.netT -= dt; continue; }
    if (e.acT > 0) e.acT -= dt;
    // plazmové dělo / energetická síť – když boss vstoupí do dosahu
    if (e.boss && d - e.r <= S.range) {
      if (S.plasma > 0 && !e.plasmaDone) { e.plasmaDone = true; damageEnemy(R, e, e.maxHp * S.plasma * ((R.bc.plasma || 100) / 100), { src: 'plasma' }); R.fx.push({ k: 'beam', x: e.x, y: e.y, color: '#ff8cff', life: 0.4, max: 0.4, w: 4 }); if (e.dead) continue; }
      if (S.energyNet > 0 && !e.netDone) { e.netDone = true; e.netT = S.energyNet; track('net_hits'); }
    }
    let slow = 0;
    if (R.chrono > 0 && d <= cfR) { slow = Math.max(slow, S.uw.chronoField.slow * (e.fleet ? 0.5 : 1)); e.inCF = true; } else e.inCF = false;
    if (S.slowAura > 0 && d <= S.range) slow = Math.max(slow, S.slowAura);
    if (e.slowT > 0) { e.slowT -= dt; slow = Math.max(slow, e.slowV || 0); }
    if (e.inSwamp) slow = Math.max(slow, 0.25);
    if (e.boss) slow *= 0.5;
    slow = Math.min(0.9, slow);
    if (e.debuff) slow = Math.max(slow, e.debuff);
    e.rot += dt * (e.type === 'fast' ? 0 : 0.8);
    if (e.orbCd > 0) e.orbCd -= dt;
    let stop = T.stop ? (e.type === 'ranged' ? S.rangedStop : T.stop) : TOWER_R + e.r;
    if (wallUp && !T.stop) stop = WALL_R + e.r;
    const spd = e.spd * (1 - slow) * (1 + (e.cmdStacks ? Math.pow(1.15, e.cmdStacks) - 1 : 0));
    // chrono smyčka (UW+): tangenciální pohyb
    if (e.inCF && plus.chronoField !== undefined && !e.boss) {
      const w = (0.2 + 0.1 * plus.chronoField) * dt, ca = Math.cos(w), sa = Math.sin(w);
      const nx = e.x * ca - e.y * sa; e.y = e.x * sa + e.y * ca; e.x = nx;
    }
    if (d > stop + 0.01) {
      const mv = Math.min(spd * dt, d - stop);
      e.x -= e.x / d * mv; e.y -= e.y / d * mv;
      e.atkT = Math.min(e.atkT, (T.rate / atkSpdMult(R)) * 0.5);
    } else {
      e.atkT += dt * atkSpdMult(R) * (e.type === 'ray' && R.bc.ray ? 1 + R.bc.ray / 100 : 1) * (e.type === 'vampire' && R.bc.vamp ? 1 + R.bc.vamp / 100 : 1);
      if (e.atkT >= T.rate) { e.atkT = 0; enemyAttack(R, e, T, wallUp && !T.stop); }
    }
    if (e.draining && d > (T.stop || 0) + 1) e.draining = false;
  }
  // velitel – pulz posiluje okolní nepřátele
  R.commanderT += dt;
  if (R.commanderT > 5) {
    R.commanderT = 0;
    for (const c of R.enemies) {
      if (c.type !== 'commander' || c.dead) continue;
      R.fx.push({ k: 'ring', x: c.x, y: c.y, r: 15, color: '#9dff3d', life: 0.6, max: 0.6 });
      for (const e of R.enemies) if (!e.boss && e !== c && e.cmdStacks < 8 && Math.hypot(e.x - c.x, e.y - c.y) < 15) { e.cmdStacks++; e.hp *= 1.15; e.maxHp *= 1.15; e.mass *= 1.15; }
    }
  }
}
const atkSpdMult = R => 1 + (R.bc.atkSpd || 0) / 100;

function enemyAttack(R, e, T, hitsWall) {
  const S = R.S;
  if (e.miss > 0 && Math.random() < e.miss) return;
  const dmgMul = (e.burnT > 0 ? 1 - e.burnRed : 1) * (e.inCF && save.labs.cfDmgRed ? 1 - (S.uw.chronoField ? labV('cfRed') : 0) : 1) * (e.inBH && S.uniq.primordial ? 1 - S.uniq.primordial / 100 : 1) * (1 - (e.debuff || 0));
  switch (T.atk) {
    case 'melee':
      e.heat *= 1.04;
      if (hitsWall) hurtWall(R, e.dmg * e.heat * dmgMul, e);
      else hurtTower(R, e.dmg * e.heat * dmgMul, e);
      break;
    case 'shoot':
      if (e.inBH && save.labs.bhDisable) break;
      R.ebullets.push({ x: e.x, y: e.y, dmg: e.dmg * dmgMul, color: T.color, src: e });
      break;
    case 'drain':
      // upír: 2 % max. HP věže za sekundu, blokuje regeneraci
      e.draining = true;
      hurtTower(R, R.S.maxHp * 0.01, null, true);
      if (S.thorns > 0 && labV('garlic')) damageEnemy(R, e, e.maxHp * labV('garlic'), { src: 'thorns' });
      R.fx.push({ k: 'beam', x: e.x, y: e.y, color: '#ff2a2a', life: 0.3, max: 0.3 });
      break;
    case 'ray':
      hurtTower(R, BASE_DMG * enemyScale(R).dmg * 2 * dmgMul, null);
      R.fx.push({ k: 'beam', x: e.x, y: e.y, color: '#fff36b', life: 0.6, max: 0.6, w: 3 });
      break;
    case 'sabotage': {
      if (hitsWall) break;
      hurtTower(R, e.dmg * dmgMul, e);
      const owned = Object.keys(R.S.uw);
      if (owned.length) { const id = pick(owned); R.sabotage[id] = (R.sabotage[id] || 0) + 1; R.dirty = true; fxText(R, 0, -10, 'SABOTÁŽ: ' + UW_MAP[id].name, '#ff8c1a'); }
      break;
    }
    case 'overcharge':
      R.ebullets.push({ x: e.x, y: e.y, dmg: e.dmg * e.ocMult, color: '#3dd5ff', src: e, oc: true });
      e.ocMult *= 1.4 + (R.bc.oc || 0);
      break;
  }
}

function updateEnemyBullets(R, dt) {
  for (const b of R.ebullets) {
    if (b.returning) {
      const s = b.src;
      if (!s || s.dead) { b.dead = true; continue; }
      const dx = s.x - b.x, dy = s.y - b.y, d = Math.hypot(dx, dy);
      if (d < 1.5) { b.dead = true; continue; }
      b.x += dx / d * EBULLET_SPD * dt; b.y += dy / d * EBULLET_SPD * dt;
      continue;
    }
    const d = Math.hypot(b.x, b.y);
    const mv = EBULLET_SPD * dt;
    const wallUp = R.wallState && R.wallState.hp > 0;
    const target = wallUp ? WALL_R : TOWER_R;
    if (d <= mv + target) {
      if (wallUp) hurtWall(R, b.dmg, b.src); else hurtTower(R, b.dmg, b.src);
      if (b.oc) { b.returning = true; continue; }
      b.dead = true; continue;
    }
    b.x -= b.x / d * mv; b.y -= b.y / d * mv;
  }
  if (R.ebullets.some(b => b.dead)) R.ebullets = R.ebullets.filter(b => !b.dead);
}

// ---------- poškození nepřátel a odměny ----------
function damageEnemy(R, e, dmg, o = {}) {
  if (e.dead || dmg <= 0) return;
  if (e.prot && e.type !== 'protector') dmg *= 1 - R.S.protRed;
  if (e.dwHit && R.S.uw.deathWave) dmg *= 1 + labV('dwAmp');
  if (e.acT > 0) dmg *= R.S.uniq.antiCube || 1;
  e.hp -= dmg;
  e.flash = 0.09;
  if (o.src) e.lastSrc = o.src;
  if (e.hp <= 0) killEnemy(R, e);
}

function killEnemy(R, e) {
  if (e.dead) return;
  e.dead = true;
  const S = R.S, T = ENEMY_TYPES[e.type];
  R.kills++;
  save.stats.kills++;
  track('kill_' + e.type);
  if (e.lastSrc) track(e.lastSrc + '_kills');
  if (R.golden > 0) { track('gt_kills'); R.goldenKills++; }
  if (e.inCF) track('cf_kills');
  if (R.card.demonT > 0) track('demon_kills');
  const inSpot = spotlit(R, e);
  if (inSpot) track('sl_kills');
  // cash
  const gm = R.golden > 0 && S.uw.goldenTower ? S.uw.goldenTower.mult : 1;
  const combo = R.comboT > 0 ? R.comboMult : 1;
  if (!S.noKillCash) addCash(R, e.cash * S.cashMult * gm * combo * (S.enemyBalance || 1) * (R.summonT > 0 ? R.summonCash || 1 : 1));
  // coiny
  if (!R.introLeft) {
    let c = e.coin * S.coinKill * S.coinMult * gm * combo * e.bounty;
    if (e.critCoin) c += S.coinKill * S.coinMult * (Math.random() < S.critCoinDouble ? 2 : 1);
    if (e.dwHit) c *= labV('dwCoin');
    if (e.lastSrc === 'bh') c *= labV('bhCoin');
    if (inSpot) c *= labV('slCoin');
    if (S.uniq.bhDigestor && R.freeThisWave) c *= 1 + S.uniq.bhDigestor / 100 * R.freeThisWave;
    for (const b of R.botsState) if (b.id === 'golden' && b.active > 0 && Math.hypot(e.x - b.x, e.y - b.y) < b.range) c *= b.bonus;
    if (R.wave - e.spawnWave >= 3) c *= 0.5; // úbytek mincí
    addCoins(R, c);
  }
  R.fx.push({ k: 'burst', x: e.x, y: e.y, r: e.r, color: T.color, life: 0.35, max: 0.35, big: e.boss || e.fleet, gold: R.golden > 0 });
  // elity → buňky
  if (e.elite) {
    const cells = (1 + (S.cellsFlat || 0)) * (e.dwHit ? labV('dwCell') : 1);
    save.cells += cells; R.cellsEarned += cells;
  }
  if (e.boss) {
    R.bossKills++; save.stats.bosses++;
    if (Math.random() < 0.15) { const n = (save.maxTier >= 2 ? [1, 3, 5, 8, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105][R.tier - 1] : 1) + labV('rerollShards'); save.shards.reroll += n; fxText(R, e.x, e.y - 6, '+' + n + ' ⟳', '#8fd3ff'); }
    if (isFeature('modules')) {
      if (Math.random() < 0.02 + labV('modCommon')) { dropModule(0); fxText(R, e.x, e.y - 9, 'MODUL!', '#b8c0ff'); }
      else if (Math.random() < 0.005 + labV('modRare')) { dropModule(1); fxText(R, e.x, e.y - 9, 'VZÁCNÝ MODUL!', '#4d8dff'); }
    }
    if (S.packAfterBoss) givePackage(R);
  }
  if (e.fleet) {
    if (Math.random() < 0.8) { const n = R.tier >= 15 ? 1200 + (R.tier - 15) * 160 : 1080; save.shards.reroll += n; }
    else { const k = pick(['cannon', 'armor', 'generator', 'core']); save.shards[k] += 5 + Math.floor(R.wave / 250); }
    // sabotér vrací úrovně zbraní
    if (e.type === 'saboteur') { R.sabotage = {}; R.dirty = true; }
  }
  if ((e.boss || e.elite || e.fleet) && S.uniq.ampStrike) R.ampT = S.uniq.ampStrike;
  // miny ze zabitých nepřátel
  if (S.mineOn && R.mines.length < 30 && Math.random() < S.mineChance) {
    if (S.uniq.spaceDisplacer && Math.random() < S.uniq.spaceDisplacer / 100 && R.ilms.length < 20) R.ilms.push({ a: Math.atan2(e.y, e.x), r: Math.min(14, Math.hypot(e.x, e.y)), dmg: 30, charge: 0 });
    else R.mines.push({ x: e.x, y: e.y, life: S.mineDecay });
  }
  // rozptylovač se dělí 4x
  if (e.type === 'scatter' && e.gen < 4) {
    const frac = [1, 1 / 4, 1 / 9, 1 / 16][e.gen];
    for (let k = 0; k < 2; k++) {
      const c = makeEnemy(R, 'scatter', e.x + rand(-2, 2), e.y + rand(-2, 2));
      c.gen = e.gen + 1;
      c.r = e.r * 0.8;
      c.maxHp = c.hp = BASE_HP * enemyScale(R).hp * frac * (1 + (R.bc.scatter || 0) / 100);
      c.cash = e.cash * 0.5; c.coin = e.coin * 0.5; c.elite = c.gen === 4;
      R.enemies.push(c);
    }
  }
}

function addCash(R, v) { if (v > 0) { R.cash += v; R.cashEarned += v; } }
function addCoins(R, v) { if (v > 0) { save.coins += v; R.coinsEarned += v; save.stats.coins += v; } }

function dropModule(rarity) {
  if (typeof newModule === 'function') { save.modules.push(newModule(rarity)); track('modules_got'); }
}

// ---------- věž a zeď dostávají poškození ----------
function hurtWall(R, raw, src) {
  const S = R.S, w = R.wallState;
  if (w.inv > 0) return;
  const d = Math.max(0, raw * (1 - S.defPct) - S.defAbs);
  w.hp -= d;
  if (src && S.wallThorns) damageEnemy(R, src, src.maxHp * S.wallThorns * (src.boss ? 0.5 : 1), { src: 'thorns' });
  if (src && S.thorns > 0) damageEnemy(R, src, src.maxHp * S.thorns * (src.boss ? 0.5 : 1) * ((R.bc.thorns || 100) / 100), { src: 'thorns' });
  if (w.hp <= 0) { w.hp = 0; w.rebuild = S.wallRebuild; fxText(R, 0, -12, 'ZEĎ PADLA', '#ff4d6d'); }
}

function updateWall(R, dt) {
  const S = R.S, w = R.wallState;
  if (w.inv > 0) w.inv -= dt;
  if (w.hp <= 0) {
    w.rebuild -= dt;
    if (w.rebuild <= 0) {
      w.max = S.wallHp; w.hp = w.max; w.inv = S.wallInv;
      // obnova zdi odsune nepřátele ven
      for (const e of R.enemies) { const d = Math.hypot(e.x, e.y) || 1; if (d < WALL_R + e.r) { e.x = e.x / d * (WALL_R + e.r + 0.5); e.y = e.y / d * (WALL_R + e.r + 0.5); } }
    }
  } else if (S.wallRegen) w.hp = Math.min(w.max, w.hp + w.max * S.wallRegen / 60 * dt);
}

function hurtTower(R, raw, src, isDrain) {
  if (R.over) return;
  const S = R.S;
  if (R.card.invT > 0 || R.card.demonT > 0) return;
  // energetický štít
  if (S.energyShield && R.card.es > 0 && !isDrain && !(save.vault.harmony.esRestrict)) {
    R.card.es--; track('shield_saves');
    R.fx.push({ k: 'shield', life: 0.5, max: 0.5 });
    return;
  }
  const d = isDrain ? raw : Math.max(0, raw * (1 - S.defPct) - S.defAbs);
  R.hp -= d;
  R.card.absorbed += d;
  if (d > 0) { R.hitFlash = 0.15; R.noDmgWaves = 0; }
  if (src && S.thorns > 0 && !src.dead) damageEnemy(R, src, src.maxHp * S.thorns * (src.boss ? 0.5 : 1) * ((R.bc.thorns || 100) / 100), { src: 'thorns' });
  if (R.hp <= 0) deathSaves(R);
}

function deathSaves(R) {
  const S = R.S;
  const dd = S.deathDefy * (1 - (R.bc.dd || 0) / 100);
  if (Math.random() < dd) { R.hp = 1; fxText(R, 0, -8, 'VZDOR SMRTI', '#ffd23d'); return; }
  if (S.secondWind && !R.card.swUsed) {
    R.card.swUsed = true; R.card.swW = S.recharge.secondWind || 0;
    R.hp = S.maxHp * 0.5; R.card.invT = S.secondWind;
    if (R.wallState) { R.wallState.hp = R.wallState.max; R.wallState.rebuild = 0; }
    if (S.swBlast) for (const e of R.enemies) damageEnemy(R, e, e.maxHp * S.swBlast);
    R.rings.push({ k: 'shock', r: TOWER_R, spd: 80, max: 60, delay: 0 });
    fxText(R, 0, -8, 'DRUHÝ DECH', '#c45cff');
    return;
  }
  if (save.vault.harmony.smartDemon && S.demonMode && !R.card.demonUsed) { activateDemon(R); R.hp = 1; return; }
  if (save.vault.harmony.smartNuke && S.nuke && !R.card.nukeUsed) { activateNuke(R); R.hp = 1; return; }
  R.hp = 0;
  endRun(R, false);
}

// ---------- karty (aktivní efekty) ----------
function updateCards(R, dt) {
  const S = R.S, c = R.card;
  if (c.invT > 0) c.invT -= dt;
  if (c.demonT > 0) { c.demonT -= dt; if (c.demonT <= 0) R.demonRevengeWave = R.wave + 300; }
  if (S.energyShield && c.es < S.esCharges) {
    c.esT += dt;
    if (c.esT >= S.energyShield * 60 * (1 + (R.bc.es || 0) / 100)) { c.esT = 0; c.es++; }
  }
  // super věž: poprvé po 30 s, pak každých 45 s na 15 s
  if (S.superTower) { c.superT += dt; }
  // paprsek smrti: každých 11 s
  if (S.deathRay) {
    c.drT += dt;
    if (c.drOn > 0) {
      c.drOn -= dt;
      c.drA += Math.PI / S.deathRay * dt;
      deathRayHit(R, c.drA);
      if (c.drDouble) deathRayHit(R, c.drA + Math.PI);
    } else if (c.drT >= 11) { c.drT = 0; c.drOn = S.deathRay; c.drA = rand(0, Math.PI * 2); c.drDouble = Math.random() < S.drDouble; }
  }
  if (save.vault.harmony.demonAuto && S.demonMode && !c.demonUsed) activateDemon(R);
  if (save.vault.harmony.nukeAuto && S.nuke && !c.nukeUsed && R.enemies.length > 20) activateNuke(R);
  if (save.vault.harmony.barrageAuto && save.labs.barrage && !R.barrageUsed && S.uw.smartMissiles && R.enemies.length > 10) activateBarrage(R);
}
const superActive = R => R.S.superTower && R.card.superT >= 30 && ((R.card.superT - 30) % 45) < 15;

function deathRayHit(R, ang) {
  const S = R.S;
  for (const e of R.enemies) {
    if (e.dead) continue;
    const a = Math.atan2(e.y, e.x);
    let diff = Math.atan2(Math.sin(a - ang), Math.cos(a - ang));
    if (Math.abs(diff) * Math.hypot(e.x, e.y) > e.r + 0.8) continue;
    if (canInstaKill(e)) {
      if (R.bc.dr) damageEnemy(R, e, e.maxHp * R.bc.dr / 100, { src: 'dr' });
      else { e.lastSrc = 'dr'; killEnemy(R, e); }
    }
  }
}

function activateDemon(R) {
  if (!R.S.demonMode || R.card.demonUsed || R.introLeft) return;
  R.card.demonUsed = true; R.card.demonW = R.S.recharge.demonMode || 0;
  R.card.demonT = R.tourney !== null ? Math.min(R.S.demonMode, 10 * 35) : R.S.demonMode;
  fxText(R, 0, -10, 'DÉMONSKÝ MÓD', '#ff3d3d', 2);
}
function activateNuke(R) {
  const S = R.S;
  if (!S.nuke || R.card.nukeUsed || R.introLeft) return;
  R.card.nukeUsed = true; R.card.nukeW = S.recharge.nuke || 0;
  const targets = shuffle(R.enemies.filter(e => !e.dead && !e.boss && !e.fleet));
  const n = Math.ceil(targets.length * S.nuke / 100);
  for (let i = 0; i < n; i++) { targets[i].lastSrc = 'nuke'; killEnemy(R, targets[i]); }
  R.card.invT = Math.max(R.card.invT, 15);
  R.rings.push({ k: 'nuke', r: TOWER_R, spd: 120, max: SPAWN_R, delay: 0 });
  fxText(R, 0, -10, 'ATOMOVKA', '#ffd23d', 2);
}
function activateBarrage(R) {
  const S = R.S;
  if (!save.labs.barrage || R.barrageUsed || !S.uw.smartMissiles || !R.enemies.length) return;
  R.barrageUsed = true;
  const n = labV('barrageQty') || 25;
  for (let i = 0; i < n; i++) launchMissile(R, S.uw.smartMissiles.dmg);
}

// ---------- střelba věže ----------
function targetOrder(R, list) {
  const pr = save.targetPrio;
  if (labV('targetPriority') >= 1 && pr && pr !== 'nearest') {
    if (pr === 'spotlight') list.sort((a, b) => (spotlit(R, b[1]) - spotlit(R, a[1])) || a[0] - b[0]);
    else list.sort((a, b) => ((b[1].type === pr) - (a[1].type === pr)) || a[0] - b[0]);
  } else list.sort((a, b) => a[0] - b[0]);
}

function fire(R) {
  const S = R.S;
  const targets = [];
  for (const e of R.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x, e.y);
    if (d - e.r <= S.range) targets.push([d, e]);
  }
  if (!targets.length) return false;
  targetOrder(R, targets);
  const n = Math.random() < S.multiChance ? S.multiTargets : 1;
  for (let i = 0; i < Math.min(n, targets.length); i++) R.bullets.push({ x: 0, y: 0, t: targets[i][1], bounce: 0, hit: null, primary: true, bn: 0 });
  if (R.rapidT <= 0 && S.rapidChance > 0 && Math.random() < S.rapidChance) R.rapidT = S.rapidDur;
  return true;
}

function spotlit(R, e) {
  const sp = R.S.uw.spotlight;
  if (!sp) return false;
  const a = Math.atan2(e.y, e.x);
  const half = sp.angle * Math.PI / 360;
  for (let i = 0; i < sp.qty; i++) {
    let diff = a - (R.spotA + i * Math.PI * 2 / sp.qty);
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) <= half && Math.hypot(e.x, e.y) <= R.S.range) return true;
  }
  return false;
}

// společný výpočet poškození střely (krit, super krit, rend, bonusy)
function projectileDamage(R, e, o = {}) {
  const S = R.S;
  let dist = Math.floor(Math.hypot(e.x, e.y));
  if (R.scoutT > 0) dist *= R.scoutMult || 2;
  let dmg = S.damage * (1 + S.dmgMeter * dist);
  let crit = 0;
  if (Math.random() < S.critChance || R.annShots > 0) {
    dmg *= S.critFactor; crit = 1;
    if (Math.random() < S.scChance || R.annShots > 0) {
      dmg *= S.scMult; crit = 2;
      if (R.annShots > 0) R.annShots--; else if (S.uniq.annihilator) R.annShots = 5;
    }
  }
  if (spotlit(R, e)) {
    let b = S.uw.spotlight.bonus;
    if (save.uwPlus.spotlight !== undefined) b *= 1 + S.dmgMeter * S.range * 0.05 * (save.uwPlus.spotlight + 1);
    dmg *= b;
  }
  for (const b of R.botsState) if (b.id === 'amplify' && b.active > 0 && Math.hypot(e.x - b.x, e.y - b.y) < b.range) dmg *= b.bonus;
  if (superActive(R)) dmg *= S.superTower;
  if (R.card.demonT > 0) dmg *= 300;
  if (R.demonRevengeWave > R.wave) dmg *= S.demonRevenge;
  if (S.berserker) dmg *= Math.min(8, 1 + R.card.absorbed * S.berserker / Math.max(1, S.damage));
  if (R.ampT > 0) dmg *= 5;
  if (S.uniq.funding) dmg *= 1 + S.uniq.funding / 100 * String(Math.floor(R.cash)).length;
  if (o.bounceN && S.uniq.astral) dmg *= 1 + S.uniq.astral / 100 * o.bounceN;
  dmg *= e.rend * e.shock;
  return { dmg, crit };
}

function updateBullets(R, dt) {
  const spd = save.labs.lightSpeed ? 180 : Math.min(150, 50 + 15 * R.S.atkSpeed);
  for (const b of R.bullets) {
    if (b.dead) continue;
    if (b.t.dead) {
      const n = nearestEnemy(R, b.x, b.y, 15, b.hit);
      if (!n) { b.dead = true; continue; }
      b.t = n;
    }
    const dx = b.t.x - b.x, dy = b.t.y - b.y, d = Math.hypot(dx, dy);
    const mv = spd * dt;
    if (d <= mv + b.t.r) { bulletHit(R, b, b.t); continue; }
    b.x += dx / d * mv; b.y += dy / d * mv;
  }
}

function bulletHit(R, b, e) {
  b.dead = true;
  const S = R.S;
  if (e.armor > 0) { e.armor--; R.fx.push({ k: 'burst', x: e.x, y: e.y, r: 1, color: '#aaa', life: 0.2, max: 0.2 }); return; }
  if (e.marked && canInstaKill(e)) { e.lastSrc = 'mark'; killEnemy(R, e); return; }
  const { dmg, crit } = projectileDamage(R, e, { bounceN: b.bn });
  if (crit) track('crits');
  if (crit === 2) track('supercrits');
  const before = e.hp;
  if (R.fx.length < 220) R.fx.push({ k: 'hit', x: e.x, y: e.y, crit, color: ENEMY_TYPES[e.type].color, life: 0.05, max: 0.05 });
  damageEnemy(R, e, dmg, { src: 'tower' });
  if (S.lifesteal > 0 && !R.enemies.some(x => x.draining)) R.hp = Math.min(S.maxHp, R.hp + Math.min(dmg, before) * S.lifesteal);
  if (crit && R.fx.length < 120 && save.dmgNumbers !== false) fxText(R, e.x + rand(-1, 1), e.y - e.r - 1, fmt(dmg), crit === 2 ? '#ff5ce1' : '#ffd23d', 0.5);
  // rend armor
  if (S.rendChance > 0 && Math.random() < S.rendChance) e.rend = Math.min(S.rendMax, (S.uniq.havoc && Math.random() < S.uniq.havoc / 100) ? S.rendMax : e.rend + S.rendMult);
  if (S.uniq.shrinkRay && Math.random() < 0.01) e.mass *= 1 - S.uniq.shrinkRay / 100;
  if (S.uniq.pulsar && Math.random() < S.uniq.pulsar / 100) { e.maxHp *= 0.97; e.hp *= 0.97; e.dmg *= 0.97; }
  if (!e.dead && S.knockChance > 0 && !b.hit && Math.random() < S.knockChance) knock(R, e, S.knockForce * 4);
  if (S.uw.chainLightning && Math.random() < S.uw.chainLightning.chance) chainLightning(R, e);
  let left = b.bounce;
  if (b.primary && S.bounceChance > 0 && Math.random() < S.bounceChance) left = S.bounceTargets;
  if (left > 0) {
    const hit = b.hit || new Set();
    hit.add(e);
    const n = nearestEnemy(R, e.x, e.y, S.bounceRange, hit);
    if (n) { R.bullets.push({ x: e.x, y: e.y, t: n, bounce: left - 1, hit, primary: false, bn: (b.bn || 0) + 1 }); track('bounces'); }
  }
}

function knock(R, e, f) {
  if (ENEMY_TYPES[e.type].noKnock || e.fleet) return;
  const d = Math.hypot(e.x, e.y) || 1;
  const k = f / e.mass * (e.boss ? 0.2 : 1) * ((R.bc.knock || 100) / 100);
  const nd = Math.min(SPAWN_R, d + k);
  e.x = e.x / d * nd; e.y = e.y / d * nd;
  track('knockbacks');
}

function uwDamage(R, mult) {
  // UW poškození = násobek × poškození × očekávaný krit (wiki vzorec)
  const S = R.S;
  let d = mult * S.uwDmgMult * S.damage * (1 + (S.critFactor - 1) * S.critChance) * (1 + (S.scMult - 1) * S.scChance * S.critChance);
  if (S.uwCrit && Math.random() < S.uwCrit) d *= S.critFactor;
  return d;
}

function chainLightning(R, e) {
  const S = R.S, c = S.uw.chainLightning;
  const smite = save.uwPlus.chainLightning;
  for (let q = 0; q < c.qty; q++) {
    const hit = new Set(S.uniq.dimension && Math.random() < 0.6 ? [] : [e]);
    const pts = [[e.x, e.y]];
    let cur = e;
    for (let i = 0; i < 4; i++) {
      const n = nearestEnemy(R, cur.x, cur.y, 20, hit);
      if (!n) break;
      hit.add(n);
      pts.push([n.x, n.y]);
      let d = uwDamage(R, c.dmg) * (n.type === 'scatter' ? labV('clScatter') : 1);
      damageEnemy(R, n, d, { src: 'cl' });
      track('cl_hits');
      if (save.labs.clShock && Math.random() < labV('clShockChance')) {
        const m = labV('clShockMult') * (S.uniq.dimension ? 2 : 1);
        n.shock = S.uniq.dimension ? Math.min(1 + (m - 1) * S.uniq.dimension, n.shock + (m - 1)) : Math.max(n.shock, m);
      }
      if (smite !== undefined && Math.random() < c.chance) damageEnemy(R, n, BASE_HP * enemyScale(R).hp * (1 + smite * 0.5), { src: 'cl' });
      cur = n;
    }
    if (pts.length > 1) R.fx.push({ k: 'bolt', pts, life: 0.2, max: 0.2 });
  }
}

// ---------- obranné mechaniky ----------
const orbRadius = S => Math.max(8, S.range * 0.45);

function orbHit(R, e, extra) {
  const S = R.S;
  if (e.boss) { if (e.orbCd <= 0 && S.orbBoss) { damageEnemy(R, e, e.maxHp * S.orbBoss, { src: 'orb' }); e.orbCd = 0.5; } return; }
  if (e.elite || e.fleet) return;
  if (e.orbCd > 0) return;
  if (e.prot) { damageEnemy(R, e, S.damage, { src: 'orb' }); e.orbCd = 0.3; return; }
  if (R.bc.orb) { damageEnemy(R, e, e.maxHp * R.bc.orb / 100, { src: 'orb' }); e.orbCd = 0.3; if (!e.dead && S.uniq.negMass) e.debuff = Math.min(0.5, (e.debuff || 0) + S.uniq.negMass / 100); return; }
  e.lastSrc = 'orb';
  killEnemy(R, e);
}

function updateOrbs(R, dt) {
  const S = R.S;
  const or = orbRadius(S), size = 1.3 * S.orbSize;
  if (S.orbs > 0) {
    if (!S.uniq.sentry) R.orbA += S.orbSpeed * 0.5 * dt;
    for (let k = 0; k < S.orbs; k++) {
      const a = R.orbA + k * Math.PI * 2 / S.orbs;
      const ox = Math.cos(a) * or, oy = Math.sin(a) * or;
      for (const e of R.enemies) if (!e.dead && Math.hypot(e.x - ox, e.y - oy) < e.r + size) orbHit(R, e);
    }
    // strážní protokol: orby střílí mini orby
    if (S.uniq.sentry) {
      R.sentryT = (R.sentryT || 0) + dt * S.orbSpeed;
      if (R.sentryT > 2) { R.sentryT = 0; for (let k = 0; k < S.orbs; k++) for (let j = 0; j < S.uniq.sentry; j++) { const t = nearestEnemy(R, 0, 0, S.range); if (t) orbHit(R, t); } }
    }
  }
  if (S.extraOrb) {
    R.extraOrbA -= S.extraOrb * 0.3 * dt;
    const r2 = or * 0.65;
    for (let k = 0; k < S.extraOrbs; k++) {
      const a = R.extraOrbA + k * Math.PI * 2 / S.extraOrbs;
      const ox = Math.cos(a) * r2, oy = Math.sin(a) * r2;
      for (const e of R.enemies) if (!e.dead && Math.hypot(e.x - ox, e.y - oy) < e.r + size) orbHit(R, e, true);
    }
  }
  // orbitální augment: elektrony berou 15 % zbývajícího HP
  if (S.uniq.orbital) {
    R.electronA = (R.electronA || 0) + 1.5 * dt;
    for (let k = 0; k < S.uniq.orbital; k++) {
      const a = R.electronA + k * Math.PI * 2 / S.uniq.orbital;
      const ox = Math.cos(a) * 11, oy = Math.sin(a) * 11;
      for (const e of R.enemies) if (!e.dead && e.orbCd <= 0 && Math.hypot(e.x - ox, e.y - oy) < e.r + 1) { damageEnemy(R, e, e.hp * 0.15 * (e.boss || e.fleet ? 0.25 : 1), { src: 'orb' }); e.orbCd = 0.5; }
    }
  }
}

function updateShock(R, dt) {
  const S = R.S;
  if (!S.shockOn) return;
  R.shockT += dt;
  if (R.shockT < S.shockFreq) return;
  R.shockT = 0;
  const rad = S.shockSize * 10;
  R.rings.push({ k: 'shock', r: TOWER_R, spd: 60, max: rad, delay: 0 });
  for (const e of R.enemies) {
    if (e.dead || Math.hypot(e.x, e.y) > rad + e.r) continue;
    if (S.uniq.antiCube) e.acT = 7;
    if (e.boss || e.elite || e.fleet || (e.prot && R.bc.prot)) continue;
    knock(R, e, 6);
  }
}

function updateMines(R, dt) {
  const S = R.S;
  const rad = S.mineRadius * 6;
  for (const m of R.mines) {
    m.life -= dt;
    if (m.life <= 0) { m.dead = true; continue; }
    for (const e of R.enemies) {
      if (e.dead || Math.hypot(e.x - m.x, e.y - m.y) > e.r + 1.5) continue;
      m.dead = true;
      for (const o of R.enemies) {
        if (o.dead || Math.hypot(o.x - m.x, o.y - m.y) > rad + o.r) continue;
        o.lastSrc = 'mine';
        damageEnemy(R, o, uwDamage(R, S.mineDmg) / S.uwDmgMult, { src: 'mine' });
        track('mine_hits');
        if (S.mineStun && !o.boss && Math.random() < 0.4) { o.stun = S.mineStun * (o.fleet ? 0.5 : 1); track('stuns'); }
      }
      R.fx.push({ k: 'boom', x: m.x, y: m.y, r: rad, color: '#ff9f43', life: 0.35, max: 0.35 });
      break;
    }
  }
  if (R.mines.some(m => m.dead)) R.mines = R.mines.filter(m => !m.dead);
}

// ---------- ultimátní zbraně ----------
function launchMissile(R, mult, from) {
  const a = rand(0, Math.PI * 2);
  const f = from || { x: 0, y: 0 };
  R.missiles.push({ x: f.x, y: f.y, vx: Math.cos(a) * MISSILE_SPD, vy: Math.sin(a) * MISSILE_SPD, t: R.enemies.length ? pick(R.enemies) : null, life: 6 + labV('smDespawn'), mult });
}

function uwReady(R, id, cd, dt) {
  if (R.uwT[id] === undefined) R.uwT[id] = cd * 0.3;
  if (R.uwT[id] > 0) R.uwT[id] -= dt;
  if (R.uwT[id] <= 0 && R.enemies.length) { R.uwT[id] = cd; return true; }
  return false;
}

function updateUW(R, dt) {
  const S = R.S, U = S.uw;
  const plus = save.uwPlus;
  const sync = S.uniq.multiverse !== undefined && U.deathWave && U.goldenTower && U.blackHole;
  if (sync) {
    const cd = (U.deathWave.cd + U.goldenTower.cd + U.blackHole.cd) / 3 + S.uniq.multiverse;
    if (uwReady(R, 'nexus', cd, dt)) { fireDeathWave(R); R.golden = U.goldenTower.dur; spawnBlackHoles(R); }
  }
  if (U.deathWave && !sync && uwReady(R, 'deathWave', U.deathWave.cd, dt)) fireDeathWave(R);
  if (U.smartMissiles && uwReady(R, 'smartMissiles', U.smartMissiles.cd, dt)) for (let i = 0; i < U.smartMissiles.qty; i++) launchMissile(R, U.smartMissiles.dmg);
  if (U.smartMissiles && plus.smartMissiles !== undefined) { R.coverT += dt; if (R.coverT >= Math.max(1, 10 - 0.8 * plus.smartMissiles)) { R.coverT = 0; launchMissile(R, U.smartMissiles.dmg); } }
  if (U.smartMissiles && S.uniq.tactical) { R.tacT += dt; if (R.tacT >= S.uniq.tactical) { R.tacT = 0; launchMissile(R, U.smartMissiles.dmg); } }
  if (U.spotlight && labV('slMissile')) { R.slMissT += dt; if (R.slMissT >= labV('slMissile')) { R.slMissT = 0; const a = R.spotA; launchMissile(R, U.smartMissiles ? U.smartMissiles.dmg : 10, { x: Math.cos(a) * S.range * 0.6, y: Math.sin(a) * S.range * 0.6 }); } }
  if (U.blackHole && !sync && uwReady(R, 'blackHole', U.blackHole.cd, dt)) spawnBlackHoles(R);
  if (U.goldenTower && !sync && uwReady(R, 'goldenTower', U.goldenTower.cd, dt)) { R.golden = U.goldenTower.dur; R.goldenKills = 0; }
  if (U.chronoField && uwReady(R, 'chronoField', U.chronoField.cd, dt)) R.chrono = U.chronoField.dur;
  if (U.poisonSwamp && uwReady(R, 'poisonSwamp', U.poisonSwamp.cd, dt)) {
    const a = rand(0, Math.PI * 2), d = rand(8, S.range * 0.85);
    R.swamps.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: U.poisonSwamp.radius, life: U.poisonSwamp.dur, max: U.poisonSwamp.dur, tick: 0, n: 0 });
  }
  if (U.innerMines && uwReady(R, 'innerMines', U.innerMines.cd, dt)) {
    for (let i = 0; i < U.innerMines.qty; i++) R.ilms.push({ a: i * Math.PI * 2 / U.innerMines.qty, r: 7 + (i % 2) * 2, dmg: U.innerMines.dmg, charge: 0 });
    if (S.uniq.magneticHook) for (const e of R.enemies.filter(x => (x.boss || x.fleet) && Math.hypot(x.x, x.y) < S.range)) for (let i = 0; i < S.uniq.magneticHook; i++) R.ilms.push({ a: Math.atan2(e.y, e.x), r: Math.hypot(e.x, e.y), dmg: U.innerMines.dmg, charge: 0, homing: e });
  }
  // zlatá věž + zlaté kombo (UW+)
  if (R.golden > 0) { R.golden -= dt; if (R.golden <= 0 && plus.goldenTower !== undefined) { R.comboMult = Math.pow(1 + 0.0003 * (plus.goldenTower + 1), Math.min(R.goldenKills, 2000)); R.comboT = 10; } }
  if (R.comboT > 0) R.comboT -= dt;
  if (R.chrono > 0) R.chrono -= dt;
  if (U.spotlight) {
    // Om čip: reflektor míří na bosse
    const boss = S.uniq.omChip && R.enemies.find(e => e.boss && Math.hypot(e.x, e.y) < S.range);
    if (boss) R.spotA = Math.atan2(boss.y, boss.x); else R.spotA += 0.7 * dt;
  }

  // vlny smrti
  for (const g of R.rings) {
    if (g.delay > 0) { g.delay -= dt; continue; }
    g.r += g.spd * dt;
    if (g.k === 'death') {
      for (const e of R.enemies) {
        if (e.dead || g.hit.has(e) || Math.hypot(e.x, e.y) > g.r) continue;
        g.hit.add(e);
        e.dwHit = true;
        if (labV('dwStrip')) e.armor = Math.max(0, e.armor - labV('dwStrip'));
        track('dw_hits');
        damageEnemy(R, e, uwDamage(R, U.deathWave ? U.deathWave.dmg : 1) * R.dwMult, { src: 'dw' });
        if (plus.deathWave !== undefined) R.dwMult += 0.001 * (plus.deathWave + 1);
      }
    }
    if (g.r >= g.max) g.dead = true;
  }
  if (R.rings.some(g => g.dead)) R.rings = R.rings.filter(g => !g.dead);

  // rakety
  for (const m of R.missiles) {
    m.life -= dt;
    if (!m.t || m.t.dead) m.t = nearestEnemy(R, m.x, m.y, 200);
    if (!m.t || m.life <= 0) { m.dead = true; continue; }
    const dx = m.t.x - m.x, dy = m.t.y - m.y, d = Math.hypot(dx, dy);
    if (d < m.t.r + 1) {
      m.dead = true;
      const rad = (save.labs.smExplosion ? 4 : 1.5) * (1 + labV('smRadius')) * ((U.smartMissiles && U.smartMissiles.radiusMult) || 1);
      for (const o of R.enemies) {
        if (o.dead || Math.hypot(o.x - m.x, o.y - m.y) > rad + o.r) continue;
        o.smHits = (o.smHits || 0) + 1;
        const amp = 1 + labV('smAmp') * (o.smHits - 1);
        damageEnemy(R, o, uwDamage(R, m.mult) * amp, { src: 'sm' });
      }
      R.fx.push({ k: 'boom', x: m.x, y: m.y, r: rad, color: '#ffb347', life: 0.35, max: 0.35 });
      continue;
    }
    const turn = Math.min(1, 4 * dt);
    m.vx += (dx / d * MISSILE_SPD - m.vx) * turn;
    m.vy += (dy / d * MISSILE_SPD - m.vy) * turn;
    m.x += m.vx * dt; m.y += m.vy * dt;
  }
  if (R.missiles.some(m => m.dead)) R.missiles = R.missiles.filter(m => !m.dead);

  // černé díry
  for (const e of R.enemies) e.inBH = false;
  for (const h of R.holes) {
    h.life -= dt;
    const end = h.life <= 0;
    for (const e of R.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - h.x, e.y - h.y);
      if (d > h.r + e.r) continue;
      e.inBH = true;
      if (end && plus.blackHole !== undefined) damageEnemy(R, e, BASE_HP * enemyScale(R).hp * (2 + plus.blackHole), { src: 'bh' });
      if (labV('bhDmg')) damageEnemy(R, e, e.maxHp * labV('bhDmg') * dt, { src: 'bh' });
      if (e.boss || e.elite || e.fleet) continue;
      // přitahování ke středu, ve středu zánik
      const pull = 8 * dt;
      if (d < 1.5 && canInstaKill(e)) { e.lastSrc = 'bh'; killEnemy(R, e); continue; }
      e.x += (h.x - e.x) / (d || 1) * Math.min(pull, d); e.y += (h.y - e.y) / (d || 1) * Math.min(pull, d);
    }
    if (end) h.dead = true;
  }
  if (R.holes.some(h => h.dead)) R.holes = R.holes.filter(h => !h.dead);

  // bažiny
  for (const e of R.enemies) e.inSwamp = false;
  for (const s of R.swamps) {
    s.life -= dt; s.tick += dt;
    const doTick = s.tick >= 1;
    if (doTick) { s.tick = 0; s.n++; }
    for (const e of R.enemies) {
      if (e.dead || Math.hypot(e.x - s.x, e.y - s.y) > s.r + e.r) continue;
      e.inSwamp = true;
      if (!e.poisoned) { e.poisoned = true; track('ps_poison'); if (S.uniq.harmony) e.miss = S.uniq.harmony / 100 * (e.boss ? 0.5 : 1); }
      if (doTick) {
        const creep = save.uwPlus.poisonSwamp !== undefined ? 1 + 0.05 * (save.uwPlus.poisonSwamp + 1) * s.n : 1;
        damageEnemy(R, e, uwDamage(R, U.poisonSwamp ? U.poisonSwamp.dmg : 10) * creep, { src: 'ps' });
        if (save.labs.psStun && !e.boss && Math.random() < labV('psStunChance')) e.stun = labV('psStunTime') * (e.fleet ? 0.5 : 1);
        if (labV('psRend') && e.type === 'basic') e.rend = Math.min(S.rendMax || 8, e.rend + labV('psRend'));
      }
    }
    if (s.life <= 0) s.dead = true;
  }
  if (R.swamps.some(s => s.dead)) R.swamps = R.swamps.filter(s => !s.dead);

  // vnitřní miny obíhají kolem věže
  const rot = 0.6 + labV('ilmRot') * 0.1;
  for (const m of R.ilms) {
    if (m.homing) {
      const t = m.homing;
      if (t.dead) { m.homing = null; continue; }
      const mx = Math.cos(m.a) * m.r, my = Math.sin(m.a) * m.r;
      m.a = Math.atan2(t.y, t.x); m.r = Math.min(Math.hypot(t.x, t.y), m.r + 40 * dt);
      void mx; void my;
    } else m.a += rot * dt;
    if (save.uwPlus.innerMines !== undefined) m.charge += 0.5 * (save.uwPlus.innerMines + 1) * dt;
    const mx = Math.cos(m.a) * m.r, my = Math.sin(m.a) * m.r;
    for (const e of R.enemies) {
      if (e.dead || Math.hypot(e.x - mx, e.y - my) > e.r + 1.2) continue;
      m.dead = true;
      const rad = 3 + labV('ilmRadius');
      for (const o of R.enemies) {
        if (o.dead || Math.hypot(o.x - mx, o.y - my) > rad + o.r) continue;
        damageEnemy(R, o, uwDamage(R, m.dmg) * (1 + m.charge), { src: 'ilm' });
        if (save.labs.ilmStun && !o.boss) o.stun = 1;
      }
      R.fx.push({ k: 'boom', x: mx, y: my, r: rad, color: '#ff9f43', life: 0.3, max: 0.3 });
      break;
    }
  }
  if (R.ilms.some(m => m.dead)) R.ilms = R.ilms.filter(m => !m.dead);
}

function fireDeathWave(R) {
  const U = R.S.uw;
  if (!U.deathWave) return;
  R.dwMult = 1;
  for (let i = 0; i < U.deathWave.qty; i++) R.rings.push({ k: 'death', r: TOWER_R, delay: i * 0.6, spd: 40, max: SPAWN_R, hit: new Set() });
}

function spawnBlackHoles(R) {
  const S = R.S, U = S.uw;
  const n = 1 + (save.labs.bhExtra ? 1 : 0) + (S.uniq.primordial ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = Math.max(12, S.range * 0.7);
    R.holes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: U.blackHole.size * 0.22, life: U.blackHole.dur, max: U.blackHole.dur });
  }
}

// ---------- boti ----------
function updateBots(R, dt) {
  const S = R.S;
  if (R.botsState.length !== S.bots.length) {
    R.botsState = S.bots.map((b, i) => {
      const a = -Math.PI / 2 + (i - (S.bots.length - 1) / 2) * 0.9;
      return Object.assign({ x: Math.cos(a) * S.range * 0.55, y: Math.sin(a) * S.range * 0.55, t: b.cd * 0.3, active: 0, tick: 0 }, b);
    });
  }
  const bb = R.botsState.find(b => b.id === 'botbot' && b.active > 0);
  for (const b of R.botsState) {
    const src = S.bots.find(x => x.id === b.id);
    if (src) Object.assign(b, src, { x: b.x, y: b.y, t: b.t, active: b.active, tick: b.tick });
    const boost = bb && b !== bb && Math.hypot(b.x - bb.x, b.y - bb.y) < bb.range ? bb.bonus : 1;
    if (b.active > 0) {
      b.active -= dt;
      if (b.id === 'flame') {
        b.tick += dt;
        if (b.tick >= Math.max(0.3, 1 + labV('flameFreq') * 0.03)) {
          b.tick = 0;
          for (const e of R.enemies) if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < b.range * boost) { e.burnT = 3; e.burnRed = b.red; damageEnemy(R, e, uwDamage(R, b.dmg * boost) * S.aoe, { src: 'flame' }); }
        }
      }
      if (b.id === 'thunder' && b.active <= 0) for (const e of R.enemies) if (Math.hypot(e.x - b.x, e.y - b.y) < b.range * boost) { e.slowT = b.lingerT; e.slowV = b.linger * (e.boss || e.elite ? 0.5 : 1); }
    } else {
      b.t -= dt;
      if (b.t <= 0) {
        b.t = b.cd;
        b.active = b.id === 'flame' ? 10 : b.id === 'thunder' ? b.stun : b.dur;
        if (b.id === 'thunder') for (const e of R.enemies) if (!e.fleet && Math.hypot(e.x - b.x, e.y - b.y) < b.range * boost) e.stun = b.stun * (e.boss || e.elite ? 0.5 : 1);
        if (b.id === 'golden' || b.id === 'amplify') b.bonus = (b.bonus || 1) * boost;
      }
    }
  }
}

// ---------- guardian (čipy) ----------
function updateChips(R, dt) {
  const S = R.S;
  if (R.summonT > 0) { R.summonT -= dt; }
  if (R.scoutT > 0) R.scoutT -= dt;
  for (const c of S.chips) {
    if (R.chipT[c.id] === undefined) R.chipT[c.id] = c.cd;
    R.chipT[c.id] -= dt;
    if (R.chipT[c.id] > 0) continue;
    R.chipT[c.id] = c.cd;
    const inR = R.enemies.filter(e => !e.dead && Math.hypot(e.x, e.y) < S.range * 1.5);
    if (c.id === 'ally') {
      const t = inR.filter(e => !e.boss && !e.fleet).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
      if (t) { t.dead = true; const cap = S.maxHp * S.maxRecovery * c.max; R.hp = Math.min(cap, R.hp + S.maxHp * c.amount); fxText(R, t.x, t.y, '+HP', '#4dff9a'); }
    } else if (c.id === 'attack') {
      for (const e of inR.sort((a, b) => (b.maxHp - b.hp) / b.maxHp - (a.maxHp - a.hp) / a.maxHp).slice(0, c.targets)) {
        damageEnemy(R, e, (e.maxHp - e.hp) * c.pct * (e.boss ? 0.5 : 1), { src: 'guardian' });
        R.fx.push({ k: 'beam', x: e.x, y: e.y, color: '#ff5555', life: 0.3, max: 0.3 });
      }
    } else if (c.id === 'bounty') {
      for (const e of R.enemies.filter(e => !e.dead && e.type !== 'basic').slice(0, c.targets)) e.bounty = c.mult;
    } else if (c.id === 'fetch') {
      if (Math.random() < c.find) {
        const times = Math.random() < c.double ? 2 : 1;
        for (let i = 0; i < times; i++) fetchLoot(R);
      }
    } else if (c.id === 'summon') { R.summonT = c.dur; R.summonCash = c.cash; }
    else if (c.id === 'scout') { R.scoutT = c.dur; R.scoutMult = c.range; }
  }
}

function fetchLoot(R) {
  const roll = Math.random() * 100;
  if (roll < 4) { save.gems += 2; R.gemsEarned += 2; fxText(R, 0, -14, 'Aport: +2 ◆', '#ff5ce1'); }
  else if (roll < 6) { save.medals += 5; fxText(R, 0, -14, 'Aport: +5 medailí', '#ffd23d'); }
  else if (roll < 9) { save.shards.reroll += 10; fxText(R, 0, -14, 'Aport: úlomky', '#8fd3ff'); }
  else if (roll < 13) { const k = pick(['cannon', 'armor', 'generator', 'core']); save.shards[k] += 3; fxText(R, 0, -14, 'Aport: úlomky', '#8fd3ff'); }
  else if (roll < 13.5 && isFeature('modules')) { dropModule(roll < 13.1 ? 1 : 0); fxText(R, 0, -14, 'Aport: modul!', '#4d8dff'); }
  else { addCoins(R, R.S.coinWave * R.S.coinMult * 5 + 10); fxText(R, 0, -14, 'Aport: coiny', '#ffe08a'); }
}

// ---------- efekty a gemy ----------
function fxText(R, x, y, text, color, life = 1.2) { R.fx.push({ k: 'txt', x, y, text, color, life, max: life }); }

function updateFx(R, dt) {
  for (const f of R.fx) f.life -= dt;
  // při vysoké rychlosti efekty zaniknou dřív, než je renderer uvidí – výbuchy si proto předáme zvlášť
  for (const f of R.fx) if (f.life <= 0 && !f._r && (f.k === 'burst' || f.k === 'boom') && game.fxQ.length < 160) { f._r = true; game.fxQ.push(f); }
  if (R.fx.some(f => f.life <= 0)) R.fx = R.fx.filter(f => f.life > 0);
  if (R.hitFlash > 0) R.hitFlash -= dt;
}

// Gem obíhá kolem věže po vyznačené bariéře (kruh dosahu); max 10 za run
const GEM_ORBIT_SPD = 0.35;
function updateGem(R, dt) {
  if (!R.gem && R.gemCount < 10 && R.wave >= R.gemNext) {
    R.gem = { a: rand(0, Math.PI * 2), life: 25 };
    R.gemNext = R.wave + 40;
  }
  if (R.gem) {
    const g = R.gem;
    g.a += GEM_ORBIT_SPD * dt;
    g.x = Math.cos(g.a) * R.S.range;
    g.y = Math.sin(g.a) * R.S.range;
    g.life -= dt / R.speed;
    if (g.life <= 0) R.gem = null;
  }
}

function tryCollectGem(px, py) {
  const R = game.run;
  if (!R || !R.gem || R.gem.x === undefined) return;
  const wx = (px - game.cw / 2) / game.scale, wy = (py - game.ch / 2) / game.scale;
  if (Math.hypot(wx - R.gem.x, wy - R.gem.y) < 7) {
    save.gems += 2;
    R.gemsEarned += 2;
    R.gemCount++;
    track('gems_tapped');
    fxText(R, R.gem.x, R.gem.y, '+2 ◆', '#ff5ce1');
    R.gem = null;
  }
}

function toggleUW(R, id) {
  if (R.uwToggles >= 40) return false;
  R.uwToggles++;
  R.uwOff[id] = !R.uwOff[id];
  delete R.uwT[id];
  R.dirty = true;
  return true;
}

// ---------- konec runu ----------
function endRun(R, forfeit) {
  if (R.over) return;
  R.over = true;
  let tour = null;
  if (R.tourney !== null && save.tourney.cur) {
    const cur = save.tourney.cur;
    cur.best = Math.max(cur.best || 0, R.wave);
    tour = { wave: R.wave, best: cur.best };
    track('tourneys');
  }
  if (R.disso) {
    const max = DISSO_CATS.find(c => c[0] === R.disso)[2];
    const b = dissoBoost(max, R.wave);
    save.disso[R.tier] = save.disso[R.tier] || {};
    if (b > (save.disso[R.tier][R.disso] || 1)) save.disso[R.tier][R.disso] = b;
  }
  save.history.unshift({ t: Date.now(), tier: R.tier, tourney: R.tourney, disso: R.disso, wave: R.wave, coins: R.coinsEarned, cash: R.cashEarned, kills: R.kills, time: R.time, cells: R.cellsEarned, ctr: R.ctr });
  save.history = save.history.slice(0, 20);
  game.run = null;
  save.run = null;
  writeSave(true);
  if (typeof showRunSummary === 'function') showRunSummary(R, tour, forfeit);
  // automatický restart (trezor)
  if (save.vault.harmony.autoRestart && !forfeit && R.tourney === null) setTimeout(() => { if (!game.run) { startRun(R.tier, undefined, R.disso); if (typeof renderBattle === 'function') renderBattle(); } }, 3000);
}
