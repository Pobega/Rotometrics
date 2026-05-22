// Pokemon Champions VGC SP Optimizer & Damage Calculator
// Pure Client-Side JavaScript ES6+

// ==========================================
// 1. STATIC DATA: TYPE MATCHUPS & NATURES
// ==========================================

const TYPE_EFFECTIVENESS = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Electric: { Water: 2, Grass: 0.5, Electric: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Grass: 0.5, Electric: 2, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Grass: 2, Electric: 0.5, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 }
};

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
  { apiName: 'iron-fist', name: 'Iron Fist (1.2x Punching moves)' }
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
  mode: 'survival', 
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
    moves: []
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
    crit: false
  }
};

const CACHE = {
  pokemonList: [], 
  pokemonDetails: {}, 
  movesDetails: {},
  statusMoves: {}
};

// ==========================================
// 3. STAT & DAMAGE FORMULA CALCULATORS (Pokemon Champions Rules)
// ==========================================

function calculateStat(statName, base, sp, natureName, isHP = false) {
  if (isHP) {
    if (base === 1) return 1; 
    return base + sp + 75;
  }

  let natureMod = 1.0;
  const natLower = natureName ? natureName.toLowerCase() : "neutral";

  if (natLower === '+atk' && statName === 'atk') natureMod = 1.1;
  else if (natLower === '+spa' && statName === 'spa') natureMod = 1.1;
  else if (natLower === '+def' && statName === 'def') natureMod = 1.1;
  else if (natLower === '+spd' && statName === 'spd') natureMod = 1.1;
  else if (natLower === '+spe' && statName === 'spe') natureMod = 1.1;

  // Assume standard VGC hindered offensive stat (0.9x) for unrealistic situations!
  if (natLower === '+atk' && statName === 'spa') natureMod = 0.9;
  else if (natLower === '+spa' && statName === 'atk') natureMod = 0.9;
  else if (natLower === '+def' && statName === 'spa') natureMod = 0.9;
  else if (natLower === '+spd' && statName === 'atk') natureMod = 0.9;
  else if (natLower === '+spe' && statName === 'spa') natureMod = 0.9;

  return Math.floor((base + sp + 20) * natureMod);
}

function calculateStatBoost(statValue, stage) {
  if (stage === 0) return statValue;
  if (stage > 0) {
    return Math.floor(statValue * (2 + stage) / 2);
  } else {
    return Math.floor(statValue * 2 / (2 - stage));
  }
}

function getTypeEffectiveness(moveType, defenderTypes) {
  let mult = 1.0;
  for (const defType of defenderTypes) {
    if (defType === '???' || !defType) continue;
    const row = TYPE_EFFECTIVENESS[moveType];
    if (row && row[defType] !== undefined) {
      mult *= row[defType];
    }
  }
  return mult;
}

