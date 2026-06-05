// Shared top-nav controller for the main views (Calculator, Pokédex, Attackdex).
// Each view registers its nav button + page container (and an optional onShow
// callback); this module owns the active/idle button styling, the per-view
// header Rotom form + tagline swap, and hiding the calculator-only damage HUDs
// when a dex view is active. Pulling this out of the dex page logic lets any
// number of views coexist instead of a hard-coded two-way toggle.

const ACTIVE_CLS = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition bg-amber-950/40 text-amber-400 shadow";
const IDLE_CLS = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition text-slate-400 hover:text-white";

// The header Rotom swaps form per view: base Rotom drives the calculator, Wash
// Rotom presides over the Pokédex, and Mow Rotom (its grass-cutting form, all
// sharp edges) fronts the Attackdex.
const BRAND_BY_PAGE = {
  calculator: {
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/479.gif',
    subtitle: 'VGC Spread Optimizer',
  },
  pokedex: {
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/10009.gif',
    subtitle: 'Pokémon Champions Pokédex',
  },
  attackdex: {
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/10008.gif',
    subtitle: 'Pokémon Champions Attackdex',
  },
};

const pages = new Map(); // id -> { navBtn, pageEl, onShow }
let domCache = null;

function navDom() {
  if (domCache) return domCache;
  domCache = {
    brandRotom: document.getElementById('brand-rotom'),
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

  // Swap the header Rotom form + tagline to match the active view.
  const brand = BRAND_BY_PAGE[id] || BRAND_BY_PAGE.calculator;
  if (dom.brandRotom && dom.brandRotom.getAttribute('src') !== brand.sprite) {
    dom.brandRotom.src = brand.sprite;
  }
  if (dom.brandSubtitle) dom.brandSubtitle.textContent = brand.subtitle;

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
