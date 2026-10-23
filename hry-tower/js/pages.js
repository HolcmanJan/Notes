'use strict';
// ---------- stránky: laboratoře, zbraně, karty, moduly ----------

// ===== Laboratoře =====
// pokrok se počítá v „sekundách práce“, takže rychlost labů a boosty působí i na běžící výzkum
function labTick() {
  const now = Date.now();
  const last = save.labLast || now;
  save.labLast = now;
  const dt = Math.min((now - last) / 1000, 400 * 86400);
  if (dt <= 0) return;
  const mult = labSpeedMult();
  let changed = false;
  for (const a of save.labActive) {
    a.done = (a.done || 0) + dt * mult;
    if (a.done >= a.work) {
      save.labs[a.id] = (save.labs[a.id] || 0) + 1;
      a.fin = true; changed = true;
      toast(`Výzkum dokončen: ${LAB_MAP[a.id].name} Lv ${save.labs[a.id]}`, 'good');
    }
  }
  if (changed) {
    const fin = save.labActive.filter(a => a.fin);
    save.labActive = save.labActive.filter(a => !a.fin);
    // automatický výzkum dalšího levelu
    for (const a of fin) if (save.labAuto[a.id]) startLab(a.id, true);
    markDirty();
    if (UI.page === 'labs') renderPage();
    buildNav();
  }
}
const rushCost = a => Math.max(1, Math.ceil(interpRows(RUSH_ROWS, Math.max(60, (a.work - a.done) / labSpeedMult()))));
function labDisplay(d, L) {
  const v = L ? interpRows(d.valRows, L) * d.scale : (d.unit === 'x' ? 1 : 0);
  switch (d.unit) {
    case 'x': return 'x' + v.toFixed(2);
    case '%': return (v * 100).toFixed(2) + '%';
    case '$': return '$' + fmt(v);
    case 's': return (v > 0 ? '+' : '') + v.toFixed(1) + 's';
    case 'w': return L ? fmt(v) + ' vln' : '—';
    case 'u': return L ? 'Odemčeno' : 'Zamčeno';
    default: return (v > 0 && d.unit === '+' ? '+' : '') + (Math.abs(v) < 10 ? v.toFixed(2) : fmt(v));
  }
}

