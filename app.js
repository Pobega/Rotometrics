// Pokemon Champions VGC SP Optimizer & Damage Calculator
// Pure Client-Side JavaScript ES6+

import { calculateStat, calculateStatBoost } from './src/engine/stats.js';
import { calculateDamageRolls } from './src/engine/damage.js';
import { optimizeSurvivalEVsWithNatures, optimizeOffensiveEVsWithNatures } from './src/engine/optimize.js';
import { bst, sortDex, filterDex, isHiddenForm, isRegulationMALegal } from './src/data/dex.js';
import { exportMatchup, importMatchup } from './src/data/matchup-text.js';
import {
  NATURES,
  ALL_TYPES,
  OFF_VGC_ABILITIES_HELPER,
  DEF_VGC_ABILITIES_HELPER
} from './src/data/constants.js';
import { DOM } from './src/ui/dom.js';
import { STATE, CACHE } from './src/state.js';
import {
  Storage,
  initPokemonList,
  initStatusMovesList,
  initChampionsLegalList,
  fetchPokemonDetails,
  fetchMoveDetails
} from './src/api/pokeapi.js';
import {
  getTypeBgClass,
  createOptionCardHTML,
  createImpossibleOptionCardHTML,
  updateStatsBars,
  updateDropdownColors,
  updateMoveDetailsVisuals,
  setSearchPlaceholders,
} from './src/ui/render.js';
import { setSpeedText, updateResultSummary } from './src/ui/result-summary.js';
import { onDexFormatChange, initDexPage } from './src/ui/dex-page.js';

// ==========================================
// 2. APPLICATION STATE & GLOBAL CACHE
// ==========================================
// STATE and CACHE now live in ./src/state.js (imported at the top of this file)
// so UI modules can share them without importing app.js.

// While applying an imported matchup we set many DOM inputs in sequence and
// own the move selection, so suppress setAttackerDetails' async move auto-pick
// (its late updateLiveStats would otherwise clobber the imported move).
let isApplyingMatchup = false;

// burn lives on attacker.status and the tailwind flags are read straight off
// the DOM in updateLiveStats, so fold them into the modifiers slice for export.
function augmentedState() {
  return {
    ...STATE,
    modifiers: {
      ...STATE.modifiers,
      burn: STATE.attacker.status === 'burned',
      tailAtk: DOM.modTailAtk.checked,
      tailDef: DOM.modTailDef.checked
    }
  };
}


// ==========================================
// 7. UI WORKFLOW & CONTROLLER BINDING
// ==========================================


function populateDropdowns() {
  NATURES.forEach(n => {
    const optAttacker = document.createElement('option');
    optAttacker.value = n.id;
    optAttacker.textContent = n.name;
    DOM.attackerNature.appendChild(optAttacker);

    const optDefender = document.createElement('option');
    optDefender.value = n.id;
    optDefender.textContent = n.name;
    DOM.defenderNature.appendChild(optDefender);
  });

  ALL_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    DOM.moveType.appendChild(opt);
  });

  DOM.attackerNature.value = STATE.attacker.nature;
  DOM.defenderNature.value = STATE.defender.nature;
}

function bindAutocomplete(inputEl, resultsEl, spinnerEl, callback) {
  inputEl.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      resultsEl.classList.add('hidden');
      return;
    }

    let matches = CACHE.pokemonList.filter(p => p.name.toLowerCase().includes(q));
    matches = matches.filter(p => !isHiddenForm(p.apiName));

    if (STATE.format === 'regulation_ma') {
      matches = matches.filter(p => isRegulationMALegal(p.apiName, CACHE.championsLegalList));
    }

    // Dynamic Priority Sorting: Starts-With matches take absolute priority over containing matches!
    matches.sort((a, b) => {
      const aStart = a.name.toLowerCase().startsWith(q);
      const bStart = b.name.toLowerCase().startsWith(q);
      
      if (aStart && !bStart) return -1; // a goes first
      if (!aStart && bStart) return 1;  // b goes first
      
      // If both start with the query (or both contain it in the middle), sort alphabetically!
      return a.name.localeCompare(b.name);
    });

    matches = matches.slice(0, 10);

    if (matches.length === 0) {
      resultsEl.innerHTML = `<div class="p-3 text-slate-500 text-xs">No legal Pokémon found in current format</div>`;
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.innerHTML = matches.map(p => {
      const isRegMA = STATE.format === 'regulation_ma';
      const badgeText = isRegMA ? 'M-A' : 'National Dex';
      const badgeColor = isRegMA 
        ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30' 
        : 'bg-slate-800/60 text-slate-400 border border-slate-700/30';
        
      return `
        <button class="w-full text-left hover:bg-slate-700/50 px-4 py-2.5 text-xs font-bold border-b border-slate-750 flex justify-between items-center transition" data-api-name="${p.apiName}">
          <span>${p.name}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-extrabold border ${badgeColor}">
            ${badgeText}
          </span>
        </button>
      `;
    }).join('');
    resultsEl.classList.remove('hidden');
  });

  resultsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-api-name]');
    if (!btn) return;

    const apiName = btn.dataset.apiName;
    inputEl.value = btn.querySelector('span').textContent;
    resultsEl.classList.add('hidden');

    spinnerEl.classList.remove('hidden');
    try {
      const details = await fetchPokemonDetails(apiName);
      callback(details);
    } catch (err) {
      console.error('Error loading selected Pokemon details', err);
      window.dispatchEvent(new ErrorEvent('error', { error: err, message: "Autocomplete Selection Error: " + err.message }));
    } finally {
      spinnerEl.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !resultsEl.contains(e.target)) {
      resultsEl.classList.add('hidden');
    }
  });
}

