'use strict';
// ---------- uživatelské rozhraní: jádro, bitva, dílna ----------
const UI = { page: 'battle', runCat: 'atk', wsCat: 'atk', moreSub: 'menu', modFilter: 'all', labSearch: '', pages: {} };

const NAV = [
  { id: 'battle', label: 'Bitva', ic: 'battle', title: 'Bitva' },
  { id: 'workshop', label: 'Dílna', ic: 'hammer', title: 'Dílna' },
  { id: 'labs', label: 'Laby', ic: 'flask', feat: 'labs', title: 'Laboratoře' },
  { id: 'uw', label: 'Zbraně', ic: 'uw', feat: 'uw', title: 'Ultimátní zbraně' },
  { id: 'cards', label: 'Karty', ic: 'cards', feat: 'cards', title: 'Karty' },
  { id: 'modules', label: 'Moduly', ic: 'module', feat: 'modules', title: 'Moduly' },
  { id: 'more', label: 'Více', ic: 'menu', title: 'Více' },
];
const FEAT_HINT = { labs: 'Laboratoře: milník Tier 1 vlna 30', uw: 'Ultimátní zbraně: odemkni turnaje (milník T1 vlna 60) a získej kameny', cards: 'Karty: odehraj 2 runy na Tieru 1', modules: 'Moduly: milník Tier 2 vlna 90' };
const ALL_BULKS = [1, 5, 10, 'max', 100];
const availBulks = () => [1, ...[5, 10, 'max', 100].slice(0, labV('buyMult') ? (save.labs.buyMult || 0) : 0)];
const bulkLabel = b => b === 'max' ? 'Max' : 'x' + b;

// ---------- obecné prvky ----------
function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

function modal(html, cls = '', closable = true) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${cls}">${closable ? '<button class="modal-x" data-act="close-modal">✕</button>' : ''}${html}</div>`;
  $('#modal-root').appendChild(bg);
  return bg;
}

function confirmModal(text, onYes) {
  const m = modal(`<p class="confirm-text">${text}</p><div class="row-btns"><button class="btn" data-act="close-modal">Zrušit</button><button class="btn primary" id="cf-yes">Ano</button></div>`);
  $('#cf-yes', m).onclick = () => { m.remove(); onYes(); };
}

function bulkCount(mode, costFn, L0, maxL, budget) {
  let n = 0, cost = 0;
  const lim = mode === 'max' ? 100000 : mode;
  while (n < lim && L0 + n < maxL) {
    const c = costFn(L0 + n);
    if (mode === 'max' && cost + c > budget) break;
    cost += c; n++;
  }
  if (mode === 'max' && n === 0 && L0 < maxL) return { n: 1, cost: costFn(L0), short: true };
  return { n, cost };
}

// ---------- navigace ----------
function navBadge(id) {
  if (id === 'more') return (unclaimedMilestones() + claimableMissions() + (eventClaimable() ? 1 : 0) + (tourneyClaimable() ? 1 : 0)) || '';
  if (id === 'labs') return isFeature('labs') && save.labActive.length < save.labSlots ? '!' : '';
  return '';
}
function buildNav() {
  $('#nav').innerHTML = NAV.map(n => {
    const locked = n.feat && !isFeature(n.feat);
    const b = !locked ? navBadge(n.id) : '';
    return `<button class="nav-btn ${UI.page === n.id ? 'active' : ''} ${locked ? 'locked' : ''}" data-act="nav" data-page="${n.id}" title="${n.title}">
      ${ico(n.ic)}<span class="nav-l">${n.label}</span>${b ? `<i class="badge">${b}</i>` : ''}</button>`;
  }).join('');
}

function showPage(id) {
  const n = NAV.find(x => x.id === id);
  if (n && n.feat && !isFeature(n.feat)) { toast(FEAT_HINT[n.feat]); return; }
  if (id === 'cards' && !save.cardsVisited) { save.cardsVisited = true; save.gems += 40; toast('Vítej v kartách! +40 ◆', 'gem'); }
  UI.page = id;
  $('#page-title').textContent = (n ? n.title : id).toUpperCase();
  buildNav();
  $('#battle-view').style.display = id === 'battle' ? '' : 'none';
  const pg = $('#page');
  pg.style.display = id === 'battle' ? 'none' : '';
  if (id === 'battle') renderBattle();
  else renderPage();
}

function renderPage() {
  const p = UI.pages[UI.page];
  if (!p) return;
  const pg = $('#page');
  const st = pg.scrollTop;
  pg.innerHTML = p.render();
  pg.scrollTop = st;
  if (p.update) p.update();
}

