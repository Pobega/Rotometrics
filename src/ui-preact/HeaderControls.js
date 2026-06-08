// Header chrome (Preact). Two small islands that replace the vanilla header glue
// (applyFormTheme + populateFormatSelector + the format/load/export bindings) and
// retire src/ui/dom.js:
//   - Brand: the brand Rotom sprite, whose glow tints to the active format's
//     Rotom-form accent color.
//   - HeaderControls: the format pill + selector, Load Sample, and Export/Import
//     buttons (rendered into a `display:contents` mount so they stay direct flex
//     children of the header bar). The nav buttons stay vanilla (page-nav owns
//     their active/idle classes), so they're left in index.html untouched.
import { html, useStore } from './preact.js';
import { STATE } from '../state.js';
import { REGULATIONS, NATIONAL_THEME } from '../data/regulations.js';
import { update } from './store.js';
import { onDexFormatChange } from './dex-store.js';
import { openExportImport } from './ExportImportModal.js';

const themeFor = (format) => REGULATIONS[format]?.theme || NATIONAL_THEME;

// The header Rotom swaps form per view: base Rotom drives the calculator, Wash
// Rotom presides over the Pokédex, and Mow Rotom (its grass-cutting form) fronts
// the Attackdex. page-nav records the active view on STATE.page and notifies.
const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';
const ROTOM_BY_PAGE = {
  calculator: `${SPRITE_BASE}/479.gif`,
  pokedex: `${SPRITE_BASE}/10009.gif`,
  attackdex: `${SPRITE_BASE}/10008.gif`,
};

// Brand Rotom sprite — its form follows the active view and its drop-shadow glow
// follows the active format's accent.
export function Brand() {
  useStore();
  const t = themeFor(STATE.format);
  const sprite = ROTOM_BY_PAGE[STATE.page] || ROTOM_BY_PAGE.calculator;
  return html`
    <img src=${sprite}
      alt="Rotom" class="w-11 h-11 object-contain transition-[filter]"
      style=${{ filter: `drop-shadow(0 0 5px ${t.glow})` }} />`;
}

function onFormatChange(value) {
  // Changing the format runs the shared recompute (re-tags both mons via their
  // islands) then rebuilds the Pokédex roster for the new legality set.
  update((s) => {
    s.format = value;
  });
  onDexFormatChange();
}

export function HeaderControls({ onLoadSample }) {
  useStore();
  const t = themeFor(STATE.format);

  return html`
    <!-- Format selector pill, tinted to the active Rotom form -->
    <div class=${`flex items-center gap-1.5 bg-slate-900 border rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors ${t.pillBorder} ${t.pillText}`}>
      <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider hidden sm:inline">Regulation:</span>
      <select value=${STATE.format} onChange=${(e) => onFormatChange(e.target.value)}
        class="bg-transparent font-bold focus:outline-none text-slate-200 cursor-pointer uppercase tracking-wider text-[9px] sm:text-[10px]">
        ${Object.entries(REGULATIONS).map(([format, reg]) => html`<option value=${format} class="bg-slate-800">${reg.short}</option>`)}
        <option value="all" class="bg-slate-800">None</option>
      </select>
    </div>

    <!-- Load a ready-made VGC sample matchup -->
    <button onClick=${onLoadSample} title="Load VGC Sample Matchup"
      class="bg-amber-600 hover:bg-amber-500 border border-amber-500/30 text-white text-[10px] font-extrabold py-1.5 px-2.5 rounded-lg transition flex items-center gap-1.5 shadow">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span class="hidden md:inline">Load Sample</span>
    </button>

    <!-- Export / Import the current matchup as shareable text -->
    <button onClick=${openExportImport} title="Export or import a matchup as text"
      class="bg-cyan-700 hover:bg-cyan-600 border border-cyan-500/30 text-white text-[10px] font-extrabold py-1.5 px-2.5 rounded-lg transition flex items-center gap-1.5 shadow">
      <i class="fa-solid fa-right-left"></i>
      <span class="hidden md:inline">Export / Import</span>
    </button>`;
}
