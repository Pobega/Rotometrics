// Pokemon Champions VGC SP Optimizer & Damage Calculator
// Pure Client-Side JavaScript ES6+

import { calculateStat, calculateStatBoost } from './src/engine/stats.js';
import { calculateDamageRolls, resolveEffectiveMove } from './src/engine/damage.js';
import { optimizeSurvivalEVsWithNatures, optimizeOffensiveEVsWithNatures } from './src/engine/optimize.js';
import { bst, sortDex, filterDex, isHiddenForm, isFormatLegal } from './src/data/dex.js';
import { REGULATIONS, NATIONAL_THEME } from './src/data/regulations.js';
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
  initPokemonList,
  initStatusMovesList,
  initChampionsRoster,
  legalSetForFormat,
  initAllMovesList,
  fetchPokemonDetails,
  fetchMoveDetails
} from './src/api/pokeapi.js';
import { pruneOldCaches } from './src/api/cache.js';
import {
  getTypeBgClass,
  createOptionCardHTML,
  createImpossibleOptionCardHTML,
  updateStatsBars,
  updateDropdownColors,
  updateMoveDetailsVisuals,
  setMoveTypeBadge,
  setSearchPlaceholders,
} from './src/ui/render.js';
import { buildResultModel } from './src/ui/result-summary.js';
import { onDexFormatChange, initDexPage, jumpToDexPokemon, getPokemonDetails } from './src/ui/dex-page.js';
import { initAttackdexPage, jumpToAttackdexMove, getMoveDetails } from './src/ui/attackdex-page.js';
import { registerPage, showPage } from './src/ui/page-nav.js';
import { initDetailModal } from './src/ui/detail-modal.js';
import { render, h } from 'preact';
import { AttackerCard } from './src/ui-preact/AttackerCard.js';
import { DefenderCard } from './src/ui-preact/DefenderCard.js';
import { CenterPanel } from './src/ui-preact/OptimizerPanel.js';
import { ResultsHUD } from './src/ui-preact/ResultsHUD.js';
import { setRecompute, notify, DERIVED } from './src/ui-preact/store.js';

// Each format gets a Rotom-form accent: the brand Rotom's glow and the format
// pill borrow that form's signature color. Each regulation carries its own theme
// (see regulations.js); the unrestricted "None" format wears Wash Rotom's cool sky.
function applyFormTheme(format) {
  const t = REGULATIONS[format]?.theme || NATIONAL_THEME;
  if (DOM.brandRotom) {
    // A colored glow hugging Rotom's silhouette — the form accent without a box.
    DOM.brandRotom.style.filter = `drop-shadow(0 0 5px ${t.glow})`;
  }
  if (DOM.formatPill) {
    DOM.formatPill.className = `flex items-center gap-1.5 bg-slate-900 border rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors ${t.pillBorder} ${t.pillText}`;
  }
}

// ==========================================
// 2. APPLICATION STATE & GLOBAL CACHE
// ==========================================
// STATE and CACHE now live in ./src/state.js (imported at the top of this file)
// so UI modules can share them without importing app.js.

// While applying an imported matchup we set many DOM inputs in sequence and
// own the move selection, so suppress setAttackerDetails' async move auto-pick
// (its late updateLiveStats would otherwise clobber the imported move).
let isApplyingMatchup = false;

// Tracks whether the field aura is currently force-locked to Fairy by the
// attacker's Fairy Aura ability, so releasing the ability can revert it to none.
let auraLockedByFairyAura = false;

// burn lives on attacker.status (the rest, incl. tailAtk/tailDef, are already on
// STATE.modifiers), so fold burn into the modifiers slice for export.
function augmentedState() {
  return {
    ...STATE,
    modifiers: {
      ...STATE.modifiers,
      burn: STATE.attacker.status === 'burned'
    }
  };
}


// ==========================================
// 7. UI WORKFLOW & CONTROLLER BINDING
// ==========================================