function updateTopbar() {
  $('#r-coins').textContent = fmt(Math.floor(save.coins));
  $('#r-gems').textContent = fmt(Math.floor(save.gems));
  $('#r-stones').textContent = fmt(Math.floor(save.stones));
  $('#r-extra').innerHTML = [
    save.medals ? `<span class="medal">✪ ${fmt(Math.floor(save.medals))}</span>` : '',
    save.cells ? `<span class="cell">⬣ ${fmt(Math.floor(save.cells))}</span>` : '',
    save.keys ? `<span class="key">⚿ ${fmt(save.keys)}</span>` : '',
  ].join('');
}

// ---------- bitva ----------
function buildBattleView() {
  $('#battle-view').innerHTML = `
    <div id="bmenu"></div>
    <div id="brun">
      <div id="canvas-wrap">
        <canvas id="cv"></canvas>
        <div id="hud-tl">
          <div class="hud-cash">$ <span id="h-cash">0</span></div>
          <div class="hud-coin">${ico('coin')} <span id="h-coins">0</span></div>
          <div class="hud-gem">${ico('gem', '#ff5ce1')} <span id="h-gems">0</span></div>
        </div>
        <div id="hud-tr">
          <button class="hud-btn shop" data-act="goto-more" data-sub="shop" title="Obchod">${ico('cart')}</button>
          <button class="hud-btn" data-act="pause" id="btn-pause" title="Pauza">❚❚</button>
          <button class="hud-btn" data-act="quit" title="Ukončit run">✕</button>
        </div>
        <div id="hud-info"></div>
        <div id="hud-manual"></div>
      </div>
      <div class="run-mid">
        <div class="ad-gem" data-act="ad-gems" id="ad-gem">${ico('gem', '#ff5ce1')} <span>${AD_GEMS}</span> <span class="play">▶</span></div>
        <div class="speed"><button data-act="speed" data-d="-1">−</button><span id="h-speed">x1</span><button data-act="speed" data-d="1">+</button></div>
        <button class="hud-bonus" data-act="ad-bonus" id="btn-bonus"><b>BONUS</b><span id="bonus-st"></span></button>
      </div>
      <div id="statusbar">
        <div class="sb-stats">
          <div class="sb-row"><span class="sb-l">${ico('dmg', '#3ab8ff')}<b id="s-dmg"></b></span><span class="sb-l">${ico('heart', '#ff4d6d')}<b id="s-regen"></b></span><span class="sb-l">${ico('coin')}<b id="s-coinm"></b></span></div>
          <div class="hpbar"><i id="s-hpfill"></i><span id="s-hp"></span></div>
          <div class="wallbar" id="s-wall"><i id="s-wallfill"></i></div>
        </div>
        <div class="sb-wave" data-act="wave-info">
          <div class="sb-row"><span class="wv">Vlna <span id="s-wave"></span></span><span class="mults"><span id="s-ehp"></span><br><span id="s-edmg"></span></span></div>
          <div class="wbar"><i id="s-wfill"></i></div>
          <div class="muted small" id="s-tier"></div>
        </div>
      </div>
      <div class="upg-head" id="run-head"></div>
      <div id="run-grid" class="ugrid"></div>
      <div class="cat-bar" id="run-cats"></div>
    </div>`;
  initCanvas($('#cv'));
}

function renderBattle() {
  const R = game.run;
  $('#bmenu').style.display = R ? 'none' : '';
  $('#brun').style.display = R ? '' : 'none';
  if (!R) { renderBattleMenu(); return; }
  buildRunTabs();
  buildRunGrid();
  updateRunUI();
}

