// Battle Modifiers — Preact sub-panel of the center column. 8 checkbox toggles
// + weather/terrain/aura selects. Replaces updateDropdownColors (the select color
// maps) and the Fairy-Aura aura lock; burn lives on STATE.attacker.status.
import { html } from './preact.js';
import { STATE, update } from './store.js';
import { BOOST_STAGES } from './card-common.js';

// Checkbox cells: [statePath, label, checkedTheme]. burned reads/writes
// attacker.status; the rest are STATE.modifiers booleans.
const CELLS = [
  ['spread', 'Spread Move (0.75x)', 'peer-checked:bg-amber-950/30 peer-checked:text-amber-300'],
  ['crit', 'Crit Hit (1.5x)', 'peer-checked:bg-amber-950/30 peer-checked:text-amber-300'],
  [
    'friendGuard',
    'Friend Guard (0.75x)',
    'peer-checked:bg-emerald-950/30 peer-checked:text-emerald-300',
  ],
  ['screens', 'Screens (0.66x)', 'peer-checked:bg-emerald-950/30 peer-checked:text-emerald-300'],
  ['burned', 'Burned (0.5x Phys)', 'peer-checked:bg-orange-950/30 peer-checked:text-orange-300'],
  ['helpingHand', 'Helping Hand (1.5x)', 'peer-checked:bg-rose-950/30 peer-checked:text-rose-300'],
  ['tailAtk', 'Atk Tailwind (2.0x)', 'peer-checked:bg-blue-950/30 peer-checked:text-blue-300'],
  ['tailDef', 'Def Tailwind (2.0x)', 'peer-checked:bg-blue-950/30 peer-checked:text-blue-300'],
  [
    'boosterActive',
    'Paradox Boost (1.3x)',
    'peer-checked:bg-purple-950/30 peer-checked:text-purple-300',
  ],
  ['pinchActive', 'Pinch / Low HP', 'peer-checked:bg-red-950/30 peer-checked:text-red-300'],
];

// Per-value select color classes (mirrors updateDropdownColors in render.js).
const WEATHER = {
  none: 'bg-slate-900/45 border-slate-700 text-slate-400',
  sun: 'bg-red-950/40 border-red-500/50 text-red-300',
  rain: 'bg-blue-950/40 border-blue-500/50 text-blue-300',
  sandstorm: 'bg-amber-950/40 border-amber-500/50 text-amber-300',
  snow: 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300',
};
const TERRAIN = {
  none: 'bg-slate-900/45 border-slate-700 text-slate-400',
  electric: 'bg-yellow-950/40 border-yellow-500/50 text-yellow-300',
  grassy: 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300',
  psychic: 'bg-purple-950/40 border-purple-500/50 text-purple-300',
  misty: 'bg-pink-950/40 border-pink-500/50 text-pink-300',
};
const AURA = {
  none: 'bg-slate-900/45 border-slate-700 text-slate-400',
  fairy: 'bg-pink-950/40 border-pink-500/50 text-pink-300',
  dark: 'bg-stone-950/40 border-stone-500/50 text-stone-300',
};
const selCls = (map, v) =>
  `w-full border rounded-lg py-1.5 px-2 text-[10px] focus:outline-none cursor-pointer font-bold transition-all duration-200 ${map[v] || map.none}`;

function isChecked(key) {
  return key === 'burned' ? STATE.attacker.status === 'burned' : !!STATE.modifiers[key];
}
function toggle(key, checked) {
  update((s) => {
    if (key === 'burned') s.attacker.status = checked ? 'burned' : null;
    else s.modifiers[key] = checked;
  });
}

// Moves whose damage needs a piece of battle state the general toggles don't
// cover. The relevant control surfaces in MoveContext only while one of these is
// the selected move, so the panel stays uncluttered the rest of the time.
const MOVES_FIRST = ['bolt-beak', 'fishious-rend', 'payback'];
const HP_DEPENDENT = ['wring-out', 'crush-grip', 'brine'];

const ctxSel =
  'bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200 cursor-pointer focus:outline-none focus:border-amber-500';

// One labeled row of the move-context block.
const CtxRow = ({ label, children }) => html`
  <div class="flex items-center justify-between gap-2">
    <span class="text-[10px] font-bold text-slate-400">${label}</span>
    ${children}
  </div>`;

const boostSelect = (value, onChange) => html`
  <select value=${String(value)} onChange=${onChange} class=${ctxSel}>
    ${BOOST_STAGES.map((n) => html`<option value=${String(n)}>${n >= 0 ? `+${n}` : n}</option>`)}
  </select>`;