UI.pages.labs = {
  render() {
    const slots = [];
    for (let i = 0; i < save.labSlots; i++) {
      const a = save.labActive[i];
      if (a) {
        const d = LAB_MAP[a.id], L = save.labs[a.id] || 0;
        slots.push(`<div class="lab-slot active"><div class="sb-row"><b>${d.name}</b><span class="muted">Lv ${L} → ${L + 1}</span></div>
          <div class="bar"><i id="lab-bar-${i}"></i></div>
          <div class="sb-row"><span id="lab-time-${i}"></span>
          <span><label class="small"><input type="checkbox" data-act="lab-auto" data-id="${a.id}" ${save.labAuto[a.id] ? 'checked' : ''}> auto</label>
          <button class="btn sm gem" data-act="lab-rush" data-i="${i}">Dokončit ◆<span id="lab-gem-${i}"></span></button></span></div></div>`);
      } else slots.push(`<div class="lab-slot empty">Volný slot – vyber výzkum níže</div>`);
    }
    const busy = new Set(save.labActive.map(a => a.id));
    const free = save.labActive.length < save.labSlots;
    const q = UI.labSearch.toLowerCase();
    let lockedN = 0;
    const list = Object.entries(LAB_GROUPS).map(([g, gname]) => {
      const rows = LAB_DEFS.filter(d => d.group === g).filter(d => { const ok = labAvailable(d); if (!ok) lockedN++; return ok; })
        .filter(d => !q || d.name.toLowerCase().includes(q)).map(d => {
          const L = save.labs[d.id] || 0, max = L >= d.max, cost = labCost(d, L);
          const can = !max && free && !busy.has(d.id) && save.coins >= cost;
          return `<div class="lab-row ${busy.has(d.id) ? 'busy' : ''}">
            <div><b>${d.name}</b> <span class="muted small">Lv ${L}/${d.max}</span><div class="small">${labDisplay(d, L)}${max ? '' : ` → <span class="good">${labDisplay(d, L + 1)}</span>`}</div></div>
            ${max ? '<span class="muted">MAX</span>' : busy.has(d.id) ? '<span class="muted">Probíhá…</span>' :
              `<button class="btn sm ${can ? 'primary' : 'off'}" data-act="lab-start" data-id="${d.id}"><span class="coin">© ${fmt(cost)}</span><br><span class="small">${fmtTime(labTime(d, L))}</span></button>`}
          </div>`;
        }).join('');
      return rows ? `<h3>${gname}</h3>${rows}` : '';
    }).join('');
    const nextSlot = LAB_SLOT_COSTS[save.labSlots];
    const boost = Date.now() < save.labBoost.until;
    return `<h1>Laboratoře</h1><p class="muted small">Výzkum běží v reálném čase i když hra neběží. Rychlost labů: x${labSpeedMult().toFixed(2)}</p>
      <div class="lab-slots">${slots.join('')}</div>
      ${nextSlot ? `<button class="btn gem wide" data-act="lab-slot">Koupit ${save.labSlots + 1}. slot · ◆ ${fmt(nextSlot)}</button>` : ''}
      <div class="panel"><div class="panel-t">Zrychlení buňkami ⬣ ${fmt(save.cells)}</div>
        ${boost ? `<div class="good small">Aktivní x${save.labBoost.mult} ještě ${fmtTime((save.labBoost.until - Date.now()) / 1000)}</div>` : `<div class="row-btns wrap">${LAB_BOOSTS.slice(0, 4).map(([m, c]) => `<button class="btn sm ${save.cells >= c ? '' : 'off'}" data-act="lab-boost" data-m="${m}" data-c="${c}">x${m} na 1h · ⬣ ${fmt(c)}</button>`).join('')}</div>`}
      </div>
      <input class="search" placeholder="Hledat výzkum…" value="${UI.labSearch}" data-input="lab-search">
      ${list}
      ${lockedN ? `<p class="muted small center">${lockedN} dalších výzkumů se odemkne milníky, zbraněmi, kartami nebo boty.</p>` : ''}`;
  },
  update() {
    save.labActive.forEach((a, i) => {
      const bar = $('#lab-bar-' + i);
      if (!bar) return;
      bar.style.width = clamp(a.done / a.work * 100, 0, 100) + '%';
      $('#lab-time-' + i).textContent = fmtTime((a.work - a.done) / labSpeedMult());
      $('#lab-gem-' + i).textContent = rushCost(a);
    });
  },
};

function startLab(id, auto) {
  const d = LAB_MAP[id], L = save.labs[id] || 0;
  if (L >= d.max || save.labActive.length >= save.labSlots || save.labActive.some(a => a.id === id)) return;
  const cost = labCost(d, L);
  if (save.coins < cost) { if (!auto) toast('Nedostatek coinů'); return; }
  save.coins -= cost;
  save.labActive.push({ id, work: interpRows(d.timeRows, L + 1), done: 0 });
  if (!auto) renderPage();
}