function calculateDamageRolls(attacker, defender, move, modifiers) {
  const isPhysical = move.category.toLowerCase() === 'physical';
  const atkStatName = isPhysical ? 'atk' : 'spa';
  const defStatName = isPhysical ? 'def' : 'spd';

  let baseAtkVal = calculateStat(atkStatName, attacker.baseStats[atkStatName], attacker.sps[atkStatName], attacker.nature, false);
  let baseDefVal = calculateStat(defStatName, defender.baseStats[defStatName], defender.sps[defStatName], defender.nature, false);

  let effectiveAtk = calculateStatBoost(baseAtkVal, attacker.boosts[atkStatName] || 0);
  let effectiveDef = calculateStatBoost(baseDefVal, defender.boosts[defStatName] || 0);

  if (attacker.item === 'choice_band' && isPhysical) {
    effectiveAtk = Math.floor(effectiveAtk * 1.5);
  } else if (attacker.item === 'choice_specs' && !isPhysical) {
    effectiveAtk = Math.floor(effectiveAtk * 1.5);
  }

  if (attacker.ability === 'huge_power' && isPhysical) {
    effectiveAtk = Math.floor(effectiveAtk * 2.0);
  } else if (attacker.ability === 'guts' && isPhysical) {
    effectiveAtk = Math.floor(effectiveAtk * 1.5);
  }

  if (defender.item === 'assault_vest' && !isPhysical) {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  } else if (defender.item === 'eviolite') {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  }

  // Weather Defensive Buffs:
  // Sandstorm boosts Rock types Sp. Def (SpD) by 1.5x
  if (modifiers.weather === 'sandstorm' && defender.types.includes('Rock') && defStatName === 'spd') {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  }
  // Snow boosts Ice types Defense (Def) by 1.5x
  if (modifiers.weather === 'snow' && defender.types.includes('Ice') && defStatName === 'def') {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  }

  const levelFactor = 22; 
  const baseDamage = Math.floor(Math.floor((levelFactor * move.power * effectiveAtk) / 50) / effectiveDef) + 2;

  let mod = 1.0;

  if (modifiers.spread) {
    mod *= 0.75;
  }

  // Weather offensive modifiers:
  if (modifiers.weather === 'sun') {
    if (move.type === 'Fire') {
      mod *= 1.5;
    } else if (move.type === 'Water') {
      mod *= 0.5;
    }
  } else if (modifiers.weather === 'rain') {
    if (move.type === 'Water') {
      mod *= 1.5;
    } else if (move.type === 'Fire') {
      mod *= 0.5;
    }
  }

  if (modifiers.crit) {
    mod *= (attacker.ability === 'sniper' ? 2.25 : 1.5);
  }

  let stab = 1.0;
  if (attacker.types.includes(move.type)) {
    stab = attacker.ability === 'adaptability' ? 2.0 : 1.5;
  }
  mod *= stab;

  const typeMult = getTypeEffectiveness(move.type, defender.types);
  mod *= typeMult;

  if (isPhysical && attacker.ability !== 'guts' && attacker.status === 'burned') {
    mod *= 0.5;
  }

  // Attacker Offensive Abilities (Technician, Sharpness, Tough Claws, Strong Jaw, Transistor, Steelworker, Supreme Overlord)
  let attackerAbilityMod = 1.0;
  const moveNameLower = move.apiName ? move.apiName.toLowerCase() : "";

  if (attacker.ability === 'technician' && move.power > 0 && move.power <= 60) {
    attackerAbilityMod *= 1.5;
  } else if (attacker.ability === 'sharpness') {
    const slicingMoves = ['leaf-blade', 'sacred-sword', 'kowtow-cleave', 'aqua-cutter', 'slash', 'night-slash', 'air-slash', 'psyblade', 'x-scissor', 'sasha', 'aerial-ace'];
    if (slicingMoves.includes(moveNameLower)) {
      attackerAbilityMod *= 1.5;
    }
  } else if (attacker.ability === 'tough_claws') {
    const contactMoves = ['fake-out', 'close-combat', 'u-turn', 'sucker-punch', 'flare-blitz', 'wood-hammer', 'triple-axel', 'knock-off', 'high-jump-kick', 'drain-punch', 'thunder-punch', 'ice-punch', 'fire-punch', 'brave-bird', 'extreme-speed', 'bullet-punch'];
    if (contactMoves.includes(moveNameLower)) {
      attackerAbilityMod *= 1.3;
    }
  } else if (attacker.ability === 'strong_jaw') {
    const bitingMoves = ['crunch', 'psychic-fangs', 'thunder-fang', 'ice-fang', 'fire-fang', 'fishious-rend', 'bite', 'hyper-fang'];
    if (bitingMoves.includes(moveNameLower)) {
      attackerAbilityMod *= 1.5;
    }
  } else if (attacker.ability === 'iron-fist') {
    const punchingMoves = ['drain-punch', 'ice-punch', 'thunder-punch', 'fire-punch', 'bullet-punch', 'mach-punch', 'rage-fist', 'shadow-punch', 'focus-punch', 'meteor-mash', 'ice-hammer', 'hammer-arm'];
    if (punchingMoves.includes(moveNameLower)) {
      attackerAbilityMod *= 1.2;
    }
  } else if (attacker.ability === 'transistor' && move.type === 'Electric') {
    attackerAbilityMod *= 1.3;
  } else if (attacker.ability === 'steelworker' && (move.type === 'Steel' || move.type === 'Rock')) {
    attackerAbilityMod *= 1.5;
  } else if (attacker.ability === 'supreme_overlord_5') {
    attackerAbilityMod *= 1.5;
  }
  mod *= attackerAbilityMod;

  // Field Screens (0.66x for all moves)
  let screenMod = modifiers.screens ? 0.66 : 1.0;
  mod *= screenMod;

  // Defensive Abilities (Multiscale, Fluffy, Ice Scales)
  let defenderAbilityMod = 1.0;
  if (defender.ability === 'multiscale') {
    defenderAbilityMod = 0.5;
  } else if (defender.ability === 'fluffy' && isPhysical) {
    defenderAbilityMod = 0.5;
  } else if (defender.ability === 'ice_scales' && !isPhysical) {
    defenderAbilityMod = 0.5;
  }
  mod *= defenderAbilityMod;

  // Terrains (Electric, Grassy, Psychic, Misty)
  let terrainMod = 1.0;
  if (modifiers.terrain === 'electric' && move.type === 'Electric' && !attacker.types.includes('Flying')) {
    terrainMod = 1.3;
  } else if (modifiers.terrain === 'grassy' && move.type === 'Grass' && !attacker.types.includes('Flying')) {
    terrainMod = 1.3;
  } else if (modifiers.terrain === 'grassy' && move.type === 'Ground') {
    terrainMod = 0.5;
  } else if (modifiers.terrain === 'psychic' && move.type === 'Psychic' && !attacker.types.includes('Flying')) {
    terrainMod = 1.3;
  } else if (modifiers.terrain === 'misty' && move.type === 'Dragon' && !defender.types.includes('Flying')) {
    terrainMod = 0.5;
  }
  mod *= terrainMod;

  // Auras (Fairy Aura, Dark Aura)
  let auraMod = 1.0;
  if (modifiers.aura === 'fairy' && move.type === 'Fairy') {
    auraMod = 1.33;
  } else if (modifiers.aura === 'dark' && move.type === 'Dark') {
    auraMod = 1.33;
  }
  mod *= auraMod;

  // Friend Guard (Ally Damage Reduction)
  let friendGuardMod = modifiers.friendGuard ? 0.75 : 1.0;
  mod *= friendGuardMod;

  if (attacker.item === 'life_orb') {
    mod *= 1.3;
  } else if (attacker.item === 'expert_belt' && typeMult > 1.0) {
    mod *= 1.2;
  } else if (attacker.item === 'black_glasses_etc') {
    mod *= 1.2;
  }

  if (defender.item === 'berries' && typeMult > 1.0) {
    mod *= 0.5;
  }

  const rolls = [];
  for (let r = 85; r <= 100; r++) {
    const rollVal = Math.floor(baseDamage * (r / 100));
    const finalDamage = Math.floor(rollVal * mod);
    rolls.push(finalDamage);
  }

  return rolls;
}

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