function renderBattleMenu() {
  const t = save.tier;
  const coinBonus = computeStats(null).coinMult;
  const ms = unclaimedMilestones(), mis = claimableMissions();
  const bc = TIER_BC[t];
  const tr = tourneyState();
  const evLeft = isFeature('events') ? fmtTime((EVENT_EPOCH + (eventIdxNow() + 1) * 14 * DAY - Date.now()) / 1000) : '';
  const side = (sub, icon, color, tag, ok) => ok ? `<button class="side-ico" data-act="goto-more" data-sub="${sub}" style="color:${color}">${ico(icon, color)}<span class="tag" style="border-color:${color}">${tag}</span></button>` : '';
  const sq = (sub, icon, title, badge) => `<button class="sq-btn" data-act="goto-more" data-sub="${sub}" title="${title}">${ico(icon)}${badge ? `<i class="badge">${badge}</i>` : ''}</button>`;
  $('#bmenu').innerHTML = `
    <div class="menu">
      <div class="side-l">
        ${side('tourney', 'trophy', '#ffd23d', tr.open ? (tr.canPlay ? 'OTEVŘENO' : 'HRÁNO') : 'ZAVŘENO', isFeature('tourney'))}
        ${side('event', 'calendar', '#3ee6f0', 'Konec ' + evLeft, isFeature('events'))}
        ${side('guild', 'castle', '#ff4d6d', 'Gilda', isFeature('guilds'))}
      </div>
      <div class="side-r">
        ${isFeature('missions') ? `<div class="mission-tag" data-act="goto-more" data-sub="missions">MISE<br>${save.missions.list.length}/8${mis ? `<i class="badge">${mis}</i>` : ''}</div>` : ''}
        ${sq('settings', 'gear', 'Nastavení')}${sq('stats', 'podium', 'Statistiky')}${sq('perks', 'list', 'Perky')}${sq('shop', 'cart', 'Obchod')}${sq('vault', 'vault', 'Trezor')}${sq('history', 'history', 'Historie')}
      </div>
      <div class="logo">NEON TOWER</div>
      <svg class="invader" viewBox="0 0 11 8" width="104" height="76"><path fill="none" stroke="#ff5ce1" stroke-width="0.35" d="M2 0h1v1h1v1h3V1h1V0h1v2h1v1h1v3h-1V4H9v2H8v1H6v-1h1v-1H4v1h1v1H3V6H2V4H1v2H0V3h1V2h1z"/></svg>
      <button class="ms-btn" data-act="goto-more" data-sub="milestones">MILNÍKY${ms ? `<i class="badge" style="position:absolute;top:-8px;right:-8px">${ms}</i>` : ''}</button>
      <div class="panel"><div class="panel-t">Celkový coin bonus</div><div class="big-num">${ico('coin')} x${fmt(coinBonus)}</div></div>
      <div class="panel">
        <div class="panel-t">Obtížnost</div>
        <div class="tier-sel">
          <button class="arrow" data-act="tier" data-d="-1" ${t <= 1 ? 'disabled' : ''}>‹</button>
          <span>Tier ${t}</span>
          <button class="arrow" data-act="tier" data-d="1" ${t >= save.maxTier ? 'disabled' : ''}>›</button>
        </div>
        <div style="font-weight:800">Nejvyšší vlna: ${save.best[t] || 0}</div>
        <div class="big-num" style="font-size:17px">${ico('coin')} x${TIERS[t - 1].coin}</div>
        ${t === save.maxTier && t < 24 ? `<div class="muted small">Tier ${t + 1}: milník vlna ${TIERS[t - 1].unlockWave}</div>` : ''}
        ${bc ? `<div class="bc-list">${Object.entries(bc).map(([k, v]) => `<span class="bc">${BC_NAMES[k]}: ${bcDesc(k, v)}</span>`).join('')}</div>` : ''}
      </div>
      <button class="btn huge" data-act="start-run">BITVA</button>
      ${isFeature('dissonance') ? `<button class="btn wide" data-act="disso-start">Disonantní run ♫</button>` : ''}
    </div>`;
}

// spodní kategoriová tlačítka (meč / štít / hvězda / zbraně) jako v originálu
function catBarHtml(cats, active, act) {
  return cats.map((c, i) => `<button class="cat-btn ${active === c ? 'active' : ''}" style="--c:${CAT_ICON[c][1]}" data-act="${act}" data-cat="${c}">${ico(CAT_ICON[c][0])}<span class="n">${i + 1}</span></button>`).join('');
}
function headHtml(cat, bulkAct, bulk) {
  return `<span>${CAT_HEAD[cat]}</span>${bulkAct ? `<button class="bulk-btn" data-act="${bulkAct}">${bulkLabel(bulk)}</button>` : ''}`;
}
function setVal(el, t) {
  if (el.textContent === t) return;
  el.textContent = t;
  el.style.fontSize = t.length > 9 ? '12px' : t.length > 7 ? '14px' : '';
}
function buildRunTabs() {
  const R = game.run;
  const cats = ['atk', 'def', 'util'];
  if (R && (Object.keys(save.uw).length || R.perkUw)) cats.push('uw');
  $('#run-cats').innerHTML = catBarHtml(cats, UI.runCat, 'run-tab');
  const h = $('#run-head');
  h.className = 'upg-head ' + UI.runCat;
  h.innerHTML = headHtml(UI.runCat, UI.runCat === 'uw' ? null : 'run-bulk', save.bulk);
}

