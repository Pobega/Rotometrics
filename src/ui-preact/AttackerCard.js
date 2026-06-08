// Attacker card — the first Preact island. Renders the attacker profile, search,
// stat dashboard, and SP-allocation sliders from STATE, mounted into the existing
// #panel-attacker container. Everything else on the calculator page is still
// vanilla; this island bridges through src/ui-preact/store.js.
import { html, useState, useEffect, useRef, useStore } from './preact.js';
import { STATE, CACHE, update } from './store.js';
import { calculateStat, calculateStatBoost } from '../engine/stats.js';
import { getTypeBgClass } from '../ui/render.js';
import { NATURES, OFF_VGC_ABILITIES_HELPER } from '../data/constants.js';
import { REGULATIONS } from '../data/regulations.js';
import { isHiddenForm, isFormatLegal } from '../data/dex.js';
import { legalSetForFormat, nonLegalFormsForFormat, fetchPokemonDetails } from '../api/pokeapi.js';
import { GHOST_SPRITE, BOOST_STAGES, regulationTag } from './card-common.js';

// Which preset (if any) the current attacker spread matches — mirrors app.js.
function matchedPreset(sps, nature) {
  const { atk, spa, spe } = sps;
  if (atk === 32 && spa === 0 && spe === 32 && nature === '+atk') return 'phys_attacker';
  if (atk === 0 && spa === 32 && spe === 32 && nature === '+spa') return 'spec_attacker';
  if (atk === 32 && spa === 32 && spe === 2 && nature === 'neutral') return 'mixed_attacker';
  return '';
}

const PRESETS = {
  phys_attacker: { atk: 32, spa: 0, spe: 32, nature: '+atk' },
  spec_attacker: { atk: 0, spa: 32, spe: 32, nature: '+spa' },
  mixed_attacker: { atk: 32, spa: 32, spe: 2, nature: 'neutral' },
};

function StatBars({ base, show }) {
  const rows = [
    ['HP', 'hp', 'bg-blue-500'],
    ['Atk', 'atk', 'bg-red-500'],
    ['Def', 'def', 'bg-indigo-500'],
    ['SpA', 'spa', 'bg-purple-500'],
    ['SpD', 'spd', 'bg-teal-500'],
    ['Spe', 'spe', 'bg-amber-500'],
  ];
  return html`
    <div class=${`${show ? 'flex' : 'hidden'} flex-col gap-1 text-[9px] w-full mt-2`}>
      ${rows.map(([label, key, color]) => {
        const v = base[key] || 0;
        const pct = Math.min(100, Math.max(5, (v / 200) * 100));
        return html`
          <div class="flex items-center gap-2">
            <span class="w-7 font-extrabold text-slate-400 uppercase text-[8px]">${label}</span>
            <span class="w-6 text-right font-bold font-mono text-slate-300">${v}</span>
            <div class="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div class=${`h-full ${color} rounded-full transition-all duration-500`} style=${`width:${pct}%`}></div>
            </div>
          </div>`;
      })}
    </div>`;
}

function BoostSelect({ stat, pad }) {
  const a = STATE.attacker;
  return html`
    <select value=${String(a.boosts[stat])}
      onChange=${(e) =>
        update((s) => {
          s.attacker.boosts[stat] = parseInt(e.target.value) || 0;
        })}
      class=${`bg-slate-800 border border-slate-700 rounded ${pad || 'px-1'} py-0.5 text-[9px] font-mono text-slate-300 cursor-pointer focus:outline-none focus:border-red-500`}>
      ${BOOST_STAGES.map((n) => html`<option value=${String(n)}>${n >= 0 ? `+${n}` : n}</option>`)}
    </select>`;
}