function isRegulationMALegal(apiName) {
  const name = apiName.toLowerCase();

  const paradoxList = [
    'great-tusk', 'scream-tail', 'brute-bonnet', 'flutter-mane', 'slither-wing', 'sandy-shocks',
    'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis', 'iron-moth', 'iron-thorns',
    'roaring-moon', 'iron-valiant', 'walking-wake', 'iron-leaves', 'gouging-fire', 'raging-bolt',
    'iron-crown', 'iron-boulder'
  ];
  if (paradoxList.includes(name)) return false;

  const legendaryList = [
    'koraidon', 'miraidon', 'ting-lu', 'chien-pao', 'wo-chien', 'chi-yu',
    'okidogi', 'munkidori', 'fezandipiti', 'ogerpon', 'terapagos', 'pecharunt',
    'mewtwo', 'lugia', 'ho-oh', 'kyogre', 'groudon', 'rayquaza', 'dialga', 'palkia', 'giratina',
    'reshiram', 'zekrom', 'kyurem', 'xerneas', 'yveltal', 'zygarde', 'solgaleo', 'lunala', 'necrozma',
    'zacian', 'zamazenta', 'eternatus', 'calyrex',
    'articuno', 'zapdos', 'moltres', 'mew', 'raikou', 'entei', 'suicune', 'celebi', 'regirock',
    'regice', 'registeel', 'latias', 'latios', 'jirachi', 'deoxys', 'uxie', 'mesprit', 'azelf',
    'heatran', 'regigigas', 'cresselia', 'phione', 'manaphy', 'darkrai', 'shaymin', 'arceus', 'victini',
    'cobalion', 'terrakion', 'virizion', 'tornadus', 'thundurus', 'landorus', 'keldeo', 'meloetta',
    'genesect', 'diancie', 'hoopa', 'volcanion', 'type-null', 'silvally', 'tapu-koko', 'tapu-lele',
    'tapu-bulu', 'tapu-fini', 'cosmog', 'cosmoem', 'nihilego', 'buzzwole', 'pheromosa', 'xurkitree',
    'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon',
    'magearna', 'marshadow', 'zeraora', 'meltan', 'melmetal', 'kubfu', 'urshifu', 'zarude',
    'regieleki', 'regidrago', 'glastrier', 'spectrier', 'enamorus'
  ];

  for (const leg of legendaryList) {
    if (name === leg || name.startsWith(leg + '-')) return false;
  }

  if (name.includes('totem')) return false;

  return true;
}