function bindAutocomplete(inputEl, resultsEl, spinnerEl, callback) {
  inputEl.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      resultsEl.classList.add('hidden');
      return;
    }

    let matches = CACHE.pokemonList.filter(p => p.name.toLowerCase().includes(q));
    matches = matches.filter(p => !isHiddenForm(p.apiName));

    const legal = legalSetForFormat(STATE.format);
    if (legal) {
      matches = matches.filter(p => isFormatLegal(p.apiName, legal));
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
      const reg = REGULATIONS[STATE.format];
      const badgeText = reg ? reg.short : 'National Dex';
      const badgeColor = reg
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

  const reg = REGULATIONS[STATE.format];

  if (reg) {
    const isLegal = isFormatLegal(apiName, legalSetForFormat(STATE.format));
    if (isLegal) {
      tagEl.textContent = `${reg.label} Legal`;
      tagEl.className = "text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-green-950 text-green-400 border border-green-900/50";
    } else {
      tagEl.textContent = `Banned in ${reg.short}`;
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
  // Render-only fields the AttackerCard island reads (sprite + raw ability list).
  STATE.attacker.sprite = details.sprite;
  STATE.attacker.abilities = details.abilities || [];

  // Mega Evolution lock (VGC authenticity): Megas have a fixed item and a single
  // ability. The island renders the lock from STATE; here we just set the values.
  const learnableOffensive = OFF_VGC_ABILITIES_HELPER(details.abilities);
  const isMega = details.apiName.includes('-mega');
  if (isMega) {
    STATE.attacker.item = "mega_stone";
    STATE.attacker.ability = learnableOffensive.length > 0 ? learnableOffensive[0].apiName : "none";
  } else {
    STATE.attacker.ability = "none";
  }

  // The move dropdown is rendered by the MovePanel island from STATE.attacker.moves;
  // here we only choose which move is active (STATE.move).
  const damagingMoves = details.moves
    .filter(m => !CACHE.statusMoves[m.apiName])
    .sort((a, b) => a.name.localeCompare(b.name));

  // Auto Pre-Selection of the very first valid damaging move from the new learnset!
  // While importing a matchup, applyMatchup owns the move selection, so skip the
  // async auto-pick here — its late updateLiveStats() would clobber the import.
  if (damagingMoves.length > 0 && !isApplyingMatchup) {
    const firstMove = damagingMoves[0];
    STATE.move.apiName = firstMove.apiName;
    STATE.move.name = firstMove.name;

    fetchMoveDetails(firstMove.apiName).then(move => {
      STATE.move.power = move.power; // base power; MovePanel shows resolved BP
      STATE.move.type = move.type;
      STATE.move.category = move.category.toLowerCase();
      updateLiveStats();
    }).catch(err => {
      console.error("Error auto pre-selecting first VGC move:", err);
      STATE.move.apiName = "";
      STATE.move.name = "Custom Move";
      STATE.move.power = 80;
      updateLiveStats();
    });
  } else if (!isApplyingMatchup) {
    STATE.move.apiName = "";
    STATE.move.name = "Custom Move";
    STATE.move.power = 80;
    updateLiveStats();
  }

  updateLiveStats();
}

function setDefenderDetails(details) {
  STATE.defender.name = details.name;
  STATE.defender.apiName = details.apiName;
  STATE.defender.baseStats = details.baseStats;
  STATE.defender.types = details.types;
  // Render-only fields the DefenderCard island reads.
  STATE.defender.sprite = details.sprite;
  STATE.defender.abilities = details.abilities || [];

  // Symmetrical mega lock: fixed item + single (first learnable) ability. The
  // island renders the lock from STATE; here we just set the values.
  const learnableDefensive = DEF_VGC_ABILITIES_HELPER(details.abilities);
  const isMega = details.apiName.includes('-mega');
  if (isMega) {
    STATE.defender.item = "mega_stone";
    STATE.defender.ability = learnableDefensive.length > 0 ? learnableDefensive[0].apiName : "none";
  } else {
    STATE.defender.ability = "none";
  }

  updateLiveStats();
}


function updateLiveStats() {
  // Attacker fields are owned by the Preact AttackerCard island (it writes them
  // straight to STATE); only read the vanilla card here if it's actually mounted.
  if (DOM.attackerNature) {
    STATE.attacker.nature = DOM.attackerNature.value;
    STATE.attacker.item = DOM.attackerItem.value;
    STATE.attacker.ability = DOM.attackerAbility.value;
    STATE.attacker.sps.atk = parseInt(DOM.attackerEvAtk.value) || 0;
    STATE.attacker.sps.spa = parseInt(DOM.attackerEvSpa.value) || 0;
    STATE.attacker.sps.spe = parseInt(DOM.attackerEvSpe.value) || 0;
    STATE.attacker.boosts.atk = parseInt(DOM.attackerBoostAtk.value) || 0;
    STATE.attacker.boosts.spa = parseInt(DOM.attackerBoostSpa.value) || 0;
    STATE.attacker.boosts.spe = parseInt(DOM.attackerBoostSpe.value) || 0;
  }

  // Defender fields are owned by the Preact DefenderCard island; only read the
  // vanilla card here if it's actually mounted.
  if (DOM.defenderNature) {
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
  }

  // Move + modifier fields are owned by the MovePanel / ModifiersPanel islands,
  // which write them straight to STATE. The only cross-panel rule enforced here:
  // Fairy Aura forces the field aura to Fairy while its holder is the attacker
  // (the ModifiersPanel renders the aura select locked/disabled from this), and
  // releasing the lock reverts a previously-forced 'fairy' back to 'none'.
  if (STATE.attacker.ability === 'fairy-aura') {
    STATE.modifiers.aura = 'fairy';
    auraLockedByFairyAura = true;
  } else if (auraLockedByFairyAura) {
    STATE.modifiers.aura = 'none';
    auraLockedByFairyAura = false;
  }

  const attackerSPSum = STATE.attacker.sps.atk + STATE.attacker.sps.spa + STATE.attacker.sps.spe;
  // Attacker EV-sum display is rendered by the island; guard the vanilla write.
  if (DOM.attackerEvSum) {
    DOM.attackerEvSum.className = attackerSPSum > 66
      ? "text-xs font-mono text-red-400 font-bold"
      : "text-xs font-mono text-slate-400";
  }

  const defenderSPSum = STATE.defender.sps.hp + STATE.defender.sps.def + STATE.defender.sps.spd + STATE.defender.sps.spe;
  // Defender EV-sum display is rendered by the island; guard the vanilla write.
  if (DOM.defenderEvSum) {
    DOM.defenderEvSum.className = defenderSPSum > 66
      ? "text-xs font-mono text-red-400 font-bold"
      : "text-xs font-mono text-slate-400";
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
  if (STATE.modifiers.tailAtk) {
    finalAttackerSpe = finalAttackerSpe * 2;
  }

  // Attacker live-stat displays are rendered by the island; guard vanilla writes.
  if (DOM.attackerStatAtkVal) {
    DOM.attackerStatAtkVal.textContent = finalAtk;
    DOM.attackerStatSpaVal.textContent = finalSpa;
    DOM.attackerStatSpeVal.textContent = finalAttackerSpe;
  }

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
  if (STATE.modifiers.tailDef) {
    finalDefenderSpe = finalDefenderSpe * 2;
  }

  // Defender live-stat displays are rendered by the island; guard vanilla writes.
  if (DOM.defenderStatHpVal) {
    DOM.defenderStatHpVal.textContent = finalHp;
    DOM.defenderStatDefVal.textContent = finalDef;
    DOM.defenderStatSpdVal.textContent = finalSpd;
    DOM.defenderStatSpeVal.textContent = finalDefenderSpe;
  }

  // Attacker EV value labels are rendered by the island; guard vanilla writes.
  if (DOM.attackerEvAtkVal) {
    DOM.attackerEvAtkVal.textContent = STATE.attacker.sps.atk;
    DOM.attackerEvSpaVal.textContent = STATE.attacker.sps.spa;
    DOM.attackerEvSpeVal.textContent = STATE.attacker.sps.spe;
    DOM.attackerEvSum.textContent = `Used: ${attackerSPSum}/66 SP`;
  }

  // Defender EV value labels are rendered by the island; guard vanilla writes.
  if (DOM.defenderEvHpVal) {
    DOM.defenderEvHpVal.textContent = STATE.defender.sps.hp;
    DOM.defenderEvDefVal.textContent = STATE.defender.sps.def;
    DOM.defenderEvSpdVal.textContent = STATE.defender.sps.spd;
    DOM.defenderEvSpeVal.textContent = STATE.defender.sps.spe;
    DOM.defenderEvSum.textContent = `Used: ${defenderSPSum}/66 SP`;
  }

  // Turn order (speed) is computed inside buildResultModel and rendered by the
  // ResultsHUD island.

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
  if (DOM.attackerSpPresets) DOM.attackerSpPresets.value = matchedAtkPreset;

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
  if (DOM.defenderSpPresets) DOM.defenderSpPresets.value = matchedDefPreset;

  runOptimizations();

  // Re-render mounted Preact islands (the AttackerCard) now that STATE + derived
  // values are current. Also fires for vanilla-driven edits (e.g. Tailwind), so
  // the attacker speed display, which folds in Tailwind, stays in sync.
  notify();
}


// Compute the damage rolls + optimizer suggestion cards into the DERIVED stash.
// The OptimizerPanel + ResultsHUD islands render from DERIVED; this no longer
// touches the DOM. Card shape is documented on DERIVED in store.js.
function runOptimizations() {
  const rolls = calculateDamageRolls(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers);
  DERIVED.rolls = rolls;

  const cards = [];
  let notPossible = false;

  if (STATE.mode === 'survival') {
    const cheapest = optimizeSurvivalEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, null);
    const speedy = optimizeSurvivalEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, ['+spe']);
    const current = optimizeSurvivalEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, [STATE.defender.nature]);
    const statName = STATE.move.category.toLowerCase() === 'physical' ? 'Def' : 'SpD';
    const stat = statName.toLowerCase();
    const opt = (title, r) => ({ type: 'survival', theme: 'blue', title, nature: r.nature, hp: r.hp, def: r.def, statName, stat, total: r.total });

    if (cheapest) {
      cards.push(opt('Option 1: Most Efficient', cheapest));
      cards.push(speedy ? opt('Option 2: Speed Positive (+Spe)', speedy)
        : { impossible: true, theme: 'blue', title: 'Option 2: Speed Positive (+Spe)', nature: '+spe' });
      if (current) {
        if (current.nature !== cheapest.nature && !(speedy && current.nature === speedy.nature)) {
          cards.push(opt('Option 3: Keep Current Nature', current));
        }
      } else {
        cards.push({ impossible: true, theme: 'blue', title: 'Option 3: Keep Current Nature', nature: STATE.defender.nature });
      }
    } else {
      notPossible = true;
    }
  } else {
    const cheapest = optimizeOffensiveEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, STATE.targetKO, null);
    const speedy = optimizeOffensiveEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, STATE.targetKO, ['+spe']);
    const current = optimizeOffensiveEVsWithNatures(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers, STATE.targetKO, [STATE.attacker.nature]);
    const stat = STATE.move.category.toLowerCase() === 'physical' ? 'atk' : 'spa';
    const opt = (title, r) => ({ type: 'offensive', theme: 'amber', title, nature: r.nature, sp: r.sp, statName: stat, stat, total: r.sp });

    if (cheapest) {
      cards.push(opt('Option 1: Most Efficient', cheapest));
      cards.push(speedy ? opt('Option 2: Speed Positive (+Spe)', speedy)
        : { impossible: true, theme: 'amber', title: 'Option 2: Speed Positive (+Spe)', nature: '+spe' });
      if (current) {
        if (current.nature !== cheapest.nature && !(speedy && current.nature === speedy.nature)) {
          cards.push(opt('Option 3: Keep Current Nature', current));
        }
      } else {
        cards.push({ impossible: true, theme: 'amber', title: 'Option 3: Keep Current Nature', nature: STATE.attacker.nature });
      }
    } else {
      notPossible = true;
    }
  }

  DERIVED.optimizer = { notPossible, cards };

  // Headline result model for both HUD views (rendered by the ResultsHUD island).
  DERIVED.model = buildResultModel(rolls, STATE);
}