// ===== Ultimátní zbraně =====
UI.pages.uw = {
  render() {
    const owned = Object.keys(save.uw);
    const n = owned.length;
    const nextCost = UW_UNLOCK_COSTS[n];
    const allOwned = n === UW_DEFS.length;
    const plusN = Object.keys(save.uwPlus).length;
    const cards = UW_DEFS.filter(u => save.uw[u.id]).map(u => {
      const body = u.stats.map(st => {
        const L = save.uw[u.id][st.id] || 0, max = L >= st.max;
        const c = st.costs[L + 1];
        return `<div class="uw-stat"><span>${st.name}</span><b>${st.fmt(st.vals[L])}</b>
          ${max ? '<span class="muted">MAX</span>' : `<button class="btn sm stone ${save.stones >= c ? '' : 'off'}" data-act="uw-up" data-id="${u.id}" data-stat="${st.id}">→ ${st.fmt(st.vals[L + 1])} · ▲${fmt(c)}</button>`}</div>`;
      }).join('');
      let plus = '';
      if (allOwned) {
        const P = UW_PLUS[u.id], pl = save.uwPlus[u.id];
        plus = pl === undefined
          ? `<button class="btn sm stone wide ${save.stones >= UWP_UNLOCK_COSTS[plusN] ? '' : 'off'}" data-act="uwp-unlock" data-id="${u.id}">Odemknout ${P.name}+ · ▲${UWP_UNLOCK_COSTS[plusN]}</button>`
          : `<div class="uw-stat"><span>${P.name}+ (Lv ${pl}/10)</span><span class="small">${P.desc(pl)}</span>${pl < 10 ? `<button class="btn sm stone" data-act="uwp-up" data-id="${u.id}">▲${uwpLevelCost(pl)}</button>` : '<span class="muted">MAX</span>'}</div>`;
      }
      return `<div class="uw-card" style="--c:${u.color}"><div class="uw-head"><span class="uw-ic">${u.icon}</span><div><b>${u.name}</b><div class="small muted">${u.desc}</div></div></div>${body}${plus}</div>`;
    }).join('');
    return `<h1>Ultimátní zbraně</h1><p class="muted small">Kupují se a vylepšují za kameny ▲ (turnaje, týdenní mise, milníky, event obchod). Při nákupu vybíráš ze 3 náhodných zbraní.</p>
      ${n < UW_DEFS.length ? `<button class="btn stone huge ${save.stones >= nextCost ? '' : 'off'}" data-act="uw-buy">KOUPIT ZBRAŇ (${n + 1}/9) · ▲ ${fmt(nextCost)}</button>` : ''}
      ${allOwned ? `<p class="small good center">Všech 9 zbraní vlastníš – můžeš odemykat Ultimate Weapon+ schopnosti.</p>` : ''}
      ${cards || '<p class="muted center">Zatím nevlastníš žádnou zbraň.</p>'}`;
  },
};

function buyUW() {
  const n = Object.keys(save.uw).length;
  const cost = UW_UNLOCK_COSTS[n];
  if (save.stones < cost) { toast('Nedostatek kamenů'); return; }
  if (!save.uwOffer || save.uwOffer.some(id => save.uw[id])) {
    const left = shuffle(UW_DEFS.filter(u => !save.uw[u.id]).map(u => u.id));
    save.uwOffer = left.slice(0, 3);
  }
  const m = modal(`<h2>Vyber zbraň · ▲ ${cost}</h2><div class="perk-list">${save.uwOffer.map(id => { const u = UW_MAP[id]; return `<button class="perk" data-id="${id}" style="border-color:${u.color}">${u.icon} ${u.name}<div class="small muted">${u.desc}</div></button>`; }).join('')}</div>`);
  $$('.perk', m).forEach(b => b.onclick = () => {
    m.remove();
    if (save.stones < cost) return;
    save.stones -= cost;
    save.uw[b.dataset.id] = {};
    save.uwOffer = null;
    markDirty(); renderPage(); buildNav();
    toast(`Získáno: ${UW_MAP[b.dataset.id].name}`, 'gold');
  });
}

// ===== Karty =====
function cardPool() {
  return CARD_DEFS.filter(c => cardLevel(c.id) < 7 && (!c.ms || msClaimed(c.ms[0], c.ms[1])));
}
function pullCard() {
  const pool = cardPool();
  if (!pool.length) return null;
  let c;
  if (!Object.keys(save.cards).length) c = CARD_MAP[pick(['damage', 'attackSpeed'])];
  else {
    const rars = Object.entries(CARD_RARITY).filter(([k]) => pool.some(x => x.rarity === k)).map(([k, v]) => [k, v.weight]);
    const rar = weighted(rars);
    c = pick(pool.filter(x => x.rarity === rar));
  }
  save.cards[c.id] = (save.cards[c.id] || 0) + 1;
  track('cards_bought');
  return c;
}
function buyCards(n) {
  const cost = CARD_COST * n;
  if (save.gems < cost) { toast('Nedostatek gemů'); return; }
  save.gems -= cost;
  const got = [];
  for (let i = 0; i < n; i++) { const c = pullCard(); if (c) got.push(c); }
  markDirty(); renderPage();
  modal(`<h2>${n > 1 ? 'Získané karty' : 'Nová karta'}</h2><div class="card-grid">${got.map(c => {
    const r = CARD_RARITY[c.rarity], l = cardLevel(c.id);
    return `<div class="card" style="--c:${r.color}"><div class="card-n">${c.name}</div><div class="card-ic">${c.icon}</div><div class="stars">${'★'.repeat(l)}</div><div class="small" style="color:${r.color}">${r.name}</div></div>`;
  }).join('')}</div><div class="row-btns"><button class="btn" data-act="close-modal">OK</button></div>`, 'card-modal');
}
const cardSlotsTotal = () => save.cardSlots + ['cardSlot1', 'cardSlot2', 'cardSlot3'].filter(k => save.vault.harmony[k]).length;

