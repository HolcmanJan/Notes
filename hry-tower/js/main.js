'use strict';
// ---------- start hry a hlavní smyčka ----------
// Hru spouští cloud.js, až porovná uložení s Firebase. Kdyby se modul nenačetl (offline bez cache),
// hra se po pár sekundách spustí sama z lokálního uložení.
let gameStarted = false;
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  loadSave();
  if (save.run) {
    try { restoreRun(save.run); } catch (e) { console.warn(e); save.run = null; game.run = null; }
  }
  labTick(); // dopočítá výzkum za dobu, kdy hra neběžela
  refreshMissions();
  refreshEvent();
  refreshGuild();
  initUI();

  let last = performance.now(), frameN = 0;
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    // od LITE_SPEED se vykresluje jen každý 2. snímek a ušetřený čas dostane simulace
    const draw = UI.page === 'battle' && (!liteFx() || (frameN++ & 1) === 0);
    // rozpočet simulace ~75 % délky snímku (bez vykreslení 90 %) – raději klesne fps, než aby hra zpomalila
    tick(dt, clamp(dt * (draw ? 750 : 900), 10, 45));
    if (draw) render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Když je karta na pozadí, prohlížeč zastaví requestAnimationFrame – hra ale běží dál.
  setInterval(() => {
    if (!document.hidden) return;
    const now = performance.now();
    const dt = Math.min(5, (now - last) / 1000);
    last = now;
    tick(dt, 250);
  }, 1000);

  setInterval(() => {
    updateTopbar();
    if (UI.page === 'battle') { if (game.run) updateRunUI(); }
    else { const p = UI.pages[UI.page]; if (p && p.update) p.update(); }
  }, 200);

  setInterval(() => {
    labTick();
    refreshEvent();
    if (Math.random() < 0.05) { refreshMissions(); refreshGuild(); buildNav(); }
  }, 1000);
  setInterval(() => { if (!window.__noSave) writeSave(); }, 10000);
  window.addEventListener('beforeunload', () => { if (!window.__noSave) writeSave(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !window.__noSave) writeSave(true); });
}
setTimeout(startGame, 8000);