// The search field is hidden behind a magnifier in the card header to save
// vertical space. Clicking the magnifier reveals + focuses it; picking a
// Pokémon collapses it again (see collapseSearch in the detail setters).
function bindSearchToggle(toggleBtn, wrapEl, inputEl) {
  if (!toggleBtn || !wrapEl) return;
  toggleBtn.addEventListener('click', () => {
    const willOpen = wrapEl.classList.contains('hidden');
    wrapEl.classList.toggle('hidden', !willOpen);
    toggleBtn.classList.toggle('bg-slate-700/60', willOpen);
    toggleBtn.classList.toggle('text-white', willOpen);
    if (willOpen) { inputEl.focus(); inputEl.select(); }
  });
}

function collapseSearch(wrapEl, toggleBtn) {
  wrapEl?.classList.add('hidden');
  toggleBtn?.classList.remove('bg-slate-700/60', 'text-white');
}

function updateRegulationTag(apiName, tagEl) {
  if (!apiName) {
    tagEl.classList.add('hidden');
    return;
  }
  tagEl.classList.remove('hidden');

  const isRegMA = STATE.format === 'regulation_ma';

  if (isRegMA) {
    const isLegal = isRegulationMALegal(apiName, CACHE.championsLegalList);
    if (isLegal) {
      tagEl.textContent = "Regulation M-A Legal";
      tagEl.className = "text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-green-950 text-green-400 border border-green-900/50";
    } else {
      tagEl.textContent = "Banned in M-A";
      tagEl.className = "text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-red-950 text-red-400 border border-red-900/50";
    }
  } else {
    tagEl.textContent = "National Dex";
    tagEl.className = "text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-slate-800/60 text-slate-400 border border-slate-700/30 border";
  }
}


function setAttackerDetails(details) {
  STATE.attacker.name = details.name;
  STATE.attacker.apiName = details.apiName;
  STATE.attacker.baseStats = details.baseStats;
  STATE.attacker.types = details.types;
  STATE.attacker.moves = details.moves;

  DOM.attackerName.textContent = details.name;
  DOM.attackerSprite.src = details.sprite;
  DOM.attackerTypes.innerHTML = details.types.map(t => `
    <span class="text-[10px] px-2 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white">${t}</span>
  `).join('');

  updateRegulationTag(details.apiName, DOM.attackerRegTag);
  updateStatsBars(details.baseStats, 'attacker');
  collapseSearch(DOM.attackerSearchWrap, DOM.attackerSearchToggle);

  const damagingMoves = details.moves
    .filter(m => !CACHE.statusMoves[m.apiName])
    .sort((a, b) => a.name.localeCompare(b.name));
  DOM.attackerMoveSelect.innerHTML = `<option value="custom">--- Custom Move ---</option>` +
    damagingMoves.map(m => `<option value="${m.apiName}">${m.name}</option>`).join('');

  // Filter custom VGC offensive abilities to ONLY those this Pokemon learn!
  const learnableOffensive = OFF_VGC_ABILITIES_HELPER(details.abilities);
  DOM.attackerAbility.innerHTML = `<option value="none">No offensive ability</option>` + 
    learnableOffensive.map(a => `<option value="${a.apiName}">${a.name}</option>`).join('');
  DOM.attackerAbility.value = "none";

  // Mega Evolution lock (VGC authenticity): Megas have a fixed item and a
  // single ability, so lock both. Auto-select the ability when we model it.
  const isMega = details.apiName.includes('-mega');
  if (isMega) {
    DOM.attackerItem.value = "mega_stone";
    DOM.attackerItem.disabled = true;
    DOM.attackerItem.className = "w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-400 cursor-not-allowed";

    if (learnableOffensive.length > 0) {
      DOM.attackerAbility.value = learnableOffensive[0].apiName;
    }
    DOM.attackerAbility.disabled = true;
    DOM.attackerAbility.className = "w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-slate-400 cursor-not-allowed";
  } else {
    DOM.attackerItem.disabled = false;
    DOM.attackerItem.className = "w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";

    DOM.attackerAbility.disabled = false;
    DOM.attackerAbility.className = "w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";
  }

  // Auto Pre-Selection of the very first valid damaging move from the new learnset!
  // While importing a matchup, applyMatchup owns the move selection, so skip the
  // async auto-pick here — its late updateLiveStats() would clobber the import.
  if (damagingMoves.length > 0 && !isApplyingMatchup) {
    const firstMove = damagingMoves[0];
    DOM.attackerMoveSelect.value = firstMove.apiName;
    STATE.move.apiName = firstMove.apiName;
    
    fetchMoveDetails(firstMove.apiName).then(move => {
      DOM.movePower.value = move.power;
      updateMoveDetailsVisuals(move.type, move.category, false);
      updateLiveStats();
    }).catch(err => {
      console.error("Error auto pre-selecting first VGC move:", err);
      DOM.attackerMoveSelect.value = "custom";
      STATE.move.apiName = "";
      DOM.movePower.value = 80;
      updateMoveDetailsVisuals("Normal", "physical", true);
      updateLiveStats();
    });
  } else {
    DOM.attackerMoveSelect.value = "custom";
    STATE.move.apiName = "";
    DOM.movePower.value = 80;
    updateMoveDetailsVisuals("Normal", "physical", true);
    updateLiveStats();
  }

  updateLiveStats();
}

