// Pokemon Champions VGC SP Optimizer & Damage Calculator
// Pure Client-Side JavaScript ES6+

import { calculateStat, calculateStatBoost } from './src/engine/stats.js';
import { calculateDamageRolls } from './src/engine/damage.js';
import { bst, sortDex, filterDex } from './src/data/dex.js';
import { DOM } from './src/ui/dom.js';
import {
  getTypeBgClass,
  createOptionCardHTML,
  createImpossibleOptionCardHTML,
  updateStatsBars,
  updateDropdownColors,
  updateMoveDetailsVisuals,
} from './src/ui/render.js';

// ==========================================
// 1. STATIC DATA: NATURES & TYPES
// ==========================================

const NATURES = [
  { id: 'neutral', name: 'Neutral' },
  { id: '+atk', name: '+Attack' },
  { id: '+spa', name: '+Sp. Attack' },
  { id: '+def', name: '+Defense' },
  { id: '+spd', name: '+Sp. Defense' },
  { id: '+spe', name: '+Speed' }
];

const ALL_TYPES = [
  'Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting',
  'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost',
  'Dragon', 'Dark', 'Steel', 'Fairy'
];

const OFFENSIVE_VGC_ABILITIES = [
  { apiName: 'huge-power', name: 'Huge Power (2x Atk Stat)' },
  { apiName: 'guts', name: 'Guts Activated (1.5x Atk Stat)' },
  { apiName: 'adaptability', name: 'Adaptability (2.0x STAB)' },
  { apiName: 'technician', name: 'Technician (1.5x moves <= 60 power)' },
  { apiName: 'sharpness', name: 'Sharpness (1.5x Slicing moves)' },
  { apiName: 'tough-claws', name: 'Tough Claws (1.3x Contact moves)' },
  { apiName: 'strong-jaw', name: 'Strong Jaw (1.5x Biting moves)' },
  { apiName: 'sniper', name: 'Sniper (Boosts Crit to 2.25x)' },
  { apiName: 'transistor', name: 'Transistor (1.3x Electric moves)' },
  { apiName: 'steelworker', name: 'Steelworker (1.5x Steel moves)' },
  { apiName: 'rocky-payload', name: 'Rocky Payload (1.5x Rock moves)' },
  { apiName: 'supreme-overlord', name: 'Supreme Overlord (1.5x damage)' },
  { apiName: 'iron-fist', name: 'Iron Fist (1.2x Punching moves)' },
  { apiName: 'mega-sol', name: 'Mega Sol (Always Sunny)' },
  { apiName: 'fairy-aura', name: 'Fairy Aura (1.33x Fairy moves)' }
];

const DEFENSIVE_VGC_ABILITIES = [
  { apiName: 'multiscale', name: 'Multiscale (0.5x full HP)' },
  { apiName: 'shadow-shield', name: 'Shadow Shield (0.5x full HP)' },
  { apiName: 'fluffy', name: 'Fluffy (0.5x Contact Physical)' },
  { apiName: 'ice-scales', name: 'Ice Scales (0.5x Special)' }
];

function OFF_VGC_ABILITIES_HELPER(learnable) {
  return OFFENSIVE_VGC_ABILITIES.filter(vgc => 
    learnable.some(a => a.apiName === vgc.apiName)
  );
}

function DEF_VGC_ABILITIES_HELPER(learnable) {
  return DEFENSIVE_VGC_ABILITIES.filter(vgc => 
    learnable.some(a => a.apiName === vgc.apiName)
  );
}

// ==========================================
// 2. APPLICATION STATE & GLOBAL CACHE
// ==========================================