export function AttackerCard({ onChoose }) {
  useStore();
  const a = STATE.attacker;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  // Index of the keyboard-highlighted result. Typing resets it to 0 so the top
  // match is always the active one (Enter chooses it); Up/Down move it.
  const [highlight, setHighlight] = useState(0);
  const [spinner, setSpinner] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Opening the search drops the caret straight into the box and highlights any
  // leftover text, so the user can type a new name without reaching for the mouse.
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  // Keep the highlighted row scrolled into view as Up/Down walk past the visible
  // window of the (max-h-60, scrollable) results dropdown.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.children[highlight];
    if (row) row.scrollIntoView({ block: 'nearest' });
  }, [highlight, results]);

  const selected = !!a.apiName;
  const isMega = a.apiName.includes('-mega');
  const learnable = OFF_VGC_ABILITIES_HELPER(a.abilities || []);
  const tag = regulationTag(a.apiName);

  // Live stats (mirror updateLiveStats). Speed folds in Choice Scarf + Tailwind
  // (the Tailwind flag lives on STATE.modifiers, set by the ModifiersPanel).
  const finalAtk = calculateStatBoost(
    calculateStat('atk', a.baseStats.atk, a.sps.atk, a.nature, false),
    a.boosts.atk
  );
  const finalSpa = calculateStatBoost(
    calculateStat('spa', a.baseStats.spa, a.sps.spa, a.nature, false),
    a.boosts.spa
  );
  let finalSpe = calculateStatBoost(
    calculateStat('spe', a.baseStats.spe || 100, a.sps.spe, a.nature, false),
    a.boosts.spe
  );
  if (a.item === 'choice_scarf') finalSpe = Math.floor(finalSpe * 1.5);
  if (STATE.modifiers.tailAtk) finalSpe *= 2;

  const spSum = a.sps.atk + a.sps.spa + a.sps.spe;
  const preset = matchedPreset(a.sps, a.nature);

  function runSearch(q) {
    setQuery(q);
    setHighlight(0); // top match is always active while typing
    const term = q.trim().toLowerCase();
    if (!term) {
      setResults([]);
      return;
    }
    let m = CACHE.pokemonList.filter(
      (p) => p.name.toLowerCase().includes(term) && !isHiddenForm(p.apiName)
    );
    const legal = legalSetForFormat(STATE.format);
    if (legal)
      m = m.filter((p) => isFormatLegal(p.apiName, legal, nonLegalFormsForFormat(STATE.format)));
    m.sort((x, y) => {
      const xs = x.name.toLowerCase().startsWith(term);
      const ys = y.name.toLowerCase().startsWith(term);
      if (xs && !ys) return -1;
      if (!xs && ys) return 1;
      return x.name.localeCompare(y.name);
    });
    setResults(m.slice(0, 10));
  }

  async function pick(p) {
    setResults([]);
    setQuery(p.name);
    setSpinner(true);
    try {
      const details = await fetchPokemonDetails(p.apiName);
      onChoose(details);
      setOpen(false);
    } catch (err) {
      console.error('Error loading selected Pokemon details', err);
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: err,
          message: 'Autocomplete Selection Error: ' + err.message,
        })
      );
    } finally {
      setSpinner(false);
    }
  }

  // Keyboard control for the search box: Up/Down walk the results, Enter commits
  // the highlighted one (and closes the box), Escape backs out.
  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const choice = results[highlight];
      if (choice) pick(choice);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const reg = REGULATIONS[STATE.format];
  const badgeText = reg ? reg.short : 'National Dex';
  const badgeColor = reg
    ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30'
    : 'bg-slate-800/60 text-slate-400 border border-slate-700/30';

  const lockedSel =
    'w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-slate-400 cursor-not-allowed';
  const liveSel =
    'w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer';

  return html`
    <!-- Card 1: Attacker Profile & Selection -->
    <div class="bg-slate-800 border border-slate-700 border-t-2 border-t-red-500/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4 pokemon-card">
      <div class="flex justify-between items-center border-b border-slate-700 pb-2.5">
        <h2 class="text-sm font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-hand-fist text-xs"></i> Attacker
        </h2>
        <button type="button" aria-label="Search Pokémon" title="Search Pokémon"
          onClick=${() => setOpen((v) => !v)}
          class=${`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-700 transition ${open ? 'bg-slate-700/60 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/60'}`}>
          Search <i class="fa-solid fa-magnifying-glass text-[10px]"></i>
        </button>
      </div>

      ${
        open &&
        html`
      <div class="relative">
        <div class="relative">
          <input type="text" placeholder="Search (e.g. Lopunny, Incineroar...)" ref=${inputRef}
            value=${query} onInput=${(e) => runSearch(e.target.value)} onKeyDown=${onKeyDown}
            class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 focus:outline-none focus:border-slate-500 transition" />
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-500 text-[10px]"></i>
          ${spinner && html`<div class="absolute right-3 top-2"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/479.png" alt="Loading" class="w-6 h-6 animate-spin" style="image-rendering: pixelated;" /></div>`}
        </div>
        ${
          results.length > 0 &&
          html`
        <div ref=${listRef} class="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          ${results.map(
            (p, i) => html`
            <button onClick=${() => pick(p)} onMouseMove=${() => setHighlight(i)}
              aria-selected=${i === highlight}
              class=${`w-full text-left px-4 py-2.5 text-xs font-bold border-b border-slate-750 flex justify-between items-center transition ${i === highlight ? 'bg-slate-700/60' : 'hover:bg-slate-700/50'}`}>
              <span>${p.name}</span>
              <span class=${`text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-extrabold border ${badgeColor}`}>${badgeText}</span>
            </button>`
          )}
        </div>`
        }
        ${
          query.trim() &&
          results.length === 0 &&
          html`
        <div class="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl">
          <div class="p-3 text-slate-500 text-xs">No legal Pokémon found in current format</div>
        </div>`
        }
      </div>`
      }

      <!-- Profile + stats bars -->
      <div class="bg-slate-900/40 border border-slate-700 rounded-xl p-3 flex flex-col gap-3">
        <div class="flex items-center gap-3.5">
          <img src=${selected ? a.sprite : GHOST_SPRITE} alt="Attacker"
            class=${`w-24 h-24 object-contain bg-slate-900 rounded-xl p-1 shadow-inner border border-slate-700/30 ${selected ? '' : 'opacity-20 animate-pulse'}`} />
          <div class="flex-1 min-w-0 flex flex-col items-center text-center gap-1">
            <div>${tag && html`<span class=${`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${tag.cls}`}>${tag.text}</span>`}</div>
            <h3 class="font-black text-base truncate text-slate-100 w-full">${a.name || 'Select a Pokemon'}</h3>
            <div class="flex gap-1.5 justify-center w-full">
              ${(a.types && a.types.length ? a.types : ['???']).map((t) =>
                t === '???'
                  ? html`<span class="text-[9px] px-1.5 py-0.5 font-bold uppercase rounded bg-slate-700 text-slate-300">???</span>`
                  : html`<span class=${`text-[10px] px-2 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white`}>${t}</span>`
              )}
            </div>
          </div>
        </div>

        <details class="group border-t border-slate-700 pt-2 w-full">
          <summary class="flex items-center justify-between cursor-pointer select-none list-none text-[9px] font-extrabold text-slate-400 uppercase tracking-wider [&::-webkit-details-marker]:hidden">
            <span><i class="fa-solid fa-chart-simple text-[8px] mr-1 text-slate-500"></i> Base Stats</span>
            <i class="fa-solid fa-chevron-down text-[8px] text-slate-500 transition-transform duration-200 group-open:rotate-180"></i>
          </summary>
          <${StatBars} base=${a.baseStats} show=${selected} />
        </details>
      </div>

      <!-- Level & Nature -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-left">Level</label>
          <input type="number" value="50" disabled class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 text-center text-slate-500 cursor-not-allowed" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-left">Nature</label>
          <select value=${a.nature} onChange=${(e) =>
            update((s) => {
              s.attacker.nature = e.target.value;
            })} class=${liveSel}>
            ${NATURES.map((n) => html`<option value=${n.id}>${n.name}</option>`)}
          </select>
        </div>
      </div>

      <!-- Item & Ability -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-left">Held Item</label>
          <select value=${a.item} disabled=${isMega} onChange=${(e) =>
            update((s) => {
              s.attacker.item = e.target.value;
            })}
            class=${isMega ? `${lockedSel} text-xs` : liveSel}>
            <option value="none">No offensive item</option>
            <option value="choice_band">Choice Band (1.5x Atk)</option>
            <option value="choice_specs">Choice Specs (1.5x SpA)</option>
            <option value="choice_scarf">Choice Scarf (1.5x Speed)</option>
            <option value="life_orb">Life Orb (1.3x Damage)</option>
            <option value="expert_belt">Expert Belt (1.2x Super Eff.)</option>
            <option value="black_glasses_etc">Type boosting item (1.2x)</option>
            <option value="mega_stone">Mega Stone</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-left">Offensive Ability</label>
          <select value=${a.ability} disabled=${isMega} onChange=${(e) =>
            update((s) => {
              s.attacker.ability = e.target.value;
            })} class=${isMega ? lockedSel : liveSel}>
            <option value="none">No offensive ability</option>
            ${learnable.map((ab) => html`<option value=${ab.apiName}>${ab.name}</option>`)}
          </select>
        </div>
      </div>

      <!-- Stats dashboard -->
      <div class="bg-slate-900/40 border border-slate-700 rounded-xl p-3">
        <div class="grid grid-cols-3 gap-2.5">
          <div class="flex flex-col gap-1 text-left">
            <div class="flex justify-between items-center text-slate-300 font-extrabold uppercase text-[9px] tracking-wider">
              <span>Attack</span><span class="text-amber-400 text-xs font-black">${selected ? finalAtk : '---'}</span>
            </div>
            <div class="flex justify-between items-center mt-1.5 text-[9px] text-slate-400">
              <span>Boost</span><${BoostSelect} stat="atk" />
            </div>
          </div>
          <div class="flex flex-col gap-1 text-left border-l border-slate-700 pl-2">
            <div class="flex justify-between items-center text-slate-300 font-extrabold uppercase text-[9px] tracking-wider">
              <span>Sp. Atk</span><span class="text-amber-400 text-xs font-black">${selected ? finalSpa : '---'}</span>
            </div>
            <div class="flex justify-between items-center mt-1.5 text-[9px] text-slate-400">
              <span>Boost</span><${BoostSelect} stat="spa" />
            </div>
          </div>
          <div class="flex flex-col gap-1 text-left border-l border-slate-700 pl-2">
            <div class="flex justify-between items-center text-slate-300 font-extrabold uppercase text-[9px] tracking-wider">
              <span>Speed</span><span class="text-amber-400 text-xs font-black">${selected ? finalSpe : '---'}</span>
            </div>
            <div class="flex justify-between items-center mt-1.5 text-[9px] text-slate-400">
              <span>Boost</span><${BoostSelect} stat="spe" pad="px-1.5" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Card 3: SP Allocations -->
    <div class="bg-slate-800 border border-slate-700 border-t-2 border-t-red-500/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4 pokemon-card">
      <div class="flex justify-between items-center border-b border-slate-700 pb-2.5">
        <h2 class="text-sm font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-sliders text-xs"></i> SP Allocations
        </h2>
        <select value=${preset}
          onChange=${(e) => {
            const v = e.target.value;
            if (!v) return;
            const p = PRESETS[v];
            update((s) => {
              s.attacker.sps.atk = p.atk;
              s.attacker.sps.spa = p.spa;
              s.attacker.sps.spe = p.spe;
              s.attacker.nature = p.nature;
            });
          }}
          class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-300 cursor-pointer focus:outline-none focus:border-red-500">
          <option value="">-- Presets --</option>
          <option value="phys_attacker">Physical Attacker</option>
          <option value="spec_attacker">Special Attacker</option>
          <option value="mixed_attacker">Mixed Attacker</option>
        </select>
      </div>
      <div class="flex justify-between items-center text-xs font-mono text-slate-400 -mt-1">
        <span>Status sum:</span>
        <span class=${spSum > 66 ? 'font-bold text-red-400' : 'font-bold'}>Used: ${spSum}/66 SP</span>
      </div>
      <div class="flex flex-col gap-3.5 text-xs">
        ${[
          ['atk', 'Attack SP:', 'text-red-400', 'accent-red-500'],
          ['spa', 'Sp. Atk SP:', 'text-purple-400', 'accent-purple-500'],
          ['spe', 'Speed SP:', 'text-amber-400', 'accent-amber-500'],
        ].map(
          ([key, label, textColor, accent]) => html`
          <div>
            <div class="flex justify-between font-mono mb-1">
              <span>${label}</span><span class=${`font-bold ${textColor}`}>${a.sps[key]}</span>
            </div>
            <input type="range" min="0" max="32" step="1" value=${String(a.sps[key])}
              onInput=${(e) =>
                update((s) => {
                  s.attacker.sps[key] = parseInt(e.target.value) || 0;
                })}
              class=${`w-full ${accent} bg-slate-700 rounded-lg appearance-none cursor-pointer`} />
          </div>`
        )}
      </div>
    </div>`;
}