function upgCellHtml(d, prefix) {
  const cat = CATS.find(c => c.id === d.cat);
  return `<div class="ucell" style="--c:${cat.color}" data-act="${prefix}-buy" data-id="${d.id}" title="${d.desc}">
    <div class="uname">${d.name}</div>
    <div class="ubox"><span class="ubulk" id="${prefix}-b-${d.id}"></span><div class="uval" id="${prefix}-v-${d.id}"></div><div class="ucost" id="${prefix}-c-${d.id}"></div></div>
  </div>`;
}

function buildRunGrid() {
  const R = game.run;
  if (UI.runCat === 'uw') {
    const ids = Object.keys(save.uw).concat(R.perkUw ? [R.perkUw] : []);
    $('#run-grid').innerHTML = ids.map(id => {
      const u = UW_MAP[id];
      return `<div class="ucell" style="--c:${u.color}" data-act="uw-toggle" data-id="${id}"><div class="uname">${u.icon} ${u.name}</div>
        <div class="ubox"><div class="uval" id="uwt-${id}"></div><div class="ucost">přepnout</div></div></div>`;
    }).join('') + `<div class="grid-note muted small">Přepnutí resetuje cooldown. Zbývá přepnutí: <b id="uw-toggles"></b></div>`;
    return;
  }
  const defs = STAT_DEFS.filter(d => d.cat === UI.runCat);
  const locked = defs.filter(d => !statUnlocked(d)).length;
  $('#run-grid').innerHTML = defs.filter(statUnlocked).map(d => upgCellHtml(d, 'run')).join('')
    + (locked ? `<div class="grid-note muted small">+${locked} dalších vylepšení lze odemknout v Dílně</div>` : '');
}

function runBulk(d, R) {
  const wsL = save.ws[d.id] || 0, runL = R.lv[d.id] || 0;
  return bulkCount(save.bulk, L => cashCost(d, L), runL, d.max - wsL, R.cash);
}

function manualButtonsHtml(R) {
  const S = R.S, b = [];
  if (S.demonMode) b.push(`<button class="hud-man ${R.card.demonUsed ? 'used' : ''}" data-act="manual" data-k="demon" title="Démonský mód">☠${R.card.demonT > 0 ? `<small>${Math.ceil(R.card.demonT)}</small>` : ''}</button>`);
  if (S.nuke) b.push(`<button class="hud-man ${R.card.nukeUsed ? 'used' : ''}" data-act="manual" data-k="nuke" title="Atomovka">☢</button>`);
  if (save.labs.barrage && S.uw.smartMissiles) b.push(`<button class="hud-man ${R.barrageUsed ? 'used' : ''}" data-act="manual" data-k="barrage" title="Raketová palba">➶</button>`);
  return b.join('');
}