const STATE = {
  mode: 'offensive', 
  targetKO: 'ohko',  
  format: 'regulation_ma', 
  
  attacker: {
    name: '',
    apiName: '',
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 50,
    nature: '+atk',
    item: 'none',
    ability: 'none',
    sps: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    boosts: { atk: 0, spa: 0, spe: 0 },
    types: ['???'],
    moves: [],
    status: null
  },

  defender: {
    name: '',
    apiName: '',
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 50,
    nature: '+def',
    item: 'none',
    ability: 'none',
    sps: { hp: 32, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    boosts: { def: 0, spd: 0, spe: 0 },
    types: ['???']
  },

  move: {
    name: 'Custom Move',
    type: 'Normal',
    power: 80,
    category: 'physical'
  },

  modifiers: {
    spread: false,
    weather: 'none', // 'none', 'sun', 'rain', 'sandstorm', 'snow'
    crit: false,
    helpingHand: false
    // movesFirst (Bolt Beak / Fishious Rend) is left unset so the engine
    // infers turn order from effective Speed; set it to override that.
  }
};

const CACHE = {
  pokemonList: [], 
  pokemonDetails: {}, 
  movesDetails: {},
  statusMoves: {},
  championsLegalList: null
};

// ==========================================
// 4. OPTIMIZATION ALGORITHMS
// ==========================================

function optimizeSurvivalEVsWithNatures(attacker, defender, move, modifiers, allowedNatures) {
  const isPhysical = move.category.toLowerCase() === 'physical';
  const defStatName = isPhysical ? 'def' : 'spd';

  let bestHP = null;
  let bestDef = null;
  let bestNature = null;
  let minSum = 9999;

  const testAttacker = JSON.parse(JSON.stringify(attacker));
  const testDefender = JSON.parse(JSON.stringify(defender));

  NATURES.forEach(nat => {
    if (allowedNatures && !allowedNatures.includes(nat.id)) return;
    testDefender.nature = nat.id;

    for (let spHP = 0; spHP <= 32; spHP++) {
      for (let spDef = 0; spDef <= 32; spDef++) {
        const totalUsed = spHP + spDef;
        if (totalUsed > 66) continue;
        if (totalUsed > minSum) continue; 

        testDefender.sps.hp = spHP;
        testDefender.sps[defStatName] = spDef;

        const hpVal = calculateStat('hp', testDefender.baseStats.hp, spHP, nat.id, true);
        const rolls = calculateDamageRolls(testAttacker, testDefender, move, modifiers);
        const maxDamage = rolls[rolls.length - 1];

        if (maxDamage < hpVal) {
          let isBetter = false;
          if (totalUsed < minSum) {
            isBetter = true;
          } else if (totalUsed === minSum) {
            if (nat.id === defender.nature && bestNature !== defender.nature) {
              isBetter = true; 
            } else if (nat.id === bestNature || bestNature !== defender.nature) {
              if (spHP > bestHP) {
                isBetter = true;
              }
            }
          }

          if (isBetter) {
            minSum = totalUsed;
            bestHP = spHP;
            bestDef = spDef;
            bestNature = nat.id;
          }
        }
      }
    }
  });

  if (bestHP === null) return null; 
  return { hp: bestHP, def: bestDef, nature: bestNature, total: minSum };
}

function optimizeOffensiveEVsWithNatures(attacker, defender, move, modifiers, targetKO, allowedNatures) {
  const isPhysical = move.category.toLowerCase() === 'physical';
  const atkStatName = isPhysical ? 'atk' : 'spa';

  let bestSP = null;
  let bestNature = null;
  let minSP = 9999;

  const testAttacker = JSON.parse(JSON.stringify(attacker));
  const testDefender = JSON.parse(JSON.stringify(defender));

  const defHP = calculateStat('hp', defender.baseStats.hp, defender.sps.hp, defender.nature, true);

  NATURES.forEach(nat => {
    if (allowedNatures && !allowedNatures.includes(nat.id)) return;
    testAttacker.nature = nat.id;

    for (let spAtk = 0; spAtk <= 32; spAtk++) {
      if (spAtk > minSP) continue;

      testAttacker.sps[atkStatName] = spAtk;
      const rolls = calculateDamageRolls(testAttacker, testDefender, move, modifiers);
      const minDamage = rolls[0];

      let success = false;
      if (targetKO === 'ohko') {
        if (minDamage >= defHP) success = true;
      } else {
        if (minDamage >= Math.ceil(defHP / 2)) success = true;
      }

      if (success) {
        let isBetter = false;
        if (spAtk < minSP) {
          isBetter = true;
        } else if (spAtk === minSP) {
          if (nat.id === attacker.nature && bestNature !== attacker.nature) {
            isBetter = true; 
          }
        }

        if (isBetter) {
          minSP = spAtk;
          bestSP = spAtk;
          bestNature = nat.id;
        }
      }
    }
  });

  if (bestSP === null) return null;
  return { sp: bestSP, nature: bestNature };
}

// ==========================================
// 5. REGULATION M-A RULES CHECKER
// ==========================================

// Non-legal cosmetic / gimmick / event forms. These share a prefix with a legal
// base species (so they'd otherwise pass the form check below) but aren't VGC
// selectable: Gigantamax, Totem, cosplay/cap Pikachu, Eternal Floette,
// Ash-Greninja (Battle Bond), Let's Go starters, etc.
const NON_LEGAL_FORMS = [
  '-totem', '-cap', '-battle-bond', '-gmax', '-eternamax', '-starter',
  '-cosplay', '-rock-star', '-belle', '-pop-star', '-phd', '-libre',
  '-eternal', 'greninja-ash'
];

function isRegulationMALegal(apiName) {
  if (!apiName) return false;
  const name = apiName.toLowerCase();

  if (NON_LEGAL_FORMS.some(f => name.includes(f))) return false;
  if (!CACHE.championsLegalList) return false;

  // A Pokémon is legal when it IS, or is a form of, a legal base species. PokéAPI
  // names every variety as "<base>-<form>" (charizard-mega-x, aegislash-shield,
  // ninetales-alola), and some legal species only exist as such forms. The
  // trailing-hyphen guard matches those forms without letting a base like "mew"
  // match "mewtwo", and it handles hyphenated base names (kommo-o, ho-oh).
  for (const base of CACHE.championsLegalList) {
    if (name === base || name.startsWith(base + '-')) return true;
  }
  return false;
}

async function initChampionsLegalList() {
  const cacheKey = 'vgc_opt_champions_legal_list_v3';
  const cached = Storage.get(cacheKey);
  if (cached && cached.length > 0) {
    CACHE.championsLegalList = new Set(cached);
    return;
  }

  try {
    const res = await fetch('champions_dex.json');
    const data = await res.json();
    CACHE.championsLegalList = new Set(data);
    Storage.set(cacheKey, data);
  } catch (err) {
    console.error("Failed to fetch Champions VGC local Pokedex JSON, loading fallback", err);
    // High-fidelity VGC legal fallbacks (Scenario templates!)
    CACHE.championsLegalList = new Set([
      'crabominable', 'incineroar', 'flutter-mane', 'amoonguss', 'rillaboom', 'tornadus',
      'urshifu', 'gholdengo', 'kingambit', 'sneasler', 'garchomp', 'basculegion',
      'charizard', 'venusaur', 'blastoise', 'beedrill', 'pidgeot', 'pikachu', 'raichu', 'clefable', 'ninetales'
    ]);
  }
}

const API_BASE = 'https://pokeapi.co/api/v2';

const Storage = {
  get: (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }
};

async function initPokemonList() {
  const cached = Storage.get('vgc_opt_pokemon_list_v2');
  if (cached && cached.length > 0) {
    CACHE.pokemonList = cached;
    DOM.attackerSearch.placeholder = "Search Attacker (" + CACHE.pokemonList.length + " loaded)...";
    DOM.defenderSearch.placeholder = "Search Defender (" + CACHE.pokemonList.length + " loaded)...";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/pokemon?limit=1500`);
    const data = await res.json();
    
    CACHE.pokemonList = data.results.map(p => ({
      name: formatDisplayName(p.name),
      apiName: p.name,
      url: p.url
    }));

    Storage.set('vgc_opt_pokemon_list_v2', CACHE.pokemonList);
    DOM.attackerSearch.placeholder = "Search Attacker (" + CACHE.pokemonList.length + " loaded)...";
    DOM.defenderSearch.placeholder = "Search Defender (" + CACHE.pokemonList.length + " loaded)...";
  } catch (e) {
    console.error('Failed fetching Pokemon list from PokeAPI', e);
    CACHE.pokemonList = [
      { name: 'Incineroar', apiName: 'incineroar' },
      { name: 'Flutter Mane', apiName: 'flutter-mane' },
      { name: 'Amoonguss', apiName: 'amoonguss' },
      { name: 'Urshifu Rapid-Strike', apiName: 'urshifu-rapid-strike' },
      { name: 'Rillaboom', apiName: 'rillaboom' },
      { name: 'Calyrex Shadow', apiName: 'calyrex-shadow' },
      { name: 'Ogerpon Hearthflame', apiName: 'ogerpon-hearthflame' },
      { name: 'Tornadus', apiName: 'tornadus' }
    ];
    DOM.attackerSearch.placeholder = "Search Attacker (Fallbacks loaded)...";
    DOM.defenderSearch.placeholder = "Search Defender (Fallbacks loaded)...";
  }
}

async function initStatusMovesList() {
  const cacheKey = 'vgc_opt_status_moves_set_v1';
  let statusMoves = Storage.get(cacheKey);
  
  if (!statusMoves) {
    try {
      const res = await fetch('https://pokeapi.co/api/v2/move-damage-class/status/');
      const data = await res.json();
      
      statusMoves = {};
      data.moves.forEach(m => {
        statusMoves[m.name] = true;
      });
      Storage.set(cacheKey, statusMoves);
    } catch (err) {
      console.error("Failed to fetch status moves list", err);
      statusMoves = {};
    }
  }
  
  CACHE.statusMoves = statusMoves;
}

function formatDisplayName(apiName) {
  return apiName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function fetchPokemonDetails(apiName) {
  const cacheKey = `poke_details_v6_${apiName}`;
  const cached = Storage.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/pokemon/${apiName}`);
  const data = await res.json();

  let movesMapped = data.moves.map(m => ({
    name: formatDisplayName(m.move.name),
    apiName: m.move.name
  }));

  // PokéAPI empty moves learnset fallback for Mega Evolution species/special forms!
  if (movesMapped.length === 0 && apiName.includes('-mega')) {
    try {
      const baseSpeciesName = apiName.split('-mega')[0];
      const baseRes = await fetch(`${API_BASE}/pokemon/${baseSpeciesName}`);
      const baseData = await baseRes.json();
      movesMapped = baseData.moves.map(m => ({
        name: formatDisplayName(m.move.name),
        apiName: m.move.name
      }));
    } catch (err) {
      console.error(`Failed to fetch base species moves fallback for ${apiName}`, err);
    }
  }

  const details = {
    name: formatDisplayName(data.name),
    apiName: data.name,
    sprite: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
    types: data.types.map(t => formatDisplayName(t.type.name)),
    baseStats: {
      hp: data.stats[0].base_stat,
      atk: data.stats[1].base_stat,
      def: data.stats[2].base_stat,
      spa: data.stats[3].base_stat,
      spd: data.stats[4].base_stat,
      spe: data.stats[5].base_stat
    },
    moves: movesMapped,
    abilities: data.abilities.map(a => ({
      name: formatDisplayName(a.ability.name),
      apiName: a.ability.name
    }))
  };

  Storage.set(cacheKey, details);
  return details;
}

async function fetchMoveDetails(moveApiName) {
  const cacheKey = `move_details_${moveApiName}`;
  const cached = Storage.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/move/${moveApiName}`);
  const data = await res.json();

  const details = {
    name: formatDisplayName(data.name),
    apiName: data.name,
    power: data.power || 0,
    type: formatDisplayName(data.type.name),
    category: data.damage_class.name 
  };

  Storage.set(cacheKey, details);
  return details;
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

    if (STATE.format === 'regulation_ma') {
      matches = matches.filter(p => isRegulationMALegal(p.apiName));
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

function updateRegulationTag(apiName, tagEl) {
  if (!apiName) {
    tagEl.classList.add('hidden');
    return;
  }
  tagEl.classList.remove('hidden');

  const isRegMA = STATE.format === 'regulation_ma';

  if (isRegMA) {
    const isLegal = isRegulationMALegal(apiName);
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
  if (damagingMoves.length > 0) {
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

  // Dynamic Turn-Order Comparison Banner Generation (Desktop & Mobile Sync!)
  if (!STATE.attacker.name || !STATE.defender.name) {
    DOM.speedComparisonBanner.innerHTML = `<span class="text-slate-555 italic flex items-center justify-center gap-1"><i class="fa-solid fa-hourglass-half mr-1 text-[10px]"></i> Awaiting Pokemon Search...</span>`;
    if (DOM.mobOverlaySpeed) {
      DOM.mobOverlaySpeed.textContent = "Awaiting Speed";
      DOM.mobOverlaySpeed.className = "text-[7px] font-black px-1.5 py-0.5 rounded uppercase font-mono select-none tracking-wider bg-slate-850 text-slate-450 border border-slate-750 border";
    }
  } else if (finalAttackerSpe > finalDefenderSpe) {
    DOM.speedComparisonBanner.innerHTML = `
      <span class="text-green-400 flex items-center gap-1">
        <i class="fa-solid fa-bolt"></i> ${STATE.attacker.name} (${finalAttackerSpe} Spe) outspeeds ${STATE.defender.name} (${finalDefenderSpe} Spe) — Attacker goes first!
      </span>`;
    if (DOM.mobOverlaySpeed) {
      DOM.mobOverlaySpeed.textContent = "Attacker Moves 1st";
      DOM.mobOverlaySpeed.className = "text-[7px] font-black px-1.5 py-0.5 rounded uppercase font-mono select-none tracking-wider bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 border";
    }
  } else if (finalDefenderSpe > finalAttackerSpe) {
    DOM.speedComparisonBanner.innerHTML = `
      <span class="text-orange-400 flex items-center gap-1">
        <i class="fa-solid fa-bolt"></i> ${STATE.defender.name} (${finalDefenderSpe} Spe) outspeeds ${STATE.attacker.name} (${finalAttackerSpe} Spe) — Defender goes first!
      </span>`;
    if (DOM.mobOverlaySpeed) {
      DOM.mobOverlaySpeed.textContent = "Attacker Moves 2nd";
      DOM.mobOverlaySpeed.className = "text-[7px] font-black px-1.5 py-0.5 rounded uppercase font-mono select-none tracking-wider bg-red-950/60 text-red-400 border border-red-900/30 border";
    }
  } else {
    DOM.speedComparisonBanner.innerHTML = `
      <span class="text-yellow-450 flex items-center gap-1">
        <i class="fa-solid fa-arrows-left-right"></i> Speed Tie (${finalAttackerSpe} Spe) — 50% chance to attack first!
      </span>`;
    if (DOM.mobOverlaySpeed) {
      DOM.mobOverlaySpeed.textContent = "Speed Tie";
      DOM.mobOverlaySpeed.className = "text-[7px] font-black px-1.5 py-0.5 rounded uppercase font-mono select-none tracking-wider bg-amber-950/60 text-amber-400 border border-amber-900/30 border";
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
  const minDamage = rolls[0];
  const maxDamage = rolls[rolls.length - 1];

  const finalHp = calculateStat('hp', STATE.defender.baseStats.hp, STATE.defender.sps.hp, STATE.defender.nature, true);
  
  const minPct = ((minDamage / finalHp) * 100).toFixed(1);
  const maxPct = ((maxDamage / finalHp) * 100).toFixed(1);

  DOM.damagePercentageRange.textContent = `${minPct}% - ${maxPct}%`;
  DOM.damageRollsCount.textContent = `Rolls: ${minDamage} to ${maxDamage} hp`;

  const fillVal = Math.min(100, parseFloat(maxPct));
  DOM.damageBarMin.style.width = `${fillVal}%`;
  if (fillVal >= 100) {
    DOM.damageBarMin.className = "h-full bg-gradient-to-r from-red-600 to-rose-600 rounded-full transition-all duration-300";
  } else if (fillVal >= 50) {
    DOM.damageBarMin.className = "h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all duration-300";
  } else {
    DOM.damageBarMin.className = "h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-300";
  }

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

  // Update Premium Mobile Sticky Floating Overlay in real-time!
  if (DOM.mobOverlayMatchup) {
    if (!STATE.attacker.name || !STATE.defender.name) {
      DOM.mobOverlayMatchup.textContent = "Awaiting Pokemon Selection...";
      DOM.mobOverlayMove.textContent = "Select both slots to calculate";
      DOM.mobOverlayDamage.textContent = "0 - 0 Dmg";
      DOM.mobOverlayPct.textContent = "0.0% Damage";
      DOM.mobOverlayBadge.textContent = "Awaiting";
      DOM.mobOverlayBadge.className = "h-7 px-2 rounded-lg flex items-center justify-center text-[9px] font-black uppercase bg-slate-850 text-slate-450 border border-slate-750 select-none tracking-wider";
    } else {
      DOM.mobOverlayMatchup.textContent = `${STATE.attacker.name} vs ${STATE.defender.name}`;
      DOM.mobOverlayMove.textContent = `${STATE.move.name} (${STATE.move.power} BP)`;
      DOM.mobOverlayDamage.textContent = `${minDamage} - ${maxDamage} Dmg`;
      
      const finalHp = calculateStat('hp', STATE.defender.baseStats.hp, STATE.defender.sps.hp, STATE.defender.nature, true);
      const minPct = (minDamage / finalHp) * 100;
      const maxPct = (maxDamage / finalHp) * 100;
      
      DOM.mobOverlayPct.textContent = `${minPct.toFixed(1)}% - ${maxPct.toFixed(1)}%`;
      
      // Glowing verdict badges matching top layouts (Correct VGC Survival/Offensive Chance logic!)
      if (STATE.mode === 'survival') {
        const isOHKO = minDamage >= finalHp;
        const isChance = minDamage < finalHp && maxDamage >= finalHp;
        
        if (isOHKO) {
          DOM.mobOverlayBadge.innerHTML = `<span class="leading-none">Faints</span>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-red-950/60 text-red-400 border border-red-900/30 select-none tracking-wider animate-pulse";
        } else if (isChance) {
          DOM.mobOverlayBadge.innerHTML = `
            <div class="flex flex-col items-center justify-center leading-none gap-0.5">
              <span>Survives</span>
              <span class="text-[7px] font-extrabold lowercase opacity-85 tracking-normal font-sans">(roll)</span>
            </div>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-amber-950/60 text-amber-400 border border-amber-900/30 select-none tracking-wider";
        } else {
          DOM.mobOverlayBadge.innerHTML = `<span class="leading-none">Survives</span>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 select-none tracking-wider";
        }
      } else {
        // Dynamic Multi-Tier Offensive VGC calculations solver!
        const isGuaranteedOHKO = minDamage >= finalHp;
        const isPossibleOHKO = minDamage < finalHp && maxDamage >= finalHp;
        const isGuaranteed2HKO = minDamage >= (finalHp / 2);
        const isPossible2HKO = minDamage < (finalHp / 2) && maxDamage >= (finalHp / 2);
        
        if (isGuaranteedOHKO) {
          DOM.mobOverlayBadge.innerHTML = `<span class="leading-none">OHKO</span>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 select-none tracking-wider";
        } else if (isPossibleOHKO) {
          DOM.mobOverlayBadge.innerHTML = `
            <div class="flex flex-col items-center justify-center leading-none gap-0.5">
              <span>OHKO</span>
              <span class="text-[7px] font-extrabold lowercase opacity-85 tracking-normal font-sans">(roll)</span>
            </div>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-amber-950/60 text-amber-400 border border-amber-900/30 select-none tracking-wider";
        } else if (isGuaranteed2HKO) {
          DOM.mobOverlayBadge.innerHTML = `<span class="leading-none">2HKO</span>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 select-none tracking-wider";
        } else if (isPossible2HKO) {
          DOM.mobOverlayBadge.innerHTML = `
            <div class="flex flex-col items-center justify-center leading-none gap-0.5">
              <span>2HKO</span>
              <span class="text-[7px] font-extrabold lowercase opacity-85 tracking-normal font-sans">(roll)</span>
            </div>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-amber-950/60 text-amber-400 border border-amber-900/30 select-none tracking-wider";
        } else {
          DOM.mobOverlayBadge.innerHTML = `<span class="leading-none">No KO</span>`;
          DOM.mobOverlayBadge.className = "h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase bg-red-950/60 text-red-400 border border-red-900/30 select-none tracking-wider";
        }
      }
    }
  }
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
    DOM.tabSurvival.className = "flex-1 text-center py-2.5 text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 bg-blue-600 text-white shadow-md";
    DOM.tabOffensive.className = "flex-1 text-center py-2.5 text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 text-slate-400 hover:text-white";
    DOM.survivalResults.classList.remove('hidden');
    DOM.offensiveResults.classList.add('hidden');
    updateLiveStats();
  });

  DOM.tabOffensive.addEventListener('click', () => {
    STATE.mode = 'offensive';
    DOM.tabOffensive.className = "flex-1 text-center py-2.5 text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 bg-amber-600 text-white shadow-md";
    DOM.tabSurvival.className = "flex-1 text-center py-2.5 text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 text-slate-400 hover:text-white";
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

// ==========================================
//  POKÉDEX STATS-BROWSER PAGE
// ==========================================

const DexPage = {
  roster: [],          // [{ apiName, name, details|null }]
  byName: {},          // apiName -> row (same object refs as roster)
  sortKey: 'bst',
  sortDir: 'desc',
  query: '',
  builtForFormat: null,
  allLoaded: false,    // every roster row has details loaded
  loading: false,
  observer: null,
  dom: null
};

function dexDom() {
  if (DexPage.dom) return DexPage.dom;
  DexPage.dom = {
    pageCalculator: document.getElementById('page-calculator'),
    pagePokedex: document.getElementById('page-pokedex'),
    navCalculator: document.getElementById('nav-calculator'),
    navPokedex: document.getElementById('nav-pokedex'),
    search: document.getElementById('dex-search'),
    rows: document.getElementById('dex-rows'),
    status: document.getElementById('dex-status'),
    header: document.getElementById('dex-header')
  };
  return DexPage.dom;
}

// Build the roster for the current STATE.format from the already-loaded caches.
function buildDexRoster() {
  let entries = (CACHE.pokemonList || []).map(p => ({ apiName: p.apiName, name: p.name }));
  // M-A: keep only legal varieties, using the same predicate the calculator's
  // search uses so the two views stay in sync.
  if (STATE.format === 'regulation_ma') {
    entries = entries.filter(p => isRegulationMALegal(p.apiName));
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  DexPage.roster = entries.map(e => ({ apiName: e.apiName, name: e.name, details: null }));
  DexPage.byName = {};
  DexPage.roster.forEach(r => { DexPage.byName[r.apiName] = r; });
  DexPage.builtForFormat = STATE.format;
  DexPage.allLoaded = false;
}

function dexStatusText() {
  const total = DexPage.roster.length;
  const loaded = DexPage.roster.filter(r => r.details).length;
  if (loaded < total) return `${total} species · loaded ${loaded}/${total}…`;
  return `${total} species`;
}

// Concurrency-limited loader. Resolves once every requested name is fetched.
async function loadDexDetails(apiNames, { rerenderEachBatch = true } = {}) {
  const queue = apiNames.filter(n => DexPage.byName[n] && !DexPage.byName[n].details);
  if (queue.length === 0) return;
  DexPage.loading = true;

  const CONCURRENCY = 8;
  const RENDER_EVERY = 24; // rebuild the table periodically, not on every fetch
  let cursor = 0;
  let sinceRender = 0;

  async function worker() {
    while (cursor < queue.length) {
      const apiName = queue[cursor++];
      try {
        const details = await fetchPokemonDetails(apiName);
        const row = DexPage.byName[apiName];
        if (row) row.details = details;
      } catch (err) {
        console.error(`Pokédex: failed to load ${apiName}`, err);
      }
      if (rerenderEachBatch && ++sinceRender >= RENDER_EVERY) {
        sinceRender = 0;
        renderDex();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  DexPage.loading = false;
  DexPage.allLoaded = DexPage.roster.every(r => r.details);
  renderDex();
}

// Ensure every roster row has details (used before stat-sort / ability-search in
// the National Dex where rows are otherwise lazy-loaded).
async function ensureDexFullyLoaded() {
  if (DexPage.allLoaded || DexPage.loading) return;
  await loadDexDetails(DexPage.roster.map(r => r.apiName));
}

const TYPE_SHORT = {
  Normal: 'NOR', Fire: 'FIR', Water: 'WAT', Grass: 'GRA', Electric: 'ELE',
  Ice: 'ICE', Fighting: 'FIG', Poison: 'POI', Ground: 'GRD', Flying: 'FLY',
  Psychic: 'PSY', Bug: 'BUG', Rock: 'ROC', Ghost: 'GHO', Dragon: 'DRA',
  Dark: 'DRK', Steel: 'STE', Fairy: 'FAI'
};

function dexRowHTML(row) {
  const d = row.details;
  if (!d) {
    // Lazy placeholder; carries data-api so the observer knows what to fetch.
    return `<div class="dex-row grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs" data-api="${row.apiName}">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div>
        <span class="font-bold text-slate-300 truncate">${row.name}</span>
      </div>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-slate-600 text-[10px]">loading…</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
    </div>`;
  }

  const types = d.types.map(t =>
    `<span class="text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white" title="${t}">${TYPE_SHORT[t] || t}</span>`
  ).join(' ');
  const abilities = d.abilities.map(a => a.name).join(', ');
  const s = d.baseStats;
  const total = bst(s);
  const cell = (v) => `<span class="text-right font-mono text-slate-300">${v}</span>`;

  return `<div class="dex-row grid grid-cols-[minmax(150px,1.6fr)_110px_minmax(140px,1.4fr)_repeat(6,46px)_58px] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs hover:bg-slate-800/40 transition" data-api="${row.apiName}">
    <div class="flex items-center gap-2 min-w-0">
      <img src="${d.sprite || ''}" alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0">
      <span class="font-bold text-slate-100 truncate">${row.name}</span>
    </div>
    <div class="flex flex-wrap gap-1">${types}</div>
    <span class="text-slate-400 text-[10px] leading-tight">${abilities}</span>
    ${cell(s.hp)}${cell(s.atk)}${cell(s.def)}${cell(s.spa)}${cell(s.spd)}${cell(s.spe)}
    <span class="text-right font-mono font-bold text-amber-400">${total}</span>
  </div>`;
}

function updateDexSortIndicators() {
  const { header } = dexDom();
  if (!header) return;
  header.querySelectorAll('.dex-sort').forEach(btn => {
    const arrow = btn.querySelector('.dex-arrow');
    const active = btn.dataset.sortKey === DexPage.sortKey;
    btn.classList.toggle('text-amber-400', active);
    if (arrow) arrow.textContent = active ? (DexPage.sortDir === 'desc' ? '▼' : '▲') : '';
  });
}

function renderDex() {
  const { rows, status } = dexDom();
  if (!rows) return;

  const filtered = filterDex(DexPage.roster, DexPage.query);
  const sorted = sortDex(filtered, DexPage.sortKey, DexPage.sortDir);

  rows.innerHTML = sorted.length
    ? sorted.map(dexRowHTML).join('')
    : `<div class="px-3 py-8 text-center text-xs text-slate-500">No Pokémon match “${DexPage.query}”.</div>`;

  if (status) status.textContent = dexStatusText();
  updateDexSortIndicators();
  observeLazyDexRows();
}

// In National Dex mode, fetch details for placeholder rows as they scroll in.
function observeLazyDexRows() {
  const { rows } = dexDom();
  if (!rows) return;
  if (DexPage.observer) DexPage.observer.disconnect();
  if (DexPage.allLoaded) return;

  DexPage.observer = new IntersectionObserver((entries) => {
    const toLoad = [];
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const apiName = entry.target.getAttribute('data-api');
      const row = DexPage.byName[apiName];
      if (row && !row.details) toLoad.push(apiName);
      DexPage.observer.unobserve(entry.target);
    });
    if (toLoad.length) loadDexDetails(toLoad, { rerenderEachBatch: true });
  }, { rootMargin: '200px' });

  rows.querySelectorAll('.dex-row[data-api]').forEach(el => {
    const apiName = el.getAttribute('data-api');
    const row = DexPage.byName[apiName];
    if (row && !row.details) DexPage.observer.observe(el);
  });
}

function showPage(page) {
  const dom = dexDom();
  const activeCls = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition bg-amber-950/40 text-amber-400 shadow";
  const idleCls = "text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider py-1.5 px-2.5 rounded-md transition text-slate-400 hover:text-white";

  if (page === 'pokedex') {
    dom.pageCalculator.classList.add('hidden');
    dom.pagePokedex.classList.remove('hidden');
    dom.navPokedex.className = activeCls;
    dom.navCalculator.className = idleCls;
    openDexPage();
  } else {
    dom.pagePokedex.classList.add('hidden');
    dom.pageCalculator.classList.remove('hidden');
    dom.navCalculator.className = activeCls;
    dom.navPokedex.className = idleCls;
  }
}

// Build + render the dex the first time it's shown (or after a format change).
async function openDexPage() {
  if (DexPage.builtForFormat === STATE.format && DexPage.roster.length > 0) {
    renderDex();
    return;
  }

  // The roster is sourced from the background caches — make sure they're ready.
  // Both caches are needed even for M-A: the legal list seeds base species while
  // the full variety list supplies their Mega and regional forms.
  const { status } = dexDom();
  if (status) status.textContent = 'loading roster…';
  const pending = [];
  if (STATE.format === 'regulation_ma') pending.push(initChampionsLegalList());
  if (!CACHE.pokemonList || CACHE.pokemonList.length === 0) pending.push(initPokemonList());
  if (pending.length) await Promise.all(pending);

  buildDexRoster();
  renderDex();
  // M-A is bounded — eager-load everything so sort/search work instantly.
  if (STATE.format === 'regulation_ma') {
    loadDexDetails(DexPage.roster.map(r => r.apiName));
  }
}

function onDexFormatChange() {
  const dom = dexDom();
  if (!dom.pagePokedex) return;
  DexPage.builtForFormat = null; // force rebuild on next open
  if (!dom.pagePokedex.classList.contains('hidden')) {
    openDexPage();
  }
}

function initDexPage() {
  const dom = dexDom();
  if (!dom.navPokedex) return;

  dom.navPokedex.addEventListener('click', () => showPage('pokedex'));
  dom.navCalculator.addEventListener('click', () => showPage('calculator'));

  let searchTimer = null;
  dom.search.addEventListener('input', (e) => {
    DexPage.query = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      // Ability search needs every row's details; in the lazy National Dex,
      // load them all the first time the user types a non-empty query.
      if (DexPage.query.trim() && !DexPage.allLoaded) {
        await ensureDexFullyLoaded();
      }
      renderDex();
    }, 180);
  });

  dom.header.querySelectorAll('.dex-sort').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.sortKey;
      if (DexPage.sortKey === key) {
        DexPage.sortDir = DexPage.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        DexPage.sortKey = key;
        DexPage.sortDir = key === 'name' ? 'asc' : 'desc';
      }
      // Stat sorting needs every row's stats loaded.
      if (key !== 'name' && !DexPage.allLoaded) {
        renderDex(); // reflect arrow immediately
        await ensureDexFullyLoaded();
      }
      renderDex();
    });
  });
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
  initPokemonList();
  initChampionsLegalList();
}

document.addEventListener('DOMContentLoaded', init);
