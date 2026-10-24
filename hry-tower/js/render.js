'use strict';
// ---------- vykreslování bojiště: PixiJS (WebGL) s efekty ----------
// bloom záře, částice, otřes obrazovky, rázové vlny, animovaná čísla, záblesky zásahů
const PX = { app: null, ok: false, last: performance.now(), frame: 0, shake: 0, parts: [], texts: [], shockwaves: [], banner: null, lastWave: 0, hitPrev: false, prevAtk: 0, towerPulse: 0, hudIcons: {}, born: new WeakMap(), prevPos: new WeakMap(), hurtA: 0, bloomKick: 0, meteors: [] };
const MAX_PARTS = 1400;
const hex = c => typeof c === 'number' ? c : parseInt(String(c).slice(1, 7), 16);

function initCanvas(cv) {
  game.cv = cv;
  const wrap = cv.parentElement;
  try {
    if (!window.PIXI) throw new Error('PixiJS se nenačetl');
    PX.app = new PIXI.Application({ view: cv, width: wrap.clientWidth || 300, height: wrap.clientHeight || 300, antialias: true, backgroundColor: 0x0d0f2b, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: false, autoStart: false });
    PX.ok = true;
  } catch (e) {
    console.warn('WebGL není k dispozici, použije se Canvas 2D:', e);
    PX.ok = false;
    initCanvas2d(cv);
    return;
  }
  buildScene();
  const resize = () => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    PX.app.renderer.resize(w, h);
    cv.style.width = '100%'; cv.style.height = '100%';
    game.cw = w; game.ch = h;
    fitScale(true);
    layoutScreen();
  };
  new ResizeObserver(resize).observe(wrap);
  resize();
  cv.addEventListener('pointerdown', ev => {
    const r = cv.getBoundingClientRect();
    tryCollectGem(ev.clientX - r.left, ev.clientY - r.top);
  });
}

