'use strict';
// ---------- uživatelské rozhraní ----------
const $ = id => document.getElementById(id);
const UI = { page: 'battle', cat: 'atk', wsCat: 'atk', bulk: 1, tier: 1, overShown: false, modalOpen: false, perkOpen: false };
const BULKS = [1, 5, 'max'];
const UNLOCK_NAMES = { range: 'Dosah', multi: 'Rozhoz', bounce: 'Odraz', def: 'Obrana', thorns: 'Trny', knock: 'Odhození', life: 'Lifesteal', gold: 'Zlaťáky', bank: 'Úrok', free: 'Vylepšení zdarma', roulette: 'Krupiérova přízeň' };
const PAGE_TITLES = { battle: 'Stůl', ws: 'Dílna', herna: 'Herna', stats: 'Rekordy' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function modal(html, { closable = true, onClose } = {}) {
  closeModal();
  const root = $('modal-root');
  root.innerHTML = `<div class="back-drop"><div class="modal">${html}</div></div>`;
  UI.modalOpen = true;
  game.modalPause = true;
  UI.onClose = onClose;
  if (closable) root.firstChild.addEventListener('click', e => { if (e.target === root.firstChild && !RL.spinning) closeModal(); });
  return root.querySelector('.modal');
}
function closeModal() {
  const root = $('modal-root');
  if (!root.firstChild) return;
  root.innerHTML = '';
  UI.modalOpen = false;
  UI.perkOpen = false;
  game.modalPause = false;
  const cb = UI.onClose; UI.onClose = null;
  if (cb) cb();
}

// ---------- navigace ----------
function showPage(p) {
  UI.page = p;
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.page === p);
  for (const id of ['battle', 'ws', 'herna', 'stats']) $('page-' + id).hidden = id !== p;
  $('page-title').textContent = PAGE_TITLES[p];
  if (p === 'ws') renderWs();
  if (p === 'herna') renderHerna();
  if (p === 'stats') renderStats();
  if (p === 'battle') { buildRunGrid(); updateStart(); }
}

function updateTop() {
  $('c-gold').textContent = fmt(Math.floor(save.gold));
  $('c-gems').textContent = fmt(save.gems);
}

// ---------- bitva: start ----------
function updateStart() {
  const el = $('start');
  const show = !game.run;
  el.hidden = !show;
  for (const id of ['run-panel', 'status', 'hud', 'hud-btns']) $(id).hidden = show;
  if (!show) return;
  UI.tier = clamp(UI.tier || save.tier, 1, save.maxTier);
  const T = TIERS[UI.tier - 1];
  const best = save.best[UI.tier] || 0;
  const next = UI.tier === save.maxTier && save.maxTier < TIERS.length ? `<div class="d">Vlna ${TIER_UNLOCK_WAVE} odemkne ${TIERS[UI.tier].name}</div>` : '';
  el.innerHTML = `
    <h1>Jackpot<br>Tower</h1>
    <div class="sub">Automat uprostřed stolu hází žetony po kostkách, kartách a krupiérech. Přežij co nejvíc vln, točí se samo — štěstí přeje připraveným.</div>
    <div class="tier-pick">
      <button data-act="tier" data-d="-1" ${UI.tier <= 1 ? 'disabled' : ''}>‹</button>
      <div class="tier-card"><div class="d">Stůl ${UI.tier}</div><div class="n">${T.name}</div>
        <div class="d">Nejlepší vlna: ${best} · zlaťáky ×${T.gold}</div>${next}</div>
      <button data-act="tier" data-d="1" ${UI.tier >= save.maxTier ? 'disabled' : ''}>›</button>
    </div>
    <button class="btn big gold" data-act="play">Rozdat a hrát</button>`;
}

function newRun() {
  save.tier = UI.tier;
  startRun(UI.tier);
  UI.overShown = false;
  writeSave();
  updateStart();
  buildRunGrid();
}