UI.pages.cards = {
  render() {
    const nextSlot = CARD_SLOT_COSTS[save.cardSlots - 1];
    const lvl7 = CARD_DEFS.filter(c => cardLevel(c.id) >= 7).length;
    const masteryOn = isFeature('mastery') && lvl7 >= 30;
    const cards = CARD_DEFS.map(c => {
      const copies = save.cards[c.id] || 0, l = cardLevel(c.id), eq = save.cardEquip.includes(c.id);
      const rar = CARD_RARITY[c.rarity];
      if (!copies) return `<div class="card unknown" style="--c:${rar.color}"><div class="card-n">${c.ms && !msClaimed(c.ms[0], c.ms[1]) ? '🔒 T' + c.ms[0] + ' v' + c.ms[1] : '???'}</div><div class="card-ic">?</div><div class="small">${rar.name}</div></div>`;
      const need = CARD_LEVEL_REQ[l];
      const m = CARD_MASTERY[c.id];
      const mast = save.cardMastery[c.id];
      return `<div class="card ${eq ? 'eq' : ''}" style="--c:${rar.color}" data-act="card-toggle" data-id="${c.id}">
        <div class="card-n">${c.locked ? '🔒' : ''}${c.name}</div><div class="card-ic">${c.icon}</div>
        <div class="stars">${'★'.repeat(l)}<span class="dim">${'★'.repeat(7 - l)}</span></div>
        <div class="small">${c.desc(c.vals[l - 1])}</div>
        <div class="small muted">${need ? `${copies}/${need}` : 'MAX'}</div>${eq ? '<div class="eq-mark">✔</div>' : ''}
        ${masteryOn && m && l >= 7 ? (mast === undefined ? `<button class="btn sm stone" data-act="mastery-buy" data-id="${c.id}">${m[0]} ▲${m[1]}</button>` : `<div class="small good">${m[0]} Lv${mast}${mast < 9 ? ` <button class="btn sm" data-act="mastery-up" data-id="${c.id}">© ${fmt(interpRows(WIKI.ws.Card_Masteries || [[1, 1e15]], mast + 1))}</button>` : ''}</div>`) : ''}
      </div>`;
    }).join('');
    const presets = save.labs.presets ? `<div class="row-btns wrap">${save.cardPresets.map((p, i) => `<button class="btn sm ${save.cardPreset === i ? 'primary' : ''}" data-act="preset-load" data-i="${i}">P${i + 1}</button>`).join('')}<button class="btn sm" data-act="preset-save">Uložit do P${save.cardPreset + 1}</button></div>` : '';
    return `<h1>Karty</h1>
      <div class="row-btns"><button class="btn gem" data-act="card-buy" data-n="1">KOUPIT · ◆ ${CARD_COST}</button><button class="btn gem" data-act="card-buy" data-n="10">x10 · ◆ ${CARD_COST * 10}</button></div>
      <p class="muted small">Šance: běžná 80 %, vzácná 17 %, epická 3 %. Karty na levelu 7 už nepadají.</p>
      <div class="sb-row"><h3>Aktivní ${save.cardEquip.length}/${cardSlotsTotal()}</h3>
      ${nextSlot ? `<button class="btn sm gem" data-act="card-slot">+ slot · ◆ ${fmt(nextSlot)}</button>` : ''}</div>
      ${presets}
      <p class="muted small">Klepnutím kartu nasadíš / sundáš. 🔒 karty nejde měnit během runu.${masteryOn ? '' : ' Mistrovství: milník T16 v100 a 30 karet na levelu 7.'}</p>
      <div class="card-grid">${cards}</div>`;
  },
};