// ---------- textury ----------
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return PIXI.Texture.from(c);
}
function shapeTex(draw) {
  const g = new PIXI.Graphics();
  g.beginFill(0x000000, 0.001).drawCircle(0, 0, 44).endFill(); // symetrické hranice → anchor 0.5 je střed
  draw(g);
  const t = PX.app.renderer.generateTexture(g, { resolution: 2 });
  g.destroy();
  return t;
}
function polyPts(n, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
  return pts;
}
function buildTextures() {
  const T = PX.tex = {};
  T.dot = canvasTex(64, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  T.bolt = canvasTex(64, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  T.ring = canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.9)'); g.addColorStop(0.85, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  T.shard = shapeTex(g => g.beginFill(0xffffff).drawPolygon([0, -14, 9, 10, -9, 10]).endFill());
  T.diamond = shapeTex(g => g.beginFill(0xffffff, 0.35).lineStyle(5, 0xffffff).drawPolygon([0, -20, 14, 0, 0, 20, -14, 0]).endFill());
  T.vignette = canvasTex(256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,8,0.75)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  T.nebula = canvasTex(256, (c, s) => {
    c.fillStyle = '#0d0f2b'; c.fillRect(0, 0, s, s);
    for (const [x, y, r, col] of [[0.25, 0.3, 0.5, 'rgba(90,40,160,0.35)'], [0.8, 0.75, 0.55, 'rgba(30,70,170,0.35)'], [0.65, 0.15, 0.35, 'rgba(160,40,140,0.18)']]) {
      const g = c.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
  });
  T.hole = canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(10,0,25,0.95)'); g.addColorStop(0.8, 'rgba(120,50,220,0.5)'); g.addColorStop(1, 'rgba(180,92,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  // nepřátelé: bílý obrys (barví se tintem), varianty s výplní pro bosse/elity
  T.enemy = {};
  for (const [type, D] of Object.entries(ENEMY_TYPES)) {
    const filled = D.boss || D.elite || D.fleet;
    T.enemy[type] = shapeTex(g => {
      g.lineStyle(7, 0xffffff, 1);
      g.beginFill(0xffffff, filled ? 0.22 : 0.07);
      if (D.sides === 0) g.drawCircle(0, 0, 32); else g.drawPolygon(polyPts(D.sides, 32, D.sides === 4 ? Math.PI / 4 : -Math.PI / 2));
      g.endFill();
      if (type === 'tank') { g.lineStyle(5, 0xffffff, 0.9); g.drawPolygon(polyPts(4, 17, Math.PI / 4)); }
      if (type === 'ranged') { g.lineStyle(5, 0xffffff, 0.9); g.drawCircle(0, 0, 11); }
      if (type === 'protector') { g.lineStyle(4, 0xffffff, 0.9); g.drawCircle(0, 0, 14); }
      if (D.fleet) { g.lineStyle(4, 0xffffff, 0.8); g.drawPolygon(polyPts(3, 14, -Math.PI / 2)); }
      if (D.boss) { g.lineStyle(4, 0xffffff, 0.8); g.drawPolygon(polyPts(6, 18, 0)); }
    });
  }
}

// ---------- scéna ----------
function makePool(layer, tex, add) {
  return {
    items: [], n: 0, layer, tex, add,
    begin() { this.n = 0; },
    get(tex) {
      let s = this.items[this.n];
      if (!s) { s = new PIXI.Sprite(tex || this.tex); s.anchor.set(0.5); if (this.add) s.blendMode = PIXI.BLEND_MODES.ADD; this.layer.addChild(s); this.items.push(s); }
      if (tex && s.texture !== tex) s.texture = tex;
      s.visible = true; this.n++;
      return s;
    },
    end() { for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false; },
  };
}

function buildScene() {
  const app = PX.app, st = app.stage;
  buildTextures();
  const C = () => new PIXI.Container();
  PX.bg = C(); PX.world = C(); PX.textLayer = C(); PX.hud = C();
  st.addChild(PX.bg, PX.world, PX.textLayer, PX.hud);
  PX.nebula = new PIXI.Sprite(PX.tex.nebula); PX.bg.addChild(PX.nebula);
  PX.starLayer = C(); PX.bg.addChild(PX.starLayer);
  PX.stars = Array.from({ length: 170 }, () => {
    const s = new PIXI.Sprite(PX.tex.dot); s.anchor.set(0.5); s.blendMode = PIXI.BLEND_MODES.ADD;
    s.fx = Math.random(); s.fy = Math.random(); s.base = Math.random() * 0.5 + 0.15; s.tw = Math.random() * 6.28; s.sz = Math.random() * 3 + 1.5;
    PX.starLayer.addChild(s); return s;
  });
  const W = PX.world;
  PX.fieldG = new PIXI.Graphics(); W.addChild(PX.fieldG);
  PX.zoneLayer = C(); W.addChild(PX.zoneLayer);
  PX.mineLayer = C(); W.addChild(PX.mineLayer);
  PX.haloLayer = C(); W.addChild(PX.haloLayer);
  PX.enemyLayer = C(); W.addChild(PX.enemyLayer);
  PX.enemyG = new PIXI.Graphics(); W.addChild(PX.enemyG);
  PX.trailLayer = C(); W.addChild(PX.trailLayer);
  PX.bulletLayer = C(); W.addChild(PX.bulletLayer);
  PX.partLayer = C(); W.addChild(PX.partLayer);
  PX.towerGlow = new PIXI.Sprite(PX.tex.dot); PX.towerGlow.anchor.set(0.5); PX.towerGlow.blendMode = PIXI.BLEND_MODES.ADD; W.addChild(PX.towerGlow);
  PX.topG = new PIXI.Graphics(); W.addChild(PX.topG);
  PX.pools = {
    zone: makePool(PX.zoneLayer, PX.tex.hole, false),
    zoneAdd: makePool(PX.zoneLayer, PX.tex.dot, true),
    mine: makePool(PX.mineLayer, PX.tex.dot, true),
    halo: makePool(PX.haloLayer, PX.tex.dot, true),
    enemy: makePool(PX.enemyLayer, PX.tex.dot, false),
    trail: makePool(PX.trailLayer, PX.tex.bolt, true),
    bullet: makePool(PX.bulletLayer, PX.tex.bolt, true),
    part: makePool(PX.partLayer, PX.tex.dot, true),
    shard: makePool(PX.partLayer, PX.tex.shard, false),
    ring: makePool(PX.partLayer, PX.tex.ring, true),
    meteor: makePool(PX.starLayer, PX.tex.bolt, true),
  };
  PX.vignette = new PIXI.Sprite(PX.tex.vignette); PX.hud.addChild(PX.vignette);
  PX.hurt = new PIXI.Sprite(PX.tex.vignette); PX.hurt.tint = 0xff2040; PX.hurt.alpha = 0; PX.hud.addChild(PX.hurt);
  PX.hudG = new PIXI.Graphics(); PX.hud.addChild(PX.hudG);
  PX.bannerText = new PIXI.Text('', new PIXI.TextStyle({ fontFamily: 'Exo 2, sans-serif', fontSize: 30, fontWeight: '900', fill: '#ffffff', stroke: '#000000', strokeThickness: 4, letterSpacing: 3 }));
  PX.bannerText.anchor.set(0.5); PX.bannerText.resolution = 2; PX.hud.addChild(PX.bannerText);
  PX.pauseText = new PIXI.Text('', new PIXI.TextStyle({ fontFamily: 'Exo 2, sans-serif', fontSize: 26, fontWeight: '900', fill: '#ffffff', letterSpacing: 2 }));
  PX.pauseText.anchor.set(0.5); PX.pauseText.resolution = 2; PX.hud.addChild(PX.pauseText);
  PX.textStyle = new PIXI.TextStyle({ fontFamily: 'Exo 2, sans-serif', fontSize: 15, fontWeight: '800', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 });
  PX.textFree = [];
  // bloom záře na celém bojišti
  PX.bloom = null;
  if (PIXI.filters && PIXI.filters.AdvancedBloomFilter) {
    PX.bloom = new PIXI.filters.AdvancedBloomFilter({ threshold: 0.18, bloomScale: 1.15, brightness: 1, blur: 5, quality: 4 });
  }
  applyFilters();
}

function applyFilters() {
  const f = [];
  if (PX.bloom && save.glow) f.push(PX.bloom);
  for (const s of PX.shockwaves) f.push(s.f);
  PX.world.filters = f.length ? f : null;
  PX.world.filterArea = f.length ? PX.app.screen : null;
}

function layoutScreen() {
  const w = game.cw, h = game.ch;
  PX.nebula.width = w; PX.nebula.height = h;
  PX.vignette.width = w; PX.vignette.height = h;
  PX.hurt.width = w; PX.hurt.height = h;
  PX.bannerText.position.set(w / 2, h * 0.2);
  PX.pauseText.position.set(w / 2, h / 2 - 30);
}

// ---------- částice ----------
function emit(x, y, o) {
  let n = o.n || 8;
  // při plném zásobníku (vysoká rychlost hry) se počet částic ředí, ať efekty nezahltí snímek
  if (PX.parts.length > MAX_PARTS * 0.5) n = Math.ceil(n / (PX.parts.length > MAX_PARTS * 0.8 ? 4 : 2));
  for (let i = 0; i < n; i++) {
    if (PX.parts.length >= MAX_PARTS) return;
    const a = o.angle !== undefined ? o.angle + rand(-(o.spread || Math.PI), o.spread || Math.PI) : rand(0, Math.PI * 2);
    const sp = rand(o.speed[0], o.speed[1]);
    const life = rand(o.life[0], o.life[1]);
    PX.parts.push({
      x: x + (o.jitter ? rand(-o.jitter, o.jitter) : 0), y: y + (o.jitter ? rand(-o.jitter, o.jitter) : 0),
      vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), life, max: life,
      size: rand(o.size[0], o.size[1]), color: hex(o.color), drag: o.drag || 2, shard: !!o.shard, ring: !!o.ring, rot: rand(0, 6.28), vr: rand(-8, 8),
      streak: o.streak || 0, grow: o.grow || 0, gravity: o.gravity || 0, alpha: o.alpha || 1, pull: o.pull,
    });
  }
}
function updateParts(dt) {
  const P = PX.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    if (p.pull) { const dx = p.pull.x - p.x, dy = p.pull.y - p.y; p.vx += dx * 4 * dt; p.vy += dy * 4 * dt; }
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy *= k; p.vy += p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
}
function drawParts() {
  const pp = PX.pools.part, ps = PX.pools.shard, pr = PX.pools.ring;
  for (const p of PX.parts) {
    const t = p.life / p.max;
    const s = p.ring ? pr.get() : p.shard ? ps.get() : pp.get();
    s.position.set(p.x, p.y);
    s.tint = p.color;
    s.alpha = p.alpha * Math.min(1, t * 1.6);
    const sz = p.size * (1 + p.grow * (1 - t));
    if (p.ring) { s.rotation = 0; s.scale.set(sz / 64); s.alpha = p.alpha * t; }
    else if (p.shard) { s.rotation = p.rot; s.scale.set(sz / 28); }
    else if (p.streak) {
      const v = Math.hypot(p.vx, p.vy);
      s.rotation = Math.atan2(p.vy, p.vx);
      s.scale.set((sz + v * p.streak) / 64, sz / 64);
    } else { s.rotation = 0; s.scale.set(sz / 64); }
  }
}

function shake(a) { PX.shake = Math.min(14, PX.shake + a); }
function addShockwave(x, y, amp = 22) {
  if (!PIXI.filters || !PIXI.filters.ShockwaveFilter || PX.shockwaves.length >= 3) return;
  const sx = game.cw / 2 + x * game.scale, sy = game.ch / 2 + y * game.scale;
  const f = new PIXI.filters.ShockwaveFilter([sx, sy], { amplitude: amp, wavelength: 110, speed: 520, brightness: 1.15, radius: Math.max(game.cw, game.ch) }, 0);
  PX.shockwaves.push({ f, t: 0 });
  applyFilters();
}

// zpracování herních událostí (R.fx) → částice, otřesy
function onFx(R, f) {
  switch (f.k) {
    case 'burst': {
      const big = f.big;
      emit(f.x, f.y, { n: big ? 40 : 9, color: f.color, speed: big ? [8, 34] : [6, 20], size: big ? [0.8, 1.8] : [0.5, 1.1], life: [0.35, big ? 1.1 : 0.6], shard: true, drag: 2.5 });
      emit(f.x, f.y, { n: big ? 30 : 6, color: f.color, speed: [4, big ? 28 : 14], size: [1.4, big ? 4.5 : 2.4], life: [0.2, 0.5], drag: 3 });
      emit(f.x, f.y, { n: 1, color: f.color, speed: [0, 0], size: [f.r * 1.6, f.r * 1.6], life: [0.3, 0.3], grow: big ? 5 : 2.2, ring: true, alpha: 0.9 });
      if (f.gold) emit(f.x, f.y, { n: 6, color: 0xffd700, speed: [3, 9], size: [1, 1.8], life: [0.6, 1], gravity: -6, drag: 1.5 });
      if (big) { shake(9); addShockwave(f.x, f.y, 26); PX.bloomKick = 1; emit(f.x, f.y, { n: 1, color: 0xffffff, speed: [0, 0], size: [18, 18], life: [0.25, 0.25], grow: 1.5 }); }
      break;
    }
    case 'boom':
      emit(f.x, f.y, { n: Math.min(26, 8 + f.r * 2), color: f.color, speed: [f.r * 2, f.r * 6], size: [1, 2.6], life: [0.2, 0.55], drag: 4 });
      emit(f.x, f.y, { n: 1, color: 0xffffff, speed: [0, 0], size: [f.r * 2.2, f.r * 2.2], life: [0.18, 0.18], grow: 0.6, alpha: 0.8 });
      emit(f.x, f.y, { n: 1, color: f.color, speed: [0, 0], size: [f.r * 1.4, f.r * 1.4], life: [0.28, 0.28], grow: 1.6, ring: true, alpha: 0.8 });
      shake(f.r > 5 ? 2.5 : 1);
      break;
    case 'hit':
      emit(f.x, f.y, { n: f.crit ? 5 : 2, color: f.crit === 2 ? 0xff5ce1 : f.crit ? 0xffd23d : 0xffffff, speed: [10, f.crit ? 30 : 18], size: [0.5, 0.9], life: [0.08, 0.22], streak: 0.06, drag: 6 });
      break;
    case 'bolt':
      for (const p of f.pts) emit(p[0], p[1], { n: 3, color: 0x7df9ff, speed: [6, 16], size: [0.5, 1], life: [0.1, 0.3], streak: 0.05 });
      break;
    case 'beam':
      emit(f.x, f.y, { n: 4, color: f.color, speed: [3, 10], size: [0.8, 1.4], life: [0.15, 0.35] });
      break;
    case 'shield':
      emit(0, 0, { n: 24, color: 0x4d8dff, speed: [14, 22], size: [0.6, 1.2], life: [0.2, 0.4], streak: 0.04 });
      shake(2);
      break;
  }
}

// ---------- hlavní vykreslení ----------
function render() {
  if (!PX.ok) { render2d(); return; }
  if (!game.cw) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - PX.last) / 1000);
  PX.last = now;
  PX.frame++;
  const R = game.run;
  const w = game.cw, h = game.ch, s = fitScale();
  const bg = curBg();
  PX.app.renderer.background.color = hex(bg.bg);
  PX.nebula.tint = 0xffffff;

  // hvězdy (třpyt + pomalý posun)
  const tm = now / 1000;
  for (const st of PX.stars) {
    st.x = ((st.fx * w + tm * 2 * st.sz) % (w + 10));
    st.y = st.fy * h;
    st.alpha = st.base * (0.6 + 0.4 * Math.sin(tm * 1.7 + st.tw));
    st.scale.set(st.sz / 64);
  }
  PX.nebula.alpha = 0.85 + 0.15 * Math.sin(tm * 0.25);
  // padající hvězdy
  if (Math.random() < dt * 0.25 && PX.meteors.length < 3) { const a = rand(0.35, 0.7); PX.meteors.push({ x: rand(-0.1, 0.9) * w, y: rand(-0.1, 0.4) * h, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.7, max: 0.7 }); }
  const G = PX.fieldG, EG = PX.enemyG, TG = PX.topG, HG = PX.hudG;
  G.clear(); EG.clear(); TG.clear(); HG.clear();
  for (const k in PX.pools) PX.pools[k].begin();
  PX.meteors = PX.meteors.filter(m => (m.life -= dt) > 0);
  for (const m of PX.meteors) {
    m.x += m.vx * dt; m.y += m.vy * dt;
    const sp = PX.pools.meteor.get(); sp.position.set(m.x, m.y); sp.rotation = Math.atan2(m.vy, m.vx);
    sp.tint = 0xcfe0ff; sp.alpha = Math.sin(Math.PI * m.life / m.max) * 0.8; sp.scale.set(90 / 64, 2.2 / 64);
  }

  if (!R) {
    for (const k in PX.pools) PX.pools[k].end();
    PX.parts.length = 0;
    game.fxQ.length = 0;
    for (const t of PX.texts) { t.t.visible = false; PX.textFree.push(t.t); }
    PX.texts = [];
    PX.bannerText.text = ''; PX.pauseText.text = '';
    PX.app.render();
    return;
  }
  const S = R.S;
  const px = 1 / s;
  // otřes obrazovky
  PX.shake = Math.max(0, PX.shake - dt * 28);
  const shx = PX.shake ? rand(-PX.shake, PX.shake) : 0, shy = PX.shake ? rand(-PX.shake, PX.shake) : 0;
  PX.world.position.set(w / 2 + shx, h / 2 + shy);
  PX.world.scale.set(s);

  // nové události
  for (const f of R.fx) if (!f._r) { f._r = true; onFx(R, f); }
  if (game.fxQ.length) { for (const f of game.fxQ) onFx(R, f); game.fxQ.length = 0; }
  if (R.hitFlash > 0 && !PX.hitPrev) { shake(3); PX.hurtA = 0.85; emit(0, 0, { n: 12, color: 0xff4d6d, speed: [10, 24], size: [0.6, 1.2], life: [0.15, 0.35], streak: 0.05 }); }
  PX.hitPrev = R.hitFlash > 0;
  if (R.atkT < PX.prevAtk - 0.5) {
    PX.towerPulse = 1;
    emit(0, 0, { n: 3, color: curSkin().color, speed: [14, 26], size: [0.4, 0.8], life: [0.08, 0.18], streak: 0.04, drag: 5 });
  }
  PX.prevAtk = R.atkT;
  PX.towerPulse = Math.max(0, PX.towerPulse - dt * 8);
  for (const g of R.rings) if (!g._r && g.delay <= 0) {
    g._r = true;
    if (g.k === 'nuke') { shake(12); addShockwave(0, 0, 40); PX.bloomKick = 1.6; }
    if (g.k === 'death') { shake(2); addShockwave(0, 0, 12); }
    if (g.k === 'shock' && g.max >= 60) addShockwave(0, 0, 30);
  }
  // nová vlna – banner
  if (R.wave !== PX.lastWave) {
    if (PX.lastWave) PX.banner = { text: (isBossWave(R, R.wave) ? 'BOSS · ' : '') + 'VLNA ' + R.wave, t: 1.6, boss: isBossWave(R, R.wave) };
    PX.lastWave = R.wave;
  }

  // ---- zóny: chrono, reflektor, dosah, bažiny, díry ----
  if (R.chrono > 0 && S.uw.chronoField) {
    const cr = S.range * (S.uw.chronoField.radius || 1);
    G.beginFill(0x4dd2ff, 0.07).drawCircle(0, 0, cr).endFill();
    G.lineStyle(1.2 * px, 0x4dd2ff, 0.6);
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12 + tm * 0.4; G.moveTo(Math.cos(a) * (cr - 1.5), Math.sin(a) * (cr - 1.5)); G.lineTo(Math.cos(a) * cr, Math.sin(a) * cr); }
    G.lineStyle(0);
  }
  if (S.uw.spotlight) {
    const sp = S.uw.spotlight, half = sp.angle * Math.PI / 360;
    for (let i = 0; i < sp.qty; i++) {
      const a = R.spotA + i * Math.PI * 2 / sp.qty;
      G.beginFill(0xfff5a5, 0.09).moveTo(0, 0).arc(0, 0, S.range, a - half, a + half).lineTo(0, 0).endFill();
      G.lineStyle(1 * px, 0xfff5a5, 0.35).moveTo(0, 0).lineTo(Math.cos(a - half) * S.range, Math.sin(a - half) * S.range).moveTo(0, 0).lineTo(Math.cos(a + half) * S.range, Math.sin(a + half) * S.range).lineStyle(0);
    }
  }
  // bariéra dosahu s jemně rotujícími čárkami
  G.lineStyle(1.3 * px, 0xc0c4e6, 0.45).drawCircle(0, 0, S.range);
  G.lineStyle(2 * px, 0xc0c4e6, 0.35);
  for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18 + tm * 0.08; G.moveTo(Math.cos(a) * S.range, Math.sin(a) * S.range); G.arc(0, 0, S.range, a, a + 0.04); }
  G.lineStyle(0);
  if (S.slowAura > 0) G.lineStyle(px, 0x78c8ff, 0.15).drawCircle(0, 0, S.range * 0.5).lineStyle(0);

  for (const sw of R.swamps) {
    const a = Math.min(1, sw.life);
    G.beginFill(0x8bff3d, 0.13 * a).drawCircle(sw.x, sw.y, sw.r).endFill();
    G.lineStyle(1.2 * px, 0x8bff3d, 0.5 * a).drawCircle(sw.x, sw.y, sw.r).lineStyle(0);
    if (Math.random() < dt * 14) { const aa = rand(0, 6.28), rr = rand(0, sw.r); emit(sw.x + Math.cos(aa) * rr, sw.y + Math.sin(aa) * rr, { n: 1, color: 0x8bff3d, speed: [0, 1], size: [0.8, 1.6], life: [0.5, 0.9], gravity: -3, grow: 0.8, alpha: 0.7 }); }
  }
  for (const hl of R.holes) {
    const z = PX.pools.zone.get(PX.tex.hole);
    z.position.set(hl.x, hl.y); z.scale.set(hl.r * 2.3 / 128); z.alpha = 1; z.rotation = tm;
    G.lineStyle(1.6 * px, 0xb45cff, 0.9).drawCircle(hl.x, hl.y, hl.r).lineStyle(0);
    if (Math.random() < dt * 40) { const aa = rand(0, 6.28); emit(hl.x + Math.cos(aa) * hl.r * 1.3, hl.y + Math.sin(aa) * hl.r * 1.3, { n: 1, color: 0xb45cff, speed: [2, 4], angle: aa + Math.PI / 2, spread: 0.2, size: [0.6, 1.1], life: [0.6, 0.9], drag: 0, pull: hl }); }
  }
  // boti
  for (const b of R.botsState) {
    const col = hex(BOT_MAP[b.id].color);
    if (b.active > 0) G.beginFill(col, 0.1 + 0.04 * Math.sin(tm * 6)).drawCircle(b.x, b.y, b.range).endFill();
    G.lineStyle(px, col, 0.3).drawCircle(b.x, b.y, b.range).lineStyle(0);
    TG.lineStyle(1.5 * px, col, 1).drawPolygon(polyPts(4, 1.5, Math.PI / 4 + tm).map((v, i) => v + (i % 2 ? b.y : b.x))).lineStyle(0);
    if (b.active > 0 && b.id === 'flame' && Math.random() < dt * 20) emit(b.x + rand(-b.range, b.range) * 0.6, b.y + rand(-b.range, b.range) * 0.6, { n: 1, color: 0xff6a2a, speed: [0, 2], size: [1, 2], life: [0.4, 0.7], gravity: -6 });
  }
  // miny
  for (const m of R.mines) {
    const sp = PX.pools.mine.get(); sp.position.set(m.x, m.y); sp.tint = 0xff9f43; sp.alpha = 0.9; sp.scale.set((1.6 + 0.3 * Math.sin(tm * 8 + m.x)) / 64 * 2);
  }
  for (const m of R.ilms) {
    const mx = Math.cos(m.a) * m.r, my = Math.sin(m.a) * m.r;
    const sp = PX.pools.mine.get(PX.tex.diamond); sp.position.set(mx, my); sp.tint = 0xffcf8a; sp.alpha = 1; sp.scale.set(1.8 / 44); sp.rotation = tm * 2;
  }
  // zeď
  if (R.wallState) {
    const wl = R.wallState;
    if (wl.hp > 0) {
      G.lineStyle(1.8 * px, wl.inv > 0 ? 0xffffff : 0x9fb4ff, 0.95);
      G.moveTo(0, -WALL_R).arc(0, 0, WALL_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (wl.hp / wl.max));
      G.lineStyle(4 * px, 0x9fb4ff, 0.12).drawCircle(0, 0, WALL_R).lineStyle(0);
    } else G.lineStyle(px, 0x9fb4ff, 0.2).drawCircle(0, 0, WALL_R).lineStyle(0);
  }
  // prstence (vlna smrti, rázová vlna, atomovka)
  for (const g of R.rings) {
    if (g.delay > 0) continue;
    const col = g.k === 'death' ? 0xff4d6d : g.k === 'nuke' ? 0xffd23d : 0x7df9ff;
    const a = g.k === 'shock' ? Math.max(0, 1 - g.r / g.max) : Math.max(0.2, 1 - g.r / g.max * 0.7);
    G.lineStyle((g.k === 'shock' ? 2 : 4) * px, col, a).drawCircle(0, 0, g.r);
    G.lineStyle((g.k === 'shock' ? 6 : 12) * px, col, a * 0.2).drawCircle(0, 0, g.r).lineStyle(0);
    if (g.k !== 'shock' && Math.random() < dt * 60) { const aa = rand(0, 6.28); emit(Math.cos(aa) * g.r, Math.sin(aa) * g.r, { n: 1, color: col, speed: [2, 6], angle: aa, spread: 0.3, size: [0.8, 1.4], life: [0.2, 0.4] }); }
  }
  // paprsek smrti
  if (R.card.drOn > 0) {
    for (const a of R.card.drDouble ? [R.card.drA, R.card.drA + Math.PI] : [R.card.drA]) {
      const ex = Math.cos(a) * SPAWN_R, ey = Math.sin(a) * SPAWN_R;
      G.lineStyle(7 * px, 0xff3dff, 0.25).moveTo(0, 0).lineTo(ex, ey);
      G.lineStyle(2.5 * px, 0xffb3ff, 1).moveTo(0, 0).lineTo(ex, ey).lineStyle(0);
      if (Math.random() < dt * 30) { const d = rand(5, SPAWN_R); emit(Math.cos(a) * d, Math.sin(a) * d, { n: 1, color: 0xff3dff, speed: [2, 6], size: [0.8, 1.4], life: [0.2, 0.4] }); }
    }
  }

  // ---- nepřátelé ----
  const ET = PX.tex.enemy;
  for (const e of R.enemies) {
    const D = ENEMY_TYPES[e.type];
    // náběh při objevení (pružné zvětšení + jiskry)
    let born = PX.born.get(e);
    if (born === undefined) {
      born = now; PX.born.set(e, now);
      emit(e.x, e.y, { n: D.boss ? 18 : 3, color: D.color, speed: [3, D.boss ? 16 : 8], size: [0.5, 1.1], life: [0.2, 0.45], drag: 3 });
      if (D.boss) { emit(e.x, e.y, { n: 1, color: D.color, speed: [0, 0], size: [e.r * 2, e.r * 2], life: [0.6, 0.6], grow: 3, ring: true }); shake(4); }
    }
    const bk = Math.min(1, (now - born) / 260), pop = bk < 1 ? 1 - Math.pow(1 - bk, 3) * Math.cos(bk * 5) : 1;
    const col = hex(D.color);
    const big = D.boss || D.elite || D.fleet;
    const hs = PX.pools.halo.get();
    hs.position.set(e.x, e.y); hs.tint = col; hs.rotation = 0;
    hs.alpha = (big ? 0.38 + 0.12 * Math.sin(tm * 4 + e.rot) : 0.14) * bk;
    hs.scale.set(e.r * (big ? 4.2 : 2.6) * pop / 64);
    const sp = PX.pools.enemy.get(ET[e.type]);
    sp.position.set(e.x, e.y);
    sp.rotation = e.type === 'fast' ? Math.atan2(-e.y, -e.x) + Math.PI / 2 : e.rot;
    sp.scale.set(e.r / 32 * pop);
    if (e.flash > 0) { e.flash -= dt; sp.tint = 0xffffff; }
    else sp.tint = e.stun > 0 || e.netT > 0 ? 0xe0e8ff : col;
    sp.alpha = 1;
    if (e.type === 'protector') EG.lineStyle(px, 0x7fb2ff, 0.22 + 0.08 * Math.sin(tm * 3)).drawCircle(e.x, e.y, ENEMY_TYPES.protector.shield * S.protRadius).lineStyle(0);
    if (e.prot) EG.lineStyle(0.7 * px, 0x7fb2ff, 0.9).drawCircle(e.x, e.y, e.r + 0.8).lineStyle(0);
    if (e.armor > 0) EG.lineStyle(px, 0xcccccc, 0.9).drawPolygon(polyPts(6, e.r + 0.6).map((v, i) => v + (i % 2 ? e.y : e.x))).lineStyle(0);
    if (e.netT > 0) { EG.lineStyle(0.6 * px, 0x7df9ff, 1); for (let i = -1; i <= 1; i++) { EG.moveTo(e.x - e.r, e.y + i * e.r * 0.6).lineTo(e.x + e.r, e.y + i * e.r * 0.6); EG.moveTo(e.x + i * e.r * 0.6, e.y - e.r).lineTo(e.x + i * e.r * 0.6, e.y + e.r); } EG.lineStyle(0); }
    if (e.burnT > 0 && Math.random() < dt * 10) emit(e.x, e.y, { n: 1, color: 0xff6a2a, speed: [0, 2], size: [0.8, 1.6], life: [0.3, 0.5], gravity: -5, jitter: e.r * 0.6 });
    if (e.draining) EG.lineStyle(1.2 * px, 0xff2a2a, 0.5 + 0.3 * Math.sin(tm * 12)).moveTo(e.x, e.y).lineTo(0, 0).lineStyle(0);
    if ((D.boss || D.elite || D.fleet || e.type === 'tank' || e.type === 'protector') && e.hp < e.maxHp) {
      const bw = e.r * 2.4;
      EG.beginFill(0x000000, 0.6).drawRect(e.x - bw / 2, e.y - e.r - 2.2, bw, 0.9).endFill();
      EG.beginFill(hex(D.color), 1).drawRect(e.x - bw / 2, e.y - e.r - 2.2, bw * Math.max(0, e.hp / e.maxHp), 0.9).endFill();
    }
  }
  // ---- střely ----
  const bp = PX.pools.bullet;
  const bcol = R.card.demonT > 0 ? 0xff3d3d : superActive(R) ? 0xffe45e : 0xd8f4ff;
  for (const b of R.bullets) {
    if (b.dead) continue;
    const sp = bp.get();
    const a = b.t ? Math.atan2(b.t.y - b.y, b.t.x - b.x) : 0;
    sp.position.set(b.x, b.y); sp.rotation = a; sp.tint = bcol; sp.alpha = 1;
    sp.scale.set(3.2 / 64, 1.1 / 64);
    // stopa od pozice z minulého snímku
    const pv = PX.prevPos.get(b);
    if (pv) {
      const dx = b.x - pv[0], dy = b.y - pv[1], len = Math.min(7, Math.hypot(dx, dy));
      if (len > 0.3) {
        const ta = Math.atan2(dy, dx), tr = PX.pools.trail.get();
        tr.position.set(b.x - Math.cos(ta) * len / 2, b.y - Math.sin(ta) * len / 2); tr.rotation = ta;
        tr.tint = bcol; tr.alpha = 0.45; tr.scale.set((len + 1.5) / 64, 0.9 / 64);
      }
      pv[0] = b.x; pv[1] = b.y;
    } else PX.prevPos.set(b, [b.x, b.y]);
  }
  for (const b of R.ebullets) {
    const sp = bp.get(); sp.position.set(b.x, b.y); sp.rotation = 0; sp.tint = hex(b.color); sp.alpha = 1;
    sp.scale.set((b.oc ? 2.4 : 1.6) / 64);
  }
  for (const m of R.missiles) {
    const sp = bp.get(PX.tex.shard);
    sp.position.set(m.x, m.y); sp.rotation = Math.atan2(m.vy, m.vx) + Math.PI / 2; sp.tint = 0xffb347; sp.alpha = 1; sp.scale.set(1.6 / 28);
    if (Math.random() < 0.6) emit(m.x, m.y, { n: 1, color: 0xff8c3a, speed: [0, 1], size: [0.8, 1.4], life: [0.2, 0.35], grow: 1, alpha: 0.6 });
  }
  // ---- orby ----
  const or = orbRadius(S);
  const orbAt = [];
  if (S.orbs > 0) {
    G.lineStyle(px, 0xffffff, 0.08).drawCircle(0, 0, or).lineStyle(0);
    for (let k = 0; k < S.orbs; k++) { const a = R.orbA + k * Math.PI * 2 / S.orbs; orbAt.push([Math.cos(a) * or, Math.sin(a) * or, 0xffffff, 1.2 * S.orbSize]); }
  }
  if (S.extraOrb) for (let k = 0; k < S.extraOrbs; k++) { const a = R.extraOrbA + k * Math.PI * 2 / S.extraOrbs; orbAt.push([Math.cos(a) * or * 0.65, Math.sin(a) * or * 0.65, 0xbff8ff, 1.1 * S.orbSize]); }
  if (S.uniq.orbital) for (let k = 0; k < S.uniq.orbital; k++) { const a = (R.electronA || 0) + k * Math.PI * 2 / S.uniq.orbital; orbAt.push([Math.cos(a) * 11, Math.sin(a) * 11, 0xffe45e, 0.6]); }
  for (const [x, y, c, r] of orbAt) {
    const sp = bp.get(PX.tex.dot); sp.position.set(x, y); sp.rotation = 0; sp.tint = c; sp.alpha = 1; sp.scale.set(r * 3.2 / 64);
    if (Math.random() < 0.5) emit(x, y, { n: 1, color: c, speed: [0, 0.5], size: [r * 1.2, r * 1.8], life: [0.15, 0.3], alpha: 0.5 });
  }

  // ---- věž ----
  const skin = curSkin();
  const tc = hex(R.card.demonT > 0 ? '#ff3d3d' : R.golden > 0 ? '#ffd700' : R.hitFlash > 0 ? '#ff4d6d' : superActive(R) ? '#ffe45e' : skin.color);
  const pulse = 1 + PX.towerPulse * 0.08;
  const sh = skin.shape || 0;
  PX.towerGlow.tint = tc;
  PX.towerGlow.alpha = 0.16 + 0.1 * PX.towerPulse + 0.04 * Math.sin(tm * 3);
  PX.towerGlow.scale.set(TOWER_R * (3.4 + PX.towerPulse * 0.6) / 64);
  TG.lineStyle(0.8 * px, tc, 0.35);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - tm * 0.9; TG.moveTo(Math.cos(a) * (TOWER_R + 4.4), Math.sin(a) * (TOWER_R + 4.4)).arc(0, 0, TOWER_R + 4.4, a, a + 0.6); }
  TG.lineStyle(0);
  if (R.golden > 0) { TG.beginFill(0xffd700, 0.12 + 0.05 * Math.sin(tm * 8)).drawCircle(0, 0, TOWER_R * 2.4).endFill(); if (Math.random() < dt * 20) emit(rand(-3, 3), rand(-3, 3), { n: 1, color: 0xffd700, speed: [1, 3], size: [0.6, 1], life: [0.5, 0.8], gravity: -5 }); }
  TG.beginFill(tc, 0.12);
  TG.lineStyle(2.6 * px, tc, 1);
  if (sh) TG.drawPolygon(polyPts(sh, TOWER_R * pulse, Math.PI / 6)); else TG.drawCircle(0, 0, TOWER_R * pulse);
  TG.endFill();
  TG.lineStyle(1.4 * px, tc, 0.9).drawPolygon(polyPts(sh || 6, TOWER_R * 0.55, Math.PI / 6 + R.time * 0.6));
  TG.lineStyle(1.3 * px, 0x4dff9a, 0.85).moveTo(0, -(TOWER_R + 1.4)).arc(0, 0, TOWER_R + 1.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(R.hp / S.maxHp, 0, 1));
  if (R.card.invT > 0 || R.card.demonT > 0) TG.lineStyle(1.2 * px, 0xffffff, 0.4 + 0.3 * Math.sin(tm * 10)).drawCircle(0, 0, TOWER_R + 2.4);
  if (R.card.es > 0) TG.lineStyle(0.9 * px, 0x4d8dff, 0.9).drawPolygon(polyPts(6, TOWER_R + 3.2, tm * 0.5));
  TG.lineStyle(0);
  if (S.chips.length) { const ga = R.time * 0.6; TG.lineStyle(1.3 * px, 0xff7777, 1).drawPolygon(polyPts(3, 1, ga).map((v, i) => v + (i % 2 ? Math.sin(ga) * 5.5 : Math.cos(ga) * 5.5))).lineStyle(0); }

  // ---- efekty s trváním ----
  for (const f of R.fx) {
    const t = Math.max(0, f.life / f.max);
    if (f.k === 'bolt') {
      const jag = (p, i, arr) => i && i < arr.length ? [p[0] + rand(-0.7, 0.7), p[1] + rand(-0.7, 0.7)] : p;
      const pts = f.pts.map(jag);
      for (const [wdt, al] of [[5, 0.25 * t], [1.6, t]]) { G.lineStyle(wdt * px, 0x7df9ff, al); pts.forEach((p, i) => i ? G.lineTo(p[0], p[1]) : G.moveTo(p[0], p[1])); }
      G.lineStyle(0);
    } else if (f.k === 'beam') {
      const c = hex(f.color);
      G.lineStyle((f.w || 1.5) * 3 * px, c, 0.2 * t).moveTo(f.x, f.y).lineTo(0, 0);
      G.lineStyle((f.w || 1.5) * px, c, t).moveTo(f.x, f.y).lineTo(0, 0).lineStyle(0);
    } else if (f.k === 'burst') {
      G.lineStyle(1.2 * px, hex(f.color), t).drawCircle(f.x, f.y, f.r * (1 + (1 - t) * (f.big ? 4 : 1.6))).lineStyle(0);
    } else if (f.k === 'boom' || f.k === 'ring') {
      const c = hex(f.color);
      G.beginFill(c, (f.k === 'boom' ? 0.3 : 0.06) * t).lineStyle(1.6 * px, c, t).drawCircle(f.x, f.y, f.r * (1.25 - t * 0.45)).endFill().lineStyle(0);
    } else if (f.k === 'shield') {
      G.lineStyle(2.2 * px, 0x4d8dff, t).drawPolygon(polyPts(6, TOWER_R + 3 + (1 - t) * 3)).lineStyle(0);
    }
  }

  // ---- gem obíhající po bariéře ----
  if (R.gem && R.gem.x !== undefined) {
    const g = R.gem, k = 2.4 * (1 + Math.sin(now / 150) * 0.12);
    const sp = PX.pools.mine.get(PX.tex.diamond); sp.position.set(g.x, g.y); sp.tint = 0xff5ce1; sp.alpha = 1; sp.rotation = 0; sp.scale.set(k * 1.1 / 20);
    if (Math.random() < dt * 12) emit(g.x, g.y, { n: 1, color: 0xff9cf0, speed: [2, 5], size: [0.5, 0.9], life: [0.3, 0.6], jitter: 1.5 });
  }

  updateParts(dt);
  drawParts();
  for (const k in PX.pools) PX.pools[k].end();

  // ---- texty (čísla poškození, zprávy) ----
  PX.frame++;
  for (const f of R.fx) {
    if (f.k !== 'txt') continue;
    if (!f._t) {
      const t = PX.textFree.pop() || (() => { const n = new PIXI.Text('', PX.textStyle); n.anchor.set(0.5); n.resolution = 2; PX.textLayer.addChild(n); return n; })();
      t.text = f.text; t.tint = hex(f.color); t.visible = true;
      f._t = t; PX.texts.push({ f, t });
    }
    f._seen = PX.frame;
    const t = f.life / f.max, age = f.max - f.life;
    const pop = age < 0.12 ? 1 + (1 - age / 0.12) * 0.6 : 1;
    f._t.position.set(w / 2 + shx + f.x * s, h / 2 + shy + (f.y - (1 - t) * 3) * s);
    f._t.alpha = Math.min(1, t * 2);
    f._t.scale.set(pop * (f.max <= 0.5 ? 0.85 : 1));
  }
  PX.texts = PX.texts.filter(o => { if (o.f._seen === PX.frame) return true; o.t.visible = false; o.f._t = null; PX.textFree.push(o.t); return false; });

  // ---- rázové vlny (filtr) ----
  if (PX.shockwaves.length) {
    for (const sw of PX.shockwaves) { sw.t += dt; sw.f.time = sw.t; }
    const before = PX.shockwaves.length;
    PX.shockwaves = PX.shockwaves.filter(sw => sw.t < 1.3);
    if (PX.shockwaves.length !== before) applyFilters();
  }
  if (!!(PX.world.filters || []).includes(PX.bloom) !== !!(PX.bloom && save.glow)) applyFilters();

  // ---- červený okraj při zásahu / nízkém zdraví, záblesk záře ----
  PX.hurtA = Math.max(0, PX.hurtA - dt * 3);
  const low = R.hp < S.maxHp * 0.25 ? 0.3 + 0.2 * Math.sin(tm * 6) : 0;
  PX.hurt.alpha = Math.max(PX.hurtA, low);
  PX.bloomKick = Math.max(0, PX.bloomKick - dt * 2.5);
  if (PX.bloom) PX.bloom.bloomScale = 1.15 + PX.bloomKick * 0.9;

  // ---- HUD: ikony zbraní, banner vlny, pauza ----
  drawHud(R, w, h, dt);
  PX.app.render();
}