// ==========================================
// 6. POKEAPI & AUTOCMP DATA SERVICE
// ==========================================

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
  const cacheKey = `poke_details_v4_${apiName}`;
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

const DOM = {
  formatSelector: document.getElementById('format-selector'),

  attackerSearch: document.getElementById('attacker-search'),
  attackerResults: document.getElementById('attacker-results'),
  attackerSpinner: document.getElementById('attacker-spinner'),
  attackerSprite: document.getElementById('attacker-sprite'),
  attackerName: document.getElementById('attacker-name'),
  attackerTypes: document.getElementById('attacker-types'),
  attackerLevel: document.getElementById('attacker-level'),
  attackerNature: document.getElementById('attacker-nature'),
  attackerItem: document.getElementById('attacker-item'),
  attackerAbility: document.getElementById('attacker-ability'),
  attackerBoostAtk: document.getElementById('attacker-boost-atk'),
  attackerBoostSpa: document.getElementById('attacker-boost-spa'),
  attackerBoostSpe: document.getElementById('attacker-boost-spe'),
  attackerStatAtkVal: document.getElementById('attacker-stat-atk-val'),
  attackerStatSpaVal: document.getElementById('attacker-stat-spa-val'),
  attackerStatSpeVal: document.getElementById('attacker-stat-spe-val'),
  attackerEvAtk: document.getElementById('attacker-ev-atk'),
  attackerEvSpa: document.getElementById('attacker-ev-spa'),
  attackerEvSpe: document.getElementById('attacker-ev-spe'),
  attackerEvAtkVal: document.getElementById('attacker-ev-atk-val'),
  attackerEvSpaVal: document.getElementById('attacker-ev-spa-val'),
  attackerEvSpeVal: document.getElementById('attacker-ev-spe-val'),
  attackerEvSum: document.getElementById('attacker-ev-sum'),
  attackerMoveSelect: document.getElementById('attacker-move-select'),
  attackerRegTag: document.getElementById('attacker-regulation-tag'),
  attackerSpPresets: document.getElementById('attacker-sp-presets'),

  defenderSearch: document.getElementById('defender-search'),
  defenderResults: document.getElementById('defender-results'),
  defenderSpinner: document.getElementById('defender-spinner'),
  defenderSprite: document.getElementById('defender-sprite'),
  defenderName: document.getElementById('defender-name'),
  defenderTypes: document.getElementById('defender-types'),
  defenderLevel: document.getElementById('defender-level'),
  defenderNature: document.getElementById('defender-nature'),
  defenderItem: document.getElementById('defender-item'),
  defenderAbility: document.getElementById('defender-ability'),
  defenderBoostDef: document.getElementById('defender-boost-def'),
  defenderBoostSpd: document.getElementById('defender-boost-spd'),
  defenderBoostSpe: document.getElementById('defender-boost-spe'),
  defenderStatHpVal: document.getElementById('defender-stat-hp-val'),
  defenderStatDefVal: document.getElementById('defender-stat-def-val'),
  defenderStatSpdVal: document.getElementById('defender-stat-spd-val'),
  defenderStatSpeVal: document.getElementById('defender-stat-spe-val'),
  defenderEvHp: document.getElementById('defender-ev-hp'),
  defenderEvDef: document.getElementById('defender-ev-def'),
  defenderEvSpd: document.getElementById('defender-ev-spd'),
  defenderEvSpe: document.getElementById('defender-ev-spe'),
  defenderEvHpVal: document.getElementById('defender-ev-hp-val'),
  defenderEvDefVal: document.getElementById('defender-ev-def-val'),
  defenderEvSpdVal: document.getElementById('defender-ev-spd-val'),
  defenderEvSpeVal: document.getElementById('defender-ev-spe-val'),
  defenderEvSum: document.getElementById('defender-ev-sum'),
  defenderRegTag: document.getElementById('defender-regulation-tag'),
  defenderSpPresets: document.getElementById('defender-sp-presets'),

  moveType: document.getElementById('move-type'),
  movePower: document.getElementById('move-power'),
  moveCategory: document.getElementById('move-category'),

  modSpread: document.getElementById('mod-spread'),
  modWeatherSelect: document.getElementById('mod-weather-select'),
  modCrit: document.getElementById('mod-crit'),
  modFriendGuard: document.getElementById('mod-friend-guard'),
  modScreens: document.getElementById('mod-screens'),
  modTerrainSelect: document.getElementById('mod-terrain-select'),
  modAuraSelect: document.getElementById('mod-aura-select'),
  speedComparisonBanner: document.getElementById('speed-comparison-banner'),

  tabSurvival: document.getElementById('tab-survival'),
  tabOffensive: document.getElementById('tab-offensive'),
  survivalResults: document.getElementById('survival-results'),
  offensiveResults: document.getElementById('offensive-results'),

  survivalNotPossible: document.getElementById('survival-not-possible'),
  survivalPossibleData: document.getElementById('survival-possible-data'),
  survivalOptionsContainer: document.getElementById('survival-options-container'),

  offensiveNotPossible: document.getElementById('offensive-not-possible'),
  offensivePossibleData: document.getElementById('offensive-possible-data'),
  btnTargetOHKO: document.getElementById('btn-target-ohko'),
  btnTarget2HKO: document.getElementById('btn-target-2hko'),
  offensiveOptionsContainer: document.getElementById('offensive-options-container'),

  damagePercentageRange: document.getElementById('damage-percentage-range'),
  damageBarMin: document.getElementById('damage-bar-min'),
  damageRollsCount: document.getElementById('damage-rolls-count'),
  loadSampleBtn: document.getElementById('load-sample-btn')
};

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

    matches = matches.slice(0, 10);

    if (matches.length === 0) {
      resultsEl.innerHTML = `<div class="p-3 text-slate-500 text-xs">No legal Pokémon found in current format</div>`;
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.innerHTML = matches.map(p => `
      <button class="w-full text-left hover:bg-slate-700/50 px-4 py-2.5 text-xs font-bold border-b border-slate-750 flex justify-between items-center transition" data-api-name="${p.apiName}">
        <span>${p.name}</span>
        <span class="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded uppercase font-mono">
          ${isRegulationMALegal(p.apiName) ? 'M-A' : 'Banned'}
        </span>
      </button>
    `).join('');
    resultsEl.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !resultsEl.contains(e.target)) {
      resultsEl.classList.add('hidden');
    }
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
      console.error(err);
    } finally {
      spinnerEl.classList.add('hidden');
    }
  });
}

