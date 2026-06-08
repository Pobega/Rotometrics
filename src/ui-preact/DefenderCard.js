// Defender card — Preact island mirroring AttackerCard, mounted into
// #panel-defender. Differs in: HP/Def/SpD/Spe dashboard (HP has no boost),
// defensive item/ability lists, four EV sliders, and the bulk presets.
import { html, useState, useStore } from './preact.js';
import { STATE, CACHE, update } from './store.js';
import { calculateStat, calculateStatBoost } from '../engine/stats.js';
import { getTypeBgClass } from '../ui/render.js';
import { NATURES, DEF_VGC_ABILITIES_HELPER } from '../data/constants.js';
import { REGULATIONS } from '../data/regulations.js';
import { isHiddenForm, isFormatLegal } from '../data/dex.js';
import { legalSetForFormat, nonLegalFormsForFormat, fetchPokemonDetails } from '../api/pokeapi.js';
import { GHOST_SPRITE, BOOST_STAGES, regulationTag } from './card-common.js';

// Mirror of the defender preset matcher in app.js.
function matchedPreset(sps) {
  const { hp, def, spd, spe } = sps;
  if (hp === 32 && def === 32 && spd === 0 && spe === 0) return 'max_phys_bulk';
  if (hp === 32 && def === 0 && spd === 32 && spe === 0) return 'max_spec_bulk';
  if (hp === 32 && def === 17 && spd === 17 && spe === 0) return 'balanced_def';
  if (hp === 32 && def === 2 && spd === 0 && spe === 32) return 'fast_bulky';
  return '';
}

