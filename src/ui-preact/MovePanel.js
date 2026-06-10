// Attack Selection — Preact sub-panel of the center column. Move dropdown (built
// from the attacker's learnset minus status moves) + type/category/power. A named
// move shows resolved badges (read-only); "Custom Move" exposes editable inputs.
// Replaces the move-select handler + updateMoveDetailsVisuals/setMoveTypeBadge.
import { html } from './preact.js';
import { STATE, CACHE, update } from './store.js';
import { getTypeBgClass } from '../ui/render.js';
import { ALL_TYPES } from '../data/constants.js';
import { resolveEffectiveMove } from '../engine/damage.js';
import { isSpreadMove } from '../data/moves.js';
import { fetchMoveDetails } from '../api/pokeapi.js';

function damagingMoves() {
  return (STATE.attacker.moves || [])
    .filter((m) => !CACHE.statusMoves[m.apiName])
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Monotonic token: every selection bumps it, and a fetch only applies if it's
// still the latest. Guards against out-of-order resolution — picking move Y
// after X must not be overwritten when X's slower fetch lands second.
let selectToken = 0;

async function onSelect(value) {
  const token = ++selectToken;
  if (value === 'custom') {
    update((s) => {
      s.move.apiName = '';
      s.move.name = 'Custom Move';
      s.move.spread = false;
    });
    return;
  }
  try {
    const mv = await fetchMoveDetails(value);
    if (token !== selectToken) return; // a newer selection superseded this one
    const entry = (STATE.attacker.moves || []).find((m) => m.apiName === value);
    update((s) => {
      s.move.apiName = mv.apiName;
      s.move.name = entry ? entry.name : mv.apiName;
      s.move.type = mv.type;
      s.move.category = mv.category.toLowerCase();
      s.move.power = mv.power; // base power; resolved BP is computed for display
      // Sync the Spread Move (0.75x) modifier to the selected move so its 0.75x
      // multiplier follows the choice automatically (#71 follow-up). User can still
      // override the toggle afterward; move.spread records capability for the card's
      // Spread/Non-Spread tag.
      s.move.spread = isSpreadMove(mv);
      s.modifiers.spread = s.move.spread;
    });
  } catch (err) {
    console.error('Error fetching move info', err);
  }
}

export function MovePanel() {
  const move = STATE.move;
  const isCustom = !move.apiName;
  const moves = damagingMoves();

  // Variable moves (Weather Ball) resolve their effective type/BP from battle
  // state for display; STATE.move stays at base so the engine doubles once.
  const eff = resolveEffectiveMove(STATE.attacker, move, STATE.modifiers, STATE.defender);
  const isPhysical = move.category.toLowerCase() === 'physical';
  const catColor = isPhysical
    ? 'bg-red-950/30 text-red-400 border border-red-900/30'
    : 'bg-purple-950/30 text-purple-400 border border-purple-900/30';
  const catIcon = isPhysical ? 'fa-hand-fist' : 'fa-wand-magic-sparkles';
  const catText = isPhysical ? 'Physical' : 'Special';

  return html`
    <div class="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3.5 pokemon-card">
      <h3 class="text-sm font-extrabold text-red-400 flex items-center gap-2 border-b border-slate-700 pb-2">
        <i class="fa-solid fa-hand-fist"></i> Attack Selection
      </h3>

      <div class="flex flex-col gap-1.5 text-xs">
        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Select Move</label>
        <select value=${move.apiName || 'custom'} onChange=${(e) => onSelect(e.target.value)}
          class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer">
          <option value="custom">--- Custom Move ---</option>
          ${moves.map((m) => html`<option value=${m.apiName}>${m.name}</option>`)}
        </select>
      </div>

      <div class="flex items-center justify-between gap-2.5 mt-1.5 bg-slate-900/45 border border-slate-700 rounded-xl p-3 text-xs font-bold shadow-inner">
        <!-- Type -->
        <div class="flex flex-col gap-1.5 text-left">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Type</span>
          ${
            isCustom
              ? html`<select value=${move.type} onChange=${(e) =>
                  update((s) => {
                    s.move.type = e.target.value;
                  })}
                class="bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-[10px] focus:outline-none focus:border-amber-500 text-slate-100 cursor-pointer">
                ${ALL_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
              </select>`
              : html`<div class="flex items-center h-6">
                <span class=${`text-[10px] px-2 py-0.5 font-black uppercase rounded ${getTypeBgClass(eff.type)} text-white shadow-sm select-none`}>${eff.type}</span>
              </div>`
          }
        </div>

        <!-- Category -->
        <div class="flex flex-col gap-1.5 text-left border-l border-slate-800 pl-3.5">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Category</span>
          ${
            isCustom
              ? html`<select value=${move.category} onChange=${(e) =>
                  update((s) => {
                    s.move.category = e.target.value;
                  })}
                class="bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-[10px] focus:outline-none focus:border-amber-500 text-slate-100 cursor-pointer">
                <option value="physical">Physical</option><option value="special">Special</option>
              </select>`
              : html`<div class="flex items-center h-6">
                <span class=${`text-[10px] px-2 py-0.5 font-extrabold uppercase rounded ${catColor} flex items-center gap-1 shadow-sm select-none`}>
                  <i class=${`fa-solid ${catIcon} text-[9px]`}></i> ${catText}
                </span>
              </div>`
          }
        </div>

        <!-- Power -->
        <div class="flex flex-col gap-1.5 text-right border-l border-slate-800 pl-3.5">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Power</span>
          <div class="flex items-center justify-end gap-1 h-6">
            ${
              isCustom
                ? html`<input type="number" min="0" max="250" value=${String(move.power)}
                  onInput=${(e) =>
                    update((s) => {
                      s.move.power = parseInt(e.target.value) || 0;
                    })}
                  class="w-10 bg-slate-900 border border-slate-700 rounded-lg text-center text-xs text-amber-400 focus:outline-none focus:border-amber-500 font-black font-mono py-0.5 focus:ring-1 focus:ring-amber-500/30" />`
                : html`<span class="w-10 bg-transparent font-black font-mono text-sm text-right text-amber-400 py-0">${eff.power}</span>`
            }
            <span class="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider shrink-0">BP</span>
          </div>
        </div>
      </div>
    </div>`;
}
