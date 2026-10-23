'use strict';
// ---------- SVG ikony ve stylu originálu (neonové obrysy) ----------
const ICON_PATHS = {
  coin: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.3 9.2A4.2 4.2 0 1 0 15.3 14.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  gem: '<path d="M3 9 7.2 4h9.6L21 9l-9 11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 9h18M9 4.2 7.6 9 12 20l4.4-11L15 4.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  stone: '<path d="M12 3 22 20H2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9 16.5 17h-9z" fill="currentColor" opacity=".55"/>',
  sword: '<path d="M19 3h2v2L10 16l-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m6.5 13.5 4 4M8 18l-3 3M5 16l-2 2M3.5 21.5 2.5 20.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shield: '<path d="M12 2.5 20 6v6c0 5-3.6 8.2-8 9.5C7.6 20.2 4 17 4 12V6z" fill="currentColor" opacity=".9"/>',
  star: '<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor"/>',
  uw: '<path d="M12 3 22 20H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="14" r="1" fill="currentColor"/>',
  heart: '<path d="M12 20.5 4 12.8A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8 6.2z" fill="currentColor"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6v4H9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m12 5.2.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 9.5h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m12 11.5 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor"/>',
  castle: '<path d="M4 21V9h2v2h2V9h2v2h4V9h2v2h2V9h2v12h-6v-4a2 2 0 0 0-4 0v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 4h6v5H9z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  podium: '<path d="M2 20h20M4 20v-6h5v6M9 20V9h6v11M15 20v-8h5v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  list: '<rect x="4" y="3" width="16" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3 6 9 7 9-7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.2"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4v4h4M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  cart: '<path d="M2 4h3l2.4 11h11l2-8H6.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="9" cy="19" r="1.6" fill="currentColor"/><circle cx="17" cy="19" r="1.6" fill="currentColor"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  battle: '<path d="M4 3h3l9 9-3 3-9-9zM20 3h-3l-4.5 4.5M17 13l3 3-3 3-3-3M7 13l-3 3 3 3 3-3M16 12l-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  hammer: '<path d="M13.5 4.5 19.5 10.5 17 13l-6-6zM14.5 9.5 4 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="m11 4 3-1.5 2 2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M7 15h10" stroke="currentColor" stroke-width="1.6"/>',
  cards: '<rect x="3" y="6" width="11" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3h11.5A1.5 1.5 0 0 1 21 4.5V18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  module: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m12 7 4.3 2.5v5L12 17l-4.3-2.5v-5z" fill="currentColor" opacity=".5"/>',
  dmg: '<path d="M19 3h2v2L10 16l-2-2z" fill="currentColor"/><path d="m6.5 13.5 4 4M8 18l-4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};
function ico(name, color) {
  return `<svg class="ico" viewBox="0 0 24 24"${color ? ` style="color:${color}"` : ''}>${ICON_PATHS[name] || ''}</svg>`;
}
const CAT_ICON = { atk: ['sword', '#3ab8ff'], def: ['shield', '#ff4d6d'], util: ['star', '#ffd23d'], uw: ['uw', '#33e08f'], enh: ['module', '#ff5ce1'] };
const CAT_HEAD = { atk: 'Útočná vylepšení', def: 'Obranná vylepšení', util: 'Užitková vylepšení', uw: 'Ultimátní zbraně', enh: 'Vylepšení dílny+' };