// ---------- bitva: panel vylepšení ----------
function buildRunTabs() {
  $('run-tabs').innerHTML = CATS.map(c => `<button data-act="cat" data-cat="${c.id}" style="--c:${c.color}" class="${c.id === UI.cat ? 'on' : ''}">${c.name}</button>`).join('');
  $('run-bulk').innerHTML = BULKS.map(b => `<button data-act="bulk" data-b="${b}" class="${b === UI.bulk ? 'on' : ''}">${b === 'max' ? 'Max' : '×' + b}</button>`).join('');
}
function buildRunGrid() {
  buildRunTabs();
  const col = CATS.find(c => c.id === UI.cat).color;
  $('run-grid').innerHTML = STATS.filter(d => d.cat === UI.cat).map(d =>
    `<button class="upg" id="u-${d.id}" data-act="buy" data-id="${d.id}" style="--c:${col}">
      <span class="nm">${d.name}</span>
      <span class="row"><span class="v"></span><span class="cost"></span></span>
    </button>`).join('');
  updateRunGrid();
}
function updateRunGrid() {
  const R = game.run;
  if (!R) return;
  for (const d of STATS) {
    if (d.cat !== UI.cat) continue;
    const el = $('u-' + d.id);
    if (!el) continue;
    const locked = !isUnlocked(d), max = atMax(d.id, R);
    const c = cashCost(d, R);
    el.classList.toggle('locked', locked);
    el.classList.toggle('max', !locked && max);
    el.classList.toggle('no', !locked && !max && R.cash < c);
    el.querySelector('.v').textContent = locked ? '🔒' : d.fmt(d.f(statLevel(d.id, R)));
    el.querySelector('.cost').textContent = locked ? 'v dílně' : max ? 'MAX' : '$' + fmt(c);
  }
  const rb = $('b-risk');
  rb.classList.toggle('on', R.risk);
  rb.querySelector('b').textContent = R.risk ? 'zap' : 'vyp';
}
function buyRunUI(id) {
  const R = game.run;
  if (!R || R.over) return;
  const d = STAT_MAP[id];
  if (!isUnlocked(d)) { toast(`Odemkni ${UNLOCK_NAMES[d.unlock[0]]} v dílně za ${fmt(d.unlock[1])} 🪙`); return; }
  const n = UI.bulk === 'max' ? 999 : UI.bulk;
  let bought = 0, won = 0, lost = 0, roll = 0;
  for (let i = 0; i < n; i++) {
    const r = buyRun(R, id);
    if (!r) break;
    bought++;
    roll = r.roll;
    if (R.risk) { if (r.gain) won++; else lost++; }
  }
  if (R.risk && bought) {
    const face = '⚀⚁⚂⚃⚄⚅'[roll - 1];
    if (bought === 1) toast(won ? `${face} Padla ${roll} – výhra! ${d.name} +2` : `${face} Padla ${roll} – smůla, ${d.name} bez zlepšení`, won ? 'good' : 'bad');
    else toast(`🎲 ${d.name}: ${won}× výhra (+${won * 2}), ${lost}× prohra`, won >= lost ? 'good' : 'bad');
  }
  updateRunGrid();
}

// ---------- bitva: HUD ----------
function updateHud() {
  const R = game.run;
  updateTop();
  if (!R) return;
  $('h-wave').textContent = R.wave;
  $('h-wavebar').style.width = (R.phase === 'spawn' ? R.phaseT / WAVE_SPAWN : 1) * 100 + '%';
  $('h-table').textContent = TIERS[R.tier - 1].name;
  $('h-cash').textContent = fmt(Math.floor(R.cash));
  $('h-hpbar').style.width = clamp(R.hp / R.S.maxHp, 0, 1) * 100 + '%';
  $('h-hp').textContent = `${fmt(Math.ceil(R.hp))} / ${fmt(R.S.maxHp)}`;
  $('b-speed').textContent = '×' + save.speed;
  $('b-pause').textContent = game.paused ? '▶' : '❚❚';
  $('b-perk').hidden = !R.perkOffer;
  const sl = R.slot, hs = $('h-slot');
  if (sl.spin > 0) { hs.textContent = '🎰 Točí se…'; hs.className = ''; }
  else if (sl.last) {
    const s = sl.last.sym ? SYM_MAP[sl.last.sym] : null;
    const big = sl.last.n === 3;
    hs.textContent = !s ? '🎰 Nic nepadlo' : big && s.id === 'seven' ? '💰 JACKPOT 777 – smete stůl!' : `${big ? '🎉 ' : ''}${s.name}: ${big ? s.triple : s.pair}`;
    hs.className = s ? 'win' : '';
  }
  $('h-slotcd').style.width = (sl.spin > 0 ? 100 : clamp(sl.t / R.S.spinCd, 0, 1) * 100) + '%';
}

