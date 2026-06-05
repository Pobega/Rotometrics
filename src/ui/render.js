// Pure-ish UI render helpers. These do not read or mutate STATE; they take
// data and write to the DOM. Anything that needs STATE stays in app.js.

import { DOM } from './dom.js';

const TYPE_BG_CLASSES = {
  Normal: 'bg-neutral-500',
  Fire: 'bg-orange-600',
  Water: 'bg-blue-500',
  Grass: 'bg-green-600',
  Electric: 'bg-yellow-500',
  Ice: 'bg-cyan-400 text-slate-900',
  Fighting: 'bg-red-700',
  Poison: 'bg-purple-600',
  Ground: 'bg-amber-600',
  Flying: 'bg-indigo-400 text-slate-900',
  Psychic: 'bg-pink-600',
  Bug: 'bg-lime-600',
  Rock: 'bg-yellow-700',
  Ghost: 'bg-violet-700',
  Dragon: 'bg-indigo-700',
  Dark: 'bg-stone-800',
  Steel: 'bg-slate-500',
  Fairy: 'bg-pink-400 text-slate-900',
};

export function getTypeBgClass(type) {
  return TYPE_BG_CLASSES[type] || 'bg-slate-700';
}

// Escape a value for safe interpolation into an HTML string (text or quoted
// attribute contexts). Used by the dex/attackdex row builders, whose data comes
// from PokéAPI and is concatenated into innerHTML.
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Reflect the loaded roster size in the calculator's search placeholders. The
// API module stays DOM-free and returns { count, fallback }; the wording lives
// here. Called after the roster loads (on startup and when the Pokédex triggers
// the background fetch).
export function setSearchPlaceholders({ count, fallback }) {
  const label = fallback ? 'Fallbacks loaded' : `${count} loaded`;
  // Both search inputs now live in the Preact islands, so their refs may be absent
  // here; guard the writes (kept for the pre-island vanilla layout / tests).
  if (DOM.attackerSearch) DOM.attackerSearch.placeholder = `Search Attacker (${label})...`;
  if (DOM.defenderSearch) DOM.defenderSearch.placeholder = `Search Defender (${label})...`;
}

const NATURE_DISPLAY = {
  'neutral': 'Neutral',
  '+atk': '+Atk',
  '+spa': '+SpAtk',
  '+def': '+Def',
  '+spd': '+SpDef',
  '+spe': '+Spe',
};

export function formatNatureDisplayName(natId) {
  return NATURE_DISPLAY[natId.toLowerCase()] || natId;
}

export function createOptionCardHTML(title, nature, hpVal, defVal, statName, totalSP, themeColor) {
  const isSurvival = themeColor === 'blue';
  const themeText = isSurvival ? 'text-blue-400' : 'text-amber-400';
  const themeBg = isSurvival ? 'bg-blue-950/25 border-blue-900/40 hover:border-blue-800/60' : 'bg-amber-950/25 border-amber-900/40 hover:border-amber-800/60';
  const themeBtn = isSurvival ? 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-800' : 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-800';

  const natureFormatted = formatNatureDisplayName(nature);

  return `
    <div class="border rounded-xl p-3 flex flex-col gap-2 transition text-left ${themeBg}">
      <div class="flex justify-between items-start gap-3">
        <div>
          <div class="text-[9px] text-slate-400 uppercase font-extrabold tracking-wider">${title}</div>
          <div class="text-xs font-black text-white mt-0.5">
            Nature: <span class="${themeText}">${natureFormatted}</span>
          </div>
        </div>
        <button class="apply-opt-btn ${themeBtn} text-white text-[9px] font-bold py-1 px-2 rounded-lg transition shrink-0"
          data-type="${isSurvival ? 'survival' : 'offensive'}"
          data-nature="${nature}"
          ${isSurvival ? `data-hp="${hpVal}" data-def="${defVal}" data-stat="${statName.toLowerCase()}"` : `data-ev="${hpVal}" data-stat="${statName.toLowerCase()}"`}>
          Apply All
        </button>
      </div>
      <div class="flex justify-between items-center text-[10px] border-t border-slate-800 pt-1.5 text-slate-400 font-mono">
        <span>Spread: <span class="font-bold text-slate-200">${isSurvival ? `${hpVal} HP / ${defVal} ${statName}` : `${hpVal} ${statName.toUpperCase()}`}</span></span>
        <span>Total: <span class="font-bold text-slate-200">${totalSP} SP</span></span>
      </div>
    </div>
  `;
}

export function createImpossibleOptionCardHTML(title, nature, themeColor) {
  const isSurvival = themeColor === 'blue';
  const themeBg = 'bg-slate-800/10 border-slate-800/50';

  const natureFormatted = formatNatureDisplayName(nature);

  return `
    <div class="border rounded-xl p-3 flex flex-col gap-1.5 opacity-40 cursor-not-allowed text-left ${themeBg}">
      <div class="flex justify-between items-start">
        <div>
          <div class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">${title}</div>
          <div class="text-xs font-bold text-slate-400 mt-0.5">
            Nature: <span>${natureFormatted}</span>
          </div>
        </div>
        <span class="text-[9px] text-slate-500 font-bold border border-slate-800 px-1.5 py-0.5 rounded-lg shrink-0">
          Impossible
        </span>
      </div>
      <p class="text-[9px] text-slate-500 italic border-t border-slate-800/30 pt-1">Requires > 66 SP to achieve survival/KO</p>
    </div>
  `;
}