function toggleCard(id) {
  const R = game.run;
  if (R && CARD_MAP[id].locked) { toast('Tuto kartu nelze měnit během runu'); return; }
  if (R && R.enemies.some(e => e.boss || e.fleet)) { toast('Během bosse nelze měnit karty'); return; }
  const i = save.cardEquip.indexOf(id);
  if (i >= 0) save.cardEquip.splice(i, 1);
  else if (save.cardEquip.length < cardSlotsTotal()) save.cardEquip.push(id);
  else { toast('Všechny sloty jsou plné'); return; }
  if (R) { R.cardsEq = save.cardEquip.slice(); R.dirty = true; }
  renderPage();
}

// ===== Moduly =====
const MOD_VARIANTS = { cannon: ['Pulzní dělo', 'Laserové dělo', 'Railgun', 'Kanón', 'Plazmomet'], armor: ['Štít', 'Krunýř', 'Bariéra', 'Plášť', 'Pancíř'], generator: ['Reaktor', 'Dynamo', 'Turbína', 'Článek', 'Baterie'], core: ['Krystal', 'Matrice', 'Procesor', 'Jádro', 'Singularita'] };
function rollSub(type, rarity, exclude) {
  const maxR = MOD_RARITIES[rarity].sub;
  const bans = save.modBans && save.modBans[type] || [];
  const opts = SUBSTATS[type].filter(s => !exclude.includes(s[0]) && !bans.includes(s[0]));
  for (let guard = 0; guard < 50; guard++) {
    const s = pick(opts);
    const r = Math.min(maxR, weighted(SUB_RARITY_W.map((w, i) => [i, w])));
    // ověř dostupnost rarity (n/a v tabulce)
    let rr = r;
    while (rr >= 0 && s[2][rr] === null) rr--;
    if (rr < 0) { rr = s[2].findIndex(v => v !== null); if (rr > maxR) continue; }
    return { k: s[0], r: rr, lock: false };
  }
  return { k: opts[0][0], r: 0, lock: false };
}
function newModule(rarity, type) {
  type = type || pick(Object.keys(MOD_TYPES));
  const m = { uid: save.modUid++, type, rarity, origin: rarity, subs: [], fav: false };
  if (rarity >= R.EPIC) { const u = pick(MOD_UNIQUES[type]); m.unique = u[0]; m.name = u[1]; }
  else m.name = pick(MOD_VARIANTS[type]);
  for (let i = 0; i < 8; i++) m.subs.push(rollSub(type, rarity, m.subs.map(s => s.k)));
  return m;
}
const modName = m => m.name || MOD_TYPES[m.type].name;
function drawModules(n) {
  const useTickets = Math.min(save.modTickets, n);
  const gemCost = (n - useTickets) * MOD_DRAW_COST;
  if (save.gems < gemCost) { toast('Nedostatek gemů'); return; }
  save.gems -= gemCost; save.modTickets -= useTickets;
  const got = [];
  for (let i = 0; i < n; i++) {
    save.modPity++;
    let r = weighted(MOD_DRAW_RATES);
    if (save.modPity >= 150) r = R.EPIC;
    if (!save.modFirstEpic && (save.stats.modDraws || 0) >= 9) r = R.EPIC;
    if (n === 10 && i === 9 && !got.some(m => m.rarity >= R.RARE)) r = Math.max(r, R.RARE);
    if (r >= R.EPIC) { save.modPity = 0; save.modFirstEpic = true; }
    save.stats.modDraws = (save.stats.modDraws || 0) + 1;
    const m = newModule(r);
    save.modules.push(m); got.push(m);
    track('modules_got');
  }
  for (const m of got) if (!save.modEquip[m.type]) save.modEquip[m.type] = m.uid;
  markDirty(); renderPage();
  modal(`<h2>Získané moduly</h2><div class="mod-list">${got.map(m => `<div class="module" style="--c:${MOD_RARITIES[m.rarity].color}"><b>${MOD_TYPES[m.type].icon} ${modName(m)}</b> <span style="color:${MOD_RARITIES[m.rarity].color}">${MOD_RARITIES[m.rarity].name}</span></div>`).join('')}</div><button class="btn wide" data-act="close-modal">OK</button>`);
}
function mergeRecipe(m) {
  const rec = MERGE_RECIPES.find(r => r[0] === m.rarity);
  if (!rec) return null;
  if (m.origin < R.EPIC && rec[4] > R.LEGP) return null;
  if (m.rarity === R.COMMON) return null;
  const eqIds = new Set(Object.values(save.modEquip));
  const mats = save.modules.filter(x => x !== m && x.type === m.type && x.rarity === rec[3] && !x.fav && !eqIds.has(x.uid)
    && (rec[1] === 'any' || (m.unique ? x.unique === m.unique : x.name === m.name && !x.unique)));
  return { rec, mats: mats.slice(0, rec[2]), ok: mats.length >= rec[2] };
}
function moduleHtml(m, equipped) {
  const T = MOD_TYPES[m.type], Rr = MOD_RARITIES[m.rarity];
  const active = new Set(modActiveSubs(m).map(s => s.k));
  const subs = m.subs.slice(0, Rr.subs).map((s, i) => {
    const def = SUBSTATS[m.type].find(x => x[0] === s.k);
    const on = active.has(s.k);
    return `<div class="mod-sub ${on ? '' : 'off'}" style="color:${SUB_RARITY_COLORS[s.r]}"><span data-act="mod-lock" data-uid="${m.uid}" data-i="${i}">${s.lock ? '🔒' : '🔓'}</span> ${def[1]} ${def[3] === '%' ? '+' + def[2][s.r] + '%' : (def[2][s.r] > 0 ? '+' : '') + def[2][s.r] + (def[3] === '+' ? '' : def[3])}</div>`;
  }).join('');
  const uq = m.unique ? MOD_UNIQUES[m.type].find(u => u[0] === m.unique) : null;
  const mr = mergeRecipe(m);
  const locks = m.subs.slice(0, Rr.subs).filter(s => s.lock).length;
  return `<div class="module" style="--c:${Rr.color}">
    <div class="mod-head"><span class="mod-ic">${T.icon}</span><div><b>${modName(m)}</b> <span style="color:${Rr.color}">${Rr.name}</span>${m.fav ? ' ★' : ''}
      <div class="small muted">${T.name} · Lv ${modLevel(m)}/${Rr.maxLv} · ${T.main} x${modMain(m).toFixed(2)}</div></div></div>
    ${uq ? `<div class="mod-uq small">✦ ${uq[2].replace('{x}', uq[3][uniqueTier(m.rarity)])}</div>` : ''}
    ${subs}
    <div class="mod-btns">
      <button class="btn sm" data-act="mod-equip" data-uid="${m.uid}">${equipped ? 'Sundat' : 'Nasadit'}</button>
      ${mr && mr.ok ? `<button class="btn sm gem" data-act="mod-merge" data-uid="${m.uid}">Sloučit → ${MOD_RARITIES[mr.rec[4]].name}</button>` : mr ? `<span class="small muted">Sloučení: ${mr.rec[2]}× ${MOD_RARITIES[mr.rec[3]].name} (${mr.rec[1] === 'same' ? 'stejný' : 'libovolný'})</span>` : ''}
      <button class="btn sm" data-act="mod-reroll" data-uid="${m.uid}">⟳ Přehodit · ${MOD_REROLL_COST[locks]}</button>
      <button class="btn sm" data-act="mod-fav" data-uid="${m.uid}">${m.fav ? '☆' : '★'}</button>
      ${!equipped && !m.fav && (m.origin < R.EPIC) ? `<button class="btn sm" data-act="mod-shatter" data-uid="${m.uid}">Rozbít</button>` : ''}
    </div></div>`;
}
function slotCost(L) {
  const k = 1 - labV('modShardCost'), kc = 1 - labV('modCoinCost');
  return { shard: Math.round(interpRows(MOD_SLOT_ROWS.shard, L + 1) * (1 + 0 * k) * k), coin: Math.round(interpRows(MOD_SLOT_ROWS.coin, L + 1) * kc) };
}

