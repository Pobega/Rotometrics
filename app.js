// Pokemon Champions VGC SP Optimizer & Damage Calculator
// Pure Client-Side JavaScript ES6+

import { calculateDamageRolls } from './src/engine/damage.js';
import { optimizeSurvivalEVsWithNatures, optimizeOffensiveEVsWithNatures } from './src/engine/optimize.js';
import { OFF_VGC_ABILITIES_HELPER, DEF_VGC_ABILITIES_HELPER } from './src/data/constants.js';
import { STATE, CACHE } from './src/state.js';
import {
  initPokemonList,
  initStatusMovesList,
  initChampionsRoster,
  initAllMovesList,
  fetchPokemonDetails,
  fetchMoveDetails
} from './src/api/pokeapi.js';
import { pruneOldCaches } from './src/api/cache.js';
import { buildResultModel } from './src/ui/result-summary.js';
import { onDexFormatChange, initDexStore, openDexPage, jumpToDexPokemon, getPokemonDetails } from './src/ui-preact/dex-store.js';
import { DexView } from './src/ui-preact/DexView.js';
import { initAttackdexStore, openAttackdexPage, jumpToAttackdexMove, getMoveDetails } from './src/ui-preact/attackdex-store.js';
import { AttackdexView } from './src/ui-preact/AttackdexView.js';
import { registerPage, showPage } from './src/ui/page-nav.js';
import { DetailModal } from './src/ui-preact/DetailModal.js';
import { render, h } from 'preact';
import { AttackerCard } from './src/ui-preact/AttackerCard.js';
import { DefenderCard } from './src/ui-preact/DefenderCard.js';
import { CenterPanel } from './src/ui-preact/OptimizerPanel.js';
import { ResultsHUD } from './src/ui-preact/ResultsHUD.js';
import { Brand, HeaderControls } from './src/ui-preact/HeaderControls.js';
import { ExportImportModal } from './src/ui-preact/ExportImportModal.js';
import { setRecompute, notify, DERIVED } from './src/ui-preact/store.js';


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


// The recompute pipeline. Every island edit flows through here (via the store's
// update()/requestRecompute), as does the format selector. The islands own all
// input fields on STATE; the only cross-panel rule left here is the Fairy-Aura
// lock (the ModifiersPanel renders the locked aura select from it). Then recompute
// damage + optimizer + HUD model into DERIVED and notify the islands to re-render.
function updateLiveStats() {
  if (STATE.attacker.ability === 'fairy-aura') {
    STATE.modifiers.aura = 'fairy';
    auraLockedByFairyAura = true;
  } else if (auraLockedByFairyAura) {
    STATE.modifiers.aura = 'none';
    auraLockedByFairyAura = false;
  }

  runOptimizations();
  notify();
}


// Compute the damage rolls + optimizer suggestion cards into the DERIVED stash.
// The OptimizerPanel + ResultsHUD islands render from DERIVED; this no longer
// touches the DOM. Card shape is documented on DERIVED in store.js.
// The EV/nature search is the expensive part (thousands of damage rolls); cache
// it on a key of its real inputs so updates that don't touch them — a format
// switch, a render-only field — reuse the last result instead of re-searching.
let _optCacheKey = null;
let _optCacheVal = null;

function runOptimizations() {
  const rolls = calculateDamageRolls(STATE.attacker, STATE.defender, STATE.move, STATE.modifiers);
  DERIVED.rolls = rolls;

  const key = JSON.stringify([STATE.mode, STATE.targetKO, STATE.attacker, STATE.defender, STATE.move, STATE.modifiers]);
  if (key !== _optCacheKey) {
    _optCacheKey = key;
    _optCacheVal = computeOptimizer();
  }
  DERIVED.optimizer = _optCacheVal;

  // Headline result model for both HUD views (rendered by the ResultsHUD island).
  DERIVED.model = buildResultModel(rolls, STATE);
}

function computeOptimizer() {
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

  return { notPossible, cards };
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
  // Header chrome islands: brand Rotom (glow tints to the format), the format
  // pill + selector + Load Sample + Export/Import controls, and the Export/Import
  // modal. The format selector reads its options from the regulation registry, so
  // adding a regulation is purely a data change in regulations.js. The theme tint
  // is reactive (no applyFormTheme): the islands re-render from STATE.format.
  render(h(Brand), document.getElementById('brand-rotom-root'));
  render(h(HeaderControls, { onLoadSample: loadSampleVGCScenario }), document.getElementById('header-controls-root'));
  render(h(ExportImportModal, { augmentedState, applyMatchup }), document.getElementById('ei-modal-root'));
  initMobileTabbing();
  // Register the calculator as the home view in the shared nav, then let the
  // dex pages register themselves. The calculator has no onShow side effect.
  registerPage('calculator', {
    navBtn: document.getElementById('nav-calculator'),
    pageEl: document.getElementById('page-calculator')
  });
  render(h(DetailModal), document.getElementById('detail-modal-root'));
  // Pokédex is a Preact island: wire its store callbacks, mount the view into the
  // persistent #page-pokedex container, and register its onShow (build + load).
  initDexStore({
    onMoveClick: (apiName) => { jumpToAttackdexMove(apiName); showPage('attackdex'); },
    getMoveDetails
  });
  render(h(DexView), document.getElementById('page-pokedex'));
  registerPage('pokedex', {
    navBtn: document.getElementById('nav-pokedex'),
    pageEl: document.getElementById('page-pokedex'),
    onShow: openDexPage
  });
  // Attackdex is a Preact island too: wire its store callbacks, mount the view
  // into the persistent #page-attackdex container, and register its onShow.
  initAttackdexStore({
    onPokemonClick: (apiName) => { jumpToDexPokemon(apiName); showPage('pokedex'); },
    getPokemonDetails
  });
  render(h(AttackdexView), document.getElementById('page-attackdex'));
  registerPage('attackdex', {
    navBtn: document.getElementById('nav-attackdex'),
    pageEl: document.getElementById('page-attackdex'),
    onShow: openAttackdexPage
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
  initPokemonList();
  // Warm the Attackdex move index so its first open is instant (names only; each
  // move's stats are lazy-loaded as rows scroll in).
  initAllMovesList();
}

document.addEventListener('DOMContentLoaded', init);