function setDefenderDetails(details) {
  STATE.defender.name = details.name;
  STATE.defender.apiName = details.apiName;
  STATE.defender.baseStats = details.baseStats;
  STATE.defender.types = details.types;

  DOM.defenderName.textContent = details.name;
  DOM.defenderSprite.src = details.sprite;
  DOM.defenderTypes.innerHTML = details.types.map(t => `
    <span class="text-[10px] px-2 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white">${t}</span>
  `).join('');

  updateRegulationTag(details.apiName, DOM.defenderRegTag);
  updateStatsBars(details.baseStats, 'defender');
  collapseSearch(DOM.defenderSearchWrap, DOM.defenderSearchToggle);

  // Filter custom VGC defensive abilities to ONLY those this Pokemon learns!
  const learnableDefensive = DEF_VGC_ABILITIES_HELPER(details.abilities);
  DOM.defenderAbility.innerHTML = `<option value="none">No defensive ability</option>` + 
    learnableDefensive.map(a => `<option value="${a.apiName}">${a.name}</option>`).join('');
  DOM.defenderAbility.value = "none";

  // Symmetrical Defender Mega lock: fixed item + single ability.
  const isMega = details.apiName.includes('-mega');
  if (isMega) {
    DOM.defenderItem.value = "mega_stone";
    DOM.defenderItem.disabled = true;
    DOM.defenderItem.className = "w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-400 cursor-not-allowed";

    if (learnableDefensive.length > 0) {
      DOM.defenderAbility.value = learnableDefensive[0].apiName;
    }
    DOM.defenderAbility.disabled = true;
    DOM.defenderAbility.className = "w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-slate-400 cursor-not-allowed";
  } else {
    DOM.defenderItem.disabled = false;
    DOM.defenderItem.className = "w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500 text-slate-100 cursor-pointer";

    DOM.defenderAbility.disabled = false;
    DOM.defenderAbility.className = "w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 focus:outline-none focus:border-blue-500 text-slate-100 cursor-pointer";
  }

  updateLiveStats();
}