function bindEvents() {
  // Attacker + defender inputs are wired inside their Preact islands; only the
  // still-vanilla move / modifier inputs are bound here.
  // The move/modifier inputs, mode tabs, and OHKO/2HKO target buttons are all
  // wired inside the CenterPanel island (ModifiersPanel / MovePanel /
  // OptimizerPanel). Only the still-vanilla format selector + header buttons here.
  DOM.formatSelector.addEventListener('change', (e) => {
    STATE.format = e.target.value;
    applyFormTheme(STATE.format);
    // Both regulation tags are rendered by their islands (refreshed via notify()
    // at the end of updateLiveStats).
    updateLiveStats();
    onDexFormatChange();
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

  // Override specific sample scenario parameters! Both mons' fields live on STATE
  // (search inputs live in the islands and reset themselves on the next render).
  STATE.attacker.nature = "+atk";
  STATE.attacker.item = "none"; // no held item -> Acrobatics doubles
  STATE.attacker.sps.atk = 32;
  STATE.attacker.sps.spa = 0;
  STATE.attacker.sps.spe = 32;
  STATE.attacker.ability = "none";

  // Max physical bulk Whimsicott
  STATE.defender.nature = "+def";
  STATE.defender.item = "none";
  STATE.defender.sps.hp = 32;
  STATE.defender.sps.def = 32;
  STATE.defender.sps.spd = 0;
  STATE.defender.sps.spe = 0;

  // Pre-select Flying-type Acrobatics move (move fields live on STATE.move).
  try {
    const move = await fetchMoveDetails("acrobatics");
    STATE.move.apiName = move.apiName;
    STATE.move.name = "Acrobatics";
    STATE.move.power = move.power;
    STATE.move.type = move.type;
    STATE.move.category = move.category.toLowerCase();
  } catch (err) {
    console.error("Failed to load preloaded Acrobatics move info", err);
  }

  // Modifiers live on STATE.modifiers (burn on attacker.status).
  STATE.modifiers.spread = false;
  STATE.modifiers.weather = 'none';
  STATE.modifiers.crit = false;
  STATE.attacker.status = null;
  STATE.modifiers.helpingHand = false;
  STATE.modifiers.tailAtk = false;
  STATE.modifiers.tailDef = false;

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

    // Both mons' fields live on STATE (island-owned). An ability this Pokémon
    // can't learn simply won't appear as an option, mirroring old select behavior.
    STATE.attacker.nature = parsed.attacker.nature;
    STATE.attacker.item = parsed.attacker.item;
    STATE.attacker.ability = parsed.attacker.ability;
    STATE.attacker.sps.atk = parsed.attacker.sps.atk;
    STATE.attacker.sps.spa = parsed.attacker.sps.spa;
    STATE.attacker.sps.spe = parsed.attacker.sps.spe;
    STATE.attacker.boosts.atk = parsed.attacker.boosts.atk;
    STATE.attacker.boosts.spa = parsed.attacker.boosts.spa;
    STATE.attacker.boosts.spe = parsed.attacker.boosts.spe;

    STATE.defender.nature = parsed.defender.nature;
    STATE.defender.item = parsed.defender.item;
    STATE.defender.ability = parsed.defender.ability;
    STATE.defender.sps.hp = parsed.defender.sps.hp;
    STATE.defender.sps.def = parsed.defender.sps.def;
    STATE.defender.sps.spd = parsed.defender.sps.spd;
    STATE.defender.sps.spe = parsed.defender.sps.spe;
    STATE.defender.boosts.def = parsed.defender.boosts.def;
    STATE.defender.boosts.spd = parsed.defender.boosts.spd;
    STATE.defender.boosts.spe = parsed.defender.boosts.spe;

    // Modifiers (all on STATE.modifiers; burn on attacker.status).
    const mod = parsed.modifiers;
    STATE.modifiers.spread = mod.spread;
    STATE.modifiers.crit = mod.crit;
    STATE.modifiers.screens = mod.screens;
    STATE.modifiers.friendGuard = mod.friendGuard;
    STATE.modifiers.helpingHand = mod.helpingHand;
    STATE.attacker.status = mod.burn ? 'burned' : null;
    STATE.modifiers.tailAtk = mod.tailAtk;
    STATE.modifiers.tailDef = mod.tailDef;
    STATE.modifiers.weather = mod.weather;
    STATE.modifiers.terrain = mod.terrain;
    STATE.modifiers.aura = mod.aura;

    // Move: a named move re-fetches its base power/type/category; a custom move
    // carries those explicitly. The MovePanel renders from STATE.move.
    if (parsed.move.apiName) {
      try {
        const mv = await fetchMoveDetails(parsed.move.apiName);
        STATE.move.apiName = mv.apiName;
        STATE.move.name = parsed.move.name || mv.apiName;
        STATE.move.power = mv.power;
        STATE.move.type = mv.type;
        STATE.move.category = mv.category.toLowerCase();
      } catch (err) {
        console.error("Imported move not found, falling back to custom:", err);
        STATE.move.apiName = "";
        STATE.move.name = "Custom Move";
      }
    } else {
      STATE.move.apiName = "";
      STATE.move.name = "Custom Move";
      STATE.move.type = parsed.move.type;
      STATE.move.category = parsed.move.category;
      STATE.move.power = parsed.move.power;
    }

    // Panel state (mode tabs + target buttons render from STATE in OptimizerPanel).
    STATE.mode = parsed.mode === 'survival' ? 'survival' : 'offensive';
    STATE.targetKO = parsed.ko === '2hko' ? '2hko' : 'ohko';

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
  // Sweep stale-version cache entries before any fetch reads or writes them.
  pruneOldCaches();
  // Register the shared recompute pipeline so the Preact islands' update() calls
  // run the same updateLiveStats the vanilla inputs use, then mount the island.
  setRecompute(updateLiveStats);
  render(h(AttackerCard, { onChoose: setAttackerDetails }), document.getElementById('panel-attacker'));
  render(h(DefenderCard, { onChoose: setDefenderDetails }), document.getElementById('panel-defender'));
  render(h(CenterPanel), document.getElementById('panel-center'));
  render(h(ResultsHUD, { variant: 'desktop' }), document.getElementById('results-hud'));
  render(h(ResultsHUD, { variant: 'mobile' }), document.getElementById('mobile-floating-overlay'));
  // Build the format dropdown from the regulation registry (+ the unrestricted
  // "None" view) up front so it's never empty, even before the async loads below.
  // Adding a regulation is then purely a data change in regulations.js.
  populateFormatSelector();
  bindEvents();
  initMobileTabbing();
  // Register the calculator as the home view in the shared nav, then let the
  // dex pages register themselves. The calculator has no onShow side effect.
  registerPage('calculator', {
    navBtn: document.getElementById('nav-calculator'),
    pageEl: document.getElementById('page-calculator')
  });
  initDetailModal();
  initDexPage({
    onMoveClick: (apiName) => { jumpToAttackdexMove(apiName); showPage('attackdex'); },
    getMoveDetails
  });
  initAttackdexPage({
    onPokemonClick: (apiName) => { jumpToDexPokemon(apiName); showPage('pokedex'); },
    getPokemonDetails
  });

  // Both search/autocomplete flows live inside their Preact islands.

  // The status-move filter list must be ready before any move dropdown is
  // built, otherwise non-damaging moves leak through unfiltered.
  await initStatusMovesList();
  await initChampionsRoster();

  // Fire preloaded sample scenario instantly on startup! Await it, then notify()
  // once more: the islands subscribe to the store in a layout effect after mount,
  // so an early notify() during the sample load could land before they're listening.
  // A trailing notify() (subscriptions guaranteed registered by now) makes the
  // islands reflect the loaded matchup instead of staying on their empty state.
  try {
    await loadSampleVGCScenario();
  } catch (err) {
    console.error("Preloader error:", err);
  }
  notify();

  // Fetch massive search databases quietly in the background without blocking!
  initPokemonList().then(setSearchPlaceholders);
  // Warm the Attackdex move index so its first open is instant (names only; each
  // move's stats are lazy-loaded as rows scroll in).
  initAllMovesList();

  // Tint the brand/format chrome to match the active format's Rotom form.
  applyFormTheme(STATE.format);
}

// Populate #format-selector: one option per regulation, then the unrestricted
// National Dex ("None") view. Keeps the menu in sync with REGULATIONS.
function populateFormatSelector() {
  const sel = DOM.formatSelector;
  if (!sel) return;
  const options = Object.entries(REGULATIONS).map(
    ([format, reg]) => `<option value="${format}" class="bg-slate-800">${reg.short}</option>`
  );
  options.push('<option value="all" class="bg-slate-800">None</option>');
  sel.innerHTML = options.join('');
  sel.value = STATE.format;
}

document.addEventListener('DOMContentLoaded', init);