// Per-move inputs for the handful of moves that read extra battle state (Body
// Press's user Defense, Foul Play's target Attack, Hex's target status, the
// movesFirst override, target-HP scaling, Assurance's turn flag). Returns null
// when the selected move needs none of them.
function MoveContext() {
  const apiName = STATE.move.apiName;
  const m = STATE.modifiers;
  const rows = [];

  if (apiName === 'body-press') {
    rows.push(
      html`<${CtxRow} label="User Defense boost">
        ${boostSelect(STATE.attacker.boosts.def, (e) =>
          update((s) => {
            s.attacker.boosts.def = parseInt(e.target.value) || 0;
          })
        )}
      </>`
    );
  }
  if (apiName === 'foul-play') {
    rows.push(
      html`<${CtxRow} label="Target Attack boost">
        ${boostSelect(STATE.defender.boosts.atk, (e) =>
          update((s) => {
            s.defender.boosts.atk = parseInt(e.target.value) || 0;
          })
        )}
      </>`
    );
  }
  if (apiName === 'hex') {
    rows.push(
      html`<${CtxRow} label="Target is statused (2x)">
        <input type="checkbox" class="accent-amber-500 cursor-pointer"
          checked=${!!STATE.defender.status}
          onChange=${(e) =>
            update((s) => {
              s.defender.status = e.target.checked ? 'poisoned' : null;
            })} />
      </>`
    );
  }
  if (MOVES_FIRST.includes(apiName)) {
    const val = m.movesFirst == null ? 'auto' : m.movesFirst ? 'first' : 'last';
    rows.push(
      html`<${CtxRow} label="Turn order">
        <select value=${val} class=${ctxSel}
          onChange=${(e) =>
            update((s) => {
              const v = e.target.value;
              s.modifiers.movesFirst = v === 'auto' ? null : v === 'first';
            })}>
          <option value="auto">Auto (by Speed)</option>
          <option value="first">Moves first</option>
          <option value="last">Moves last</option>
        </select>
      </>`
    );
  }
  if (HP_DEPENDENT.includes(apiName)) {
    rows.push(
      html`<${CtxRow} label="Target HP %">
        <input type="number" min="1" max="100" value=${String(m.defenderHpPercent)}
          class=${ctxSel + ' w-14 text-right'}
          onInput=${(e) =>
            update((s) => {
              const n = parseInt(e.target.value);
              s.modifiers.defenderHpPercent = Number.isNaN(n) ? 100 : Math.min(100, Math.max(1, n));
            })} />
      </>`
    );
  }
  if (apiName === 'assurance') {
    rows.push(
      html`<${CtxRow} label="Target already damaged (2x)">
        <input type="checkbox" class="accent-amber-500 cursor-pointer"
          checked=${!!m.targetDamaged}
          onChange=${(e) =>
            update((s) => {
              s.modifiers.targetDamaged = e.target.checked;
            })} />
      </>`
    );
  }

  if (!rows.length) return null;
  return html`
    <div class="flex flex-col gap-2 border-t border-slate-700/40 pt-3.5">
      <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">
        ${STATE.move.name} Options
      </label>
      ${rows}
    </div>`;
}

export function ModifiersPanel() {
  const m = STATE.modifiers;
  // Fairy Aura / Dark Aura lock the field aura to their type (the ability sets it).
  const auraAbility =
    STATE.attacker.ability === 'fairy-aura'
      ? 'fairy'
      : STATE.attacker.ability === 'dark-aura'
        ? 'dark'
        : null;
  const auraLocked = auraAbility !== null;
  const auraVal = auraLocked ? auraAbility : m.aura;

  return html`
    <div class="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3.5 pokemon-card">
      <h3 class="text-sm font-extrabold text-amber-400 flex items-center gap-2 border-b border-slate-700 pb-2">
        <i class="fa-solid fa-people-group"></i> Battle Modifiers
      </h3>

      <div class="bg-slate-900/45 border border-slate-700 rounded-xl overflow-hidden grid grid-cols-2 divide-x divide-y divide-slate-700 shadow-inner">
        ${CELLS.map(
          ([key, label, theme]) => html`
          <label class="relative cursor-pointer select-none h-8 flex items-center justify-center">
            <input type="checkbox" class="sr-only peer" checked=${isChecked(key)}
              onChange=${(e) => toggle(key, e.target.checked)} />
            <div class=${`w-full h-full flex items-center justify-center text-[10px] sm:text-[11px] text-slate-400 ${theme} hover:bg-slate-800/35 transition-all duration-150 font-bold`}>
              ${label}
            </div>
          </label>`
        )}
      </div>

      <div class="grid grid-cols-3 gap-2 text-xs border-t border-slate-700/40 pt-3.5">
        <div class="flex flex-col gap-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">Weather</label>
          <select value=${m.weather} onChange=${(e) =>
            update((s) => {
              s.modifiers.weather = e.target.value;
            })} class=${selCls(WEATHER, m.weather)}>
            <option value="none">None</option><option value="sun">Sun</option><option value="rain">Rain</option>
            <option value="sandstorm">Sand</option><option value="snow">Snow</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">Terrain</label>
          <select value=${m.terrain} onChange=${(e) =>
            update((s) => {
              s.modifiers.terrain = e.target.value;
            })} class=${selCls(TERRAIN, m.terrain)}>
            <option value="none">None</option><option value="electric">Electric</option><option value="grassy">Grassy</option>
            <option value="psychic">Psychic</option><option value="misty">Misty</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">Aura</label>
          <select value=${auraVal} disabled=${auraLocked}
            onChange=${(e) =>
              update((s) => {
                s.modifiers.aura = e.target.value;
              })}
            class=${auraLocked ? selCls(AURA, 'fairy') + ' cursor-not-allowed opacity-80' : selCls(AURA, auraVal)}>
            <option value="none">None</option><option value="fairy">Fairy</option><option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <${MoveContext} />
    </div>`;
}