function updateLiveStats() {
  updateDropdownColors();
  STATE.attacker.nature = DOM.attackerNature.value;
  STATE.attacker.item = DOM.attackerItem.value;
  STATE.attacker.ability = DOM.attackerAbility.value;
  STATE.attacker.sps.atk = parseInt(DOM.attackerEvAtk.value) || 0;
  STATE.attacker.sps.spa = parseInt(DOM.attackerEvSpa.value) || 0;
  STATE.attacker.sps.spe = parseInt(DOM.attackerEvSpe.value) || 0;
  STATE.attacker.boosts.atk = parseInt(DOM.attackerBoostAtk.value) || 0;
  STATE.attacker.boosts.spa = parseInt(DOM.attackerBoostSpa.value) || 0;
  STATE.attacker.boosts.spe = parseInt(DOM.attackerBoostSpe.value) || 0;

  STATE.defender.nature = DOM.defenderNature.value;
  STATE.defender.item = DOM.defenderItem.value;
  STATE.defender.ability = DOM.defenderAbility.value;
  STATE.defender.sps.hp = parseInt(DOM.defenderEvHp.value) || 0;
  STATE.defender.sps.def = parseInt(DOM.defenderEvDef.value) || 0;
  STATE.defender.sps.spd = parseInt(DOM.defenderEvSpd.value) || 0;
  STATE.defender.sps.spe = parseInt(DOM.defenderEvSpe.value) || 0;
  STATE.defender.boosts.def = parseInt(DOM.defenderBoostDef.value) || 0;
  STATE.defender.boosts.spd = parseInt(DOM.defenderBoostSpd.value) || 0;
  STATE.defender.boosts.spe = parseInt(DOM.defenderBoostSpe.value) || 0;

  const selectedMoveOpt = DOM.attackerMoveSelect.options[DOM.attackerMoveSelect.selectedIndex];
  let moveName = selectedMoveOpt ? selectedMoveOpt.textContent : "Custom Move";
  if (moveName.includes("Custom Move")) moveName = "Custom Move";
  STATE.move.name = moveName;

  STATE.move.type = DOM.moveType.value;
  STATE.move.power = parseInt(DOM.movePower.value) || 0;
  STATE.move.category = DOM.moveCategory.value;

  STATE.modifiers.spread = DOM.modSpread.checked;
  STATE.modifiers.weather = DOM.modWeatherSelect.value;
  STATE.modifiers.crit = DOM.modCrit.checked;
  STATE.modifiers.friendGuard = DOM.modFriendGuard.checked;
  STATE.modifiers.screens = DOM.modScreens.checked;
  STATE.modifiers.helpingHand = DOM.modHelpingHand.checked;
  STATE.modifiers.terrain = DOM.modTerrainSelect.value;

  // Fairy Aura locks the field aura to Fairy for its holder.
  if (DOM.attackerAbility.value === 'fairy-aura') {
    DOM.modAuraSelect.value = 'fairy';
    DOM.modAuraSelect.disabled = true;
    DOM.modAuraSelect.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1.5 px-2 text-[10px] text-slate-400 cursor-not-allowed";
  } else if (DOM.modAuraSelect.disabled) {
    // Releasing a previously forced lock: clear it and re-enable.
    DOM.modAuraSelect.value = 'none';
    DOM.modAuraSelect.disabled = false;
    DOM.modAuraSelect.className = "w-full bg-slate-900/45 border border-slate-700 rounded-lg py-1.5 px-2 text-[10px] focus:outline-none focus:border-amber-500 text-slate-100 cursor-pointer";
  }
  STATE.modifiers.aura = DOM.modAuraSelect.value;
  STATE.attacker.status = DOM.modBurned.checked ? 'burned' : null;

  const attackerSPSum = STATE.attacker.sps.atk + STATE.attacker.sps.spa + STATE.attacker.sps.spe;
  if (attackerSPSum > 66) {
    DOM.attackerEvSum.className = "text-xs font-mono text-red-400 font-bold";
  } else {
    DOM.attackerEvSum.className = "text-xs font-mono text-slate-400";
  }

  const defenderSPSum = STATE.defender.sps.hp + STATE.defender.sps.def + STATE.defender.sps.spd + STATE.defender.sps.spe;
  if (defenderSPSum > 66) {
    DOM.defenderEvSum.className = "text-xs font-mono text-red-400 font-bold";
  } else {
    DOM.defenderEvSum.className = "text-xs font-mono text-slate-400";
  }

  const finalAtk = calculateStatBoost(
    calculateStat('atk', STATE.attacker.baseStats.atk, STATE.attacker.sps.atk, STATE.attacker.nature, false),
    STATE.attacker.boosts.atk
  );
  const finalSpa = calculateStatBoost(
    calculateStat('spa', STATE.attacker.baseStats.spa, STATE.attacker.sps.spa, STATE.attacker.nature, false),
    STATE.attacker.boosts.spa
  );
  let finalAttackerSpe = calculateStatBoost(
    calculateStat('spe', STATE.attacker.baseStats.spe || 100, STATE.attacker.sps.spe, STATE.attacker.nature, false),
    STATE.attacker.boosts.spe
  );
  if (STATE.attacker.item === 'choice_scarf') {
    finalAttackerSpe = Math.floor(finalAttackerSpe * 1.5);
  }
  if (DOM.modTailAtk.checked) {
    finalAttackerSpe = finalAttackerSpe * 2;
  }

  DOM.attackerStatAtkVal.textContent = finalAtk;
  DOM.attackerStatSpaVal.textContent = finalSpa;
  DOM.attackerStatSpeVal.textContent = finalAttackerSpe;

  const finalHp = calculateStat('hp', STATE.defender.baseStats.hp, STATE.defender.sps.hp, STATE.defender.nature, true);
  const finalDef = calculateStatBoost(
    calculateStat('def', STATE.defender.baseStats.def, STATE.defender.sps.def, STATE.defender.nature, false),
    STATE.defender.boosts.def
  );
  const finalSpd = calculateStatBoost(
    calculateStat('spd', STATE.defender.baseStats.spd, STATE.defender.sps.spd, STATE.defender.nature, false),
    STATE.defender.boosts.spd
  );
  let finalDefenderSpe = calculateStatBoost(
    calculateStat('spe', STATE.defender.baseStats.spe || 100, STATE.defender.sps.spe, STATE.defender.nature, false),
    STATE.defender.boosts.spe
  );
  if (STATE.defender.item === 'choice_scarf') {
    finalDefenderSpe = Math.floor(finalDefenderSpe * 1.5);
  }
  if (DOM.modTailDef.checked) {
    finalDefenderSpe = finalDefenderSpe * 2;
  }

  DOM.defenderStatHpVal.textContent = finalHp;
  DOM.defenderStatDefVal.textContent = finalDef;
  DOM.defenderStatSpdVal.textContent = finalSpd;
  DOM.defenderStatSpeVal.textContent = finalDefenderSpe;

  DOM.attackerEvAtkVal.textContent = STATE.attacker.sps.atk;
  DOM.attackerEvSpaVal.textContent = STATE.attacker.sps.spa;
  DOM.attackerEvSpeVal.textContent = STATE.attacker.sps.spe;
  DOM.attackerEvSum.textContent = `Used: ${attackerSPSum}/66 SP`;

  DOM.defenderEvHpVal.textContent = STATE.defender.sps.hp;
  DOM.defenderEvDefVal.textContent = STATE.defender.sps.def;
  DOM.defenderEvSpdVal.textContent = STATE.defender.sps.spd;
  DOM.defenderEvSpeVal.textContent = STATE.defender.sps.spe;
  DOM.defenderEvSum.textContent = `Used: ${defenderSPSum}/66 SP`;

  // Turn-order chips (the full banner was removed; the HUD/mobile chips carry speed
  // now). Always framed around the mode's own Pokémon (the attacker in offense mode,
  // the defender in survival mode): green when it moves first, red when it moves
  // second — i.e. green is always the favorable turn order for that Pokémon.
  if (!STATE.attacker.name || !STATE.defender.name) {
    setSpeedText("Awaiting Speed", "slate");
  } else {
    const survival = STATE.mode === 'survival';
    const subjectName = survival ? STATE.defender.name : STATE.attacker.name;
    const subjectSpe = survival ? finalDefenderSpe : finalAttackerSpe;
    const otherSpe = survival ? finalAttackerSpe : finalDefenderSpe;
    if (subjectSpe === otherSpe) {
      setSpeedText("Speed Tie", "amber");
    } else {
      const first = subjectSpe > otherSpe;
      setSpeedText(`${subjectName} moves ${first ? '1st' : '2nd'}`, first ? "emerald" : "red");
    }
  }

  // Dynamic Presets Dropdowns Synchronization
  const atkSP = STATE.attacker.sps.atk;
  const spaSP = STATE.attacker.sps.spa;
  const atkSpeSP = STATE.attacker.sps.spe;
  const nat = STATE.attacker.nature;
  let matchedAtkPreset = "";
  if (atkSP === 32 && spaSP === 0 && atkSpeSP === 32 && nat === "+atk") {
    matchedAtkPreset = "phys_attacker";
  } else if (atkSP === 0 && spaSP === 32 && atkSpeSP === 32 && nat === "+spa") {
    matchedAtkPreset = "spec_attacker";
  } else if (atkSP === 32 && spaSP === 32 && atkSpeSP === 2 && nat === "neutral") {
    matchedAtkPreset = "mixed_attacker";
  }
  DOM.attackerSpPresets.value = matchedAtkPreset;

  const hpSP = STATE.defender.sps.hp;
  const defSP = STATE.defender.sps.def;
  const spdSP = STATE.defender.sps.spd;
  const defSpeSP = STATE.defender.sps.spe;
  let matchedDefPreset = "";
  if (hpSP === 32 && defSP === 32 && spdSP === 0 && defSpeSP === 0) {
    matchedDefPreset = "max_phys_bulk";
  } else if (hpSP === 32 && defSP === 0 && spdSP === 32 && defSpeSP === 0) {
    matchedDefPreset = "max_spec_bulk";
  } else if (hpSP === 32 && defSP === 17 && spdSP === 17 && defSpeSP === 0) {
    matchedDefPreset = "balanced_def";
  } else if (hpSP === 32 && defSP === 2 && spdSP === 0 && defSpeSP === 32) {
    matchedDefPreset = "fast_bulky";
  }
  DOM.defenderSpPresets.value = matchedDefPreset;

  runOptimizations();
}


