// Shared top-nav controller for the main views (Calculator, Pokédex, Attackdex).
// Each view registers its nav button + page container (and an optional onShow
// callback); this module owns the active/idle button styling, the per-view
// header Rotom form + tagline swap, and hiding the calculator-only damage HUDs
// when a dex view is active. Pulling this out of the dex page logic lets any
// number of views coexist instead of a hard-coded two-way toggle.
import { STATE } from '../state.js';
import { notify } from '../ui-preact/store.js';

const ACTIVE_CLS = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition bg-amber-950/40 text-amber-400 shadow";
const IDLE_CLS = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition text-slate-400 hover:text-white";

// Per-view header tagline. The matching Rotom form swap lives on the Brand island
// (src/ui-preact/HeaderControls.js), keyed off STATE.page; showPage sets that and
// notifies. The subtitle is a plain <p> the island doesn't own, so it stays here.
const SUBTITLE_BY_PAGE = {
  calculator: 'VGC Spread Optimizer',
  pokedex: 'Pokémon Champions Pokédex',
  attackdex: 'Pokémon Champions Attackdex',
};

const pages = new Map(); // id -> { navBtn, pageEl, onShow }
let domCache = null;

function navDom() {
  if (domCache) return domCache;
  domCache = {
    brandSubtitle: document.getElementById('brand-subtitle'),
    mobileOverlay: document.getElementById('mobile-floating-overlay'),
    desktopResultsBar: document.getElementById('results-hud'),
  };
  return domCache;
}

// Register a view. `navBtn` clicks switch to it; `pageEl` is shown/hidden;
// `onShow` (optional) runs each time the view becomes active.
export function registerPage(id, { navBtn, pageEl, onShow = null }) {
  if (!navBtn || !pageEl) return;
  pages.set(id, { navBtn, pageEl, onShow });
  navBtn.addEventListener('click', () => showPage(id));
}

export function showPage(id) {
  const dom = navDom();

  // Swap the header Rotom form + tagline to match the active view. The sprite is
  // owned by the Brand island, so record the view on STATE and notify it; the
  // subtitle is a plain <p> the island doesn't own, so set it directly.
  STATE.page = id;
  notify();
  if (dom.brandSubtitle) dom.brandSubtitle.textContent = SUBTITLE_BY_PAGE[id] || SUBTITLE_BY_PAGE.calculator;

  for (const [pid, cfg] of pages) {
    const active = pid === id;
    cfg.pageEl.classList.toggle('hidden', !active);
    cfg.navBtn.className = active ? ACTIVE_CLS : IDLE_CLS;
  }

  // The damage-results views (mobile bottom overlay + desktop pinned HUD) belong
  // to the calculator; hide them on the dex views so they don't float over them.
  // The bar's base is `hidden lg:block`, so toggle the important `!hidden` to
  // keep its responsive default intact when it's shown again.
  const onCalculator = id === 'calculator';
  if (dom.mobileOverlay) dom.mobileOverlay.classList.toggle('hidden', !onCalculator);
  if (dom.desktopResultsBar) dom.desktopResultsBar.classList.toggle('!hidden', !onCalculator);

  const cfg = pages.get(id);
  if (cfg && cfg.onShow) cfg.onShow();
}