// ---------- perky ----------
function showPerks() {
  const R = game.run;
  if (!R || !R.perkOffer || UI.modalOpen) return;
  const cards = R.perkOffer.map(id => {
    const p = PERK_MAP[id];
    const red = p.suit === '♥' || p.suit === '♦';
    return `<button class="pcard ${p.trade ? 'trade' : ''}" data-act="perkpick" data-id="${id}">
      <div class="bk"></div>
      <div class="fr"><span class="s ${red ? 'red' : ''}">${p.suit}</span><span>${esc(p.name)}</span>
      <span class="lvl">${perkN(R, id)}/${p.max}</span></div></button>`;
  }).join('');
  const m = modal(`<h2>Krupiér rozdává</h2><div class="muted small">Vlna ${R.wave}: vyber si jednu kartu</div><div class="cards">${cards}</div>`, { closable: false });
  UI.perkOpen = true;
  m.querySelectorAll('.pcard').forEach((c, i) => setTimeout(() => c.classList.add('up'), 250 + i * 220));
}

// ---------- ruleta ----------
const RL = { bet: 'red', amt: 0.25, spinning: false, rot: 0, ball: -Math.PI / 2, res: null, raf: 0 };
function showRoulette() {
  const R = game.run;
  if (!R) return;
  const m = modal(`<h2>Ruleta</h2>
    <canvas id="wheel" width="460" height="460"></canvas>
    <div class="bets">${BETS.map(b => `<button data-act="rbet" data-id="${b.id}" class="${b.id === 'red' ? 'red' : b.id === 'black' ? 'black' : b.id === 'zero' ? 'zero' : ''}">${b.name}<small>${b.pay}× výplata</small></button>`).join('')}</div>
    <div class="amounts">${[0.1, 0.25, 0.5, 1].map(a => `<button class="chip" data-act="ramt" data-a="${a}">${a === 1 ? 'VŠE' : a * 100 + ' %'}<small></small></button>`).join('')}</div>
    <div class="roul-res" id="roul-res">Hraje se o žetony z tohoto runu. Hra stojí, dokud jsi u stolu.</div>
    <div class="actions"><button class="btn gold" data-act="rspin" id="rspin">Točit</button><button class="btn ghost" data-act="close">Odejít</button></div>`);
  updateRouletteUI();
  drawRoulette();
  return m;
}
function updateRouletteUI() {
  const R = game.run;
  document.querySelectorAll('[data-act="rbet"]').forEach(b => b.classList.toggle('on', b.dataset.id === RL.bet));
  document.querySelectorAll('[data-act="ramt"]').forEach(b => {
    b.classList.toggle('on', +b.dataset.a === RL.amt);
    b.querySelector('small').textContent = '$' + fmt(Math.floor(R.cash * +b.dataset.a));
  });
  const sp = $('rspin');
  if (sp) sp.disabled = RL.spinning || Math.floor(R.cash * RL.amt) < 1;
}
function drawRoulette() {
  const cv = $('wheel');
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, c = W / 2, r1 = W * 0.47, r0 = W * 0.33, n = WHEEL.length, da = Math.PI * 2 / n;
  g.clearRect(0, 0, W, W);
  g.beginPath(); g.arc(c, c, r1 + 8, 0, Math.PI * 2); g.fillStyle = '#3a1f12'; g.fill();
  g.lineWidth = 4; g.strokeStyle = '#e3b448'; g.stroke();
  for (let i = 0; i < n; i++) {
    const a = RL.rot + i * da - Math.PI / 2;
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, r1, a, a + da); g.closePath();
    const col = numColor(WHEEL[i]);
    g.fillStyle = col === 'green' ? '#0d8a4c' : col === 'red' ? '#b3202e' : '#151515'; g.fill();
    g.strokeStyle = 'rgba(227,180,72,.5)'; g.lineWidth = 1; g.stroke();
    g.save(); g.translate(c, c); g.rotate(a + da / 2 + Math.PI / 2);
    g.fillStyle = '#fff'; g.font = '700 17px Outfit'; g.textAlign = 'center'; g.fillText(WHEEL[i], 0, -r1 + 22); g.restore();
  }
  const hub = g.createRadialGradient(c, c, 5, c, c, r0);
  hub.addColorStop(0, '#e3b448'); hub.addColorStop(0.5, '#6b3d1c'); hub.addColorStop(1, '#2a140b');
  g.beginPath(); g.arc(c, c, r0, 0, Math.PI * 2); g.fillStyle = hub; g.fill();
  g.strokeStyle = '#e3b448'; g.lineWidth = 3; g.stroke();
  // středový kříž
  g.save(); g.translate(c, c); g.rotate(RL.rot);
  g.strokeStyle = '#ffe08a'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-r0 * 0.6, 0); g.lineTo(r0 * 0.6, 0); g.moveTo(0, -r0 * 0.6); g.lineTo(0, r0 * 0.6); g.stroke();
  g.restore();
  // kulička
  const br = r1 - 40;
  const bx = c + Math.cos(RL.ball) * br, by = c + Math.sin(RL.ball) * br;
  const bg = g.createRadialGradient(bx - 3, by - 3, 1, bx, by, 9);
  bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#9aa0a8');
  g.beginPath(); g.arc(bx, by, 9, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
  // ukazatel
  g.fillStyle = '#ffe08a';
  g.beginPath(); g.moveTo(c - 12, 2); g.lineTo(c + 12, 2); g.lineTo(c, 24); g.closePath(); g.fill();
}
function spinRoulette() {
  const R = game.run;
  if (!R || RL.spinning) return;
  const amount = Math.floor(R.cash * RL.amt);
  const res = playRoulette(R, RL.bet, amount);
  if (!res) return;
  RL.spinning = true;
  updateRouletteUI();
  $('roul-res').textContent = `Sázka $${fmt(amount)} na ${BETS.find(b => b.id === RL.bet).name}…`;
  const idx = WHEEL.indexOf(res.n), n = WHEEL.length, da = Math.PI * 2 / n;
  const r0 = RL.rot % (Math.PI * 2);
  const target = -(idx * da + da / 2) - Math.PI * 2 * 5;
  const b0 = RL.ball, bTarget = -Math.PI / 2 + Math.PI * 2 * 7;
  const t0 = performance.now(), dur = 3600;
  cancelAnimationFrame(RL.raf);
  const anim = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    RL.rot = r0 + (target - r0) * e;
    RL.ball = b0 + (bTarget - b0) * e;
    drawRoulette();
    if (k < 1) { RL.raf = requestAnimationFrame(anim); return; }
    RL.rot = target % (Math.PI * 2); RL.ball = -Math.PI / 2;
    RL.spinning = false;
    const col = numColor(res.n);
    const el = $('roul-res');
    if (el) {
      el.innerHTML = `Padlo <b style="color:${col === 'red' ? '#ff5d6c' : col === 'green' ? '#4fd6a0' : '#fff'}">${res.n}</b> – ` +
        (res.win ? `<span class="good">výhra $${fmt(res.payout)}!</span>` : `<span class="bad">prohra $${fmt(res.amount)}</span>`);
      updateRouletteUI();
    }
    if (res.win && res.n === 0) toast('💚 Zelená nula! Krupiér bledne', 'good');
    writeSave();
  };
  RL.raf = requestAnimationFrame(anim);
}