function runOptimizations() {
  const rolls = calculateDamageRolls(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers);

  if (STATE.mode === 'survival') {
    const cheapest = optimizeSurvivalEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, null);
    const speedy = optimizeSurvivalEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, ['+spe']);
    const current = optimizeSurvivalEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, [STATE.defender.nature]);

    const defStatName = STATE.move.category.toLowerCase() === 'physical' ? 'Def' : 'SpD';

    if (cheapest) {
      DOM.survivalNotPossible.classList.add('hidden');
      DOM.survivalOptionsContainer.innerHTML = '';

      // Card 1: Most Efficient
      DOM.survivalOptionsContainer.innerHTML += createOptionCardHTML('Option 1: Most Efficient', cheapest.nature, cheapest.hp, cheapest.def, defStatName, cheapest.total, 'blue');

      // Card 2: Speed Positive
      if (speedy) {
        DOM.survivalOptionsContainer.innerHTML += createOptionCardHTML('Option 2: Speed Positive (+Spe)', speedy.nature, speedy.hp, speedy.def, defStatName, speedy.total, 'blue');
      } else {
        DOM.survivalOptionsContainer.innerHTML += createImpossibleOptionCardHTML('Option 2: Speed Positive (+Spe)', '+spe', 'blue');
      }

      // Card 3: Current Nature
      if (current) {
        const isDuplicateCheapest = (current.nature === cheapest.nature);
        const isDuplicateSpeedy = (speedy && current.nature === speedy.nature);
        if (!isDuplicateCheapest && !isDuplicateSpeedy) {
          DOM.survivalOptionsContainer.innerHTML += createOptionCardHTML('Option 3: Keep Current Nature', current.nature, current.hp, current.def, defStatName, current.total, 'blue');
        }
      } else {
        DOM.survivalOptionsContainer.innerHTML += createImpossibleOptionCardHTML('Option 3: Keep Current Nature', STATE.defender.nature, 'blue');
      }

      bindApplyButtonsListeners();
    } else {
      DOM.survivalNotPossible.classList.remove('hidden');
      DOM.survivalOptionsContainer.innerHTML = `<div class="text-xs text-slate-500 italic p-4 text-center border border-slate-800 rounded-xl bg-slate-800/20">Survival is impossible even with maximum defensive Nature & allocations</div>`;
    }
  } else {
    const cheapest = optimizeOffensiveEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, STATE.targetKO, null);
    const speedy = optimizeOffensiveEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, STATE.targetKO, ['+spe']);
    const current = optimizeOffensiveEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, STATE.targetKO, [STATE.attacker.nature]);

    const categoryLabel = STATE.move.category.toLowerCase() === 'physical' ? 'atk' : 'spa';

    if (cheapest) {
      DOM.offensiveNotPossible.classList.add('hidden');
      DOM.offensiveOptionsContainer.innerHTML = '';

      // Card 1: Most Efficient
      DOM.offensiveOptionsContainer.innerHTML += createOptionCardHTML('Option 1: Most Efficient', cheapest.nature, cheapest.sp, cheapest.sp, categoryLabel, cheapest.sp, 'amber');

      // Card 2: Speed Positive
      if (speedy) {
        DOM.offensiveOptionsContainer.innerHTML += createOptionCardHTML('Option 2: Speed Positive (+Spe)', speedy.nature, speedy.sp, speedy.sp, categoryLabel, speedy.sp, 'amber');
      } else {
        DOM.offensiveOptionsContainer.innerHTML += createImpossibleOptionCardHTML('Option 2: Speed Positive (+Spe)', '+spe', 'amber');
      }

      // Card 3: Current Nature
      if (current) {
        const isDuplicateCheapest = (current.nature === cheapest.nature);
        const isDuplicateSpeedy = (speedy && current.nature === speedy.nature);
        if (!isDuplicateCheapest && !isDuplicateSpeedy) {
          DOM.offensiveOptionsContainer.innerHTML += createOptionCardHTML('Option 3: Keep Current Nature', current.nature, current.sp, current.sp, categoryLabel, current.sp, 'amber');
        }
      } else {
        DOM.offensiveOptionsContainer.innerHTML += createImpossibleOptionCardHTML('Option 3: Keep Current Nature', STATE.attacker.nature, 'amber');
      }

      bindApplyButtonsListeners();
    } else {
      DOM.offensiveNotPossible.classList.remove('hidden');
      DOM.offensiveOptionsContainer.innerHTML = `<div class="text-xs text-slate-500 italic p-4 text-center border border-slate-800 rounded-xl bg-slate-800/20">Secure KO is impossible even with maximum offensive Nature & allocations</div>`;
    }
  }

  // Mirror the headline result into every view (mobile overlay + desktop HUD).
  updateResultSummary(rolls);
}


function bindApplyButtonsListeners() {
  document.querySelectorAll('.apply-opt-btn').forEach(btn => {
    btn.onclick = (e) => {
      const dataset = e.currentTarget.dataset;
      const type = dataset.type;
      const nature = dataset.nature;
      const statType = dataset.stat;

      if (type === 'survival') {
        const hp = parseInt(dataset.hp);
        const def = parseInt(dataset.def);

        if (!isNaN(hp)) {
          DOM.defenderEvHp.value = hp;
          if (statType === 'def') {
            DOM.defenderEvDef.value = def;
            DOM.defenderEvSpd.value = 0;
          } else {
            DOM.defenderEvSpd.value = def;
            DOM.defenderEvDef.value = 0;
          }
          if (nature) {
            DOM.defenderNature.value = nature;
          }
          updateLiveStats();
        }
      } else {
        const ev = parseInt(dataset.ev);

        if (!isNaN(ev)) {
          if (statType === 'atk') {
            DOM.attackerEvAtk.value = ev;
            DOM.attackerEvSpa.value = 0;
          } else {
            DOM.attackerEvSpa.value = ev;
            DOM.attackerEvAtk.value = 0;
          }
          if (nature) {
            DOM.attackerNature.value = nature;
          }
          updateLiveStats();
        }
      }
    };
  });
}

