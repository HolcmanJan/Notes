'use strict';
// ---------- vykreslení stolu (Canvas 2D) ----------
const view = { cv: null, ctx: null, w: 0, h: 0, dpr: 1, sc: 1, cx: 0, cy: 0, t: 0, felt: null };

function initRender() {
  view.cv = document.getElementById('cv');
  view.ctx = view.cv.getContext('2d');
  new ResizeObserver(resizeView).observe(view.cv);
  resizeView();
}
function resizeView() {
  const r = view.cv.getBoundingClientRect();
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = r.width; view.h = r.height;
  view.cv.width = Math.round(r.width * view.dpr);
  view.cv.height = Math.round(r.height * view.dpr);
  view.cx = r.width / 2; view.cy = r.height / 2 + 6;
  view.sc = Math.min(r.width, r.height) / (2 * VIEW_R);
  view.felt = null;
}

// Pozadí se kreslí jednou do offscreen canvasu (sukno, dřevěný okraj, ozdobný kruh)
function buildFelt() {
  const c = document.createElement('canvas');
  c.width = view.cv.width; c.height = view.cv.height;
  const g = c.getContext('2d');
  g.scale(view.dpr, view.dpr);
  const { w, h, cx, cy, sc } = view;
  const bg = g.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.75);
  bg.addColorStop(0, '#1a6b49'); bg.addColorStop(0.55, '#0f4a33'); bg.addColorStop(1, '#06231a');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // jemná textura sukna
  g.globalAlpha = 0.05;
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = i % 2 ? '#000' : '#fff';
    g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
  g.globalAlpha = 1;
  // zlatá linka stolu a nápis
  g.strokeStyle = 'rgba(227,180,72,.22)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, 30 * sc, 0, Math.PI * 2); g.stroke();
  g.setLineDash([2, 6]);
  g.beginPath(); g.arc(cx, cy, 45 * sc, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(227,180,72,.12)';
  g.font = `${Math.round(5 * sc)}px Limelight, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(cx, cy);
  const txt = 'JACKPOT ✦ TOWER ✦ ';
  const rr = 37.5 * sc;
  for (let i = 0; i < txt.length * 2; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / (txt.length * 2));
    g.save(); g.rotate(a); g.translate(0, -rr); g.fillText(txt[i % txt.length], 0, 0); g.restore();
  }
  g.restore();
  view.felt = c;
}

const X = x => view.cx + x * view.sc;
const Y = y => view.cy + y * view.sc;

function render(dt) {
  view.t += dt;
  const { ctx, dpr } = view;
  if (!ctx || !view.w) return;
  if (!view.felt) buildFelt();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(view.felt, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const R = game.run;
  if (R && R.shake > 0) ctx.translate(rand(-1, 1) * R.shake * 4, rand(-1, 1) * R.shake * 4);
  if (R) {
    drawRange(ctx, R);
    drawWheel(ctx, R);
    for (const b of R.ebullets) drawBall(ctx, X(b.x), Y(b.y), 0.9 * view.sc);
    for (const e of R.enemies) drawEnemy(ctx, e, R);
    drawMachine(ctx, R);
    for (const b of R.bullets) drawChip(ctx, X(b.x), Y(b.y), 1.15 * view.sc, b.col);
    drawFx(ctx, R);
    if (R.slowT > 0) { ctx.fillStyle = `rgba(150,220,255,${Math.min(0.12, R.slowT * 0.05)})`; ctx.fillRect(-10, -10, view.w + 20, view.h + 20); }
    if (R.flash > 0) { ctx.fillStyle = `rgba(255,214,102,${R.flash * 0.45})`; ctx.fillRect(-10, -10, view.w + 20, view.h + 20); }
  } else {
    drawWheel(ctx, null);
    drawMachine(ctx, null);
  }
}

function drawRange(ctx, R) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,224,138,.35)';
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -view.t * 8;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(view.cx, view.cy, R.S.range * view.sc, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Ruleta kolem automatu – točí se pořád, při rychlé palbě rychleji
function drawWheel(ctx, R) {
  const sc = view.sc * 1.3, cx = view.cx, cy = view.cy;
  const r1 = 9 * sc, r0 = 7 * sc;
  const rot = view.t * (R && R.rapidT > 0 ? 2.4 : 0.35);
  const n = WHEEL.length, da = Math.PI * 2 / n;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r1 + 1.2 * sc, 0, Math.PI * 2);
  ctx.fillStyle = '#3a1f12'; ctx.fill();
  ctx.strokeStyle = '#e3b448'; ctx.lineWidth = 1.5; ctx.stroke();
  for (let i = 0; i < n; i++) {
    const a = rot + i * da;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.arc(cx, cy, r1, a, a + da); ctx.arc(cx, cy, r0, a + da, a, true); ctx.closePath();
    const col = numColor(WHEEL[i]);
    ctx.fillStyle = col === 'green' ? '#0d8a4c' : col === 'red' ? '#b3202e' : '#151515';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(227,180,72,.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r0, 0, Math.PI * 2); ctx.stroke();
  // kulička obíhá proti směru
  const ba = -view.t * 1.3;
  drawBall(ctx, cx + Math.cos(ba) * (r1 + 0.1 * sc) * 0.9, cy + Math.sin(ba) * (r1 + 0.1 * sc) * 0.9, 0.55 * sc);
  ctx.restore();
}

function drawMachine(ctx, R) {
  const sc = view.sc * 1.3, cx = view.cx, cy = view.cy;
  const w = 10.5 * sc, h = 9 * sc;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  if (R && R.rapidT > 0) { ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 18 + Math.sin(view.t * 20) * 6; }
  // tělo
  const body = ctx.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, '#e23a48'); body.addColorStop(1, '#7e1520');
  roundRect(ctx, x, y, w, h, 1.6 * sc); ctx.fillStyle = body; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, 0.45 * sc); ctx.strokeStyle = '#e3b448'; ctx.stroke();
  // nápis
  ctx.fillStyle = '#ffe08a';
  ctx.font = `${Math.max(7, 1.5 * sc)}px Limelight, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('JACKPOT', cx, y + 1.35 * sc);
  // okénko s válci
  const ww = w - 1.6 * sc, wh = 4.4 * sc, wx = cx - ww / 2, wy = y + 2.5 * sc;
  roundRect(ctx, wx, wy, ww, wh, 0.6 * sc); ctx.fillStyle = '#1b0a06'; ctx.fill();
  const rw = (ww - 1.2 * sc) / 3;
  const sl = R ? R.slot : null;
  for (let i = 0; i < 3; i++) {
    const rx = wx + 0.3 * sc + i * (rw + 0.3 * sc), ry = wy + 0.3 * sc, rh = wh - 0.6 * sc;
    const g = ctx.createLinearGradient(0, ry, 0, ry + rh);
    g.addColorStop(0, '#cbbd9e'); g.addColorStop(0.3, '#fffaf0'); g.addColorStop(0.7, '#fffaf0'); g.addColorStop(1, '#cbbd9e');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    const stopAt = 1.3 - 0.35 * (i + 1);
    const spinning = sl && sl.spin > stopAt;
    const sym = spinning ? SYMS[Math.floor(view.t * 22 + i * 2) % SYMS.length].id : (sl ? sl.reels[i] : 'seven');
    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    const off = spinning ? ((view.t * 60) % 1 - 0.5) * rh * 0.6 : 0;
    drawSym(ctx, sym, rx + rw / 2, ry + rh / 2 + off, rh * 0.62);
    ctx.restore();
  }
  // výherní linka při výhře
  const hot = sl && sl.spin === 0 && sl.last && sl.last.sym && R.time - sl.last.at < 1.2;
  if (hot) {
    ctx.strokeStyle = `rgba(255,224,138,${0.5 + 0.5 * Math.sin(view.t * 25)})`; ctx.lineWidth = 2;
    roundRect(ctx, wx, wy, ww, wh, 0.6 * sc); ctx.stroke();
  }
  // světýlka dole
  for (let i = 0; i < 5; i++) {
    const on = Math.floor(view.t * 4 + i) % 2 === 0;
    ctx.fillStyle = on ? '#ffe08a' : '#7a5a1c';
    ctx.beginPath(); ctx.arc(x + (i + 1) * w / 6, y + h - 1.1 * sc, 0.38 * sc, 0, Math.PI * 2); ctx.fill();
  }
  // páka
  const pull = sl && sl.spin > 1.0 ? 1 : 0;
  ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = Math.max(1.5, 0.45 * sc);
  ctx.beginPath(); ctx.moveTo(x + w, cy); ctx.lineTo(x + w + 1.3 * sc, cy); ctx.lineTo(x + w + 1.3 * sc, cy + (pull ? 1.5 : -3.2) * sc); ctx.stroke();
  ctx.fillStyle = '#e23a48';
  ctx.beginPath(); ctx.arc(x + w + 1.3 * sc, cy + (pull ? 1.5 : -3.2) * sc, 0.75 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSym(ctx, id, x, y, size) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (id === 'seven') {
    ctx.font = `900 ${size * 1.15}px Outfit, sans-serif`;
    ctx.fillStyle = '#c11d2b'; ctx.fillText('7', x, y + size * 0.05);
  } else if (id === 'bar') {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - size * 0.55, y - size * 0.24, size * 1.1, size * 0.48);
    ctx.font = `800 ${size * 0.36}px Outfit, sans-serif`;
    ctx.fillStyle = '#fffaf0'; ctx.fillText('BAR', x, y + size * 0.02);
  } else {
    ctx.font = `${size * 0.85}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(SYM_MAP[id].ch, x, y + size * 0.04);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawChip(ctx, x, y, r, col) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.35); ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.setLineDash([r * 0.5, r * 0.5]); ctx.stroke(); ctx.setLineDash([]);
}
function drawBall(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#c9ced6'); g.addColorStop(1, '#6b7280');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
function drawDie(ctx, s, face, body, pip) {
  roundRect(ctx, -s, -s, 2 * s, 2 * s, s * 0.32);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  ctx.fillStyle = pip;
  for (const [px, py] of PIPS[face]) { ctx.beginPath(); ctx.arc(px * s * 0.5, py * s * 0.5, s * 0.17, 0, Math.PI * 2); ctx.fill(); }
}
function drawCard(ctx, s, label, color, back) {
  const w = s * 1.25, h = s * 1.75;
  roundRect(ctx, -w / 2 * 1.2, -h / 2 * 1.2, w * 1.2, h * 1.2, s * 0.18);
  ctx.fillStyle = back || '#fffaf0'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${s * 1.1}px Outfit, "Segoe UI Symbol", sans-serif`;
  ctx.fillText(label, 0, s * 0.05);
}
const CHIP_COLS = ['#2f6fd6', '#2a9a5a', '#b3202e', '#222', '#8a3fd1'];

function drawEnemy(ctx, e, R) {
  const s = e.r * view.sc;
  const x = X(e.x), y = Y(e.y);
  ctx.save();
  ctx.translate(x, y);
  // stín
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(s * 0.15, s * 0.35, s * 1.05, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  const hit = e.hitT > 0;
  switch (e.type) {
    case 'dice':
      ctx.rotate(e.rot);
      drawDie(ctx, s * 0.78, e.face, hit ? '#ffd3d3' : '#fbf6ea', '#1a1a1a');
      break;
    case 'card': {
      ctx.rotate(e.rot * 0.4);
      const red = e.suit === '♥' || e.suit === '♦';
      drawCard(ctx, s * 0.75, e.suit, red ? '#c11d2b' : '#1a1a1a', hit ? '#ffd3d3' : null);
      break;
    }
    case 'chips': {
      const col = CHIP_COLS[e.id % CHIP_COLS.length];
      for (let i = 2; i >= 0; i--) drawChip(ctx, 0, -i * s * 0.22, s * 0.85, hit ? '#ff9aa4' : col);
      break;
    }
    case 'ball':
      drawBall(ctx, 0, 0, s * 0.8);
      ctx.strokeStyle = 'rgba(179,32,46,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, s * 1.05, view.t * 4, view.t * 4 + 2); ctx.stroke();
      break;
    case 'joker':
      ctx.rotate(Math.sin(view.t * 3 + e.id) * 0.25);
      drawCard(ctx, s * 0.75, '🃏', '#5b2a86', hit ? '#ffd3d3' : '#f1e3ff');
      break;
    case 'thief': {
      ctx.fillStyle = hit ? '#5a2030' : '#24122e';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(-s * 0.8, -s * 0.35, s * 1.6, s * 0.38);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-s * 0.32, -s * 0.16, s * 0.1, 0, Math.PI * 2); ctx.arc(s * 0.32, -s * 0.16, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.font = `800 ${s * 0.6}px Outfit`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, s * 0.4);
      if (e.stolen > 0) { ctx.fillStyle = '#ffd166'; ctx.font = `700 ${Math.max(9, s * 0.45)}px Outfit`; ctx.fillText('$' + fmt(e.stolen), 0, -s * 1.3); }
      break;
    }
    case 'boss': {
      // krupiér: tvář, motýlek, cylindr
      ctx.fillStyle = hit ? '#ffc2b0' : '#f1d3b3';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(-s * 0.95, -s * 0.78, s * 1.9, s * 0.16);
      roundRect(ctx, -s * 0.55, -s * 1.5, s * 1.1, s * 0.8, s * 0.08); ctx.fill();
      ctx.fillStyle = '#b3202e'; ctx.fillRect(-s * 0.55, -s * 0.9, s * 1.1, s * 0.13);
      ctx.beginPath(); ctx.moveTo(0, s * 0.82); ctx.lineTo(-s * 0.42, s * 0.62); ctx.lineTo(-s * 0.42, s * 1.02); ctx.closePath();
      ctx.moveTo(0, s * 0.82); ctx.lineTo(s * 0.42, s * 0.62); ctx.lineTo(s * 0.42, s * 1.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-s * 0.26, -s * 0.08, s * 0.08, 0, Math.PI * 2); ctx.arc(s * 0.26, -s * 0.08, s * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.3); ctx.quadraticCurveTo(0, s * 0.18, s * 0.3, s * 0.3); ctx.stroke();
      break;
    }
  }
  ctx.restore();
  if (e.boss || e.elite || e.hp < e.maxHp) {
    const bw = Math.max(16, s * 2), bh = 3, by = y + s * (e.boss ? 1.25 : 1.1);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - bw / 2, by, bw, bh);
    ctx.fillStyle = e.boss ? '#ffd166' : e.elite ? '#c8a2ff' : '#ff5d6c';
    ctx.fillRect(x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), bh);
  }
}