const PRESETS = {
  max_phys_bulk: { hp: 32, def: 32, spd: 0, spe: 0 },
  max_spec_bulk: { hp: 32, def: 0, spd: 32, spe: 0 },
  balanced_def: { hp: 32, def: 17, spd: 17, spe: 0 },
  fast_bulky: { hp: 32, def: 2, spd: 0, spe: 32 },
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
    <div class=${`${show ? 'flex' : 'hidden'} flex-col gap-1 text-[9px] mt-2`}>
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

function BoostCol({ label, value, statKey, show }) {
  return html`
    <div class="flex flex-col gap-1 text-left border-l border-slate-700 pl-2">
      <div class="flex justify-between items-center text-slate-300 font-extrabold uppercase text-[9px] tracking-wider">
        <span>${label}</span><span class="text-blue-400 text-xs font-black">${show ? value : '---'}</span>
      </div>
      <div class="flex justify-between items-center mt-1.5 text-[9px] text-slate-400">
        <span>Boost</span>
        <select value=${String(STATE.defender.boosts[statKey])}
          onChange=${(e) =>
            update((s) => {
              s.defender.boosts[statKey] = parseInt(e.target.value) || 0;
            })}
          class="bg-slate-800 border border-slate-700 rounded py-0.5 px-1 text-[9px] font-mono text-slate-300 cursor-pointer focus:outline-none focus:border-blue-500">
          ${BOOST_STAGES.map((n) => html`<option value=${String(n)}>${n >= 0 ? `+${n}` : n}</option>`)}
        </select>
      </div>
    </div>`;
}

export function DefenderCard({ onChoose }) {
  useStore();
  const d = STATE.defender;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [spinner, setSpinner] = useState(false);

  const selected = !!d.apiName;
  const isMega = d.apiName.includes('-mega');
  const learnable = DEF_VGC_ABILITIES_HELPER(d.abilities || []);
  const tag = regulationTag(d.apiName);

  const finalHp = calculateStat('hp', d.baseStats.hp, d.sps.hp, d.nature, true);
  const finalDef = calculateStatBoost(
    calculateStat('def', d.baseStats.def, d.sps.def, d.nature, false),
    d.boosts.def
  );
  const finalSpd = calculateStatBoost(
    calculateStat('spd', d.baseStats.spd, d.sps.spd, d.nature, false),
    d.boosts.spd
  );
  let finalSpe = calculateStatBoost(
    calculateStat('spe', d.baseStats.spe || 100, d.sps.spe, d.nature, false),
    d.boosts.spe
  );
  if (d.item === 'choice_scarf') finalSpe = Math.floor(finalSpe * 1.5);
  if (STATE.modifiers.tailDef) finalSpe *= 2;

  const spSum = d.sps.hp + d.sps.def + d.sps.spd + d.sps.spe;
  const preset = matchedPreset(d.sps);

  function runSearch(q) {
    setQuery(q);
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

  const reg = REGULATIONS[STATE.format];
  const badgeText = reg ? reg.short : 'National Dex';
  const badgeColor = reg
    ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30'
    : 'bg-slate-800/60 text-slate-400 border border-slate-700/30';

  const lockedSel =
    'w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-slate-400 cursor-not-allowed';
  const liveSel =
    'w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500 text-slate-100 cursor-pointer';

  return html`
    <!-- Card 1: Defender Profile & Selection -->
    <div class="bg-slate-800 border border-slate-700 border-t-2 border-t-blue-500/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4 pokemon-card">
      <div class="flex justify-between items-center border-b border-slate-700 pb-2.5">
        <h2 class="text-sm font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-shield-halved text-xs"></i> Defender
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
          <input type="text" placeholder="Search (e.g. Amoonguss, Garchomp...)" autofocus
            value=${query} onInput=${(e) => runSearch(e.target.value)}
            class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-100 focus:outline-none focus:border-slate-500 transition" />
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-500 text-[10px]"></i>
          ${spinner && html`<div class="absolute right-3 top-2"><img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/479.png" alt="Loading" class="w-6 h-6 animate-spin" style="image-rendering: pixelated;" /></div>`}
        </div>
        ${
          results.length > 0 &&
          html`
        <div class="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          ${results.map(
            (p) => html`
            <button onClick=${() => pick(p)}
              class="w-full text-left hover:bg-slate-700/50 px-4 py-2.5 text-xs font-bold border-b border-slate-750 flex justify-between items-center transition">
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
          <img src=${selected ? d.sprite : GHOST_SPRITE} alt="Defender"
            class=${`w-24 h-24 object-contain bg-slate-900 rounded-xl p-1 shadow-inner border border-slate-700/40 ${selected ? '' : 'opacity-20 animate-pulse'}`} />
          <div class="flex-1 min-w-0 flex flex-col items-center text-center gap-1">
            <div>${tag && html`<span class=${`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${tag.cls}`}>${tag.text}</span>`}</div>
            <h3 class="font-black text-base truncate text-slate-100 w-full">${d.name || 'Select a Pokemon'}</h3>
            <div class="flex gap-1.5 justify-center w-full">
              ${(d.types && d.types.length ? d.types : ['???']).map((t) =>
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
          <${StatBars} base=${d.baseStats} show=${selected} />
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
          <select value=${d.nature} onChange=${(e) =>
            update((s) => {
              s.defender.nature = e.target.value;
            })} class=${liveSel}>
            ${NATURES.map((n) => html`<option value=${n.id}>${n.name}</option>`)}
          </select>
        </div>
      </div>

      <!-- Item & Ability -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-left">Held Item</label>
          <select value=${d.item} disabled=${isMega} onChange=${(e) =>
            update((s) => {
              s.defender.item = e.target.value;
            })}
            class=${isMega ? `${lockedSel} text-xs` : liveSel}>
            <option value="none">No defensive item</option>
            <option value="assault_vest">Assault Vest (1.5x SpD)</option>
            <option value="eviolite">Eviolite (1.5x Def/SpD)</option>
            <option value="berries">Super effective Berry (0.5x)</option>
            <option value="choice_scarf">Choice Scarf (1.5x Speed)</option>
            <option value="mega_stone">Mega Stone</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-left">Defensive Ability</label>
          <select value=${d.ability} disabled=${isMega} onChange=${(e) =>
            update((s) => {
              s.defender.ability = e.target.value;
            })} class=${isMega ? lockedSel : liveSel}>
            <option value="none">No defensive ability</option>
            ${learnable.map((ab) => html`<option value=${ab.apiName}>${ab.name}</option>`)}
          </select>
        </div>
      </div>

      <!-- Stats dashboard (HP has no boost) -->
      <div class="bg-slate-900/40 border border-slate-700 rounded-xl p-3">
        <div class="grid grid-cols-4 gap-2 text-[10px]">
          <div class="flex flex-col gap-1 text-left">
            <div class="flex justify-between items-center text-slate-300 font-extrabold uppercase text-[9px] tracking-wider">
              <span>HP</span><span class="text-blue-400 text-xs font-black">${selected ? finalHp : '---'}</span>
            </div>
            <div class="text-[8px] text-slate-500 italic mt-2.5">No Boost</div>
          </div>
          <${BoostCol} label="Def" value=${finalDef} statKey="def" show=${selected} />
          <${BoostCol} label="SpD" value=${finalSpd} statKey="spd" show=${selected} />
          <${BoostCol} label="Speed" value=${finalSpe} statKey="spe" show=${selected} />
        </div>
      </div>
    </div>

    <!-- Card 3: SP Allocations -->
    <div class="bg-slate-800 border border-slate-700 border-t-2 border-t-blue-500/80 rounded-2xl p-5 shadow-xl flex flex-col gap-4 pokemon-card">
      <div class="flex justify-between items-center border-b border-slate-700 pb-2.5">
        <h2 class="text-sm font-black text-blue-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-sliders text-xs"></i> SP Allocations
        </h2>
        <select value=${preset}
          onChange=${(e) => {
            const v = e.target.value;
            if (!v) return;
            const p = PRESETS[v];
            update((s) => {
              s.defender.sps.hp = p.hp;
              s.defender.sps.def = p.def;
              s.defender.sps.spd = p.spd;
              s.defender.sps.spe = p.spe;
            });
          }}
          class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-300 cursor-pointer focus:outline-none focus:border-red-500">
          <option value="">-- Presets --</option>
          <option value="max_phys_bulk">Max Physical Bulk</option>
          <option value="max_spec_bulk">Max Special Bulk</option>
          <option value="balanced_def">Balanced Defense</option>
          <option value="fast_bulky">Fast Bulky</option>
        </select>
      </div>
      <div class="flex justify-between items-center text-xs font-mono text-slate-400 -mt-1">
        <span>Status sum:</span>
        <span class=${spSum > 66 ? 'font-bold text-red-400' : 'font-bold'}>Used: ${spSum}/66 SP</span>
      </div>
      <div class="flex flex-col gap-3.5 text-xs">
        ${[
          ['hp', 'HP SP:', 'text-blue-400', 'accent-blue-500'],
          ['def', 'Defense SP:', 'text-indigo-400', 'accent-indigo-500'],
          ['spd', 'Sp. Def SP:', 'text-teal-400', 'accent-teal-500'],
          ['spe', 'Speed SP:', 'text-amber-400', 'accent-amber-500'],
        ].map(
          ([key, label, textColor, accent]) => html`
          <div>
            <div class="flex justify-between font-mono mb-1">
              <span>${label}</span><span class=${`font-bold ${textColor}`}>${d.sps[key]}</span>
            </div>
            <input type="range" min="0" max="32" step="1" value=${String(d.sps[key])}
              onInput=${(e) =>
                update((s) => {
                  s.defender.sps[key] = parseInt(e.target.value) || 0;
                })}
              class=${`w-full ${accent} bg-slate-700 rounded-lg appearance-none cursor-pointer`} />
          </div>`
        )}
      </div>
    </div>`;
}