function updateRunUI() {
  const R = game.run;
  if (!R) return;
  const S = R.S;
  $('#h-cash').textContent = fmt(Math.floor(R.cash));
  $('#h-coins').textContent = fmt(Math.floor(save.coins));
  $('#h-gems').textContent = fmt(Math.floor(save.gems));
  $('#h-speed').textContent = 'x' + R.speed;
  $('#btn-pause').textContent = game.userPaused ? '▶' : '❚❚';
  const bon = adBonusActive();
  $('#bonus-st').textContent = save.shop.noAds ? 'Vždy aktivní' : bon ? fmtTime((save.adBonusUntil - Date.now()) / 1000) : 'Neaktivní';
  $('#btn-bonus').classList.toggle('on', bon);
  $('#s-dmg').textContent = fmt(S.damage);
  $('#s-regen').textContent = fmt(S.regen) + '/s';
  $('#s-hp').textContent = `${fmt(Math.max(0, R.hp))} / ${fmt(S.maxHp)}`;
  $('#s-hpfill').style.width = clamp(R.hp / S.maxHp * 100, 0, 100) + '%';
  const wl = R.wallState;
  $('#s-wall').style.display = wl ? '' : 'none';
  if (wl) $('#s-wallfill').style.width = (wl.hp > 0 ? wl.hp / wl.max * 100 : 0) + '%';
  $('#s-wave').textContent = R.wave;
  $('#s-tier').textContent = R.tourney !== null ? `Turnaj · ${LEAGUES[R.tourney].name}` : R.disso ? `Disonance · Tier ${R.tier}` : `Tier ${R.tier}`;
  $('#s-wfill').style.width = (R.phase === 'spawn' ? R.waveT / WAVE_SPAWN * 100 : 100) + '%';
  $('#s-wfill').classList.toggle('cool', R.phase !== 'spawn');
  const sc = enemyScale(R);
  $('#s-coinm').textContent = 'x' + fmt(S.coinMult * S.coinKill);
  $('#s-ehp').textContent = fmt(BASE_HP * sc.hp * S.enemyHpMult);
  $('#s-edmg').textContent = fmt(BASE_DMG * sc.dmg * S.enemyDmgMult);
  const d = utcDay(Date.now()), ag = save.adGems.day === d ? save.adGems : { count: 0, last: 0 };
  $('#ad-gem').classList.toggle('off', Date.now() - ag.last < AD_GEM_COOLDOWN || ag.count >= AD_GEMS_PER_DAY / AD_GEMS);
  const info = [];
  if (R.tourney === null && isFeature('perks')) info.push(`Perk na vlně ${R.nextPerkWave}`);
  if (R.introLeft > 0) info.push(`<span style="color:#c45cff">Úvodní sprint: ${R.introLeft}</span>`);
  if (R.golden > 0) info.push(`<span style="color:#ffd700">Zlatá věž ${Math.ceil(R.golden)}s</span>`);
  if (R.card.demonT > 0) info.push(`<span style="color:#ff3d3d">Démon ${Math.ceil(R.card.demonT)}s</span>`);
  if (superActive(R)) info.push(`<span style="color:#ffe45e">Super věž</span>`);
  if (R.rapidT > 0) info.push(`<span style="color:#7df9ff">Rapid fire</span>`);
  if (S.energyShield) info.push(`<span style="color:#4d8dff">Štít ${R.card.es}/${S.esCharges}</span>`);
  if (wl && wl.hp <= 0) info.push(`<span style="color:#9fb4ff">Zeď za ${Math.ceil(wl.rebuild)}s</span>`);
  if (Object.keys(R.sabotage).length) info.push(`<span style="color:#ff8c1a">Sabotáž!</span>`);
  $('#hud-info').innerHTML = info.join('<br>');
  const mh = manualButtonsHtml(R);
  if ($('#hud-manual').dataset.h !== mh) { $('#hud-manual').innerHTML = mh; $('#hud-manual').dataset.h = mh; }

  if (UI.runCat === 'uw') {
    for (const id of Object.keys(save.uw).concat(R.perkUw ? [R.perkUw] : [])) {
      const el = $('#uwt-' + id); if (!el) continue;
      el.textContent = R.uwOff[id] ? 'VYP' : 'ZAP';
      el.closest('.ucell').classList.toggle('poor', !!R.uwOff[id]);
    }
    const t = $('#uw-toggles'); if (t) t.textContent = 40 - R.uwToggles;
    return;
  }
  for (const d of STAT_DEFS) {
    if (d.cat !== UI.runCat) continue;
    const v = $('#run-v-' + d.id), c = $('#run-c-' + d.id);
    if (!v) continue;
    const cell = v.closest('.ucell');
    setVal(v, d.fmt(rawStat(d.id, R)));
    const b = runBulk(d, R);
    $('#run-b-' + d.id).textContent = b.n > 1 ? 'x' + b.n : '';
    if (b.n === 0) { c.textContent = 'Max'; cell.className = 'ucell maxed'; continue; }
    c.textContent = '$ ' + fmt(b.cost);
    cell.className = 'ucell' + (b.cost <= R.cash && !b.short ? '' : ' poor');
  }
}

function buyRun(id) {
  const R = game.run, d = STAT_MAP[id];
  if (!R) return;
  if (R.disso && R.disso === d.cat) { toast('Tato kategorie je v disonantním runu zakázaná'); return; }
  const b = runBulk(d, R);
  if (b.n === 0 || b.short || b.cost > R.cash) return;
  R.cash -= b.cost;
  R.lv[id] = (R.lv[id] || 0) + b.n;
  track('run_buys', b.n);
  refreshStats(R);
  updateRunUI();
}

function showWaveInfo() {
  const R = game.run; if (!R) return;
  const sc = enemyScale(R), S = R.S;
  const rows = Object.entries(ENEMY_TYPES).map(([k, T]) => `<tr><td style="color:${T.color}">${T.name}</td><td>${fmt(BASE_HP * T.hp * sc.hp * S.enemyHpMult * S.eHp[k] * (T.boss ? S.bossHpMult : 1))}</td><td>${fmt(BASE_DMG * T.dmg * sc.dmg * S.enemyDmgMult * S.eAtk[k])}</td></tr>`).join('');
  const bcs = Object.entries(R.bc).map(([k, v]) => `<span class="bc">${BC_NAMES[k] || k}: ${bcDesc(k, v)}</span>`).join('');
  modal(`<h2>Vlna ${R.wave}</h2><div class="small muted center">Úroveň HP ${R.hpLv} · úroveň útoku ${R.atkLv}</div>
    <table class="sum"><tr><td></td><td>HP</td><td>Útok</td></tr>${rows}</table>${bcs ? `<h3>Bitevní podmínky</h3><div class="bc-list">${bcs}</div>` : ''}`);
}