// ---------- pauza a konec runu ----------
function showPause() {
  modal(`<h2>Pauza</h2><div class="muted small">Vlna ${game.run.wave} · ${TIERS[game.run.tier - 1].name}</div>
    ${runSummaryHtml(game.run)}
    <div class="actions"><button class="btn gold" data-act="close">Pokračovat</button><button class="btn" data-act="forfeit">Vstát od stolu</button></div>`);
}
function runSummaryHtml(R) {
  return `<div class="sum">
    <span>Vlna</span><b>${R.wave}</b><span>Poraženo</span><b>${fmt(R.kills)}</b>
    <span>Vyhrané žetony</span><b>$${fmt(R.cashEarned)}</b><span>Zlaťáky</span><b>🪙 ${fmt(Math.floor(R.goldEarned))}</b>
    <span>Diamanty</span><b>💎 ${R.gemsEarned}</b><span>Zatočení automatu</span><b>${R.spins}</b><span>Jackpoty</span><b>${R.jackpots}</b></div>`;
}
function showRunOver() {
  const R = game.run;
  UI.overShown = true;
  const best = save.best[R.tier] === R.wave;
  modal(`<h2>Bank vyhrál</h2><div class="muted small">${TIERS[R.tier - 1].name}${best ? ' · <span class="good">nový rekord!</span>' : ''}</div>
    ${runSummaryHtml(R)}<div class="muted small">Zlaťáky utrať v dílně, diamanty v herně.</div>
    <div class="actions"><button class="btn gold" data-act="again">Hrát znovu</button><button class="btn ghost" data-act="toWs">Do dílny</button></div>`,
  { closable: false, onClose: () => { game.run = null; writeSave(); updateStart(); } });
  writeSave();
}

