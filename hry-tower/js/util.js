'use strict';
// ---------- formátování a pomocné funkce ----------
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S', 'O', 'N', 'D', 'aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag', 'ah'];

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  let s;
  if (n < 1000) {
    if (Math.abs(n - Math.round(n)) < 1e-6) s = String(Math.round(n));
    else if (n < 10) s = n.toFixed(2);
    else if (n < 100) s = n.toFixed(1);
    else s = String(Math.floor(n));
  } else {
    const e = Math.floor(Math.log10(n) / 3);
    if (e < SUFFIXES.length) {
      const v = n / Math.pow(1000, e);
      s = (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUFFIXES[e];
    } else s = n.toExponential(2);
  }
  return (neg ? '-' : '') + s;
}

function pctFmt(v) {
  const p = v * 100;
  return (p < 10 ? p.toFixed(2) : p < 100 ? p.toFixed(1) : fmt(p)) + '%';
}

function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// opts: [[hodnota, váha], ...]
function weighted(opts) {
  let tot = 0;
  for (const o of opts) tot += o[1];
  let r = Math.random() * tot;
  for (const o of opts) { if ((r -= o[1]) <= 0) return o[0]; }
  return opts[opts.length - 1][0];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Interpolace v tabulce řídkých úrovní [[level, hodnota], ...] (logaritmicky pro kladné hodnoty)
function interpRows(rows, L) {
  if (!rows || !rows.length) return 0;
  if (L <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    const [l1, v1] = rows[i];
    if (L <= l1) {
      const [l0, v0] = rows[i - 1];
      const t = (L - l0) / (l1 - l0);
      if (v0 > 0 && v1 > 0) return v0 * Math.pow(v1 / v0, t);
      return v0 + (v1 - v0) * t;
    }
  }
  const n = rows.length;
  if (n < 2) return rows[n - 1][1];
  // za koncem tabulky pokračuje stejný poměr růstu
  const [la, va] = rows[n - 2], [lb, vb] = rows[n - 1];
  if (va > 0 && vb > 0 && lb > la) return vb * Math.pow(vb / va, (L - lb) / (lb - la));
  return vb;
}

// Seedovaný generátor (pro roboty v turnajích apod.)
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hashStr = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const DAY = 86400000, HOUR = 3600000;
const utcDay = t => Math.floor(t / DAY);
// pondělí 00:00 UTC daného týdne
const weekStart = t => { const d = new Date(t); const wd = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - wd * DAY; };

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