// ---------- perky a konec runu ----------
function showPerkModal(R) {
  const m = modal(`<h2>Vyber perk</h2><div class="perk-list">${R.perkChoices.map(id => {
    const p = PERK_MAP[id];
    let name = p.name;
    if (id === 'randomUw' && R.randomUwPick) name += ` (${UW_MAP[R.randomUwPick].name})`;
    return `<button class="perk ${p.type}" data-perk="${id}">${name}${p.max < 99 ? `<span class="muted small"> (${R.perks[id] || 0}/${p.max})</span>` : ''}</button>`;
  }).join('')}</div>`, 'perk-modal', false);
  $$('.perk', m).forEach(b => b.onclick = () => { m.remove(); choosePerk(R, b.dataset.perk); });
}

function showRunSummary(R, tour, forfeit) {
  let extra = '';
  if (tour) extra = `<div class="panel center"><div class="panel-t">Turnaj · ${LEAGUES[R.tourney].name}</div>Nejlepší vlna v turnaji: <b>${tour.best}</b><div class="small muted">Výsledky budou po skončení turnaje.</div></div>`;
  if (R.disso) extra = `<div class="panel center"><div class="panel-t">Disonance · ${DISSO_CATS.find(c => c[0] === R.disso)[1]}</div>Boost Tier ${R.tier}: <b>x${(save.disso[R.tier][R.disso] || 1).toFixed(3)}</b></div>`;
  modal(`<h2>${forfeit ? 'Run ukončen' : 'Věž padla!'}</h2>
    <div class="sum-wave">Vlna <b>${R.wave}</b></div>
    <table class="sum">
      <tr><td>${R.tourney !== null ? 'Liga' : 'Tier'}</td><td>${R.tourney !== null ? LEAGUES[R.tourney].name : R.tier}</td></tr>
      <tr><td>Získané coiny</td><td class="coin">© ${fmt(R.coinsEarned)}</td></tr>
      <tr><td>Vydělaný cash</td><td>$ ${fmt(R.cashEarned)}</td></tr>
      <tr><td>Zabití</td><td>${fmt(R.kills)}</td></tr>
      <tr><td>Bossové</td><td>${R.bossKills}</td></tr>
      <tr><td>Gemy</td><td class="gem">◆ ${R.gemsEarned}</td></tr>
      ${R.cellsEarned ? `<tr><td>Buňky</td><td class="cell">⬣ ${fmt(R.cellsEarned)}</td></tr>` : ''}
      <tr><td>Herní čas</td><td>${fmtTime(R.time)}</td></tr>
    </table>${extra}
    <button class="btn primary wide" data-act="close-modal">Pokračovat</button>`, 'summary');
  renderBattle();
  buildNav();
}

function onMilestoneReached(t, w) {
  toast(`Milník Tier ${t} · vlna ${w} – převezmi odměnu!`, 'gold');
  buildNav();
}