function bindEvents() {
  const inputs = [
    DOM.attackerNature, DOM.attackerItem, DOM.attackerAbility,
    DOM.attackerBoostAtk, DOM.attackerBoostSpa, DOM.attackerBoostSpe,
    DOM.attackerEvAtk, DOM.attackerEvSpa, DOM.attackerEvSpe,
    DOM.defenderNature, DOM.defenderItem, DOM.defenderAbility,
    DOM.defenderBoostDef, DOM.defenderBoostSpd, DOM.defenderBoostSpe,
    DOM.defenderEvHp, DOM.defenderEvDef, DOM.defenderEvSpd, DOM.defenderEvSpe,
    DOM.moveType, DOM.movePower, DOM.moveCategory,
    DOM.modSpread, DOM.modWeatherSelect, DOM.modCrit,
    DOM.modFriendGuard, DOM.modScreens, DOM.modBurned, DOM.modHelpingHand,
    DOM.modTailAtk, DOM.modTailDef, DOM.modTerrainSelect, DOM.modAuraSelect
  ];

  inputs.forEach(inp => {
    inp.addEventListener('input', updateLiveStats);
  });

  DOM.formatSelector.addEventListener('change', (e) => {
    STATE.format = e.target.value;
    updateRegulationTag(STATE.attacker.apiName, DOM.attackerRegTag);
    updateRegulationTag(STATE.defender.apiName, DOM.defenderRegTag);
    updateLiveStats();
    onDexFormatChange();
  });

  DOM.attackerSpPresets.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;

    if (val === 'phys_attacker') {
      DOM.attackerEvAtk.value = 32;
      DOM.attackerEvSpa.value = 0;
      DOM.attackerEvSpe.value = 32;
      DOM.attackerNature.value = "+atk";
    } else if (val === 'spec_attacker') {
      DOM.attackerEvAtk.value = 0;
      DOM.attackerEvSpa.value = 32;
      DOM.attackerEvSpe.value = 32;
      DOM.attackerNature.value = "+spa";
    } else if (val === 'mixed_attacker') {
      DOM.attackerEvAtk.value = 32;
      DOM.attackerEvSpa.value = 32;
      DOM.attackerEvSpe.value = 2;
      DOM.attackerNature.value = "neutral";
    }

    updateLiveStats();
  });

  DOM.defenderSpPresets.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;

    if (val === 'max_phys_bulk') {
      DOM.defenderEvHp.value = 32;
      DOM.defenderEvDef.value = 32;
      DOM.defenderEvSpd.value = 0;
      DOM.defenderEvSpe.value = 0;
    } else if (val === 'max_spec_bulk') {
      DOM.defenderEvHp.value = 32;
      DOM.defenderEvDef.value = 0;
      DOM.defenderEvSpd.value = 32;
      DOM.defenderEvSpe.value = 0;
    } else if (val === 'balanced_def') {
      DOM.defenderEvHp.value = 32;
      DOM.defenderEvDef.value = 17;
      DOM.defenderEvSpd.value = 17;
      DOM.defenderEvSpe.value = 0;
    } else if (val === 'fast_bulky') {
      DOM.defenderEvHp.value = 32;
      DOM.defenderEvDef.value = 2;
      DOM.defenderEvSpd.value = 0;
      DOM.defenderEvSpe.value = 32;
    }

    updateLiveStats();
  });

  DOM.tabSurvival.addEventListener('click', () => {
    STATE.mode = 'survival';
    DOM.tabSurvival.className = "flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 bg-blue-600 text-white shadow";
    DOM.tabOffensive.className = "flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-slate-400 hover:text-white";
    DOM.survivalResults.classList.remove('hidden');
    DOM.offensiveResults.classList.add('hidden');
    updateLiveStats();
  });

  DOM.tabOffensive.addEventListener('click', () => {
    STATE.mode = 'offensive';
    DOM.tabOffensive.className = "flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 bg-amber-600 text-white shadow";
    DOM.tabSurvival.className = "flex-1 text-center py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-slate-400 hover:text-white";
    DOM.offensiveResults.classList.remove('hidden');
    DOM.survivalResults.classList.add('hidden');
    updateLiveStats();
  });

  DOM.btnTargetOHKO.addEventListener('click', () => {
    STATE.targetKO = 'ohko';
    DOM.btnTargetOHKO.className = "bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl border border-amber-500/30 transition";
    DOM.btnTarget2HKO.className = "bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl border border-slate-700 transition";
    updateLiveStats();
  });

  DOM.btnTarget2HKO.addEventListener('click', () => {
    STATE.targetKO = '2hko';
    DOM.btnTarget2HKO.className = "bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl border border-amber-500/30 transition";
    DOM.btnTargetOHKO.className = "bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl border border-slate-700 transition";
    updateLiveStats();
  });

  DOM.attackerMoveSelect.addEventListener('change', async (e) => {
    const val = e.target.value;
    
    if (val === 'custom') {
      STATE.move.apiName = "";
      updateMoveDetailsVisuals("Normal", "physical", true);
      updateLiveStats();
      return;
    }

    try {
      const move = await fetchMoveDetails(val);
      DOM.movePower.value = move.power;
      STATE.move.apiName = move.apiName;
      updateMoveDetailsVisuals(move.type, move.category, false);
      updateLiveStats();
    } catch (err) {
      console.error('Error fetching move info', err);
    }
  });

  DOM.loadSampleBtn.addEventListener('click', () => {
    loadSampleVGCScenario();
  });

  bindExportImportModal();
}