// ---------- dílna ----------
function renderWs() {
  const el = $('page-ws');
  const tabs = `<div class="tabs" style="margin:-12px -12px 8px">${CATS.map(c => `<button data-act="wscat" data-cat="${c.id}" style="--c:${c.color}" class="${c.id === UI.wsCat ? 'on' : ''}">${c.name}</button>`).join('')}</div>`;
  const col = CATS.find(c => c.id === UI.wsCat).color;
  let html = tabs + `<div class="muted small">Trvalá vylepšení – platí od začátku každé hry. Úroveň v běhu se přičítá.</div>`;
  const seen = new Set();
  for (const d of STATS.filter(s => s.cat === UI.wsCat)) {
    if (d.unlock && !isUnlocked(d)) {
      const k = d.unlock[0];
      if (seen.has(k)) continue;
      seen.add(k);
      const names = STATS.filter(s => s.unlock && s.unlock[0] === k).map(s => s.name).join(', ');
      html += `<div class="unlock-row"><div><div class="nm">🔒 ${UNLOCK_NAMES[k]}</div><div class="muted small">${names}</div></div>
        <button class="btn gold" data-act="unlock" data-k="${k}" ${save.gold < d.unlock[1] ? 'disabled' : ''}>🪙 ${fmt(d.unlock[1])}</button></div>`;
      continue;
    }
    const L = wsLevel(d.id), max = L >= d.max, c = goldCost(d);
    html += `<div class="ws-row" style="--c:${col}"><div class="info"><div class="nm">${d.name} <span class="lv">úr. ${L}/${d.max}</span></div>
      <div class="ds">${d.desc}</div><div class="vals">${d.fmt(d.f(L))}${max ? '' : ` → <b>${d.fmt(d.f(L + 1))}</b>`}</div></div>
      <button data-act="ws" data-id="${d.id}" ${max || save.gold < c ? 'disabled' : ''}>${max ? 'MAX' : '🪙 ' + fmt(c)}</button></div>`;
  }
  const sy = el.scrollTop;
  el.innerHTML = html;
  el.scrollTop = sy;
}