// ---------- dílna ----------
UI.pages.workshop = {
  render() {
    const enhOn = !!save.labs.enhance;
    const cats = ['atk', 'def', 'util'].concat(enhOn ? ['enh'] : []);
    let cells;
    if (UI.wsCat === 'enh') {
      cells = ENH_DEFS.map(e => `<div class="ucell" data-act="enh-buy" data-id="${e.id}">
        <div class="uname">${e.name}<div class="small muted">${CATS.find(c => c.id === e.cat).name}</div></div><div class="ubox"><div class="uval" id="enh-v-${e.id}"></div><div class="ucost" id="enh-c-${e.id}"></div></div></div>`).join('');
    } else {
      const seen = new Set();
      cells = STAT_DEFS.filter(d => d.cat === UI.wsCat).map(d => {
        if (!statUnlocked(d)) {
          const u = d.unlock;
          if (seen.has(u.key)) return '';
          seen.add(u.key);
          const prereq = u.after && !save.unlocks[u.after];
          const names = STAT_DEFS.filter(x => x.unlock && x.unlock.key === u.key).map(x => x.name).join(' + ');
          return `<div class="ucell wide-unlock ${prereq ? 'prereq' : ''}" data-act="ws-unlock" data-key="${u.key}" title="${d.desc}">
            <div class="uname">${names}</div><div class="small" id="ws-u-${u.key}" style="font-weight:800;margin-top:4px">${prereq ? '🔒 nejdřív ' + STAT_DEFS.find(x => x.unlock && x.unlock.key === u.after).name : fmt(u.cost) + ' ' + ico('coin')}</div></div>`;
        }
        return upgCellHtml(d, 'ws');
      }).join('');
    }
    return `<div class="ws-wrap"><div class="ws-head"><h1>${CAT_HEAD[UI.wsCat]}</h1><button class="bulk-btn" data-act="ws-bulk">${bulkLabel(save.wsBulk)}</button></div>
      <div class="ugrid">${cells}</div>
      ${save.labs.respec ? `<button class="btn wide danger" data-act="ws-respec">Respec dílny (vrátí coiny) · ◆ 150</button>` : ''}
      <div class="cat-bar">${catBarHtml(cats, UI.wsCat, 'ws-tab')}</div></div>`;
  },
  update() {
    if (UI.wsCat === 'enh') {
      for (const e of ENH_DEFS) {
        const v = $('#enh-v-' + e.id), c = $('#enh-c-' + e.id); if (!v) continue;
        const L = save.enh[e.id] || 0;
        v.textContent = 'x' + (1 + L * e.per).toFixed(2);
        if (L >= e.max) { c.textContent = 'Max'; v.closest('.ucell').className = 'ucell maxed'; continue; }
        const cost = enhCost(e, L);
        c.innerHTML = fmt(cost) + ' ' + ico('coin');
        v.closest('.ucell').className = 'ucell' + (save.coins >= cost ? '' : ' poor');
      }
      return;
    }
    for (const d of STAT_DEFS) {
      if (d.cat !== UI.wsCat) continue;
      if (!statUnlocked(d)) { const u = $('#ws-u-' + d.unlock.key); if (u) u.closest('.ucell').classList.toggle('poor', save.coins < d.unlock.cost); continue; }
      const c = $('#ws-c-' + d.id);
      if (!c) continue;
      const cell = c.closest('.ucell');
      const L = save.ws[d.id] || 0;
      setVal($('#ws-v-' + d.id), d.fmt(d.f(L)));
      const b = bulkCount(save.wsBulk, l => wsCost(d, l), L, d.max, save.coins);
      $('#ws-b-' + d.id).textContent = b.n > 1 ? 'x' + b.n : '';
      if (b.n === 0) { c.innerHTML = 'Max ' + ico('coin'); cell.className = 'ucell maxed'; continue; }
      c.innerHTML = fmt(b.cost) + ' ' + ico('coin');
      cell.className = 'ucell' + (b.cost <= save.coins && !b.short ? '' : ' poor');
    }
  },
};

function buyWs(id) {
  const d = STAT_MAP[id], L = save.ws[id] || 0;
  const b = bulkCount(save.wsBulk, l => wsCost(d, l), L, d.max, save.coins);
  if (b.n === 0 || b.short || b.cost > save.coins) return;
  save.coins -= b.cost;
  save.wsSpent = (save.wsSpent || 0) + b.cost;
  save.ws[id] = L + b.n;
  track('ws_buys', b.n);
  markDirty();
  UI.pages.workshop.update();
  updateTopbar();
}