// Export/import the current matchup as a human-readable text block.
function bindExportImportModal() {
  const setStatus = (msg) => { DOM.eiStatus.textContent = msg || ''; };
  const openModal = () => {
    DOM.eiTextarea.value = exportMatchup(augmentedState());
    setStatus('');
    DOM.eiModal.classList.remove('hidden');
    DOM.eiTextarea.focus();
    DOM.eiTextarea.select();
  };
  const closeModal = () => DOM.eiModal.classList.add('hidden');

  DOM.exportImportBtn.addEventListener('click', openModal);
  DOM.eiCloseBtn.addEventListener('click', closeModal);
  // Click on the dimmed backdrop (but not the dialog itself) closes the modal.
  DOM.eiModal.addEventListener('click', (e) => {
    if (e.target === DOM.eiModal) closeModal();
  });

  DOM.eiCopyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(DOM.eiTextarea.value);
      setStatus('Copied to clipboard!');
    } catch (err) {
      // Clipboard API may be blocked; fall back to selecting the text.
      DOM.eiTextarea.select();
      setStatus('Press Ctrl/Cmd+C to copy.');
    }
  });

  DOM.eiImportBtn.addEventListener('click', async () => {
    const parsed = importMatchup(DOM.eiTextarea.value);
    if (!parsed) {
      setStatus("Couldn't read that — expected an \"Attacker:\" / \"Defender:\" block.");
      return;
    }
    setStatus('Loading…');
    DOM.eiImportBtn.disabled = true;
    const ok = await applyMatchup(parsed);
    DOM.eiImportBtn.disabled = false;
    if (ok) {
      closeModal();
    } else {
      setStatus('Failed to load — check the Pokémon names are spelled correctly.');
    }
  });
}


async function loadSampleVGCScenario() {
  // Fetch official details in parallel!
  let attackerDetails, defenderDetails;
  try {
    const [atk, def] = await Promise.all([
      fetchPokemonDetails('talonflame'),
      fetchPokemonDetails('whimsicott')
    ]);
    attackerDetails = atk;
    defenderDetails = def;
  } catch (err) {
    console.error("Error fetching details in sample loader", err);
    // Fallbacks
    attackerDetails = {
      name: "Talonflame",
      apiName: "talonflame",
      sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/663.png",
      types: ["Fire", "Flying"],
      baseStats: { hp: 78, atk: 81, def: 71, spa: 74, spd: 69, spe: 126 },
      moves: [{ name: "Acrobatics", apiName: "acrobatics" }],
      abilities: [{ name: "Gale Wings", apiName: "gale-wings" }]
    };
    defenderDetails = {
      name: "Whimsicott",
      apiName: "whimsicott",
      sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/547.png",
      types: ["Grass", "Fairy"],
      baseStats: { hp: 60, atk: 67, def: 85, spa: 77, spd: 75, spe: 116 },
      abilities: [{ name: "Prankster", apiName: "prankster" }]
    };
  }

  // Run standard detail setters to load stats, profiles, and filter abilities!
  setAttackerDetails(attackerDetails);
  setDefenderDetails(defenderDetails);

  // Populate search input fields
  DOM.attackerSearch.value = "Talonflame";
  DOM.defenderSearch.value = "Whimsicott";

  // Override specific sample scenario parameters!
  DOM.attackerNature.value = "+atk";
  DOM.attackerItem.value = "none"; // no held item -> Acrobatics doubles
  DOM.attackerEvAtk.value = 32;
  DOM.attackerEvSpa.value = 0;
  DOM.attackerEvSpe.value = 32;
  DOM.attackerAbility.value = "none";

  // Max physical bulk Whimsicott
  DOM.defenderNature.value = "+def";
  DOM.defenderItem.value = "none";
  DOM.defenderEvHp.value = 32;
  DOM.defenderEvDef.value = 32;
  DOM.defenderEvSpd.value = 0;
  DOM.defenderEvSpe.value = 0;

  // Pre-select Flying-type Acrobatics move
  DOM.attackerMoveSelect.value = "acrobatics";

  try {
    const move = await fetchMoveDetails("acrobatics");
    DOM.movePower.value = move.power;
    STATE.move.apiName = move.apiName;
    updateMoveDetailsVisuals(move.type, move.category, false);
  } catch (err) {
    console.error("Failed to load preloaded Acrobatics move info", err);
  }

  DOM.modSpread.checked = false;
  DOM.modWeatherSelect.value = 'none';
  DOM.modCrit.checked = false;
  DOM.modBurned.checked = false;
  DOM.modHelpingHand.checked = false;
  DOM.modTailAtk.checked = false;
  DOM.modTailDef.checked = false;

  updateLiveStats();
}