// ---------- herna (talismany) ----------
const HERNA = { spinning: false, last: null };
function renderHerna() {
  const el = $('page-herna');
  const res = HERNA.last;
  const icons = res ? [res.t.icon, res.t.icon, res.t.icon] : ['🍀', '7️⃣', '🎩'];
  let html = `<div class="machine"><div class="lights">${'<i></i>'.repeat(9)}</div>
    <div class="marquee">Herna talismanů</div>
    <div class="reels">${icons.map(i => `<div class="reel"><span>${i}</span></div>`).join('')}</div>
    <button class="btn gold big" data-act="talspin" ${save.gems < TAL_SPIN_COST || HERNA.spinning ? 'disabled' : ''}>Zatočit · ${TAL_SPIN_COST} 💎</button></div>
    <div class="tal-result" id="tal-result">${res ? talResultHtml(res) : '<span class="muted small">Diamanty získáš za krupiéry, za každou 10. vlnu poprvé a za 💎💎💎 na automatu.</span>'}</div>
    <div class="slots-info"><div class="sec-h" style="flex:1">Talismany</div><span class="muted small">&nbsp;Vybaveno ${save.equipped.length}/${talSlots()}</span></div>
    <div class="muted small" style="margin:-4px 0 8px">Klepnutím talisman nasadíš nebo sundáš. Další sloty odemykají vyšší stoly. Kopie zvyšují úroveň.</div>
    <div class="tal-grid">`;
  for (const t of TALISMANS) {
    const lv = talLevel(t.id), cnt = talCount(t.id), rc = TAL_RARITY[t.rarity].color;
    const on = save.equipped.includes(t.id);
    const nextReq = TAL_LEVEL_REQ[lv] || null;
    html += `<button class="tal ${lv ? '' : 'unknown'} ${on ? 'on' : ''}" style="--rc:${rc}" data-act="tal" data-id="${t.id}" ${lv ? '' : 'disabled'}>
      <span class="ic">${lv ? t.icon : '❔'}</span><span class="nm">${lv ? t.name : '???'}</span>
      <span class="rr">${TAL_RARITY[t.rarity].name}${lv ? ' · úr. ' + lv : ''}</span>
      <span class="ds">${t.desc(t.vals[Math.max(0, lv - 1)])}</span>
      <span class="prog"><i style="width:${nextReq ? Math.min(100, cnt / nextReq * 100) : 100}%"></i></span>
      <span class="muted small">${nextReq ? `${cnt}/${nextReq} kopií` : 'Maximum'}</span>
      ${on ? '<span class="eq">✓ Nasazeno</span>' : ''}</button>`;
  }
  html += '</div>';
  el.innerHTML = html;
}
function talResultHtml(r) {
  return r.isNew ? `Nový talisman: <b>${r.t.icon} ${r.t.name}</b> (${TAL_RARITY[r.t.rarity].name})`
    : r.levelUp ? `<b>${r.t.icon} ${r.t.name}</b> postoupil na úroveň ${talLevel(r.t.id)}!`
    : `Kopie: <b>${r.t.icon} ${r.t.name}</b> (${talCount(r.t.id)} ks)`;
}
function talSpinUI() {
  if (HERNA.spinning || save.gems < TAL_SPIN_COST) return;
  const res = spinTalisman();
  if (!res) return;
  HERNA.spinning = true;
  writeSave();
  updateTop();
  const reels = [...document.querySelectorAll('#page-herna .reel')];
  const btn = document.querySelector('[data-act="talspin"]');
  btn.disabled = true;
  $('tal-result').innerHTML = '&nbsp;';
  const pool = TALISMANS.map(t => t.icon);
  const iv = setInterval(() => reels.forEach(r => { if (r.classList.contains('spin')) r.firstChild.textContent = pick(pool); }), 70);
  reels.forEach(r => r.classList.add('spin'));
  reels.forEach((r, i) => setTimeout(() => { r.classList.remove('spin'); r.firstChild.textContent = res.t.icon; }, 700 + i * 380));
  setTimeout(() => {
    clearInterval(iv);
    HERNA.spinning = false;
    HERNA.last = res;
    if (game.run) refreshStats(game.run);
    if (UI.page === 'herna') renderHerna();
    if (res.t.rarity === 'epic') toast(`✨ Epický talisman: ${res.t.name}!`, 'good');
  }, 700 + 3 * 380 + 150);
}

// ---------- rekordy ----------
function renderStats() {
  const st = save.stats;
  let html = `<div class="sec-h">Stoly</div><div class="rec">`;
  TIERS.forEach((T, i) => {
    const t = i + 1;
    html += `<span>${t <= save.maxTier ? '' : '🔒 '}${t}. ${T.name}</span><b>${t <= save.maxTier ? 'vlna ' + (save.best[t] || 0) : '—'}</b>`;
  });
  html += `</div><div class="sec-h">Statistiky</div><div class="rec">
    <span>Odehrané hry</span><b>${st.runs}</b><span>Poražení nepřátelé</span><b>${fmt(st.kills)}</b>
    <span>Poražení krupiéři</span><b>${st.bosses}</b><span>Zatočení automatu</span><b>${fmt(st.spins)}</b>
    <span>Jackpoty 777</span><b>${st.jackpots}</b><span>Zlaťáky celkem</span><b>🪙 ${fmt(Math.floor(st.goldTotal))}</b>
    <span>Ruleta – zatočení</span><b>${st.rouletteSpins}</b><span>Ruleta – vyhráno</span><b class="good">$${fmt(st.rouletteWon)}</b>
    <span>Ruleta – prohráno</span><b class="bad">$${fmt(st.rouletteLost)}</b><span>Největší výhra v ruletě</span><b>$${fmt(st.rouletteBest)}</b></div>
    <div class="sec-h">Výherní tabulka automatu</div><div class="rec">
    ${SYMS.map(s => `<span>${s.ch} ${s.name}</span><b style="font-weight:500;color:var(--cream)">2× ${s.pair} · 3× ${s.triple}</b>`).join('')}</div>
    <div style="text-align:center;margin-top:24px"><button class="btn ghost" data-act="reset">Smazat postup</button></div>`;
  $('page-stats').innerHTML = html;
}