export function updateStatsBars(baseStats, prefix) {
  const container = document.getElementById(`${prefix}-stats-bars`);
  if (!container) return;

  container.classList.remove('hidden');

  const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  stats.forEach(stat => {
    const valEl = document.getElementById(`${prefix}-bar-${stat}-val`);
    const barEl = document.getElementById(`${prefix}-bar-${stat}`);
    if (valEl && barEl) {
      const baseVal = baseStats[stat];
      valEl.textContent = baseVal;

      const pct = Math.min(100, Math.max(5, (baseVal / 200) * 100));
      barEl.style.width = `${pct}%`;
    }
  });
}

export function updateDropdownColors() {
  const weather = DOM.modWeatherSelect.value;
  const weatherClasses = {
    none: "bg-slate-900/45 border-slate-700 text-slate-400",
    sun: "bg-red-950/40 border-red-500/50 text-red-300",
    rain: "bg-blue-950/40 border-blue-500/50 text-blue-300",
    sandstorm: "bg-amber-950/40 border-amber-500/50 text-amber-300",
    snow: "bg-cyan-950/40 border-cyan-500/50 text-cyan-300"
  };
  DOM.modWeatherSelect.className = `w-full border rounded-lg py-1.5 px-2 text-[10px] focus:outline-none cursor-pointer font-bold transition-all duration-200 ${weatherClasses[weather] || weatherClasses.none}`;

  const terrain = DOM.modTerrainSelect.value;
  const terrainClasses = {
    none: "bg-slate-900/45 border-slate-700 text-slate-400",
    electric: "bg-yellow-950/40 border-yellow-500/50 text-yellow-300",
    grassy: "bg-emerald-950/40 border-emerald-500/50 text-emerald-300",
    psychic: "bg-purple-950/40 border-purple-500/50 text-purple-300",
    misty: "bg-pink-950/40 border-pink-500/50 text-pink-300"
  };
  DOM.modTerrainSelect.className = `w-full border rounded-lg py-1.5 px-2 text-[10px] focus:outline-none cursor-pointer font-bold transition-all duration-200 ${terrainClasses[terrain] || terrainClasses.none}`;

  const aura = DOM.modAuraSelect.value;
  const auraClasses = {
    none: "bg-slate-900/45 border-slate-700 text-slate-400",
    fairy: "bg-pink-950/40 border-pink-500/50 text-pink-300",
    dark: "bg-stone-950/40 border-stone-500/50 text-stone-300"
  };
  DOM.modAuraSelect.className = `w-full border rounded-lg py-1.5 px-2 text-[10px] focus:outline-none cursor-pointer font-bold transition-all duration-200 ${auraClasses[aura] || auraClasses.none}`;
}

export function setMoveTypeBadge(type) {
  DOM.moveTypeBadgeContainer.innerHTML = `
      <span class="text-[10px] px-2 py-0.5 font-black uppercase rounded ${getTypeBgClass(type)} text-white shadow-sm select-none">${type}</span>
    `;
}

export function updateMoveDetailsVisuals(type, category, isCustom) {
  if (isCustom) {
    DOM.moveTypeBadgeContainer.innerHTML = "";
    DOM.moveCategoryBadgeContainer.innerHTML = "";

    DOM.moveType.classList.remove('hidden');
    DOM.moveCategory.classList.remove('hidden');

    DOM.movePower.disabled = false;
    DOM.movePower.className = "w-10 bg-slate-900 border border-slate-700 rounded-lg text-center text-xs text-amber-400 focus:outline-none focus:border-amber-500 font-black font-mono py-0.5 focus:ring-1 focus:ring-amber-500/30";
  } else {
    DOM.moveType.classList.add('hidden');
    DOM.moveCategory.classList.add('hidden');

    DOM.moveType.value = type;
    DOM.moveCategory.value = category.toLowerCase();

    setMoveTypeBadge(type);

    const isPhysical = category.toLowerCase() === 'physical';
    const catColor = isPhysical ? 'bg-red-950/30 text-red-400 border border-red-900/30' : 'bg-purple-950/30 text-purple-400 border border-purple-900/30';
    const catIcon = isPhysical ? 'fa-hand-fist' : 'fa-wand-magic-sparkles';
    const catText = isPhysical ? 'Physical' : 'Special';
    DOM.moveCategoryBadgeContainer.innerHTML = `
      <span class="text-[10px] px-2 py-0.5 font-extrabold uppercase rounded ${catColor} flex items-center gap-1 shadow-sm select-none">
        <i class="fa-solid ${catIcon} text-[9px]"></i> ${catText}
      </span>
    `;

    DOM.movePower.disabled = true;
    DOM.movePower.className = "w-10 bg-transparent font-black font-mono text-sm text-right text-slate-400 cursor-not-allowed py-0";
  }
}