// Rebuild a matchup from an imported text block (see src/data/matchup-text.js).
// Mirrors loadSampleVGCScenario: fetch both Pokémon by the apiName derived from
// their names, run the detail setters to populate option lists, then write every
// input. Returns true on success, false if a Pokémon couldn't be fetched.
async function applyMatchup(parsed) {
  isApplyingMatchup = true;
  try {
    const [aDetails, dDetails] = await Promise.all([
      fetchPokemonDetails(parsed.attacker.apiName),
      fetchPokemonDetails(parsed.defender.apiName)
    ]);

    setAttackerDetails(aDetails);
    setDefenderDetails(dDetails);
    DOM.attackerSearch.value = aDetails.name;
    DOM.defenderSearch.value = dDetails.name;

    // Attacker inputs. Setting a <select>.value to an option that doesn't exist
    // (e.g. an ability this Pokémon can't learn) silently no-ops.
    DOM.attackerNature.value = parsed.attacker.nature;
    DOM.attackerItem.value = parsed.attacker.item;
    DOM.attackerAbility.value = parsed.attacker.ability;
    DOM.attackerEvAtk.value = parsed.attacker.sps.atk;
    DOM.attackerEvSpa.value = parsed.attacker.sps.spa;
    DOM.attackerEvSpe.value = parsed.attacker.sps.spe;
    DOM.attackerBoostAtk.value = parsed.attacker.boosts.atk;
    DOM.attackerBoostSpa.value = parsed.attacker.boosts.spa;
    DOM.attackerBoostSpe.value = parsed.attacker.boosts.spe;

    // Defender inputs.
    DOM.defenderNature.value = parsed.defender.nature;
    DOM.defenderItem.value = parsed.defender.item;
    DOM.defenderAbility.value = parsed.defender.ability;
    DOM.defenderEvHp.value = parsed.defender.sps.hp;
    DOM.defenderEvDef.value = parsed.defender.sps.def;
    DOM.defenderEvSpd.value = parsed.defender.sps.spd;
    DOM.defenderEvSpe.value = parsed.defender.sps.spe;
    DOM.defenderBoostDef.value = parsed.defender.boosts.def;
    DOM.defenderBoostSpd.value = parsed.defender.boosts.spd;
    DOM.defenderBoostSpe.value = parsed.defender.boosts.spe;

    // Modifiers.
    const mod = parsed.modifiers;
    DOM.modSpread.checked = mod.spread;
    DOM.modCrit.checked = mod.crit;
    DOM.modScreens.checked = mod.screens;
    DOM.modFriendGuard.checked = mod.friendGuard;
    DOM.modHelpingHand.checked = mod.helpingHand;
    DOM.modBurned.checked = mod.burn;
    DOM.modTailAtk.checked = mod.tailAtk;
    DOM.modTailDef.checked = mod.tailDef;
    DOM.modWeatherSelect.value = mod.weather;
    DOM.modTerrainSelect.value = mod.terrain;
    DOM.modAuraSelect.value = mod.aura;

    // Move: a named move re-fetches its power/type/category; a custom move
    // carries those explicitly. The dropdown options are keyed by apiName.
    if (parsed.move.apiName) {
      try {
        const mv = await fetchMoveDetails(parsed.move.apiName);
        DOM.attackerMoveSelect.value = mv.apiName;
        DOM.movePower.value = mv.power;
        STATE.move.apiName = mv.apiName;
        updateMoveDetailsVisuals(mv.type, mv.category, false);
      } catch (err) {
        console.error("Imported move not found, falling back to custom:", err);
        DOM.attackerMoveSelect.value = "custom";
        STATE.move.apiName = "";
      }
    } else {
      DOM.attackerMoveSelect.value = "custom";
      STATE.move.apiName = "";
      DOM.moveType.value = parsed.move.type;
      DOM.moveCategory.value = parsed.move.category;
      DOM.movePower.value = parsed.move.power;
      updateMoveDetailsVisuals(parsed.move.type, parsed.move.category, true);
    }

    // Panel state. The tab/target buttons own their active-class styling, so
    // reuse their click handlers.
    (parsed.mode === 'survival' ? DOM.tabSurvival : DOM.tabOffensive).click();
    (parsed.ko === '2hko' ? DOM.btnTarget2HKO : DOM.btnTargetOHKO).click();

    isApplyingMatchup = false;
    updateLiveStats();
    return true;
  } catch (err) {
    console.error("Failed to apply imported matchup:", err);
    isApplyingMatchup = false;
    return false;
  }
}

function initMobileTabbing() {
  const mobTabAttacker = document.getElementById('mob-tab-attacker');
  const mobTabResults = document.getElementById('mob-tab-results');
  const mobTabDefender = document.getElementById('mob-tab-defender');

  const panelAttacker = document.getElementById('panel-attacker');
  const panelCenter = document.getElementById('panel-center');
  const panelDefender = document.getElementById('panel-defender');

  if (!mobTabAttacker || !mobTabResults || !mobTabDefender) return;

  function switchTab(activeTab) {
    // Reset tab button styles
    mobTabAttacker.className = "flex-1 text-center py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 text-slate-400 hover:text-white";
    mobTabResults.className = "flex-1 text-center py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 text-slate-400 hover:text-white";
    mobTabDefender.className = "flex-1 text-center py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 text-slate-400 hover:text-white";

    // Hide all panels under mobile and strip flex behaviors
    panelAttacker.classList.add('hidden');
    panelAttacker.classList.remove('flex', 'flex-col');
    panelCenter.classList.add('hidden');
    panelCenter.classList.remove('flex', 'flex-col');
    panelDefender.classList.add('hidden');
    panelDefender.classList.remove('flex', 'flex-col');

    if (activeTab === 'attacker') {
      mobTabAttacker.className = "flex-1 text-center py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 bg-red-950/30 text-red-400 border border-red-900/30 shadow";
      panelAttacker.classList.remove('hidden');
      panelAttacker.classList.add('flex', 'flex-col');
    } else if (activeTab === 'results') {
      mobTabResults.className = "flex-1 text-center py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 bg-amber-950/30 text-amber-400 border border-amber-900/30 shadow";
      panelCenter.classList.remove('hidden');
      panelCenter.classList.add('flex', 'flex-col');
    } else if (activeTab === 'defender') {
      mobTabDefender.className = "flex-1 text-center py-2.5 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1 bg-blue-950/30 text-blue-400 border border-blue-900/30 shadow";
      panelDefender.classList.remove('hidden');
      panelDefender.classList.add('flex', 'flex-col');
    }
  }

  mobTabAttacker.addEventListener('click', () => switchTab('attacker'));
  mobTabResults.addEventListener('click', () => switchTab('results'));
  mobTabDefender.addEventListener('click', () => switchTab('defender'));

  // Start with Results & Controls visible by default on mobile!
  switchTab('results');
}

async function init() {
  populateDropdowns();
  bindEvents();
  initMobileTabbing();
  initDexPage();

  bindAutocomplete(
    DOM.attackerSearch,
    DOM.attackerResults,
    DOM.attackerSpinner,
    setAttackerDetails
  );

  bindAutocomplete(
    DOM.defenderSearch,
    DOM.defenderResults,
    DOM.defenderSpinner,
    setDefenderDetails
  );

  bindSearchToggle(DOM.attackerSearchToggle, DOM.attackerSearchWrap, DOM.attackerSearch);
  bindSearchToggle(DOM.defenderSearchToggle, DOM.defenderSearchWrap, DOM.defenderSearch);

  // The status-move filter list must be ready before any move dropdown is
  // built, otherwise non-damaging moves leak through unfiltered.
  await initStatusMovesList();

  // Fire preloaded sample scenario instantly on startup!
  try {
    loadSampleVGCScenario();
  } catch (err) {
    console.error("Preloader error:", err);
  }

  // Fetch massive search databases quietly in the background without blocking!
  initPokemonList().then(setSearchPlaceholders);
  initChampionsLegalList();
}

document.addEventListener('DOMContentLoaded', init);
