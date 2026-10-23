'use strict';
// ---------- záložní vykreslování (Canvas 2D, když není WebGL) ----------
function initCanvas2d(cv) {
  game.cv = cv;
  game.ctx = cv.getContext('2d');
  game.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, a: Math.random() * 0.5 + 0.1 }));
  const resize = () => {
    const r = cv.parentElement.getBoundingClientRect();
    game.dpr = window.devicePixelRatio || 1;
    game.cw = r.width; game.ch = r.height;
    cv.width = Math.max(1, Math.round(r.width * game.dpr));
    cv.height = Math.max(1, Math.round(r.height * game.dpr));
    game.scale = Math.min(r.width, r.height) / 2 / VIEW_R;
  };
  new ResizeObserver(resize).observe(cv.parentElement);
  resize();
  cv.addEventListener('pointerdown', ev => {
    const r = cv.getBoundingClientRect();
    tryCollectGem(ev.clientX - r.left, ev.clientY - r.top);
  });
}

function poly(ctx, x, y, r, n, rot) {
  ctx.beginPath();
  if (n === 0) { ctx.arc(x, y, r, 0, Math.PI * 2); return; }
  for (let i = 0; i < n; i++) {
    const a = rot + i * Math.PI * 2 / n;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function glow(ctx, color, blur) { if (save.glow) { ctx.shadowColor = color; ctx.shadowBlur = blur; } }
function noGlow(ctx) { ctx.shadowBlur = 0; }
const curSkin = () => TOWER_SKINS.find(s => s.id === save.themes.skin) || TOWER_SKINS[0];
const curBg = () => BACKGROUNDS.find(b => b.id === save.themes.bg) || BACKGROUNDS[0];

function render2d() {
  const ctx = game.ctx;
  if (!ctx || !game.cw) return;
  const R = game.run;
  const skin = curSkin();
  const w = game.cw, h = game.ch, s = game.scale, px = 1 / s;
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  ctx.fillStyle = curBg().bg;
  ctx.fillRect(0, 0, w, h);
  for (const st of game.stars) {
    ctx.fillStyle = `rgba(200,210,255,${st.a * 0.35})`;
    ctx.fillRect(st.x * w, st.y * h, st.r, st.r);
  }
  if (!R) return;
  const S = R.S;
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);

  if (R.chrono > 0 && S.uw.chronoField) {
    ctx.fillStyle = 'rgba(77,210,255,0.10)';
    ctx.beginPath(); ctx.arc(0, 0, S.range * (S.uw.chronoField.radius || 1), 0, Math.PI * 2); ctx.fill();
  }
  if (S.uw.spotlight) {
    const sp = S.uw.spotlight, half = sp.angle * Math.PI / 360;
    ctx.fillStyle = 'rgba(255,245,165,0.10)';
    for (let i = 0; i < sp.qty; i++) {
      const a = R.spotA + i * Math.PI * 2 / sp.qty;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, S.range, a - half, a + half); ctx.closePath(); ctx.fill();
    }
  }
  // dosah (bariéra)
  ctx.strokeStyle = 'rgba(190,195,225,0.45)';
  ctx.lineWidth = 1.4 * px;
  ctx.beginPath(); ctx.arc(0, 0, S.range, 0, Math.PI * 2); ctx.stroke();

  // bažiny
  for (const sw of R.swamps) {
    ctx.fillStyle = `rgba(139,255,61,${0.12 + 0.08 * Math.min(1, sw.life)})`;
    ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8bff3d88'; ctx.lineWidth = px; ctx.stroke();
  }
  // černé díry
  for (const hl of R.holes) {
    const g = ctx.createRadialGradient(hl.x, hl.y, 0, hl.x, hl.y, hl.r);
    g.addColorStop(0, '#000'); g.addColorStop(0.7, 'rgba(40,0,70,0.9)'); g.addColorStop(1, 'rgba(180,92,255,0.2)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(hl.x, hl.y, hl.r, 0, Math.PI * 2); ctx.fill();
    glow(ctx, '#b45cff', 12);
    ctx.strokeStyle = '#b45cff'; ctx.lineWidth = 1.5 * px; ctx.stroke(); noGlow(ctx);
  }
  // boti
  for (const b of R.botsState) {
    const def = BOT_MAP[b.id];
    if (b.active > 0) {
      ctx.fillStyle = def.color + '22';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.range, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = def.color; ctx.lineWidth = 1.2 * px;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.range, 0, Math.PI * 2); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    glow(ctx, def.color, 8);
    poly(ctx, b.x, b.y, 1.4, 4, Math.PI / 4); ctx.stroke(); noGlow(ctx);
  }
  // miny
  ctx.fillStyle = '#ff9f43';
  for (const m of R.mines) { ctx.beginPath(); ctx.arc(m.x, m.y, 0.8, 0, Math.PI * 2); ctx.fill(); }
  for (const m of R.ilms) {
    const mx = Math.cos(m.a) * m.r, my = Math.sin(m.a) * m.r;
    glow(ctx, '#ff9f43', 8); ctx.fillStyle = '#ffcf8a';
    poly(ctx, mx, my, 0.9, 4, 0); ctx.fill(); noGlow(ctx);
  }
  // zeď
  if (R.wallState) {
    const wl = R.wallState;
    if (wl.hp > 0) {
      ctx.strokeStyle = wl.inv > 0 ? '#ffffff' : '#9fb4ff';
      ctx.lineWidth = 1.6 * px; glow(ctx, '#9fb4ff', 8);
      ctx.beginPath(); ctx.arc(0, 0, WALL_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (wl.hp / wl.max)); ctx.stroke(); noGlow(ctx);
    } else {
      ctx.strokeStyle = 'rgba(159,180,255,0.2)'; ctx.setLineDash([2 * px, 3 * px]); ctx.lineWidth = px;
      ctx.beginPath(); ctx.arc(0, 0, WALL_R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // prstence
  for (const g of R.rings) {
    if (g.delay > 0) continue;
    const c = g.k === 'death' ? '#ff4d6d' : g.k === 'nuke' ? '#ffd23d' : '#7df9ff';
    ctx.strokeStyle = c;
    ctx.globalAlpha = g.k === 'shock' ? Math.max(0, 1 - g.r / g.max) : 0.8;
    ctx.lineWidth = (g.k === 'shock' ? 2 : 3) * px;
    glow(ctx, c, 10);
    ctx.beginPath(); ctx.arc(0, 0, g.r, 0, Math.PI * 2); ctx.stroke();
    noGlow(ctx);
    ctx.globalAlpha = 1;
  }
  // paprsek smrti
  if (R.card.drOn > 0) {
    for (const a of R.card.drDouble ? [R.card.drA, R.card.drA + Math.PI] : [R.card.drA]) {
      ctx.strokeStyle = '#ff3dff'; ctx.lineWidth = 2.5 * px; glow(ctx, '#ff3dff', 14);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * SPAWN_R, Math.sin(a) * SPAWN_R); ctx.stroke(); noGlow(ctx);
    }
  }

  // nepřátelé
  const useGlow = save.glow && R.enemies.length < 140;
  for (const e of R.enemies) {
    const T = ENEMY_TYPES[e.type];
    let rot = e.rot;
    if (e.type === 'fast') rot = Math.atan2(-e.y, -e.x);
    ctx.lineWidth = (e.boss || e.fleet ? 2.5 : 1.6) * px;
    if (useGlow) { ctx.shadowColor = T.color; ctx.shadowBlur = e.boss || e.fleet ? 16 : 8; }
    ctx.strokeStyle = e.stun > 0 || e.netT > 0 ? '#ffffff' : T.color;
    poly(ctx, e.x, e.y, e.r, T.sides, rot);
    if (e.boss || e.elite || e.fleet) { ctx.fillStyle = T.color + '33'; ctx.fill(); }
    ctx.stroke();
    if (e.type === 'tank') { poly(ctx, e.x, e.y, e.r * 0.55, 4, rot); ctx.stroke(); }
    if (e.type === 'ranged') { ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.35, 0, Math.PI * 2); ctx.stroke(); }
    noGlow(ctx);
    if (e.type === 'protector') {
      ctx.strokeStyle = 'rgba(127,178,255,0.25)'; ctx.lineWidth = px;
      ctx.beginPath(); ctx.arc(e.x, e.y, ENEMY_TYPES.protector.shield * S.protRadius, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.prot) { ctx.strokeStyle = '#7fb2ff'; ctx.lineWidth = 0.6 * px; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 0.7, 0, Math.PI * 2); ctx.stroke(); }
    if (e.armor > 0) { ctx.strokeStyle = '#cccccc'; ctx.lineWidth = px; poly(ctx, e.x, e.y, e.r + 0.5, 6, 0); ctx.stroke(); }
    if (e.netT > 0) { ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 0.6 * px; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(e.x - e.r, e.y + i * e.r * 0.6); ctx.lineTo(e.x + e.r, e.y + i * e.r * 0.6); ctx.stroke(); } }
    if (e.burnT > 0) { ctx.fillStyle = 'rgba(255,106,42,0.35)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.8, 0, Math.PI * 2); ctx.fill(); }
    if ((e.boss || e.elite || e.fleet || e.type === 'tank' || e.type === 'protector') && e.hp < e.maxHp) {
      const bw = e.r * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - bw / 2, e.y - e.r - 2, bw, 0.8);
      ctx.fillStyle = T.color; ctx.fillRect(e.x - bw / 2, e.y - e.r - 2, bw * Math.max(0, e.hp / e.maxHp), 0.8);
    }
    if (e.draining) { ctx.strokeStyle = '#ff2a2a66'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(0, 0); ctx.stroke(); }
  }
  for (const b of R.ebullets) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.oc ? 1 : 0.6, 0, Math.PI * 2); ctx.fill(); }

  // střely věže
  ctx.fillStyle = R.card.demonT > 0 ? '#ff3d3d' : superActive(R) ? '#ffe45e' : '#e9ecff';
  for (const b of R.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 0.55, 0, Math.PI * 2); ctx.fill(); }
  for (const m of R.missiles) {
    const a = Math.atan2(m.vy, m.vx);
    ctx.fillStyle = '#ffb347';
    glow(ctx, '#ffb347', 8);
    poly(ctx, m.x, m.y, 1.2, 3, a); ctx.fill(); noGlow(ctx);
  }
  // orby
  const or = orbRadius(S);
  if (S.orbs > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = px;
    ctx.beginPath(); ctx.arc(0, 0, or, 0, Math.PI * 2); ctx.stroke();
    glow(ctx, '#fff', 12); ctx.fillStyle = '#fff';
    for (let k = 0; k < S.orbs; k++) {
      const a = R.orbA + k * Math.PI * 2 / S.orbs;
      ctx.beginPath(); ctx.arc(Math.cos(a) * or, Math.sin(a) * or, 1.1 * S.orbSize, 0, Math.PI * 2); ctx.fill();
    }
    noGlow(ctx);
  }
  if (S.extraOrb) {
    glow(ctx, '#7df9ff', 10); ctx.fillStyle = '#bff8ff';
    for (let k = 0; k < S.extraOrbs; k++) {
      const a = R.extraOrbA + k * Math.PI * 2 / S.extraOrbs;
      ctx.beginPath(); ctx.arc(Math.cos(a) * or * 0.65, Math.sin(a) * or * 0.65, 1 * S.orbSize, 0, Math.PI * 2); ctx.fill();
    }
    noGlow(ctx);
  }
  if (S.uniq.orbital) {
    ctx.fillStyle = '#ffe45e';
    for (let k = 0; k < S.uniq.orbital; k++) { const a = (R.electronA || 0) + k * Math.PI * 2 / S.uniq.orbital; ctx.beginPath(); ctx.arc(Math.cos(a) * 11, Math.sin(a) * 11, 0.5, 0, Math.PI * 2); ctx.fill(); }
  }

  // věž
  const inv = R.card.invT > 0 || R.card.demonT > 0;
  const tc = R.card.demonT > 0 ? '#ff3d3d' : R.golden > 0 ? '#ffd700' : R.hitFlash > 0 ? '#ff4d6d' : superActive(R) ? '#ffe45e' : skin.color;
  glow(ctx, tc, 18);
  ctx.strokeStyle = tc;
  ctx.lineWidth = 2.5 * px;
  poly(ctx, 0, 0, TOWER_R, skin.shape, Math.PI / 6); ctx.stroke();
  ctx.lineWidth = 1.2 * px;
  poly(ctx, 0, 0, TOWER_R * 0.55, skin.shape || 6, Math.PI / 6 + R.time * 0.5); ctx.stroke();
  noGlow(ctx);
  if (inv) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = px; ctx.beginPath(); ctx.arc(0, 0, TOWER_R + 2.2, 0, Math.PI * 2); ctx.stroke(); }
  if (R.card.es > 0) { ctx.strokeStyle = '#4d8dff'; ctx.lineWidth = 0.8 * px; poly(ctx, 0, 0, TOWER_R + 3, 6, 0); ctx.stroke(); }
  // HP prstenec věže
  ctx.strokeStyle = 'rgba(77,255,154,0.8)';
  ctx.lineWidth = 1.2 * px;
  ctx.beginPath(); ctx.arc(0, 0, TOWER_R + 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(R.hp / S.maxHp, 0, 1)); ctx.stroke();
  // guardian
  if (S.chips.length) {
    const ga = R.time * 0.6;
    glow(ctx, '#ff5555', 10); ctx.strokeStyle = '#ff7777'; ctx.lineWidth = 1.2 * px;
    poly(ctx, Math.cos(ga) * 5.5, Math.sin(ga) * 5.5, 1, 3, ga); ctx.stroke(); noGlow(ctx);
  }

  // efekty
  for (const f of R.fx) {
    const t = f.life / f.max;
    ctx.globalAlpha = Math.max(0, t);
    if (f.k === 'burst') {
      ctx.strokeStyle = f.color; ctx.lineWidth = px;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + (1 - t) * 1.5), 0, Math.PI * 2); ctx.stroke();
    } else if (f.k === 'boom' || f.k === 'ring') {
      ctx.fillStyle = f.color + (f.k === 'boom' ? '55' : '11'); ctx.strokeStyle = f.color; ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - t * 0.4), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (f.k === 'bolt') {
      ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 1.5 * px; glow(ctx, '#7df9ff', 12);
      ctx.beginPath();
      f.pts.forEach((p, i) => i ? ctx.lineTo(p[0] + rand(-0.6, 0.6), p[1] + rand(-0.6, 0.6)) : ctx.moveTo(p[0], p[1]));
      ctx.stroke(); noGlow(ctx);
    } else if (f.k === 'beam') {
      ctx.strokeStyle = f.color; ctx.lineWidth = (f.w || 1.5) * px; glow(ctx, f.color, 10);
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(0, 0); ctx.stroke(); noGlow(ctx);
    } else if (f.k === 'shield') {
      ctx.strokeStyle = '#4d8dff'; ctx.lineWidth = 2 * px;
      poly(ctx, 0, 0, TOWER_R + 3, 6, 0); ctx.stroke();
    } else if (f.k === 'txt') {
      ctx.fillStyle = f.color;
      ctx.font = `700 ${12 * px}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - (1 - t) * 3);
    }
    ctx.globalAlpha = 1;
  }

  // gem obíhající po bariéře
  if (R.gem && R.gem.x !== undefined) {
    const g = R.gem, k = 2.4 * (1 + Math.sin(performance.now() / 150) * 0.12);
    ctx.save();
    ctx.translate(g.x, g.y);
    glow(ctx, '#ff5ce1', 18);
    ctx.strokeStyle = '#ff5ce1';
    ctx.fillStyle = 'rgba(255,92,225,0.25)';
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    ctx.moveTo(-k, -0.3 * k); ctx.lineTo(-0.55 * k, -0.9 * k); ctx.lineTo(0.55 * k, -0.9 * k); ctx.lineTo(k, -0.3 * k); ctx.lineTo(0, k); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-k, -0.3 * k); ctx.lineTo(k, -0.3 * k);
    ctx.moveTo(-0.3 * k, -0.3 * k); ctx.lineTo(0, k); ctx.lineTo(0.3 * k, -0.3 * k);
    ctx.stroke();
    noGlow(ctx);
    ctx.restore();
  }

  // HUD zbraní (v pixelech)
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  let ix = 22;
  for (const u of UW_DEFS) {
    const st = S.uw[u.id];
    if (!st || st.cd === undefined) continue;
    const total = st.cd;
    const left = R.uwT[u.id] || 0;
    const active = (u.id === 'goldenTower' && R.golden > 0) || (u.id === 'chronoField' && R.chrono > 0);
    const y = h - 22;
    ctx.fillStyle = 'rgba(10,12,40,0.85)';
    ctx.beginPath(); ctx.arc(ix, y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = active || left <= 0 ? u.color : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ix, y, 14, 0, Math.PI * 2); ctx.stroke();
    if (left > 0) {
      ctx.strokeStyle = u.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ix, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left / total)); ctx.stroke();
    }
    ctx.fillStyle = u.color; ctx.font = '700 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.icon, ix, y + 1);
    ctx.textBaseline = 'alphabetic';
    ix += 32;
  }
  if (game.userPaused || R.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '900 22px Orbitron, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(R.paused ? 'VYBER PERK' : 'PAUZA', w / 2, h / 2 - 30);
  }
}