function updateRegulationTag(apiName, tagEl) {
  if (!apiName) {
    tagEl.classList.add('hidden');
    return;
  }

  const legal = isRegulationMALegal(apiName);
  tagEl.classList.remove('hidden');

  if (legal) {
    tagEl.textContent = "Regulation M-A Legal";
    tagEl.className = "text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-green-950 text-green-400 border border-green-900/50";
  } else {
    tagEl.textContent = "Banned in M-A";
    tagEl.className = "text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 bg-red-950 text-red-400 border border-red-900/50";
  }
}

function updateStatsBars(baseStats, prefix) {
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

  const damagingMoves = details.moves.filter(m => !CACHE.statusMoves[m.apiName]);
  DOM.attackerMoveSelect.innerHTML = `<option value="custom">--- Custom Move ---</option>` + 
    damagingMoves.map(m => `<option value="${m.apiName}">${m.name}</option>`).join('');
  DOM.attackerMoveSelect.value = "custom";

  // Filter custom VGC offensive abilities to ONLY those this Pokemon learn!
  const learnableOffensive = OFF_VGC_ABILITIES_HELPER(details.abilities);
  DOM.attackerAbility.innerHTML = `<option value="none">No offensive ability</option>` + 
    learnableOffensive.map(a => `<option value="${a.apiName}">${a.name}</option>`).join('');
  DOM.attackerAbility.value = "none";

  // Mega Evolution Item Lock (VGC Authenticity)
  const isMega = details.apiName.includes('-mega');
  if (isMega) {
    DOM.attackerItem.value = "mega_stone";
    DOM.attackerItem.disabled = true;
    DOM.attackerItem.className = "w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-400 cursor-not-allowed";
  } else {
    DOM.attackerItem.disabled = false;
    DOM.attackerItem.className = "w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";
  }

  // Enable overrides by default
  DOM.movePower.value = 80;
  DOM.movePower.disabled = false;
  DOM.movePower.className = "w-full bg-slate-800 border border-slate-700 rounded-lg py-1 px-2 text-xs text-center focus:outline-none focus:border-red-500 text-slate-100";

  DOM.moveType.value = "Normal";
  DOM.moveType.disabled = false;
  DOM.moveType.className = "w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";

  DOM.moveCategory.value = "physical";
  DOM.moveCategory.disabled = false;
  DOM.moveCategory.className = "w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";

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

  // Symmetrical Defender Mega Item Lock
  const isMega = details.apiName.includes('-mega');
  if (isMega) {
    DOM.defenderItem.value = "mega_stone";
    DOM.defenderItem.disabled = true;
    DOM.defenderItem.className = "w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-400 cursor-not-allowed";
  } else {
    DOM.defenderItem.disabled = false;
    DOM.defenderItem.className = "w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-blue-500 text-slate-100 cursor-pointer";
  }

  updateLiveStats();
}function updateLiveStats() {
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

  STATE.move.type = DOM.moveType.value;
  STATE.move.power = parseInt(DOM.movePower.value) || 0;
  STATE.move.category = DOM.moveCategory.value;

  STATE.modifiers.spread = DOM.modSpread.checked;
  STATE.modifiers.weather = DOM.modWeatherSelect.value;
  STATE.modifiers.crit = DOM.modCrit.checked;
  STATE.modifiers.friendGuard = DOM.modFriendGuard.checked;
  STATE.modifiers.screens = DOM.modScreens.checked;
  STATE.modifiers.terrain = DOM.modTerrainSelect.value;
  STATE.modifiers.aura = DOM.modAuraSelect.value;

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

  // Dynamic Turn-Order Comparison Banner Generation
  if (!STATE.attacker.name || !STATE.defender.name) {
    DOM.speedComparisonBanner.innerHTML = `<span class="text-slate-555 italic flex items-center justify-center gap-1"><i class="fa-solid fa-hourglass-half mr-1 text-[10px]"></i> Awaiting Pokemon Search...</span>`;
  } else if (finalAttackerSpe > finalDefenderSpe) {
    DOM.speedComparisonBanner.innerHTML = `
      <span class="text-green-400 flex items-center gap-1">
        <i class="fa-solid fa-bolt"></i> ${STATE.attacker.name} (${finalAttackerSpe} Spe) outspeeds ${STATE.defender.name} (${finalDefenderSpe} Spe) — Attacker goes first!
      </span>`;
  } else if (finalDefenderSpe > finalAttackerSpe) {
    DOM.speedComparisonBanner.innerHTML = `
      <span class="text-orange-400 flex items-center gap-1">
        <i class="fa-solid fa-bolt"></i> ${STATE.defender.name} (${finalDefenderSpe} Spe) outspeeds ${STATE.attacker.name} (${finalAttackerSpe} Spe) — Defender goes first!
      </span>`;
  } else {
    DOM.speedComparisonBanner.innerHTML = `
      <span class="text-yellow-450 flex items-center gap-1">
        <i class="fa-solid fa-arrows-left-right"></i> Speed Tie (${finalAttackerSpe} Spe) — 50% chance to attack first!
      </span>`;
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

function formatNatureDisplayName(natId) {
  const mapping = {
    'neutral': 'Neutral',
    '+atk': '+Atk',
    '+spa': '+SpAtk',
    '+def': '+Def',
    '+spd': '+SpDef',
    '+spe': '+Spe'
  };
  return mapping[natId.toLowerCase()] || natId;
}

function createOptionCardHTML(title, nature, hpVal, defVal, statName, totalSP, themeColor) {
  const isSurvival = themeColor === 'blue';
  const themeText = isSurvival ? 'text-blue-400' : 'text-amber-400';
  const themeBg = isSurvival ? 'bg-blue-950/25 border-blue-900/40 hover:border-blue-800/60' : 'bg-amber-950/25 border-amber-900/40 hover:border-amber-800/60';
  const themeBtn = isSurvival ? 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-800' : 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-800';

  const natureFormatted = formatNatureDisplayName(nature);

  return `
    <div class="border rounded-xl p-3 flex flex-col gap-2 transition text-left ${themeBg}">
      <div class="flex justify-between items-start gap-3">
        <div>
          <div class="text-[9px] text-slate-450 uppercase font-extrabold tracking-wider">${title}</div>
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

function createImpossibleOptionCardHTML(title, nature, themeColor) {
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
}

function getTypeBgClass(type) {
  const bgClasses = {
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
    Fairy: 'bg-pink-400 text-slate-900'
  };
  return bgClasses[type] || 'bg-slate-700';
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
    DOM.modFriendGuard, DOM.modScreens, DOM.modTerrainSelect, DOM.modAuraSelect
  ];

  inputs.forEach(inp => {
    inp.addEventListener('input', updateLiveStats);
  });

  DOM.formatSelector.addEventListener('change', (e) => {
    STATE.format = e.target.value;
    updateRegulationTag(STATE.attacker.apiName, DOM.attackerRegTag);
    updateRegulationTag(STATE.defender.apiName, DOM.defenderRegTag);
    updateLiveStats();
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
      // Enable overrides
      DOM.movePower.disabled = false;
      DOM.movePower.className = "w-full bg-slate-800 border border-slate-700 rounded-lg py-1 px-2 text-xs text-center focus:outline-none focus:border-red-500 text-slate-100";
      
      DOM.moveType.disabled = false;
      DOM.moveType.className = "w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";
      
      DOM.moveCategory.disabled = false;
      DOM.moveCategory.className = "w-full bg-slate-800 border border-slate-700 rounded-lg py-1.5 px-2 text-xs focus:outline-none focus:border-red-500 text-slate-100 cursor-pointer";
      
      updateLiveStats();
      return;
    }

    try {
      const move = await fetchMoveDetails(val);
      
      DOM.movePower.value = move.power;
      DOM.movePower.disabled = true;
      DOM.movePower.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1 px-2 text-xs text-center text-slate-400 cursor-not-allowed";
      
      DOM.moveType.value = move.type;
      DOM.moveType.disabled = true;
      DOM.moveType.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed";
      
      DOM.moveCategory.value = move.category.toLowerCase();
      DOM.moveCategory.disabled = true;
      DOM.moveCategory.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed";
      
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
  let attackerDetails, incineroarDetails;
  try {
    const [atk, inc] = await Promise.all([
      fetchPokemonDetails('crabominable-mega'),
      fetchPokemonDetails('incineroar')
    ]);
    attackerDetails = atk;
    incineroarDetails = inc;
  } catch (err) {
    console.error("Error fetching details in sample loader", err);
    // Fallbacks
    attackerDetails = {
      name: "Crabominable Mega",
      apiName: "crabominable-mega",
      sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10270.png",
      types: ["Fighting", "Ice"],
      baseStats: { hp: 97, atk: 162, def: 127, spa: 62, spd: 87, spe: 43 },
      moves: [{ name: "Drain Punch", apiName: "drain-punch" }],
      abilities: [{ name: "Iron Fist", apiName: "iron-fist" }]
    };
    incineroarDetails = {
      name: "Incineroar",
      apiName: "incineroar",
      sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/727.png",
      types: ["Fire", "Dark"],
      baseStats: { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
      abilities: [{ name: "Blaze", apiName: "blaze" }, { name: "Intimidate", apiName: "intimidate" }]
    };
  }

  // Run standard detail setters to load stats, profiles, auto-lock Mega Stone items, and filter abilities!
  setAttackerDetails(attackerDetails);
  setDefenderDetails(incineroarDetails);

  // Populate search input fields
  DOM.attackerSearch.value = "Crabominable Mega";
  DOM.defenderSearch.value = "Incineroar";

  // Override specific sample scenario parameters!
  DOM.attackerNature.value = "+atk";
  DOM.attackerEvAtk.value = 32;
  DOM.attackerEvSpa.value = 0;
  DOM.attackerEvSpe.value = 32;
  DOM.attackerAbility.value = "iron-fist";

  DOM.defenderNature.value = "+def";
  DOM.defenderItem.value = "none";
  DOM.defenderEvHp.value = 32;
  DOM.defenderEvDef.value = 2;
  DOM.defenderEvSpd.value = 0;
  DOM.defenderEvSpe.value = 32;

  // Pre-select Fighting-type Drain Punch move
  DOM.attackerMoveSelect.value = "drain-punch";
  
  try {
    const move = await fetchMoveDetails("drain-punch");
    DOM.movePower.value = move.power;
    DOM.movePower.disabled = true;
    DOM.movePower.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1 px-2 text-xs text-center text-slate-400 cursor-not-allowed";

    DOM.moveType.value = move.type;
    DOM.moveType.disabled = true;
    DOM.moveType.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed";

    DOM.moveCategory.value = move.category.toLowerCase();
    DOM.moveCategory.disabled = true;
    DOM.moveCategory.className = "w-full bg-slate-800/50 border border-slate-700 rounded-lg py-1.5 px-2 text-xs text-slate-400 cursor-not-allowed";
  } catch (err) {
    console.error("Failed to load preloaded Drain Punch move info", err);
  }

  DOM.modSpread.checked = false;
  DOM.modWeatherSelect.value = 'none';
  DOM.modCrit.checked = false;

  updateLiveStats();
}

async function init() {
  populateDropdowns();
  bindEvents();

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

  await initPokemonList();
  await initStatusMovesList();

  await loadSampleVGCScenario();
}

document.addEventListener('DOMContentLoaded', init);