// ---------- akce ----------
const ACTIONS = {
  play: () => newRun(),
  tier: el => { UI.tier = clamp(UI.tier + +el.dataset.d, 1, save.maxTier); updateStart(); },
  cat: el => { UI.cat = el.dataset.cat; buildRunGrid(); },
  bulk: el => { UI.bulk = el.dataset.b === 'max' ? 'max' : +el.dataset.b; buildRunTabs(); },
  buy: el => buyRunUI(el.dataset.id),
  risk: () => {
    const R = game.run; if (!R) return;
    R.risk = !R.risk;
    toast(R.risk ? '🎲 Riskni: každý nákup hází kostkou – 4–6 = dvě úrovně, 1–3 = nic' : 'Riskování vypnuto');
    updateRunGrid();
  },
  speed: () => { const sp = [1, 2, 3, 4]; save.speed = sp[(sp.indexOf(save.speed) + 1) % sp.length]; updateHud(); },
  pause: () => showPause(),
  roulette: () => showRoulette(),
  perk: () => showPerks(),
  perkpick: el => {
    if (!el.classList.contains('up')) return;
    choosePerk(game.run, el.dataset.id);
    toast(`🃏 ${PERK_MAP[el.dataset.id].name}`, 'good');
    closeModal();
    updateRunGrid();
  },
  rbet: el => { if (!RL.spinning) { RL.bet = el.dataset.id; updateRouletteUI(); } },
  ramt: el => { if (!RL.spinning) { RL.amt = +el.dataset.a; updateRouletteUI(); } },
  rspin: () => spinRoulette(),
  close: () => { if (!RL.spinning) closeModal(); },
  forfeit: () => { closeModal(); endRun(game.run); },
  again: () => { closeModal(); newRun(); },
  toWs: () => { closeModal(); showPage('ws'); },
  wscat: el => { UI.wsCat = el.dataset.cat; renderWs(); },
  ws: el => { if (buyWs(el.dataset.id)) { if (game.run) refreshStats(game.run); writeSave(); renderWs(); updateTop(); } },
  unlock: el => { if (buyUnlock(el.dataset.k)) { toast(`🔓 Odemčeno: ${UNLOCK_NAMES[el.dataset.k]}`, 'good'); writeSave(); renderWs(); updateTop(); } },
  talspin: () => talSpinUI(),
  tal: el => {
    if (!toggleTalisman(el.dataset.id)) toast(`Všechny sloty jsou plné (${talSlots()})`, 'bad');
    writeSave(); renderHerna();
  },
  reset: () => {
    modal(`<h2>Smazat postup?</h2><div class="muted">Přijdeš o zlaťáky, dílnu, talismany i rekordy.</div>
      <div class="actions"><button class="btn" data-act="resetYes">Smazat</button><button class="btn ghost" data-act="close">Zpět</button></div>`);
  },
  resetYes: () => { save = defaultSave(); game.run = null; closeModal(); writeSave(); UI.tier = 1; updateTop(); showPage('battle'); },
};

// ---------- hlavní smyčka ----------
let lastT = performance.now(), hudAcc = 0, saveAcc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  render(game.paused || game.modalPause ? 0 : dt);
  const R = game.run;
  if (R) {
    if (R.over && !UI.overShown) { closeModal(); showRunOver(); }
    if (R.perkOffer && !UI.modalOpen && UI.page === 'battle' && !R.over) showPerks();
  }
  hudAcc += dt;
  if (hudAcc > 0.1) { hudAcc = 0; updateHud(); if (UI.page === 'battle') updateRunGrid(); }
  saveAcc += dt;
  if (saveAcc > 5) { saveAcc = 0; writeSave(); }
  requestAnimationFrame(loop);
}

function init() {
  loadSave();
  UI.tier = save.tier;
  if (save.run) { try { restoreRun(save.run); } catch (e) { save.run = null; } }
  initRender();
  document.addEventListener('click', e => {
    const nav = e.target.closest('#nav button');
    if (nav) { showPage(nav.dataset.page); return; }
    const el = e.target.closest('[data-act]');
    if (el && ACTIONS[el.dataset.act] && !el.disabled) ACTIONS[el.dataset.act](el);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  window.addEventListener('pagehide', writeSave);
  showPage('battle');
  updateHud();
  requestAnimationFrame(t => { lastT = t; loop(t); });
}
init();
