'use strict';
// ---------- stránky v „Více“ a jejich logika ----------

// ===== Milníky =====
function unclaimedMilestones() {
  let n = 0;
  for (const k in save.msReached) if (!save.msClaimed[k]) n++;
  return n;
}
const passIndex = t => Math.floor((t - 1) / 3);
// český popisek odměny milníku (wiki texty jsou anglicky)
const LAB_PREFIX = /^(Lab_|Wall_Labs_|Perk_Labs_|Module_Labs_|Second_Wind_Labs_)/;
const MS_FEATURES = { labs: 'Laboratoře', tournaments: 'Turnaje', events: 'Eventy', guilds: 'Gildy', modules: 'Moduly', 'unlock dissonance': 'Disonance', 'workshop enhancement': 'Vylepšení dílny+', 'card mastery unlock': 'Mistrovství karet', 'assist module': 'Asistenční moduly' };
function msLabel(text) {
  if (!text) return '—';
  let m;
  if ((m = /^([\d.]+\s*[kmbt]?)\s*coins$/i.exec(text))) return '© ' + m[1].replace(/\s/g, '');
  if ((m = /^(\d+)\s*Gems$/i.exec(text))) return '◆ ' + m[1];
  if ((m = /^(\d+)\s*Stones$/i.exec(text))) return '▲ ' + m[1];
  if ((m = /Tier (\d+)/i.exec(text))) return 'Tier ' + m[1];
  if (/Skin|^Eclipse$/i.test(text)) return 'Skin věže';
  if (/^Relic:|^(Coins|Tower|Critical|Damage|Health|Lab Speed|Ultimate)/i.test(text)) return 'Relikvie: ' + text.replace(/^Relic:\s*/, '');
  const label = text.split('|').pop().trim();
  if (MS_FEATURES[label.toLowerCase()]) return MS_FEATURES[label.toLowerCase()];
  if (/^Card:/i.test(text)) { const c = CARD_DEFS.find(x => x.ms && text.toLowerCase().includes(x.id.toLowerCase().slice(0, 5))); return 'Karta: ' + (c ? c.name : label); }
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lab = LAB_DEFS.find(d => norm(d.key.replace(LAB_PREFIX, '')) === norm(label));
  return lab ? 'Lab: ' + lab.name : label;
}
function grantReward(text, t) {
  if (!text) return '';
  let m;
  const mult = { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  if ((m = /^([\d.]+)\s*([kmbt]?)\s*coins$/i.exec(text))) { const v = parseFloat(m[1]) * mult[m[2].toLowerCase()]; save.coins += v; return `+© ${fmt(v)}`; }
  if ((m = /^(\d+)\s*Gems$/i.exec(text))) { save.gems += +m[1]; return `+◆ ${m[1]}`; }
  if ((m = /^(\d+)\s*Stones$/i.exec(text))) { save.stones += +m[1]; return `+▲ ${m[1]}`; }
  if ((m = /Tier (\d+)/i.exec(text))) { save.maxTier = Math.max(save.maxTier, +m[1]); return `Odemčen Tier ${m[1]}`; }
  if (/Skin|Eclipse/i.test(text)) {
    const skin = Object.keys(SKIN_MS_TIERS).find(k => SKIN_MS_TIERS[k] === t);
    if (skin && !save.themes.skins.includes(skin)) save.themes.skins.push(skin);
    return 'Nový skin věže';
  }
  if (/Relic|^(Coins|Tower|Critical|Damage|Health|Lab|Ultimate)/i.test(text)) {
    const r = RELICS.find(x => x.src.type === 'ms' && x.src.tier === t);
    if (r && !save.relics.includes(r.id)) { save.relics.push(r.id); markDirty(); return `Relikvie: ${r.name}`; }
    return 'Relikvie';
  }
  return 'Odemčeno: ' + msLabel(text);
}
function claimMilestone(t, w) {
  const k = msKey(t, w);
  if (!save.msReached[k] || save.msClaimed[k]) return;
  save.msClaimed[k] = true;
  const out = [grantReward(msReward(t, w, false), t)];
  if (save.premiumPass[passIndex(t)]) out.push(grantReward(msReward(t, w, true), t));
  if (t === 2 && w === 90) { save.modTickets += 10; out.push('+10 tiketů na moduly'); }
  markDirty();
  return out.filter(Boolean).join(' · ');
}

// ===== Denní mise =====
function refreshMissions() {
  if (!isFeature('missions')) return;
  const M = save.missions, now = Date.now();
  const wk = weekStart(now);
  if (M.week !== wk) { M.week = wk; M.weekDone = 0; M.boxes = []; M.rerolls = 0; }
  const batch = Math.floor(now / (8 * HOUR));
  if (!M.lastBatch) M.lastBatch = batch - 2;
  let add = (batch - M.lastBatch) * 2;
  if (batch - M.lastBatch >= 9) add = 8;
  M.lastBatch = batch;
  while (add-- > 0 && M.list.length < 8) addMission();
}
function addMission() {
  const M = save.missions;
  const opts = MISSION_DEFS.filter(d => (!d[3] || d[3]()) && !M.list.some(x => x.key === d[0]));
  if (!opts.length) return;
  const d = pick(opts);
  M.list.push({ key: d[0], text: d[1], goal: pick(d[2]), base: ctr(d[0]) });
}
const missionProg = x => Math.min(x.goal, ctr(x.key) - x.base);
const claimableMissions = () => isFeature('missions') ? save.missions.list.filter(x => missionProg(x) >= x.goal).length + WEEKLY_BOXES.filter((b, i) => save.missions.weekDone >= b[0] && !save.missions.boxes.includes(i)).length : 0;
const missionCoins = () => MISSION_COINS[save.maxTier - 1];

// ===== Turnaje =====
function tourneyStartOf(t) {
  // středa a sobota 00:00 UTC
  let d = Math.floor(t / DAY) * DAY;
  for (let i = 0; i < 8; i++) {
    const wd = new Date(d - i * DAY).getUTCDay();
    if (wd === 3 || wd === 6) return d - i * DAY;
  }
  return d;
}
function tourneyState() {
  const now = Date.now();
  const start = tourneyStartOf(now), end = start + DAY;
  const cur = save.tourney.cur && save.tourney.cur.id === start ? save.tourney.cur : null;
  const open = now < end;
  const tickets = cur ? 1 + cur.extra - cur.used : 1;
  const nextStart = (() => { let s = start + DAY; while (true) { const wd = new Date(s).getUTCDay(); if (wd === 3 || wd === 6) return s; s += DAY; } })();
  return { start, end, open, cur, tickets, nextStart, canPlay: isFeature('tourney') && open && tickets > 0 && !game.run };
}
const tourneyClaimable = () => { const c = save.tourney.cur; return !!(c && c.best > 0 && Date.now() >= c.id + DAY && !c.claimed); };
function tourneyBots(id, league) {
  const rng = mulberry32(id / 1000 + league * 7919);
  const base = LEAGUES[league].bot;
  const names = BOT_NAMES.slice();
  return Array.from({ length: 29 }, (_, i) => ({ name: names.splice(Math.floor(rng() * names.length), 1)[0] || 'Hráč' + i, wave: Math.max(1, Math.round(base * (0.35 + Math.pow(rng(), 0.8) * 1.3))) }));
}
function enterTourney() {
  const st = tourneyState();
  if (!st.canPlay) return;
  if (!save.tourney.cur || save.tourney.cur.id !== st.start) {
    if (tourneyClaimable()) claimTourney();
    save.tourney.cur = { id: st.start, league: save.tourney.league, used: 0, extra: 0, best: 0, claimed: false };
  }
  save.tourney.cur.used++;
  startRun(1, save.tourney.cur.league);
  showPage('battle');
}
function claimTourney() {
  const c = save.tourney.cur;
  if (!c || c.claimed) return;
  c.claimed = true;
  const L = c.league;
  const list = tourneyBots(c.id, L).concat([{ name: 'Ty', wave: c.best, me: true }]).sort((a, b) => b.wave - a.wave || (a.me ? -1 : 1));
  const place = list.findIndex(x => x.me) + 1;
  const idx = LEAGUES[L].rew.findIndex(r => place <= r[0]);
  const rw = LEAGUES[L].rew[idx];
  const keys = LEAGUES[L].keys ? LEAGUES[L].keys[idx] : 0;
  save.gems += rw[1]; save.stones += rw[2]; save.keys += keys;
  let change = 0;
  if (place <= 4 && L < LEAGUES.length - 1) { save.tourney.league++; change = 1; }
  else if (LEAGUES[L].demote && place > 24) { save.tourney.league = Math.max(2, L - 1); change = -1; }
  // odznaky (relikvie)
  const badge = n => { const r = RELICS.find(x => x.name === n); if (r && !save.relics.includes(r.id)) { save.relics.push(r.id); toast('Relikvie: ' + r.name, 'gold'); } };
  if (place <= 4) badge(TOURNEY_BADGES[L]);
  if (place === 1 && L === 5) badge('Legend Badge');
  if (place === 1 && L === 6) badge('Mythic Badge');
  save.tourney.last = { league: L, place, list, rw: { gems: rw[1], stones: rw[2], keys }, change, best: c.best };
  markDirty();
  modal(`<h2>Turnaj · ${LEAGUES[L].name}</h2><div class="sum-wave"><b>${place}.</b> místo</div><p class="center">+◆ ${rw[1]} · +▲ ${rw[2]}${keys ? ' · +⚿ ' + keys : ''}</p>${change > 0 ? `<p class="good center">Postup do ligy ${LEAGUES[save.tourney.league].name}!</p>` : change < 0 ? `<p class="bad center">Sestup do ligy ${LEAGUES[save.tourney.league].name}</p>` : ''}<button class="btn wide primary" data-act="close-modal">OK</button>`);
}

// ===== Eventy =====
const eventIdxNow = () => Math.floor((Date.now() - EVENT_EPOCH) / (14 * DAY));
function refreshEvent() {
  if (!isFeature('events')) return;
  const idx = eventIdxNow();
  const E = save.event;
  if (E.idx !== idx) {
    // nevyzvednuté úrovně misí se připíšou automaticky
    if (E.idx >= 0) for (const m of eventMissions(E.idx)) for (let t = 0; t < 3; t++) if (eventProg(m) >= m[2][t] && !E.tiers[m[0] + t]) save.medals += EVENT_TIER_MEDALS[t] * (E.boost ? 2 : 1);
    save.event = { idx, base: Object.assign({}, save.ctr), tiers: {}, medalsEarned: 0, boost: false, relicsGot: [], shopBuys: 0, shopSkin: false, shopBg: false, maxWave: 0 };
  }
  if (game.run && game.run.tourney === null) save.event.maxWave = Math.max(save.event.maxWave || 0, game.run.wave);
}
const eventName = idx => EVENT_NAMES[((idx % EVENT_NAMES.length) + EVENT_NAMES.length) % EVENT_NAMES.length];
function eventMissions(idx) {
  const rng = mulberry32(idx * 31 + 7);
  const pool = EVENT_MISSION_DEFS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const day = Math.min(7, Math.floor((Date.now() - (EVENT_EPOCH + idx * 14 * DAY)) / DAY));
  return pool.slice(0, Math.min(pool.length, 7 + 2 * day));
}
function eventProg(m) {
  if (m[0] === 'best_wave') return save.event.maxWave || 0;
  return ctr(m[0]) - (save.event.base[m[0]] || 0);
}
const eventRelics = () => RELICS.filter(r => r.src.type === 'event' && r.src.event === eventName(save.event.idx)).sort((a, b) => a.src.medals - b.src.medals);
function eventClaimable() {
  if (!isFeature('events') || save.event.idx < 0) return false;
  const E = save.event;
  if (eventMissions(E.idx).some(m => [0, 1, 2].some(t => eventProg(m) >= m[2][t] && !E.tiers[m[0] + t]))) return true;
  return eventRelics().some(r => E.medalsEarned >= r.src.medals && (!r.src.premium || E.boost) && !save.relics.includes(r.id));
}

// ===== Gilda =====
const GUILD_NAMES = ['Neonová stráž', 'Hexagon', 'Věžníci', 'Orb Masters', 'Česká tvrz', 'Vlnolamy', 'Krit Klub', 'Bastion CZ'];
function refreshGuild() {
  const G = save.guild;
  const wk = weekStart(Date.now());
  if (G.week !== wk) { G.week = wk; G.contribMine = 0; G.chests = []; }
  const season = Math.floor((Date.now() - EVENT_EPOCH) / (56 * DAY));
  if (G.season !== season) {
    if (G.season && save.tokens > 0) { const g = Math.ceil(save.tokens / 5); save.gems += g; toast(`Konec sezóny gildy: tokeny → ◆ ${g}`, 'gem'); save.tokens = 0; }
    G.season = season; G.spent = 0; G.store = {};
  }
}
function guildTotal() {
  const G = save.guild;
  const rng = mulberry32(G.week / 1000 + hashStr(G.name || 'x'));
  let s = G.contribMine;
  const elapsed = Math.min(1, (Date.now() - G.week) / (7 * DAY));
  for (let i = 0; i < 29; i++) s += Math.round(Math.floor(rng() * 8) * 5 * elapsed);
  return s;
}
const guildRelics = () => { const list = RELICS.filter(r => r.src.type === 'guild'); const s = (save.guild.season % Math.max(1, list.length / 2)) * 2; return list.slice(s, s + 2); };

// ===== Stránky =====
const MORE_SUBS = {};

MORE_SUBS.milestones = {
  render() {
    const t = UI.msTier || save.tier;
    const prem = !!save.premiumPass[passIndex(t)];
    const rows = MS_WAVES.map(w => {
      const k = msKey(t, w), reached = save.msReached[k], claimed = save.msClaimed[k];
      return `<div class="ms ${claimed ? 'done' : reached ? 'ready' : ''}"><span>Vlna ${w}</span><span>${msLabel(msReward(t, w, false))}</span>
        <span class="${prem ? '' : 'muted'}">${msLabel(msReward(t, w, true))}</span>
        <span>${claimed ? '✔' : reached ? `<button class="btn sm primary" data-act="ms-claim" data-t="${t}" data-w="${w}">Vzít</button>` : ''}</span></div>`;
    }).join('');
    return `<h1>Milníky</h1>
      <div class="tier-sel"><button class="arrow" data-act="ms-tier" data-d="-1" ${t <= 1 ? 'disabled' : ''}>‹</button><span>Tier ${t}</span><button class="arrow" data-act="ms-tier" data-d="1" ${t >= 24 ? 'disabled' : ''}>›</button></div>
      <p class="muted small center">Odměny se musí převzít ručně. Prémiové odměny vyžadují Premium Pass (obchod) pro tiery ${passIndex(t) * 3 + 1}–${passIndex(t) * 3 + 3}.</p>
      ${unclaimedMilestones() ? `<button class="btn wide primary" data-act="ms-claim-all">Převzít vše (${unclaimedMilestones()})</button>` : ''}
      <div class="ms-list"><div class="ms head"><span>Vlna</span><span>Standard</span><span>Premium</span><span></span></div>${rows}</div>`;
  },
};

MORE_SUBS.missions = {
  render() {
    if (!isFeature('missions')) return '<p>Denní mise se odemknou po 3 runech na Tieru 1.</p>';
    refreshMissions();
    const M = save.missions;
    const coins = missionCoins(), shards = isFeature('modules') ? MISSION_SHARDS[save.maxTier - 1] + labV('dmShards') : 0;
    const list = M.list.map((x, i) => {
      const p = missionProg(x), done = p >= x.goal;
      return `<div class="lab-row"><div><b>${x.text.replace('{x}', fmt(x.goal))}</b><div class="bar"><i style="width:${p / x.goal * 100}%"></i></div><div class="small muted">${fmt(p)} / ${fmt(x.goal)}</div></div>
        ${done ? `<button class="btn sm primary" data-act="mission-claim" data-i="${i}">Vzít</button>` : save.labs.missionReroll ? `<button class="btn sm" data-act="mission-reroll" data-i="${i}">⟳ ${save.vault.harmony.missionReroll ? 'zdarma' : '◆5'}</button>` : ''}</div>`;
    }).join('');
    const boxes = WEEKLY_BOXES.map((b, i) => {
      const ok = M.weekDone >= b[0], got = M.boxes.includes(i);
      return `<button class="btn sm ${got ? 'off' : ok ? 'primary' : ''}" data-act="box-claim" data-i="${i}" ${ok && !got ? '' : 'disabled'}>📦 ${b[0]}${got ? ' ✔' : ''}</button>`;
    }).join('');
    const nextBatch = (Math.floor(Date.now() / (8 * HOUR)) + 1) * 8 * HOUR;
    return `<h1>Denní mise</h1><p class="muted small">Max 8 misí, 2 nové každých 8 hodin (další za ${fmtTime((nextBatch - Date.now()) / 1000)}). Odměna: 3 ◆ + © ${fmt(coins)}${shards ? ` + ${shards} úlomků` : ''}.</p>
      ${list || '<p class="muted">Žádné mise.</p>'}
      <h3>Týdenní odměny – splněno ${M.weekDone}/35</h3><div class="row-btns wrap">${boxes}</div>`;
  },
};

MORE_SUBS.tourney = {
  render() {
    if (!isFeature('tourney')) return '<p>Turnaje se odemknou milníkem Tier 1 vlna 60.</p>';
    const st = tourneyState();
    const L = save.tourney.league, lg = LEAGUES[L];
    const cur = st.cur;
    const last = save.tourney.last;
    const rew = lg.rew.map((r, i) => `<tr><td>≤ ${r[0]}.</td><td>◆ ${r[1]}</td><td>▲ ${r[2]}</td>${lg.keys ? `<td>⚿ ${lg.keys[i]}</td>` : ''}</tr>`).join('');
    let ranking = '';
    if (cur && cur.best) {
      const list = tourneyBots(cur.id, cur.league).concat([{ name: 'Ty', wave: cur.best, me: true }]).sort((a, b) => b.wave - a.wave);
      ranking = `<h3>Průběžné pořadí</h3><table class="lb">${list.map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}.</td><td>${x.name}</td><td>vlna ${x.wave}</td></tr>`).join('')}</table>`;
    }
    return `<h1>Turnaje</h1>
      ${tourneyClaimable() ? `<button class="btn huge primary" data-act="tourney-claim">VYZVEDNOUT VÝSLEDEK</button>` : ''}
      <div class="panel center"><div class="panel-t">Liga</div><div class="big-num" style="color:${lg.color}">${lg.name}</div>
        <div class="small muted">Obtížnost ≈ Tier ${lg.eq}+ · boss každých ${lg.boss} vln · ${lg.bcs} náhodných bitevních podmínek · pauza mezi vlnami poloviční · bez perků · top 4 postupují${lg.demote ? ', posledních 6 sestupuje' : ''}</div></div>
      <div class="panel center">${st.open
        ? `Turnaj běží – konec za <b id="tour-cd">${fmtTime((st.end - Date.now()) / 1000)}</b><br>Tikety: <b>${st.tickets}</b>${cur && cur.best ? ` · tvoje nejlepší vlna: <b>${cur.best}</b>` : ''}
          <button class="btn huge primary" data-act="tourney-start" ${st.canPlay ? '' : 'disabled'}>${game.run ? 'Nejdřív dokonči run' : st.tickets > 0 ? 'HRÁT TURNAJ' : 'Žádné tikety'}</button>
          <div class="row-btns"><button class="btn sm" data-act="ticket-ad">+1 tiket (reklama)</button><button class="btn sm gem" data-act="ticket-gem">+1 tiket · ◆ ${10 * ((cur ? cur.extra : 0) + 1)}</button></div>`
        : `Další turnaj (středa / sobota 00:00 UTC) za <b>${fmtTime((st.nextStart - Date.now()) / 1000)}</b>`}</div>
      <h3>Odměny</h3><table class="sum">${rew}</table>
      ${ranking}
      ${last ? `<h3>Poslední turnaj · ${LEAGUES[last.league].name} · ${last.place}. místo</h3>` : ''}`;
  },
  update() { const el = $('#tour-cd'); if (el) el.textContent = fmtTime((tourneyState().end - Date.now()) / 1000); },
};

MORE_SUBS.event = {
  render() {
    if (!isFeature('events')) return '<p>Eventy se odemknou milníkem Tier 1 vlna 70.</p>';
    refreshEvent();
    const E = save.event;
    const start = EVENT_EPOCH + E.idx * 14 * DAY;
    const mult = E.boost ? 2 : 1;
    const ms = eventMissions(E.idx).map(m => {
      const p = eventProg(m);
      const tiers = [0, 1, 2].map(t => {
        const got = E.tiers[m[0] + t], ok = p >= m[2][t];
        return got ? `<span class="good small">✔${EVENT_TIER_MEDALS[t] * mult}</span>` : ok ? `<button class="btn sm primary" data-act="event-claim" data-k="${m[0]}" data-t="${t}">✪${EVENT_TIER_MEDALS[t] * mult}</button>` : `<span class="muted small">${fmt(m[2][t])}</span>`;
      }).join(' ');
      return `<div class="lab-row"><div><b>${m[1].replace('{x}', '…')}</b><div class="small muted">Postup: ${fmt(p)}</div></div><div>${tiers}</div></div>`;
    }).join('');
    const rel = eventRelics().map(r => {
      const got = save.relics.includes(r.id), ok = E.medalsEarned >= r.src.medals && (!r.src.premium || E.boost);
      return `<div class="lab-row"><div><b>${r.name}</b> <span class="small muted">${r.rarity}${r.src.premium ? ' · Premium' : ''}</span><div class="small">${RELIC_EFF_NAMES[r.eff]} +${r.val}${r.eff === 'botRange' ? 'm' : r.eff === 'wallRebuild' ? 's' : '%'}</div></div>
        ${got ? '<span class="good">✔</span>' : ok ? `<button class="btn sm primary" data-act="event-relic" data-id="${r.id}">Vzít</button>` : `<span class="muted small">✪ ${r.src.medals}</span>`}</div>`;
    }).join('');
    return `<h1>Event: ${eventName(E.idx)}</h1>
      <p class="muted small">Končí za ${fmtTime((start + 14 * DAY - Date.now()) / 1000)} · Medaile v eventu: ✪ ${fmt(E.medalsEarned)}${E.boost ? ' · <span class="good">Booster aktivní (x2)</span>' : ''} · Nové mise přibývají prvních 8 dní.</p>
      ${E.boost ? '' : `<button class="btn wide gem" data-act="event-boost">Event booster (x2 medaile + prémiové relikvie) – ukázka zdarma</button>`}
      <h3>Relikvie eventu</h3>${rel || '<p class="muted small">Tento event nemá relikvie.</p>'}
      <h3>Mise</h3>${ms}`;
  },
};

MORE_SUBS.eventshop = {
  render() {
    if (!isFeature('events')) return '<p>Event obchod se odemkne s eventy.</p>';
    refreshEvent();
    const E = save.event;
    const c = EVENT_SHOP_COSTS[Math.min(E.shopBuys, 7)];
    const evSkin = TOWER_SKINS.filter(s => s.src === 'event')[E.idx % 6];
    const evBg = BACKGROUNDS[1 + (E.idx % (BACKGROUNDS.length - 1))];
    const bots = BOT_DEFS.map(b => {
      const st = save.bots[b.id];
      if (!st || !st.owned) return `<div class="uw-card locked" style="--c:${b.color}"><div class="uw-head"><span class="uw-ic">${b.icon}</span><div><b>${b.name}</b><div class="small muted">${b.desc}</div></div></div>
        <button class="btn sm wide ${save.medals >= BOT_UNLOCK[save.botsBought] ? 'primary' : 'off'}" data-act="bot-buy" data-id="${b.id}">Koupit · ✪ ${BOT_UNLOCK[save.botsBought]}</button></div>`;
      const rows = b.stats.map(([k, name, f, max, fm]) => {
        const L = st.lv[k] || 0;
        return `<div class="uw-stat"><span>${name}</span><b>${fm(f(L))}</b>${L < max ? `<button class="btn sm" data-act="bot-up" data-id="${b.id}" data-k="${k}">→ ${fm(f(L + 1))} · ✪${botUpCost(L)}</button>` : '<span class="muted">MAX</span>'}</div>`;
      }).join('');
      return `<div class="uw-card" style="--c:${b.color}"><div class="uw-head"><span class="uw-ic">${b.icon}</span><div><b>${b.name}</b> <button class="btn sm" data-act="bot-toggle" data-id="${b.id}">${st.off ? 'VYP' : 'ZAP'}</button><div class="small muted">${b.desc}</div></div></div>${rows}</div>`;
    }).join('');
    return `<h1>Event obchod</h1><p class="muted small">Medaile: ✪ ${fmt(save.medals)} (z event misí a týdenních boxů)</p>
      <h3>Měny (cena roste s každým nákupem)</h3>
      <div class="row-btns wrap"><button class="btn sm" data-act="es-buy" data-k="gems">150 ◆ · ✪${c}</button><button class="btn sm" data-act="es-buy" data-k="stones">15 ▲ · ✪${c}</button><button class="btn sm" data-act="es-buy" data-k="shards">250 úlomků · ✪${c}</button></div>
      <h3>Motivy a písně (+coin bonus)</h3>
      <div class="row-btns wrap">
        ${save.themes.skins.includes(evSkin.id) ? `<span class="good small">Skin ${evSkin.name} ✔</span>` : `<button class="btn sm" data-act="es-skin" data-id="${evSkin.id}">Skin věže ${evSkin.name} · ✪150</button>`}
        ${save.themes.bgs.includes(evBg.id) ? `<span class="good small">Pozadí ${evBg.name} ✔</span>` : `<button class="btn sm" data-act="es-bg" data-id="${evBg.id}">Pozadí ${evBg.name} · ✪250</button>`}
        ${SONGS.map(s => save.themes.songs.includes(s.id) ? `<span class="good small">♪ ${s.name} ✔</span>` : `<button class="btn sm" data-act="es-song" data-id="${s.id}">♪ ${s.name} · ✪200</button>`).join('')}
      </div>
      <h3>Boti</h3><p class="muted small">Boti stojí u věže a pravidelně se aktivují. Cena odemčení roste: 150 / 300 / 600 / 900 / 1200 medailí.</p>${bots}`;
  },
};

MORE_SUBS.guild = {
  render() {
    if (!isFeature('guilds')) return '<p>Gildy se odemknou milníkem Tier 3 vlna 10.</p>';
    refreshGuild();
    const G = save.guild, gd = save.guardian;
    if (!G.joined) return `<h1>Gilda</h1><p class="muted small">Gilda (30 hráčů) přináší týdenní truhly, tokeny, bity a Guardiana. Ostatní členové jsou simulovaní.</p>
      ${GUILD_NAMES.map(n => `<button class="btn wide" data-act="guild-join" data-n="${n}">Přidat se: ${n}</button>`).join('')}
      <button class="btn wide gem" data-act="guild-create">Založit vlastní gildu · ◆ 50</button>`;
    const total = guildTotal();
    const chests = GUILD_CHESTS.map((c, i) => {
      const ok = total >= c[0], got = G.chests.includes(i);
      return `<button class="btn sm ${got ? 'off' : ok ? 'primary' : ''}" data-act="guild-chest" data-i="${i}" ${ok && !got ? '' : 'disabled'}>🎁 ${c[0]}${got ? ' ✔' : ''}</button>`;
    }).join('');
    const storeItems = [['gems', 'Gemy +100', [15, 25, 40]], ['bits', 'Bity +50', [25, 50, 75]], ['shards', 'Úlomky +250', [5, 10, 15]]].map(([k, n, costs]) => {
      const b = G.store[k] || 0;
      return b < 3 ? `<button class="btn sm" data-act="guild-store" data-k="${k}">${n} · ⛁${costs[b]}</button>` : `<span class="muted small">${n} vyprodáno</span>`;
    }).join('');
    const chips = CHIP_DEFS.map(c => {
      const st = gd.chips[c.id];
      if (!st) return c.base ? '' : `<button class="btn sm" data-act="chip-buy" data-id="${c.id}">${c.icon} ${c.name} · ⛁${c.cost}</button>`;
      const eq = gd.equip.includes(c.id);
      const rows = c.stats.map(([k, name, f, max, fm]) => { const L = st[k] || 0; return `<div class="uw-stat"><span>${name}</span><b>${fm(f(L))}</b>${L < max ? `<button class="btn sm" data-act="chip-up" data-id="${c.id}" data-k="${k}">◇${chipUpCost(L)}</button>` : '<span class="muted">MAX</span>'}</div>`; }).join('');
      return `<div class="uw-card ${eq ? '' : 'locked'}" style="--c:#ff7777"><div class="uw-head"><span class="uw-ic">${c.icon}</span><div><b>${c.name}</b> <button class="btn sm" data-act="chip-eq" data-id="${c.id}">${eq ? 'Sundat' : 'Nasadit'}</button><div class="small muted">${c.desc}</div></div></div>${rows}</div>`;
    }).join('');
    const rel = guildRelics().map((r, i) => `<span class="small ${save.relics.includes(r.id) ? 'good' : 'muted'}">${r.name} (utrať ⛁${i ? 150 : 75})${save.relics.includes(r.id) ? ' ✔' : ''}</span>`).join(' · ');
    return `<h1>Gilda: ${G.name}</h1>
      <div class="cur-row">⛁ ${save.tokens} tokenů · ◇ ${save.bits} bitů · utraceno v sezóně ⛁ ${G.spent}</div>
      <div class="panel"><div class="panel-t">Týdenní příspěvek gildy: ${total} (tvůj: ${G.contribMine})</div><div class="small muted">Každý vyzvednutý týdenní box misí přidá 5.</div><div class="row-btns wrap">${chests}</div></div>
      <h3>Obchod gildy</h3><div class="row-btns wrap">${storeItems}${MENU_THEMES.map(t => save.themes.menus.includes(t.id) ? `<span class="good small">${t.name} ✔</span>` : `<button class="btn sm" data-act="guild-menu" data-id="${t.id}">${t.name} · ⛁100</button>`).join('')}</div>
      <p class="small">Sezónní relikvie: ${rel || '—'}</p>
      <h3>Guardian</h3>
      ${gd.unlocked ? `<p class="muted small">Sloty čipů: ${gd.equip.length}/${gd.slots}${gd.slots < 2 ? ` <button class="btn sm" data-act="guardian-slot">+ slot · ◇300</button>` : ''}</p>${chips}` : `<button class="btn wide ${save.bits >= GUARDIAN_UNLOCK ? 'primary' : 'off'}" data-act="guardian-unlock">Odemknout Guardiana · ◇ ${GUARDIAN_UNLOCK}</button>`}
      <button class="btn sm danger" data-act="guild-leave">Opustit gildu</button>`;
  },
};

MORE_SUBS.vault = {
  render() {
    if (!isFeature('vault')) return '<p>Trezor se zpřístupní po postupu do ligy Legenda (klíče ⚿ z turnajů Legenda/Mýtus).</p>';
    const V = save.vault;
    const harmony = VAULT_HARMONY.map(([k, n, c, d]) => `<div class="lab-row"><div><b>${n}</b><div class="small muted">${d}</div></div>${V.harmony[k] ? '<span class="good">✔</span>' : `<button class="btn sm ${save.keys >= c ? 'primary' : 'off'}" data-act="vault-h" data-k="${k}" data-c="${c}">⚿ ${c}</button>`}</div>`).join('');
    const power = ['atk', 'def', 'util', 'uw'].map(cat => {
      if (!V.sections[cat]) return `<button class="btn wide" data-act="vault-sec" data-k="${cat}">Odemknout sekci ${({ atk: 'Útok', def: 'Obrana', util: 'Utilita', uw: 'Zbraně' })[cat]} · ⚿25</button>`;
      return VAULT_POWER.filter(p => p[0] === cat).map(([, k, n, per]) => { const L = V.power[k] || 0; return `<div class="uw-stat"><span>${n}</span><b>+${per * L}%</b>${L < 5 ? `<button class="btn sm" data-act="vault-p" data-k="${k}">⚿ ${VAULT_POWER_COSTS[L]}</button>` : '<span class="muted">MAX</span>'}</div>`; }).join('');
    }).join('');
    const enemy = VAULT_ENEMY.map(([t, n]) => {
      const e = V.enemy[t] || {};
      return `<div class="uw-stat"><span>${n}</span>${['atk', 'hp'].map(k => `<button class="btn sm" data-act="vault-e" data-t="${t}" data-k="${k}">${k === 'atk' ? 'Útok' : 'HP'} -${e[k] || 0}% · ⚿${vaultEnemyCost(e[k] || 0)}</button>`).join('')}</div>`;
    }).join('');
    return `<h1>Trezor</h1><div class="cur-row">⚿ ${save.keys} klíčů</div><h3>Harmonie</h3>${harmony}<h3>Síla</h3>${power}<h3>Nepřátelé</h3>${enemy}`;
  },
};

MORE_SUBS.relics = {
  render() {
    const owned = RELICS.filter(r => save.relics.includes(r.id));
    const sums = {};
    for (const r of owned) sums[r.eff] = (sums[r.eff] || 0) + r.val;
    const groups = [['ms', 'Milníky (vlna 4500)'], ['tourney', 'Turnaje'], ['event', 'Eventy'], ['eventShop', 'Event obchod'], ['guild', 'Gilda'], ['years', 'Výročí'], ['other', 'Ostatní']];
    return `<h1>Relikvie (${owned.length}/${RELICS.length})</h1>
      <div class="panel small">${Object.entries(sums).map(([k, v]) => `<span class="bc">${RELIC_EFF_NAMES[k]} +${v.toFixed(1)}${k === 'botRange' ? 'm' : k === 'wallRebuild' ? 's' : '%'}</span>`).join('') || 'Zatím žádné bonusy.'}</div>
      ${groups.map(([g, gn]) => {
        const list = RELICS.filter(r => r.src.type === g);
        if (!list.length) return '';
        return `<h3>${gn}</h3>` + list.map(r => `<div class="relic ${save.relics.includes(r.id) ? 'own' : ''}"><b>${r.name}</b> <span class="small muted">${r.rarity}</span><div class="small">${RELIC_EFF_NAMES[r.eff]} +${r.val}${r.eff === 'botRange' ? 'm' : r.eff === 'wallRebuild' ? 's' : '%'} · ${r.source}</div></div>`).join('');
      }).join('')}`;
  },
};

MORE_SUBS.themes = {
  render() {
    const t = save.themes;
    const sk = TOWER_SKINS.map(s => {
      const own = t.skins.includes(s.id), act = t.skin === s.id;
      const src = s.src === 'ms' ? `milník T${SKIN_MS_TIERS[s.id]} v2500` : s.src === 'event' ? 'event obchod' : '';
      return `<div class="theme ${act ? 'eq' : ''} ${own ? '' : 'locked'}" style="--c:${s.color}" ${own && !act ? `data-act="theme-skin" data-id="${s.id}"` : ''}>
        <svg viewBox="-12 -12 24 24" width="48" height="48">${s.shape ? `<polygon points="${Array.from({ length: s.shape }, (_, i) => { const a = Math.PI / 6 + i * Math.PI * 2 / s.shape; return (Math.cos(a) * 9).toFixed(2) + ',' + (Math.sin(a) * 9).toFixed(2); }).join(' ')}" fill="none" stroke="${s.color}" stroke-width="1.5"/>` : `<circle r="9" fill="none" stroke="${s.color}" stroke-width="1.5"/>`}</svg>
        <b class="small">${s.name}</b><div class="small muted">${own ? (act ? 'Aktivní' : 'Použít') : src}</div></div>`;
    }).join('');
    const bg = BACKGROUNDS.map(b => `<div class="theme ${t.bg === b.id ? 'eq' : ''} ${t.bgs.includes(b.id) ? '' : 'locked'}" style="--c:#7a6bff;background:${b.bg}" ${t.bgs.includes(b.id) && t.bg !== b.id ? `data-act="theme-bg" data-id="${b.id}"` : ''}><b class="small">${b.name}</b><div class="small muted">${t.bgs.includes(b.id) ? (t.bg === b.id ? 'Aktivní' : 'Použít') : 'event obchod'}</div></div>`).join('');
    return `<h1>Motivy</h1><p class="muted small">Každý vlastněný motiv dává trvalý coin bonus (skin 0,4 %, pozadí 0,8 %, menu 0,6 %, píseň 0,6 %). Celkem: <b>+${(themeBonus() * 100).toFixed(1)} %</b></p>
      <h3>Skiny věže</h3><div class="theme-grid">${sk}</div><h3>Pozadí</h3><div class="theme-grid">${bg}</div>
      <h3>Menu a písně</h3><p class="small">${MENU_THEMES.map(m => `${t.menus.includes(m.id) ? '✔' : '✖'} ${m.name}`).join(' · ')}<br>${SONGS.map(s => `${t.songs.includes(s.id) ? '✔' : '✖'} ♪ ${s.name}`).join(' · ')}</p>`;
  },
};

MORE_SUBS.perks = {
  render() {
    if (!isFeature('perks')) return '<p>Perky se odemknou laboratoří „Odemknout perky“ (milník Tier 2 vlna 150).</p>';
    const C = save.perkCfg;
    const bans = labV('perkBans');
    const opts = PERK_DEFS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    return `<h1>Perky</h1><p class="muted small">Perk každých 200 vln (snižuje lab „Vlny na perk“ a perk -20 %). Nabídka: ${2 + labV('perkOptions')} možnosti. Šance: 20 % zbraň, 12 % trade-off, 68 % standard. V turnajích perky nejsou.</p>
      ${save.labs.firstPerk ? `<div class="panel"><div class="panel-t">První perk</div><select data-input="perk-first"><option value="">—</option>${PERK_DEFS.map(p => `<option value="${p.id}" ${C.first === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>` : ''}
      ${bans ? `<div class="panel"><div class="panel-t">Zakázané perky (${C.bans.length}/${bans})</div>${PERK_DEFS.map(p => `<label class="small chk"><input type="checkbox" data-act="perk-ban" data-id="${p.id}" ${C.bans.includes(p.id) ? 'checked' : ''}> ${p.name}</label>`).join('')}</div>` : ''}
      ${save.labs.autoPerk ? `<div class="panel"><div class="panel-t">Automatický výběr</div><label class="chk"><input type="checkbox" data-act="perk-auto" ${C.auto ? 'checked' : ''}> zapnuto</label>
        <div class="small">Pořadí (max ${labV('perkRanking')}): ${C.ranking.map((id, i) => `<span class="bc">${i + 1}. ${PERK_MAP[id].name} <a data-act="rank-del" data-i="${i}">✕</a></span>`).join('')}</div>
        ${C.ranking.length < labV('perkRanking') ? `<select data-input="rank-add"><option value="">+ přidat</option>${opts}</select>` : ''}</div>` : ''}`;
  },
};

MORE_SUBS.disso = {
  render() {
    if (!isFeature('dissonance')) return '<p>Disonance se odemkne milníkem Tier 4 vlna 90.</p>';
    const rows = Object.keys(save.disso).sort((a, b) => a - b).map(t => `<tr><td>Tier ${t}</td>${DISSO_CATS.map(([k]) => `<td>x${(save.disso[t][k] || 1).toFixed(3)}</td>`).join('')}</tr>`).join('');
    return `<h1>Disonance</h1><p class="muted small">Disonantní run zakáže jednu kategorii vylepšení. Podle dosažené vlny získáš trvalý boost: 1 + (max−1)·(vlna/5000)^1.75 (útok/obrana/zbraně max x5, utilita x3). Boost platí na daném tieru a 0,5 % z něj se ozývá na ostatních tierech. Spouští se z menu bitvy.</p>
      <table class="sum"><tr><td></td>${DISSO_CATS.map(c => `<td>${c[1]}</td>`).join('')}</tr>${rows || '<tr><td colspan="5">Zatím žádné boosty.</td></tr>'}</table>`;
  },
};

MORE_SUBS.shop = {
  render() {
    const items = SHOP_ITEMS.map(it => {
      const owned = save.shop[it.id];
      return `<div class="shop-item" style="--c:${it.color}"><div class="shop-name">${it.name}</div><div class="small">© ${it.desc}</div>
        <div class="shop-body">${it.id === 'noAds' ? '<div class="shop-play">▶</div>' : `<div class="shop-coin">C<sup>x${it.mult}</sup></div><span class="shop-plus">+</span><span class="shop-gems">◆ ${it.gems}</span>`}
        ${owned ? '<span class="good shop-btn">✔ Zakoupeno</span>' : `<button class="btn primary shop-btn" data-act="shop-buy" data-id="${it.id}">Koupit</button>`}</div></div>`;
    }).join('');
    const today = utcDay(Date.now());
    const ad = save.adGems.day === today ? save.adGems : { count: 0, last: 0 };
    const adReady = Date.now() - ad.last >= AD_GEM_COOLDOWN && ad.count < AD_GEMS_PER_DAY / AD_GEMS;
    return `<h1>Obchod</h1><p class="shop-head">Všechny coin bonusy se násobí</p>${items}
      <div class="panel"><div class="panel-t">Zdarma</div>
        <button class="btn wide ${save.dailyGems === today ? 'off' : 'primary'}" data-act="daily-gems">Denní gemy +${DAILY_FREE_GEMS} ◆${save.dailyGems === today ? ' (zítra)' : ''}</button>
        <button class="btn wide ${adReady ? '' : 'off'}" data-act="ad-gems">▶ Reklama: +${AD_GEMS} ◆ ${adReady ? '' : `(za ${fmtTime((AD_GEM_COOLDOWN - (Date.now() - ad.last)) / 1000)})`} · dnes ${ad.count * AD_GEMS}/${AD_GEMS_PER_DAY}</button>
        <button class="btn wide" data-act="ad-bonus">▶ Bonus x1.5 coinů na ${AD_BONUS_MIN} min${adBonusActive() ? ` – aktivní ${save.shop.noAds ? 'vždy' : fmtTime((save.adBonusUntil - Date.now()) / 1000)}` : ''}</button></div>
      <div class="panel"><div class="panel-t">Balíčky (ukázka – zdarma)</div><div class="row-btns wrap">
        ${GEM_PACKS.map(([n, name]) => `<button class="btn sm gem" data-act="shop-gems" data-n="${n}">${name}: ◆ ${n}</button>`).join('')}
        <button class="btn sm stone" data-act="shop-stones">Balíček kamenů: ▲ ${STONE_PACK}</button>
        <button class="btn sm" data-act="shop-tickets">10 tiketů na moduly</button></div></div>
      <div class="panel"><div class="panel-t">Premium Pass milníků (ukázka – zdarma)</div><div class="row-btns wrap">
        ${Array.from({ length: 8 }, (_, i) => save.premiumPass[i] ? `<span class="good small">T${i * 3 + 1}–${i * 3 + 3} ✔</span>` : `<button class="btn sm" data-act="shop-pass" data-i="${i}">Tiery ${i * 3 + 1}–${i * 3 + 3}</button>`).join('')}</div></div>
      <p class="muted small">Toto je ukázkový obchod – nákupy jsou zdarma, žádné skutečné platby.</p>`;
  },
};

MORE_SUBS.stats = {
  render() {
    const s = save.stats;
    const rows = [['Odehrané runy', s.runs], ['Zabití celkem', fmt(s.kills)], ['Bossové', fmt(s.bosses)], ['Coiny celkem', fmt(s.coins)], ['Herní čas', fmtTime(s.playTime)], ['Odemčený tier', save.maxTier], ['Liga', LEAGUES[save.tourney.league].name], ['Relikvie', save.relics.length],
      ...Object.keys(save.best).sort((a, b) => a - b).map(t => [`Nejvyšší vlna Tier ${t}`, save.best[t]])];
    const S = computeStats(null);
    const eff = [['Poškození', fmt(S.damage)], ['Rychlost útoku', S.atkSpeed.toFixed(2)], ['Krit', pctFmt(S.critChance) + ' / x' + S.critFactor.toFixed(2)], ['Super krit', pctFmt(S.scChance) + ' / x' + S.scMult.toFixed(2)],
      ['Dosah', S.range.toFixed(1) + 'm'], ['Max HP', fmt(S.maxHp)], ['Regenerace', fmt(S.regen) + '/s'], ['Obrana', pctFmt(S.defPct) + ' / ' + fmt(S.defAbs)], ['eHP', fmt((S.maxHp + S.defAbs) / (1 - S.defPct))],
      ['Cash bonus', 'x' + S.cashMult.toFixed(2)], ['Coin bonus', 'x' + fmt(S.coinMult * S.coinKill)]];
    return `<h1>Statistiky</h1><table class="sum">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
      <h3>Startovní statistiky věže</h3><table class="sum">${eff.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
  },
};

MORE_SUBS.history = {
  render() {
    return `<h1>Historie bitev</h1>` + (save.history.map(h => `<div class="lab-row small"><div><b>${h.tourney !== null && h.tourney !== undefined ? 'Turnaj ' + LEAGUES[h.tourney].name : (h.disso ? 'Disonance ' : '') + 'Tier ' + h.tier} · vlna ${h.wave}</b><div class="muted">${new Date(h.t).toLocaleString('cs-CZ')}</div></div><div>© ${fmt(h.coins)}<br>${fmt(h.kills)} zabití · ${fmtTime(h.time)}</div></div>`).join('') || '<p class="muted">Zatím žádné bitvy.</p>');
  },
};

MORE_SUBS.settings = {
  render() {
    return `<h1>Nastavení</h1>
      <button class="btn wide" data-act="toggle-glow">Neonová záře: ${save.glow ? 'ZAP' : 'VYP'}</button>
      <button class="btn wide" data-act="toggle-dmg">Čísla poškození: ${save.dmgNumbers !== false ? 'ZAP' : 'VYP'}</button>
      ${labV('targetPriority') ? `<div class="panel"><div class="panel-t">Priorita cílů</div><select data-input="target-prio">${[['nearest', 'Nejbližší'], ...Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.name]), ...(labV('targetPriority') >= 2 ? [['spotlight', 'V reflektoru']] : [])].map(([k, n]) => `<option value="${k}" ${save.targetPrio === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      <button class="btn wide" data-act="export">Exportovat uložení</button>
      <button class="btn wide" data-act="import">Importovat uložení</button>
      <button class="btn wide danger" data-act="reset">Smazat veškerý postup</button>
      <p class="muted small">Hra se ukládá automaticky do prohlížeče každých 10 s.</p>`;
  },
};

MORE_SUBS.help = {
  render() {
    return `<h1>Jak hrát</h1><div class="help">
    <p>Uprostřed stojí <b>věž</b>, která automaticky střílí. Nepřátelé přicházejí ve <b>vlnách</b> (26 s + 9 s pauza). Run končí pádem věže.</p>
    <h3>Progrese</h3>
    <p><b>Cash ($)</b> – vylepšení během runu (resetují se). <b>Coiny (©)</b> – trvalá dílna, laby, sloty modulů. <b>Gemy (◆)</b> – karty, moduly, sloty labů, urychlení. <b>Kameny (▲)</b> – ultimátní zbraně, mistrovství, asistenti. <b>Medaile (✪)</b> – event obchod a boti. <b>Buňky (⬣)</b> – z elit, zrychlení labů. <b>Klíče (⚿)</b> – trezor. <b>Bity/tokeny</b> – gilda a guardian. <b>Úlomky</b> – moduly.</p>
    <h3>Odemykání (milníky)</h3>
    <p>Milníky se musí převzít ručně. T1 v30 laboratoře · T1 v60 turnaje · T1 v70 eventy · T2 v90 moduly · T2 v150 perky (lab) · T3 v10 gildy · T4 v30 denní mise reroll · T4 v90 disonance · T12 v60 vylepšení dílny+ · T16 v100 mistrovství karet · T19 v40 asistenční moduly. Vlna 100 (od T15 vlna 300) odemyká další tier (celkem 24).</p>
    <h3>Nepřátelé</h3>
    <p>Základní, rychlý (2,1x rychlost), tank (5x HP), střelec, <b>ochránce</b> (od T2 – nepřátelé v jeho okolí nejdou okamžitě zabít a berou méně poškození), <b>boss</b> (20x HP). <b>Elity</b> podle tieru: upír (bere 2 % HP/s a blokuje regeneraci), paprsek (střílí z dálky), rozptylovač (dělí se 4x). <b>Flotily</b> od T14: sabotér (vypíná zbraně), velitel (posiluje okolí), přebíječ (vracející se střela). Útoky na blízko sílí o 4 % s každým zásahem; nepřátelé živí 3+ vlny dávají poloviční coiny.</p>
    <h3>Tipy</h3>
    <p>eHP = (HP + obrana abs.) / (1 − obrana %). Ekonomika (cash, úrok, coiny) se vyplatí brzy. Laby nechávej běžet pořád. Zlatá věž + vlna smrti + černá díra jsou hlavní farmící zbraně.</p></div>`;
  },
};

// ===== akce =====
Object.assign(ACTIONS, {
  'more-sub': el => { UI.moreSub = el.dataset.sub; renderPage(); $('#page').scrollTop = 0; },
  'lab-start': el => startLab(el.dataset.id),
  'lab-auto': el => { save.labAuto[el.dataset.id] = el.checked; },
  'lab-rush': el => {
    const a = save.labActive[+el.dataset.i]; if (!a) return;
    const c = rushCost(a);
    if (save.gems < c) { toast('Nedostatek gemů'); return; }
    save.gems -= c; a.done = a.work; labTick();
  },
  'lab-slot': () => {
    const c = LAB_SLOT_COSTS[save.labSlots];
    if (!c || save.gems < c) { toast('Nedostatek gemů'); return; }
    save.gems -= c; save.labSlots++; renderPage();
  },
  'lab-boost': el => {
    const m = +el.dataset.m, c = +el.dataset.c;
    if (save.cells < c) { toast('Nedostatek buněk'); return; }
    save.cells -= c; save.labBoost = { until: Date.now() + HOUR, mult: m }; renderPage();
  },
  'uw-buy': () => buyUW(),
  'uw-up': el => {
    const u = UW_MAP[el.dataset.id], st = u.stats.find(s => s.id === el.dataset.stat);
    const L = save.uw[u.id][st.id] || 0;
    const c = st.costs[L + 1];
    if (L >= st.max || save.stones < c) { toast('Nedostatek kamenů'); return; }
    save.stones -= c; save.uw[u.id][st.id] = L + 1; markDirty(); renderPage();
  },
  'uwp-unlock': el => {
    const c = UWP_UNLOCK_COSTS[Object.keys(save.uwPlus).length];
    if (save.stones < c) { toast('Nedostatek kamenů'); return; }
    save.stones -= c; save.uwPlus[el.dataset.id] = 0; markDirty(); renderPage();
  },
  'uwp-up': el => {
    const L = save.uwPlus[el.dataset.id], c = uwpLevelCost(L);
    if (L >= 10 || save.stones < c) { toast('Nedostatek kamenů'); return; }
    save.stones -= c; save.uwPlus[el.dataset.id] = L + 1; markDirty(); renderPage();
  },
  'card-buy': el => buyCards(+el.dataset.n),
  'card-toggle': el => { if (el.closest('button[data-act^="mastery"]')) return; toggleCard(el.dataset.id); },
  'card-slot': () => {
    const c = CARD_SLOT_COSTS[save.cardSlots - 1];
    if (!c || save.gems < c) { toast('Nedostatek gemů'); return; }
    save.gems -= c; save.cardSlots++; renderPage();
  },
  'preset-save': () => { save.cardPresets[save.cardPreset] = save.cardEquip.slice(); toast('Předvolba uložena'); },
  'preset-load': el => {
    if (game.run) { toast('Předvolby nelze měnit během runu'); return; }
    save.cardPreset = +el.dataset.i;
    const p = save.cardPresets[save.cardPreset];
    if (p && p.length) save.cardEquip = p.filter(id => save.cards[id]).slice(0, cardSlotsTotal());
    markDirty(); renderPage();
  },
  'mastery-buy': el => {
    const m = CARD_MASTERY[el.dataset.id];
    if (save.stones < m[1]) { toast('Nedostatek kamenů'); return; }
    save.stones -= m[1]; save.cardMastery[el.dataset.id] = 0; markDirty(); renderPage();
  },
  'mastery-up': el => {
    const L = save.cardMastery[el.dataset.id], c = interpRows(WIKI.ws.Card_Masteries || [[1, 1e15]], L + 1);
    if (save.coins < c) { toast('Nedostatek coinů'); return; }
    save.coins -= c; save.cardMastery[el.dataset.id] = L + 1; markDirty(); renderPage();
  },
  'mod-draw': el => drawModules(+el.dataset.n),
  'mod-equip': el => moduleAction('equip', +el.dataset.uid),
  'mod-fav': el => moduleAction('fav', +el.dataset.uid),
  'mod-shatter': el => confirmModal('Rozbít modul na úlomky?', () => moduleAction('shatter', +el.dataset.uid)),
  'mod-shatter-commons': () => {
    const eq = new Set(Object.values(save.modEquip));
    const list = save.modules.filter(m => m.rarity === 0 && !eq.has(m.uid) && !m.fav);
    for (const m of list) save.shards[m.type] += Math.round(5 * (1 + labV('shatterBonus')));
    save.modules = save.modules.filter(m => !list.includes(m));
    toast(`Rozbito ${list.length} modulů`); renderPage();
  },
  'mod-merge-all': () => mergeAllModules(),
  'mod-lock': el => moduleAction('lock', +el.dataset.uid, el),
  'mod-reroll': el => moduleAction('reroll', +el.dataset.uid),
  'mod-merge': el => moduleAction('merge', +el.dataset.uid),
  'slot-up': el => {
    const t = el.dataset.t, L = save.modSlots[t] || 0, c = slotCost(L);
    if (L >= 300 || save.shards[t] < c.shard || save.coins < c.coin) { toast('Nedostatek úlomků nebo coinů'); return; }
    save.shards[t] -= c.shard; save.coins -= c.coin; save.modSlots[t] = L + 1; markDirty(); renderPage();
  },
  'assist-unlock': el => { if (save.stones < 1000) { toast('Nedostatek kamenů'); return; } save.stones -= 1000; save.assist[el.dataset.t] = { uid: null, main: 0.01, sub: 0.01 }; renderPage(); },
  'assist-pick': el => {
    const t = el.dataset.t;
    const opts = save.modules.filter(m => m.type === t && m.uid !== save.modEquip[t] && m.unique !== (modByUid(save.modEquip[t]) || {}).unique);
    const m = modal(`<h2>Asistent ${MOD_TYPES[t].name}</h2><div class="perk-list">${opts.map(o => `<button class="perk" data-uid="${o.uid}">${modName(o)} · ${MOD_RARITIES[o.rarity].name}</button>`).join('') || '<p class="muted">Žádný vhodný modul.</p>'}</div>`);
    $$('.perk', m).forEach(b => b.onclick = () => { save.assist[t].uid = +b.dataset.uid; m.remove(); markDirty(); renderPage(); });
  },
  'assist-up': el => {
    const a = save.assist[el.dataset.t], k = el.dataset.k;
    const lv = Math.round((a[k] || 0.01) * 100);
    const c = 15 + 3 * (lv - 1);
    if (lv >= (k === 'main' ? 100 : 70) || save.stones < c) { toast('Nedostatek kamenů'); return; }
    save.stones -= c; a[k] = (lv + 1) / 100; markDirty(); renderPage();
  },
  'ms-tier': el => { UI.msTier = clamp((UI.msTier || save.tier) + +el.dataset.d, 1, 24); renderPage(); },
  'ms-claim': el => { const r = claimMilestone(+el.dataset.t, +el.dataset.w); if (r) toast(r, 'gold'); renderPage(); buildNav(); },
  'ms-claim-all': () => {
    const keys = Object.keys(save.msReached).filter(k => !save.msClaimed[k]);
    for (const k of keys) { const [t, w] = k.split('-').map(Number); claimMilestone(t, w); }
    toast(`Převzato ${keys.length} milníků`, 'gold'); renderPage(); buildNav();
  },
  'mission-claim': el => {
    const M = save.missions, x = M.list[+el.dataset.i];
    if (!x || missionProg(x) < x.goal) return;
    M.list.splice(+el.dataset.i, 1);
    save.gems += 3; save.coins += missionCoins();
    if (isFeature('modules')) save.shards[pick(['cannon', 'armor', 'generator', 'core'])] += MISSION_SHARDS[save.maxTier - 1] + labV('dmShards');
    M.weekDone++;
    toast(`Mise splněna: +3 ◆ +© ${fmt(missionCoins())}`, 'good');
    renderPage(); buildNav();
  },
  'mission-reroll': el => {
    const M = save.missions;
    if (!save.vault.harmony.missionReroll) { if (save.gems < 5) { toast('Nedostatek gemů'); return; } save.gems -= 5; }
    const old = M.list.splice(+el.dataset.i, 1)[0];
    addMission();
    if (M.list.length && M.list[M.list.length - 1].key === old.key) { M.list.pop(); addMission(); }
    renderPage();
  },
  'box-claim': el => {
    const i = +el.dataset.i, b = WEEKLY_BOXES[i], M = save.missions;
    if (M.boxes.includes(i) || M.weekDone < b[0]) return;
    M.boxes.push(i);
    save.coins += missionCoins() * b[1]; save.gems += b[2];
    if (isFeature('events')) save.medals += b[3];
    if (isFeature('tourney')) save.stones += b[4];
    if (isFeature('guilds')) { save.tokens += b[5]; if (save.guild.joined) save.guild.contribMine += 5; }
    toast('Týdenní box otevřen', 'gold'); renderPage();
  },
  'tourney-start': () => enterTourney(),
  'tourney-claim': () => { claimTourney(); renderPage(); buildNav(); },
  'ticket-ad': () => playAd(() => addTicket()),
  'ticket-gem': () => {
    const st = tourneyState(); const c = 10 * ((st.cur ? st.cur.extra : 0) + 1);
    if (save.gems < c) { toast('Nedostatek gemů'); return; }
    save.gems -= c; addTicket();
  },
  'event-claim': el => {
    const E = save.event, k = el.dataset.k + el.dataset.t;
    if (E.tiers[k]) return;
    E.tiers[k] = true;
    const m = EVENT_TIER_MEDALS[+el.dataset.t] * (E.boost ? 2 : 1);
    save.medals += m; E.medalsEarned += m;
    toast(`+✪ ${m}`, 'gold'); renderPage();
  },
  'event-relic': el => { if (!save.relics.includes(el.dataset.id)) save.relics.push(el.dataset.id); markDirty(); renderPage(); toast('Relikvie získána', 'gold'); },
  'event-boost': () => confirmModal('Koupit event booster? (ukázka – zdarma)', () => { save.event.boost = true; save.medals += save.event.medalsEarned; save.event.medalsEarned *= 2; renderPage(); }),
  'es-buy': el => {
    const E = save.event, c = EVENT_SHOP_COSTS[Math.min(E.shopBuys, 7)];
    if (save.medals < c) { toast('Nedostatek medailí'); return; }
    save.medals -= c; E.shopBuys++;
    const k = el.dataset.k;
    if (k === 'gems') save.gems += 150; else if (k === 'stones') save.stones += 15; else save.shards[pick(['cannon', 'armor', 'generator', 'core'])] += 250;
    renderPage();
  },
  'es-skin': el => { if (save.medals < 150) { toast('Nedostatek medailí'); return; } save.medals -= 150; save.themes.skins.push(el.dataset.id); markDirty(); renderPage(); },
  'es-bg': el => { if (save.medals < 250) { toast('Nedostatek medailí'); return; } save.medals -= 250; save.themes.bgs.push(el.dataset.id); markDirty(); renderPage(); },
  'es-song': el => { if (save.medals < 200) { toast('Nedostatek medailí'); return; } save.medals -= 200; save.themes.songs.push(el.dataset.id); markDirty(); renderPage(); },
  'bot-buy': el => {
    const c = BOT_UNLOCK[save.botsBought];
    if (save.medals < c) { toast('Nedostatek medailí'); return; }
    save.medals -= c; save.botsBought++; save.bots[el.dataset.id] = { owned: true, lv: {} }; markDirty(); renderPage();
  },
  'bot-up': el => {
    const st = save.bots[el.dataset.id], L = st.lv[el.dataset.k] || 0, c = botUpCost(L);
    if (save.medals < c) { toast('Nedostatek medailí'); return; }
    save.medals -= c; st.lv[el.dataset.k] = L + 1; markDirty(); renderPage();
  },
  'bot-toggle': el => { const st = save.bots[el.dataset.id]; st.off = !st.off; markDirty(); renderPage(); },
  'guild-join': el => { save.guild.joined = true; save.guild.name = el.dataset.n; markDirty(); renderPage(); },
  'guild-create': () => {
    if (save.gems < 50) { toast('Nedostatek gemů'); return; }
    const n = prompt('Název gildy (3–20 znaků):', 'Moje gilda');
    if (!n || n.length < 3) return;
    save.gems -= 50; save.guild.joined = true; save.guild.name = n.slice(0, 20); renderPage();
  },
  'guild-leave': () => confirmModal('Opustit gildu? Guardian nebude bojovat.', () => { save.guild.joined = false; markDirty(); renderPage(); }),
  'guild-chest': el => {
    const i = +el.dataset.i, c = GUILD_CHESTS[i], G = save.guild;
    if (G.chests.includes(i) || guildTotal() < c[0]) return;
    G.chests.push(i);
    save.tokens += c[1]; save.bits += c[2]; save.coins += MISSION_COINS[Math.min(save.maxTier, 18) - 1] * c[3]; save.gems += c[4];
    toast('Truhla gildy otevřena', 'gold'); renderPage();
  },
  'guild-store': el => {
    const k = el.dataset.k, G = save.guild, b = G.store[k] || 0;
    const costs = { gems: [15, 25, 40], bits: [25, 50, 75], shards: [5, 10, 15] }[k];
    if (b >= 3 || save.tokens < costs[b]) { toast('Nedostatek tokenů'); return; }
    spendTokens(costs[b]); G.store[k] = b + 1;
    if (k === 'gems') save.gems += 100; else if (k === 'bits') save.bits += 50; else save.shards[pick(['cannon', 'armor', 'generator', 'core'])] += 250;
    renderPage();
  },
  'guild-menu': el => { if (save.tokens < 100) { toast('Nedostatek tokenů'); return; } spendTokens(100); save.themes.menus.push(el.dataset.id); markDirty(); renderPage(); },
  'guardian-unlock': () => {
    if (save.bits < GUARDIAN_UNLOCK) { toast('Nedostatek bitů'); return; }
    save.bits -= GUARDIAN_UNLOCK;
    save.guardian.unlocked = true; save.guardian.chips = { ally: {}, attack: {} }; save.guardian.equip = ['attack'];
    markDirty(); renderPage();
  },
  'guardian-slot': () => { if (save.bits < 300) { toast('Nedostatek bitů'); return; } save.bits -= 300; save.guardian.slots = 2; renderPage(); },
  'chip-buy': el => {
    const c = CHIP_MAP[el.dataset.id];
    if (save.tokens < c.cost) { toast('Nedostatek tokenů'); return; }
    spendTokens(c.cost); save.guardian.chips[c.id] = {}; renderPage();
  },
  'chip-eq': el => {
    if (game.run) { toast('Čipy nelze měnit během runu'); return; }
    const g = save.guardian, id = el.dataset.id, i = g.equip.indexOf(id);
    if (i >= 0) g.equip.splice(i, 1); else if (g.equip.length < g.slots) g.equip.push(id); else { toast('Sloty čipů jsou plné'); return; }
    markDirty(); renderPage();
  },
  'chip-up': el => {
    if (game.run) { toast('Čipy nelze vylepšovat během runu'); return; }
    const st = save.guardian.chips[el.dataset.id], L = st[el.dataset.k] || 0, c = chipUpCost(L);
    if (save.bits < c) { toast('Nedostatek bitů'); return; }
    save.bits -= c; st[el.dataset.k] = L + 1; markDirty(); renderPage();
  },
  'vault-h': el => { const c = +el.dataset.c; if (save.keys < c) { toast('Nedostatek klíčů'); return; } save.keys -= c; save.vault.harmony[el.dataset.k] = true; if (el.dataset.k === 'rerollDisc') save.vault.harmony.rerollDisc = 8; markDirty(); renderPage(); },
  'vault-sec': el => { if (save.keys < 25) { toast('Nedostatek klíčů'); return; } save.keys -= 25; save.vault.sections[el.dataset.k] = true; renderPage(); },
  'vault-p': el => { const L = save.vault.power[el.dataset.k] || 0, c = VAULT_POWER_COSTS[L]; if (L >= 5 || save.keys < c) { toast('Nedostatek klíčů'); return; } save.keys -= c; save.vault.power[el.dataset.k] = L + 1; markDirty(); renderPage(); },
  'vault-e': el => {
    const e = save.vault.enemy[el.dataset.t] = save.vault.enemy[el.dataset.t] || {};
    const L = e[el.dataset.k] || 0, c = vaultEnemyCost(L);
    if (L >= 30 || save.keys < c) { toast('Nedostatek klíčů'); return; }
    save.keys -= c; e[el.dataset.k] = L + 1; markDirty(); renderPage();
  },
  'theme-skin': el => { save.themes.skin = el.dataset.id; track('skin_change'); renderPage(); },
  'theme-bg': el => { save.themes.bg = el.dataset.id; renderPage(); },
  'perk-ban': el => {
    const C = save.perkCfg, id = el.dataset.id;
    if (el.checked) { if (C.bans.length >= labV('perkBans')) { el.checked = false; toast('Maximum zákazů'); return; } C.bans.push(id); }
    else C.bans = C.bans.filter(x => x !== id);
  },
  'perk-auto': el => { save.perkCfg.auto = el.checked; },
  'rank-del': el => { save.perkCfg.ranking.splice(+el.dataset.i, 1); renderPage(); },
  'shop-buy': el => {
    const it = SHOP_ITEMS.find(x => x.id === el.dataset.id);
    if (!it || save.shop[it.id]) return;
    confirmModal(`Koupit ${it.name}?<br><span class="small muted">(ukázka – zdarma)</span>`, () => {
      save.shop[it.id] = true; save.gems += it.gems; markDirty(); renderPage(); updateTopbar();
      toast(`${it.name} zakoupen!` + (it.gems ? ` +${it.gems} ◆` : ''), 'gem');
    });
  },
  'shop-gems': el => { save.gems += +el.dataset.n; toast(`+◆ ${el.dataset.n}`, 'gem'); },
  'shop-stones': () => { save.stones += STONE_PACK; toast(`+▲ ${STONE_PACK}`, 'gold'); },
  'shop-tickets': () => { save.modTickets += 10; toast('+10 tiketů na moduly', 'gold'); },
  'shop-pass': el => { save.premiumPass[+el.dataset.i] = true; for (const k in save.msClaimed) { const [t, w] = k.split('-').map(Number); if (passIndex(t) === +el.dataset.i) grantReward(msReward(t, w, true), t); } toast('Premium Pass aktivní – prémiové odměny připsány', 'gold'); renderPage(); },
  'daily-gems': () => { const d = utcDay(Date.now()); if (save.dailyGems === d) return; save.dailyGems = d; save.gems += DAILY_FREE_GEMS; toast(`+◆ ${DAILY_FREE_GEMS}`, 'gem'); renderPage(); },
  'ad-gems': () => {
    const d = utcDay(Date.now());
    if (save.adGems.day !== d) save.adGems = { day: d, count: 0, last: 0 };
    if (Date.now() - save.adGems.last < AD_GEM_COOLDOWN || save.adGems.count >= AD_GEMS_PER_DAY / AD_GEMS) return;
    playAd(() => { save.adGems.count++; save.adGems.last = Date.now(); save.gems += AD_GEMS; toast(`+◆ ${AD_GEMS}`, 'gem'); });
  },
  'toggle-glow': () => { save.glow = !save.glow; renderPage(); },
  'toggle-dmg': () => { save.dmgNumbers = save.dmgNumbers === false; renderPage(); },
  export: () => {
    writeSave();
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(save))));
    const m = modal(`<h2>Export</h2><p class="small muted">Zkopíruj si tento text:</p><textarea class="ta" readonly>${data}</textarea>`);
    $('.ta', m).select();
  },
  import: () => {
    const m = modal(`<h2>Import</h2><textarea class="ta" id="imp"></textarea><button class="btn primary wide" id="imp-go">Načíst</button>`);
    $('#imp-go', m).onclick = () => {
      try {
        const d = JSON.parse(decodeURIComponent(escape(atob($('#imp', m).value.trim()))));
        game.run = null; window.__noSave = true;
        localStorage.setItem('neonTowerCloudForce', '1');
        localStorage.setItem(SAVE_KEY, JSON.stringify(d));
        location.reload();
      } catch (e) { toast('Neplatná data', 'bad'); }
    };
  },
  reset: () => confirmModal('Opravdu smazat VEŠKERÝ postup? Tohle nejde vrátit.', () => {
    game.run = null; localStorage.removeItem(SAVE_KEY); localStorage.setItem('neonTowerCloudForce', '1'); window.__noSave = true; location.reload();
  }),
});

function addTicket() {
  const st = tourneyState();
  if (!st.open) return;
  if (!save.tourney.cur || save.tourney.cur.id !== st.start) {
    if (tourneyClaimable()) claimTourney();
    save.tourney.cur = { id: st.start, league: save.tourney.league, used: 0, extra: 0, best: 0, claimed: false };
  }
  save.tourney.cur.extra++;
  toast('+1 turnajový tiket', 'gold');
  if (UI.page === 'more') renderPage();
}
function spendTokens(n) {
  save.tokens -= n; save.guild.spent += n;
  guildRelics().forEach((r, i) => { if (save.guild.spent >= (i ? 150 : 75) && !save.relics.includes(r.id)) { save.relics.push(r.id); toast('Relikvie: ' + r.name, 'gold'); markDirty(); } });
}

// vstupy (vyhledávání, výběry)
document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-input]');
  if (!el) return;
  const k = el.dataset.input, v = el.value;
  if (k === 'mod-filter') { UI.modFilter = v; renderPage(); }
  if (k === 'perk-first') save.perkCfg.first = v || null;
  if (k === 'rank-add' && v) { save.perkCfg.ranking.push(v); renderPage(); }
  if (k === 'target-prio') save.targetPrio = v;
});
document.addEventListener('input', ev => {
  const el = ev.target.closest('[data-input="lab-search"]');
  if (!el) return;
  UI.labSearch = el.value;
  renderPage();
  const inp = $('[data-input="lab-search"]');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
});