function drawFx(ctx, R) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of R.fx) {
    const k = f.life / f.max;
    if (f.k === 'txt') {
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `800 ${f.text.length > 18 ? 13 : 15}px Outfit, sans-serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(f.text, X(f.x), Y(f.y)); ctx.fillStyle = f.color; ctx.fillText(f.text, X(f.x), Y(f.y));
    } else if (f.k === 'burst') {
      ctx.globalAlpha = k;
      ctx.fillStyle = f.color;
      for (let i = 0; i < f.n; i++) {
        const a = i * 2.39996 + f.x, d = (1 - k) * (3 + (i % 3)) * view.sc;
        ctx.fillRect(X(f.x) + Math.cos(a) * d - 1.5, Y(f.y) + Math.sin(a) * d - 1.5, 3, 3);
      }
    } else if (f.k === 'coins') {
      ctx.globalAlpha = Math.min(1, k * 2);
      for (let i = 0; i < f.n; i++) {
        const a = i * 2.39996, sp = 10 + (i * 7) % 18;
        const t = 1 - k, d = sp * t * view.sc * 1.6;
        const cx = X(0) + Math.cos(a) * d, cy = Y(0) + Math.sin(a) * d + t * t * 30;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.ellipse(cx, cy, 4, 4 * Math.abs(Math.cos(view.t * 10 + i)), 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#9c7424'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  ctx.restore();
}