UI.pages.modules = {
  render() {
    const eqIds = new Set(Object.values(save.modEquip));
    const slots = Object.keys(MOD_TYPES).map(t => {
      const m = modByUid(save.modEquip[t]);
      const L = save.modSlots[t] || 0, c = slotCost(L);
      const head = `<div class="sb-row"><b>${MOD_TYPES[t].icon} Slot ${MOD_TYPES[t].name} – Lv ${L}/300</b>
        ${L < 300 ? `<button class="btn sm ${save.shards[t] >= c.shard && save.coins >= c.coin ? 'primary' : 'off'}" data-act="slot-up" data-t="${t}">Lv+ · ✧${fmt(c.shard)} · © ${fmt(c.coin)}</button>` : ''}</div>`;
      return `<div class="mod-slot">${head}${m ? moduleHtml(m, true) : '<div class="muted small">Prázdný slot</div>'}</div>`;
    }).join('');
    const inv = save.modules.filter(m => !eqIds.has(m.uid) && (UI.modFilter === 'all' || m.type === UI.modFilter)).sort((a, b) => b.rarity - a.rarity || a.type.localeCompare(b.type));
    const assist = isFeature('assist') ? `<h3>Asistenční moduly</h3>` + Object.keys(MOD_TYPES).map(t => {
      const a = save.assist[t];
      if (!a) return `<button class="btn sm stone" data-act="assist-unlock" data-t="${t}">Odemknout asistenta ${MOD_TYPES[t].name} · ▲1000</button>`;
      const m = modByUid(a.uid);
      return `<div class="panel small"><b>Asistent ${MOD_TYPES[t].name}</b>: ${m ? modName(m) + ' (' + MOD_RARITIES[m.rarity].name + ')' : 'nic'} · efekt ${Math.round((a.main || 0.01) * 100)} % / substaty ${Math.round((a.sub || 0.01) * 100)} %
        <div class="mod-btns"><button class="btn sm" data-act="assist-pick" data-t="${t}">Vybrat modul</button><button class="btn sm stone" data-act="assist-up" data-t="${t}" data-k="main">Efekt +1 % · ▲${15 + 3 * Math.round((a.main || 0.01) * 100 - 1)}</button><button class="btn sm stone" data-act="assist-up" data-t="${t}" data-k="sub">Substaty +1 % · ▲${15 + 3 * Math.round((a.sub || 0.01) * 100 - 1)}</button></div></div>`;
    }).join('') : '';
    return `<h1>Moduly</h1>
      <div class="cur-row small">${Object.entries(save.shards).map(([k, v]) => `<span>${k === 'reroll' ? '⟳ přehazovací' : '✧ ' + MOD_TYPES[k].name}: <b>${fmt(v)}</b></span>`).join('')}${save.modTickets ? `<span>🎟 tikety: <b>${save.modTickets}</b></span>` : ''}</div>
      <div class="row-btns"><button class="btn gem" data-act="mod-draw" data-n="1">Tah · ${save.modTickets ? '🎟' : '◆ ' + MOD_DRAW_COST}</button><button class="btn gem" data-act="mod-draw" data-n="10">x10 · ◆ ${MOD_DRAW_COST * 10}</button></div>
      <p class="muted small">Šance: běžný 68,5 %, vzácný 29 %, epický 2,5 % (unikátní efekt). Záruka epického po 150 tazích. Levely patří slotům – vylepšují se úlomky daného typu a coiny. Substaty se odemykají na levelech 41, 101, 141, 161, 201, 241.</p>
      <h3>Nasazené</h3><div class="mod-list">${slots}</div>
      ${assist}
      <div class="sb-row"><h3>Inventář (${inv.length})</h3><select data-input="mod-filter"><option value="all">Vše</option>${Object.entries(MOD_TYPES).map(([k, v]) => `<option value="${k}" ${UI.modFilter === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
      <button class="btn sm wide" data-act="mod-shatter-commons">Rozbít všechny běžné moduly</button>
      <div class="mod-list">${inv.map(m => moduleHtml(m, false)).join('') || '<p class="muted">Prázdno</p>'}</div>`;
  },
};

function moduleAction(act, uid, el) {
  const m = modByUid(uid);
  if (!m) return;
  if (act === 'equip') {
    if (game.run) { toast('Moduly nelze měnit během runu'); return; }
    save.modEquip[m.type] = save.modEquip[m.type] === uid ? null : uid;
  } else if (act === 'fav') m.fav = !m.fav;
  else if (act === 'shatter') {
    const base = m.origin === R.COMMON ? 5 : m.rarity === R.RARE ? 10 : m.rarity === R.RAREP ? 30 : 90;
    const n = Math.round(base * (1 + labV('shatterBonus')));
    save.shards[m.type] += n;
    save.modules = save.modules.filter(x => x !== m);
    toast(`+${n} úlomků ${MOD_TYPES[m.type].name}`, 'good');
  } else if (act === 'lock') {
    const s = m.subs[+el.dataset.i]; s.lock = !s.lock;
  } else if (act === 'reroll') {
    const n = MOD_RARITIES[m.rarity].subs;
    const locks = m.subs.slice(0, n).filter(s => s.lock).length;
    if (locks >= n) { toast('Všechny substaty jsou zamčené'); return; }
    const cost = Math.round(MOD_REROLL_COST[locks] * (1 - 0.025 * (save.vault.harmony.rerollDisc || 0)));
    if (save.shards.reroll < cost) { toast('Nedostatek přehazovacích úlomků'); return; }
    save.shards.reroll -= cost;
    for (let i = 0; i < 8; i++) if (!m.subs[i].lock) m.subs[i] = rollSub(m.type, m.rarity, m.subs.filter((s, j) => j !== i).map(s => s.k));
  } else if (act === 'merge') {
    const mr = mergeRecipe(m);
    if (!mr || !mr.ok) return;
    save.modules = save.modules.filter(x => !mr.mats.includes(x));
    m.rarity = mr.rec[4];
    toast(`Sloučeno: ${modName(m)} → ${MOD_RARITIES[m.rarity].name}`, 'good');
  }
  markDirty(); renderPage();
}

// ===== Více =====
UI.pages.more = {
  render() {
    const sub = UI.moreSub;
    const back = sub !== 'menu' ? '<button class="btn sm" data-act="more-sub" data-sub="menu">‹ Zpět</button>' : '';
    const fn = MORE_SUBS[sub];
    if (fn) return back + fn.render();
    const item = (id, ic, name, ok, badge) => `<button class="btn more-item ${ok ? '' : 'off'}" data-act="more-sub" data-sub="${id}">${ic} ${name}${badge ? ` <i class="badge">${badge}</i>` : ''}</button>`;
    return `<h1>Více</h1>
      <div class="cur-row">© ${fmt(save.coins)} · ◆ ${fmt(save.gems)} · ▲ ${fmt(save.stones)} · ✪ ${fmt(save.medals)} · ⬣ ${fmt(save.cells)} · ⚿ ${save.keys} · ◇ ${save.bits} bitů · ⛁ ${save.tokens} tokenů</div>
      <div class="more-grid">
      ${item('milestones', '🏁', 'Milníky', true, unclaimedMilestones())}
      ${item('missions', '📋', 'Denní mise', isFeature('missions'), claimableMissions())}
      ${item('tourney', '🏆', 'Turnaje', isFeature('tourney'), tourneyClaimable() ? '!' : '')}
      ${item('event', '🎉', 'Event', isFeature('events'), eventClaimable() ? '!' : '')}
      ${item('eventshop', '🛍', 'Event obchod + boti', isFeature('events'))}
      ${item('guild', '🛡', 'Gilda a Guardian', isFeature('guilds'))}
      ${item('vault', '🔐', 'Trezor', isFeature('vault'))}
      ${item('relics', '💎', 'Relikvie', true)}
      ${item('themes', '🎨', 'Motivy', true)}
      ${item('perks', '✨', 'Nastavení perků', isFeature('perks'))}
      ${item('disso', '♫', 'Disonance', isFeature('dissonance'))}
      ${item('shop', '🛒', 'Obchod', true)}
      ${item('stats', '📊', 'Statistiky', true)}
      ${item('history', '📜', 'Historie bitev', !!save.labs.moreStats)}
      ${item('settings', '⚙', 'Nastavení', true)}
      ${item('help', '❓', 'Jak hrát', true)}
      </div>`;
  },
  update() { const fn = MORE_SUBS[UI.moreSub]; if (fn && fn.update) fn.update(); },
};