function drawHud(R, w, h, dt) {
  const S = R.S, HG = PX.hudG;
  let ix = 22;
  const seen = new Set();
  for (const u of UW_DEFS) {
    const st = S.uw[u.id];
    if (!st || st.cd === undefined) continue;
    seen.add(u.id);
    const left = R.uwT[u.id] || 0, total = st.cd;
    const active = (u.id === 'goldenTower' && R.golden > 0) || (u.id === 'chronoField' && R.chrono > 0);
    const col = hex(u.color), y = h - 22;
    HG.beginFill(0x0a0c28, 0.85).lineStyle(2, active || left <= 0 ? col : 0x3a3f6e, 1).drawCircle(ix, y, 14).endFill();
    if (left > 0) HG.lineStyle(3, col, 1).moveTo(ix, y - 14).arc(ix, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left / total));
    if (active) HG.lineStyle(6, col, 0.25 + 0.15 * Math.sin(performance.now() / 120)).drawCircle(ix, y, 16);
    HG.lineStyle(0);
    let ic = PX.hudIcons[u.id];
    if (!ic) { ic = new PIXI.Text(u.icon, { fontFamily: 'sans-serif', fontSize: 15, fontWeight: '700', fill: u.color }); ic.anchor.set(0.5); ic.resolution = 2; PX.hud.addChild(ic); PX.hudIcons[u.id] = ic; }
    ic.visible = true; ic.position.set(ix, y + 1);
    ix += 32;
  }
  for (const id in PX.hudIcons) if (!seen.has(id)) PX.hudIcons[id].visible = false;
  // banner nové vlny
  const b = PX.banner;
  if (b && b.t > 0) {
    b.t -= dt;
    PX.bannerText.text = b.text;
    PX.bannerText.tint = b.boss ? 0xff4d6d : 0xffffff;
    const a = b.t > 1.3 ? (1.6 - b.t) / 0.3 : Math.min(1, b.t / 0.5);
    PX.bannerText.alpha = a * (b.boss ? 1 : 0.75);
    PX.bannerText.scale.set(b.boss ? 1 + 0.05 * Math.sin(performance.now() / 80) : 0.8);
  } else PX.bannerText.text = '';
  if (game.userPaused || R.paused) {
    HG.beginFill(0x000000, 0.45).drawRect(0, 0, w, h).endFill();
    PX.pauseText.text = R.paused ? 'VYBER PERK' : 'PAUZA';
  } else PX.pauseText.text = '';
}
