// Battle Modifiers — Preact sub-panel of the center column. 8 checkbox toggles
// + weather/terrain/aura selects. Replaces updateDropdownColors (the select color
// maps) and the Fairy-Aura aura lock; burn lives on STATE.attacker.status.
import { html } from './preact.js';
import { STATE, update } from './store.js';

// Checkbox cells: [statePath, label, checkedTheme]. burned reads/writes
// attacker.status; the rest are STATE.modifiers booleans.
const CELLS = [
  ['spread', 'Spread Move (0.75x)', 'peer-checked:bg-amber-950/30 peer-checked:text-amber-300'],
  ['crit', 'Crit Hit (1.5x)', 'peer-checked:bg-amber-950/30 peer-checked:text-amber-300'],
  ['friendGuard', 'Friend Guard (0.75x)', 'peer-checked:bg-emerald-950/30 peer-checked:text-emerald-300'],
  ['screens', 'Screens (0.66x)', 'peer-checked:bg-emerald-950/30 peer-checked:text-emerald-300'],
  ['burned', 'Burned (0.5x Phys)', 'peer-checked:bg-orange-950/30 peer-checked:text-orange-300'],
  ['helpingHand', 'Helping Hand (1.5x)', 'peer-checked:bg-rose-950/30 peer-checked:text-rose-300'],
  ['tailAtk', 'Atk Tailwind (2.0x)', 'peer-checked:bg-blue-950/30 peer-checked:text-blue-300'],
  ['tailDef', 'Def Tailwind (2.0x)', 'peer-checked:bg-blue-950/30 peer-checked:text-blue-300'],
];

// Per-value select color classes (mirrors updateDropdownColors in render.js).
const WEATHER = {
  none: 'bg-slate-900/45 border-slate-700 text-slate-400', sun: 'bg-red-950/40 border-red-500/50 text-red-300',
  rain: 'bg-blue-950/40 border-blue-500/50 text-blue-300', sandstorm: 'bg-amber-950/40 border-amber-500/50 text-amber-300',
  snow: 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300',
};
const TERRAIN = {
  none: 'bg-slate-900/45 border-slate-700 text-slate-400', electric: 'bg-yellow-950/40 border-yellow-500/50 text-yellow-300',
  grassy: 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300', psychic: 'bg-purple-950/40 border-purple-500/50 text-purple-300',
  misty: 'bg-pink-950/40 border-pink-500/50 text-pink-300',
};
const AURA = {
  none: 'bg-slate-900/45 border-slate-700 text-slate-400', fairy: 'bg-pink-950/40 border-pink-500/50 text-pink-300',
  dark: 'bg-stone-950/40 border-stone-500/50 text-stone-300',
};
const selCls = (map, v) => `w-full border rounded-lg py-1.5 px-2 text-[10px] focus:outline-none cursor-pointer font-bold transition-all duration-200 ${map[v] || map.none}`;

function isChecked(key) {
  return key === 'burned' ? STATE.attacker.status === 'burned' : !!STATE.modifiers[key];
}
function toggle(key, checked) {
  update((s) => {
    if (key === 'burned') s.attacker.status = checked ? 'burned' : null;
    else s.modifiers[key] = checked;
  });
}

export function ModifiersPanel() {
  const m = STATE.modifiers;
  const auraLocked = STATE.attacker.ability === 'fairy-aura';
  const auraVal = auraLocked ? 'fairy' : m.aura;

  return html`
    <div class="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3.5 pokemon-card">
      <h3 class="text-sm font-extrabold text-amber-400 flex items-center gap-2 border-b border-slate-700 pb-2">
        <i class="fa-solid fa-people-group"></i> Battle Modifiers
      </h3>

      <div class="bg-slate-900/45 border border-slate-700 rounded-xl overflow-hidden grid grid-cols-2 divide-x divide-y divide-slate-700 shadow-inner">
        ${CELLS.map(([key, label, theme]) => html`
          <label class="relative cursor-pointer select-none h-10 flex items-center justify-center">
            <input type="checkbox" class="sr-only peer" checked=${isChecked(key)}
              onChange=${(e) => toggle(key, e.target.checked)} />
            <div class=${`w-full h-full flex items-center justify-center text-[10px] sm:text-xs text-slate-400 ${theme} hover:bg-slate-800/35 transition-all duration-150 font-bold`}>
              ${label}
            </div>
          </label>`)}
      </div>

      <div class="grid grid-cols-3 gap-2 text-xs border-t border-slate-700/40 pt-3.5">
        <div class="flex flex-col gap-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">Weather</label>
          <select value=${m.weather} onChange=${(e) => update((s) => { s.modifiers.weather = e.target.value; })} class=${selCls(WEATHER, m.weather)}>
            <option value="none">None</option><option value="sun">Sun</option><option value="rain">Rain</option>
            <option value="sandstorm">Sand</option><option value="snow">Snow</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">Terrain</label>
          <select value=${m.terrain} onChange=${(e) => update((s) => { s.modifiers.terrain = e.target.value; })} class=${selCls(TERRAIN, m.terrain)}>
            <option value="none">None</option><option value="electric">Electric</option><option value="grassy">Grassy</option>
            <option value="psychic">Psychic</option><option value="misty">Misty</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-wider text-left">Aura</label>
          <select value=${auraVal} disabled=${auraLocked}
            onChange=${(e) => update((s) => { s.modifiers.aura = e.target.value; })}
            class=${auraLocked ? selCls(AURA, 'fairy') + ' cursor-not-allowed opacity-80' : selCls(AURA, auraVal)}>
            <option value="none">None</option><option value="fairy">Fairy</option><option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </div>`;
}