// ---------- akce (delegace kliknutí) ----------
const ACTIONS = {
  'close-modal': el => el.closest('.modal-bg').remove(),
  nav: el => showPage(el.dataset.page),
  'goto-more': el => { UI.moreSub = el.dataset.sub; showPage('more'); $('#page').scrollTop = 0; },
  tier: el => { save.tier = clamp(save.tier + +el.dataset.d, 1, save.maxTier); renderBattleMenu(); },
  'start-run': () => { startRun(save.tier); renderBattle(); },
  'disso-start': () => {
    const m = modal(`<h2>Disonantní run · Tier ${save.tier}</h2><p class="small muted">Vybraná kategorie bude zakázaná. Za dosaženou vlnu získáš trvalý boost této kategorie na tomto tieru (max x5, utilita x3 na vlně 5000) a ozvěnu 0,5 % na ostatních tierech.</p>
      <div class="perk-list">${DISSO_CATS.map(([k, n, max]) => `<button class="perk" data-k="${k}">${n} <span class="muted small">(současný boost x${((save.disso[save.tier] || {})[k] || 1).toFixed(3)} / max x${max})</span></button>`).join('')}</div>`);
    $$('.perk', m).forEach(b => b.onclick = () => { m.remove(); startRun(save.tier, undefined, b.dataset.k); showPage('battle'); });
  },
  'run-tab': el => { UI.runCat = el.dataset.cat; buildRunTabs(); buildRunGrid(); updateRunUI(); },
  'run-bulk': () => { const b = availBulks(); save.bulk = b[(b.indexOf(save.bulk) + 1) % b.length]; buildRunTabs(); updateRunUI(); },
  'run-buy': el => buyRun(el.dataset.id),
  'uw-toggle': el => { const R = game.run; if (R && !toggleUW(R, el.dataset.id)) toast('Vyčerpáno 40 přepnutí'); updateRunUI(); },
  'wave-info': () => showWaveInfo(),
  manual: el => {
    const R = game.run; if (!R) return;
    if (el.dataset.k === 'demon') activateDemon(R);
    if (el.dataset.k === 'nuke') activateNuke(R);
    if (el.dataset.k === 'barrage') activateBarrage(R);
    updateRunUI();
  },
  speed: el => {
    const R = game.run; if (!R) return;
    let i = SPEEDS.findIndex(v => v >= R.speed);
    if (i < 0) i = SPEEDS.length - 1;
    i = clamp(i + (+el.dataset.d > 0 ? 1 : -1), 0, SPEEDS.length - 1);
    R.speed = Math.min(SPEEDS[i], R.S.maxSpeed);
    if (+el.dataset.d > 0 && R.S.maxSpeed > MAX_SPEED && R.speed === MAX_SPEED && SPEEDS[i] === MAX_SPEED) R.speed = R.S.maxSpeed;
    save.speed = R.speed;
    updateRunUI();
  },
  pause: () => { game.userPaused = !game.userPaused; updateRunUI(); },
  quit: () => { const R = game.run; if (R) confirmModal('Opravdu ukončit run? Získané coiny ti zůstanou.', () => endRun(R, true)); },
  'ws-tab': el => { UI.wsCat = el.dataset.cat; renderPage(); },
  'ws-bulk': () => { const b = availBulks(); save.wsBulk = b[(b.indexOf(save.wsBulk) + 1) % b.length]; renderPage(); },
  'ws-buy': el => buyWs(el.dataset.id),
  'ws-unlock': el => {
    const u = UNLOCK_GROUPS[el.dataset.key];
    if (u.after && !save.unlocks[u.after]) { toast('Nejdřív odemkni předchozí vylepšení'); return; }
    if (save.coins < u.cost) { toast('Nedostatek coinů'); return; }
    save.coins -= u.cost; save.unlocks[u.key] = true; markDirty(); renderPage();
    if (game.run) buildRunGrid();
  },
  'enh-buy': el => {
    const e = ENH_DEFS.find(x => x.id === el.dataset.id), L = save.enh[e.id] || 0;
    if (L >= e.max) return;
    const c = enhCost(e, L);
    if (save.coins < c) { toast('Nedostatek coinů'); return; }
    save.coins -= c; save.enh[e.id] = L + 1; markDirty(); UI.pages.workshop.update();
  },
  'ws-respec': () => confirmModal('Respec dílny za 150 ◆? Vrátí se všechny coiny utracené za levely dílny.', () => {
    if (save.gems < 150) { toast('Nedostatek gemů'); return; }
    let refund = 0;
    for (const d of STAT_DEFS) for (let l = 0; l < (save.ws[d.id] || 0); l++) refund += interpRows(WIKI.ws[d.ws] || [[1, 30]], l + 1);
    save.gems -= 150; save.coins += refund; save.ws = {}; markDirty(); renderPage();
    toast(`Vráceno © ${fmt(refund)}`, 'good');
  }),
  'ad-bonus': () => {
    if (save.shop.noAds) { toast('Bonus je díky „Bez reklam“ vždy aktivní'); return; }
    playAd(() => {
      save.adBonusUntil = Math.max(Date.now(), save.adBonusUntil) + AD_BONUS_MIN * 60000;
      markDirty();
      toast(`Bonus x1.5 coinů aktivní na ${AD_BONUS_MIN} min`, 'gold');
    });
  },
};

// simulovaná reklama (5 s)
function playAd(done) {
  if (save.shop.noAds) { done(); return; }
  const m = modal(`<h2>Reklama</h2><div class="ad-box">Tady by běžela reklama…<div class="big-num" id="ad-cd">5</div></div>`, '', false);
  let left = 5;
  const iv = setInterval(() => {
    left--;
    const cd = $('#ad-cd', m);
    if (cd) cd.textContent = left;
    if (left > 0) return;
    clearInterval(iv);
    m.remove();
    done();
    if (UI.page !== 'battle') renderPage();
  }, 1000);
}

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { fn(el); updateTopbar(); }
});

function initUI() {
  $('#i-coin').innerHTML = ico('coin');
  $('#i-gem').innerHTML = ico('gem', '#ff5ce1');
  $('#i-stone').innerHTML = ico('stone', '#33e08f');
  buildBattleView();
  buildNav();
  showPage('battle');
  updateTopbar();
}
