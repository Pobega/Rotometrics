// Damage roll calculator for Pokemon Champions rules.

import { calculateStat, calculateStatBoost, getMoveEffectiveness } from './Stats.js';
import { attackerAbilityMultiplier, defenderAbilityMultiplier } from './Abilities.js';

// Effective Speed including stat boosts.
function effectiveSpeed(mon) {
  const base = calculateStat('spe', mon.baseStats.spe, mon.sps.spe, mon.nature, false);
  return calculateStatBoost(base, mon.boosts.spe || 0);
}

// The mon's highest battle stat key (excluding HP), used by the paradox abilities.
// Ties resolve in the game's stat order (Atk > Def > SpA > SpD > Spe) via the
// strict `>` comparison over this ordering.
const PARADOX_STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'];
function highestBattleStat(mon) {
  let bestKey = 'atk';
  let bestVal = -Infinity;
  for (const k of PARADOX_STAT_KEYS) {
    const v = calculateStat(k, mon.baseStats[k], mon.sps[k], mon.nature, false);
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey;
}

// Protosynthesis / Quark Drive boost the mon's single highest stat by 1.3x (1.5x
// for Speed, which doesn't affect damage). They activate in their field (sun /
// Electric Terrain) or whenever Booster Energy is flagged active. Returns true
// when `statKey` is the boosted stat — i.e. the move's offensive or the
// defender's defensive stat lines up with the mon's highest stat.
function paradoxBoosted(mon, statKey, modifiers) {
  const ab = mon.ability;
  if (ab !== 'protosynthesis' && ab !== 'quark-drive') return false;
  const active =
    !!modifiers.boosterActive ||
    (ab === 'protosynthesis' && modifiers.weather === 'sun') ||
    (ab === 'quark-drive' && modifiers.terrain === 'electric');
  if (!active) return false;
  return highestBattleStat(mon) === statKey;
}

// Resolve a move's effective type/power from battle state. This is the single
// source of truth for variable-type/-power moves so the damage calc and the UI
// (the Attack card's type badge + BP) can never drift. Type-changing moves
// (Weather Ball, Terrain Pulse) and variable-base-power moves (Gyro Ball, the
// weight/HP/boost-driven moves, …) all resolve here.
//
// The -ate abilities convert the user's Normal-type moves to another type and
// boost them 1.2x. resolveEffectiveMove handles the type change (so STAB + the
// type chart follow automatically); the 1.2x rides on the ._ateBoosted flag,
// applied in ATTACKER_DAMAGE_ABILITIES.
const ATE_TYPES = {
  aerilate: 'Flying',
  pixilate: 'Fairy',
  refrigerate: 'Ice',
  galvanize: 'Electric',
};

// Sum of a mon's positive stat stages. Drives Stored Power / Power Trip (own
// boosts) and Punishment (the target's). The state only tracks the offensive /
// defensive boosts the UI exposes, so accuracy/evasion stages aren't counted —
// good enough for the calculator's purposes.
function positiveBoostCount(boosts) {
  let n = 0;
  for (const k in boosts) {
    if (boosts[k] > 0) n += boosts[k];
  }
  return n;
}

// Low Kick / Grass Knot base power by the *target's* weight (kilograms). Weight
// is stored in hectograms (PokéAPI's unit), matching the dex.
function weightBasedPower(weightHg) {
  const kg = weightHg / 10;
  if (kg >= 200) return 120;
  if (kg >= 100) return 100;
  if (kg >= 50) return 80;
  if (kg >= 25) return 60;
  if (kg >= 10) return 40;
  return 20;
}

// Heavy Slam / Heat Crash base power by the ratio of the user's weight to the
// target's: the heavier the user is relative to the target, the stronger it hits.
function weightRatioPower(userHg, targetHg) {
  const ratio = userHg / Math.max(1, targetHg);
  if (ratio >= 5) return 120;
  if (ratio >= 4) return 100;
  if (ratio >= 3) return 80;
  if (ratio >= 2) return 60;
  return 40;
}

// Resolved base power for moves PokéAPI can't report a fixed number for, computed
// from battle state. Returns null when the move isn't one of these (leaving the
// reported base power in place). `defender` may be null (e.g. the Attack card
// before a target is chosen), in which case target-dependent moves fall through.
function variableBasePower(move, attacker, defender, modifiers) {
  switch (move.apiName) {
    case 'return':
    case 'frustration':
      return 102; // max happiness / min happiness, the competitive default
    case 'eruption':
    case 'water-spout':
    case 'dragon-energy':
      return 150; // scales with the user's current HP; a calc assumes full HP
    case 'stored-power':
    case 'power-trip':
      return 20 + 20 * positiveBoostCount(attacker.boosts);
    case 'gyro-ball': {
      if (!defender) return null;
      const userSpe = effectiveSpeed(attacker);
      const targetSpe = effectiveSpeed(defender);
      return Math.min(150, Math.floor((25 * targetSpe) / Math.max(1, userSpe)) + 1);
    }
    case 'electro-ball': {
      if (!defender) return null;
      const ratio = effectiveSpeed(attacker) / Math.max(1, effectiveSpeed(defender));
      return ratio >= 4 ? 150 : ratio >= 3 ? 120 : ratio >= 2 ? 80 : ratio >= 1 ? 60 : 40;
    }
    case 'punishment':
      if (!defender) return null;
      return Math.min(200, 60 + 20 * positiveBoostCount(defender.boosts));
    case 'low-kick':
    case 'grass-knot':
      if (!defender || !defender.weight) return null;
      return weightBasedPower(defender.weight);
    case 'heavy-slam':
    case 'heat-crash':
      if (!defender || !defender.weight || !attacker.weight) return null;
      return weightRatioPower(attacker.weight, defender.weight);
    case 'wring-out':
    case 'crush-grip': {
      // Scales with the target's *remaining* HP fraction; full HP (the calc
      // default) is the move's max, 120 BP.
      const pct = modifiers.defenderHpPercent != null ? modifiers.defenderHpPercent : 100;
      return Math.max(1, Math.floor((120 * pct) / 100));
    }
    default:
      return null;
  }
}

// Weather Ball / Terrain Pulse take on a field-derived type and double their
// power; Mega Sol makes the user's moves behave as if in harsh sunlight, turning
// Weather Ball into a boosted Fire move with no weather. Terrain Pulse needs the
// user grounded (a Flying-type isn't), mirroring the terrain damage boosts below.
const WEATHER_BALL_TYPES = { sun: 'Fire', rain: 'Water', sandstorm: 'Rock', snow: 'Ice' };
const TERRAIN_PULSE_TYPES = {
  electric: 'Electric',
  grassy: 'Grass',
  psychic: 'Psychic',
  misty: 'Fairy',
};

export function resolveEffectiveMove(attacker, move, modifiers, defender = null) {
  let type = move.type;
  let power = move.power;
  let changed = false;
  let ateBoosted = false;

  if (move.apiName === 'weather-ball') {
    const ballWeather = attacker.ability === 'mega-sol' ? 'sun' : modifiers.weather;
    const resolvedType = WEATHER_BALL_TYPES[ballWeather];
    if (resolvedType) {
      type = resolvedType;
      power = move.power * 2;
      changed = true;
    }
  } else if (move.apiName === 'terrain-pulse') {
    const grounded = !attacker.types.includes('Flying');
    const resolvedType = grounded ? TERRAIN_PULSE_TYPES[modifiers.terrain] : undefined;
    if (resolvedType) {
      type = resolvedType;
      power = move.power * 2;
      changed = true;
    }
  } else {
    // Variable-base-power moves (no type change). Skipped above for the two
    // type-changers, which already set their own doubled power.
    const vp = variableBasePower(move, attacker, defender, modifiers);
    if (vp != null) {
      power = vp;
      changed = true;
    }
  }

  const ateType = ATE_TYPES[attacker.ability];
  if (ateType && type === 'Normal') {
    type = ateType;
    ateBoosted = true;
    changed = true;
  }

  if (!changed) return move;
  const out = { ...move, type, power };
  if (ateBoosted) out._ateBoosted = true;
  return out;
}

// Multi-hit moves the engine sums into a single result. `hits` is the count the
// calc assumes; `max` (for the 2–5 range moves) is what Skill Link locks them
// to. `escalating` flags the Triple Kick / Triple Axel family, whose hits ramp
// 1x / 2x / 3x off the reported (first-hit) base power.
const MULTI_HIT_MOVES = {
  'double-kick': { hits: 2 },
  'dual-chop': { hits: 2 },
  'double-hit': { hits: 2 },
  'double-iron-bash': { hits: 2 },
  twineedle: { hits: 2 },
  bonemerang: { hits: 2 },
  'gear-grind': { hits: 2 },
  'dragon-darts': { hits: 2 },
  'tachyon-cutter': { hits: 2 },
  'triple-kick': { hits: 3, escalating: true },
  'triple-axel': { hits: 3, escalating: true },
  'surging-strikes': { hits: 3 },
  'rock-blast': { hits: 3, max: 5 },
  'bullet-seed': { hits: 3, max: 5 },
  'icicle-spear': { hits: 3, max: 5 },
  'pin-missile': { hits: 3, max: 5 },
  'scale-shot': { hits: 3, max: 5 },
  'bone-rush': { hits: 3, max: 5 },
  'comet-punch': { hits: 3, max: 5 },
  'fury-attack': { hits: 3, max: 5 },
  'fury-swipes': { hits: 3, max: 5 },
  'spike-cannon': { hits: 3, max: 5 },
  'tail-slap': { hits: 3, max: 5 },
  'water-shuriken': { hits: 3, max: 5 },
  'population-bomb': { hits: 10, max: 10 },
};

// In-game hit-count odds for a 2–5 move (modern gens): 2/3 hits at 35% each,
// 4/5 at 15% each. Skill Link locks to 5, so this only drives the variable case.
const HIT_COUNT_PROBS = { 2: 0.35, 3: 0.35, 4: 0.15, 5: 0.15 };

// Per-hit base powers for a move. Parental Bond (any move hits twice, the second
// at 0.25x) and the multi-hit moves both decompose a single calc into several
// floored hits summed per roll; everything else is a single hit. Skill Link
// locks a 2–5 move to its max hit count.
function hitPowers(move, power, attacker) {
  if (attacker.ability === 'parental-bond') {
    return [power, Math.floor(power * 0.25)];
  }
  const spec = MULTI_HIT_MOVES[move.apiName];
  if (spec) {
    const count = spec.max && attacker.ability === 'skill-link' ? spec.max : spec.hits;
    if (spec.escalating) {
      return Array.from({ length: count }, (_, i) => power * (i + 1));
    }
    return Array(count).fill(power);
  }
  return [power];
}

// How many times a move hits for the given attacker (Skill Link locks 2–5 moves
// to their max). 1 for ordinary moves; drives the result card's "Hits Nx" note.
// Parental Bond isn't counted here — its second hit is partial and the card
// labels it separately.
export function multiHitCount(move, attacker) {
  const spec = MULTI_HIT_MOVES[move.apiName];
  if (!spec) return 1;
  return spec.max && attacker.ability === 'skill-link' ? spec.max : spec.hits;
}

// The hit-count range a move can land for the given attacker, driving the card's
// "Hits N×" / "Hits 2–5×" note. Returns null for single-hit moves (and Parental
// Bond, which the card labels separately). A 2–5 move spans the HIT_COUNT_PROBS
// keys; Skill Link locks it to its max, and fixed-count moves report a single
// value (min === max).
export function multiHitRange(move, attacker) {
  if (attacker.ability === 'parental-bond') return null;
  const spec = MULTI_HIT_MOVES[move.apiName];
  if (!spec) return null;
  if (spec.max && attacker.ability === 'skill-link') return { min: spec.max, max: spec.max };
  if (spec.max) {
    return { min: Math.min(...Object.keys(HIT_COUNT_PROBS).map(Number)), max: spec.max };
  }
  return { min: spec.hits, max: spec.hits };
}

// Resolve all the shared inputs to a damage calc (stats, effective power, the
// full `mod` chain) once, returning a `hitVals(power)` closure that yields a
// single hit's 16 floored damage values (r = 85..100). Both the flat-roll array
// (calculateDamageRolls) and the per-hit-independent distribution
// (multiHitDistribution) build on this so they share one source of truth.
function damageContext(attacker, defender, move, modifiers) {
  move = resolveEffectiveMove(attacker, move, modifiers, defender);

  const baseIsPhysical = move.category.toLowerCase() === 'physical';

  // Resolve which stats this move uses. Most moves pit the attacker's
  // Atk/SpA against the matching defense, but several special-case it.
  let offMon = attacker;
  let isPhysical = baseIsPhysical;
  let atkStatName = baseIsPhysical ? 'atk' : 'spa';
  let defStatName = baseIsPhysical ? 'def' : 'spd';

  if (move.apiName === 'body-press') {
    atkStatName = 'def'; // damage scales off the user's Defense
  } else if (move.apiName === 'foul-play') {
    offMon = defender; // uses the target's Attack stat
    atkStatName = 'atk';
  } else if (
    move.apiName === 'psyshock' ||
    move.apiName === 'psystrike' ||
    move.apiName === 'secret-sword'
  ) {
    defStatName = 'def'; // special move that hits physical Defense
  } else if (move.apiName === 'photon-geyser' || move.apiName === 'tera-blast') {
    const atkVal = calculateStatBoost(
      calculateStat('atk', attacker.baseStats.atk, attacker.sps.atk, attacker.nature, false),
      attacker.boosts.atk || 0
    );
    const spaVal = calculateStatBoost(
      calculateStat('spa', attacker.baseStats.spa, attacker.sps.spa, attacker.nature, false),
      attacker.boosts.spa || 0
    );
    isPhysical = atkVal >= spaVal; // uses whichever offensive stat is higher
    atkStatName = isPhysical ? 'atk' : 'spa';
    defStatName = isPhysical ? 'def' : 'spd';
  }

  let baseAtkVal = calculateStat(
    atkStatName,
    offMon.baseStats[atkStatName],
    offMon.sps[atkStatName],
    offMon.nature,
    false
  );
  let baseDefVal = calculateStat(
    defStatName,
    defender.baseStats[defStatName],
    defender.sps[defStatName],
    defender.nature,
    false
  );

  let effectiveAtk = calculateStatBoost(baseAtkVal, offMon.boosts[atkStatName] || 0);
  let effectiveDef = calculateStatBoost(baseDefVal, defender.boosts[defStatName] || 0);

  // Item/ability Atk boosts only apply to the user's own stat, so they are
  // skipped when the offensive stat is borrowed from the target (Foul Play).
  if (offMon === attacker && attacker.item === 'choice_band' && isPhysical) {
    effectiveAtk = Math.floor(effectiveAtk * 1.5);
  } else if (offMon === attacker && attacker.item === 'choice_specs' && !isPhysical) {
    effectiveAtk = Math.floor(effectiveAtk * 1.5);
  }

  // Abilities that scale the user's (physical) Attack stat. Treated as already
  // "activated" — Guts/Quark etc. don't gate on the triggering condition here,
  // matching the list labels (e.g. "Guts Activated").
  const ATK_STAT_ABILITY = {
    'huge-power': 2.0,
    'pure-power': 2.0,
    guts: 1.5,
    'gorilla-tactics': 1.5,
    hustle: 1.5,
  };
  if (offMon === attacker && isPhysical && ATK_STAT_ABILITY[attacker.ability]) {
    effectiveAtk = Math.floor(effectiveAtk * ATK_STAT_ABILITY[attacker.ability]);
  }

  // Protosynthesis / Quark Drive 1.3x the user's highest stat; apply when that's
  // the offensive stat this move uses. Skipped for borrowed-stat moves (Foul Play).
  if (offMon === attacker && paradoxBoosted(attacker, atkStatName, modifiers)) {
    effectiveAtk = Math.floor(effectiveAtk * 1.3);
  }

  if (defender.item === 'assault_vest' && defStatName === 'spd') {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  } else if (defender.item === 'eviolite') {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  }

  // Protosynthesis / Quark Drive on the defender boost its highest stat; apply
  // when that's the defensive stat this move targets.
  if (paradoxBoosted(defender, defStatName, modifiers)) {
    effectiveDef = Math.floor(effectiveDef * 1.3);
  }

  if (
    modifiers.weather === 'sandstorm' &&
    defender.types.includes('Rock') &&
    defStatName === 'spd'
  ) {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  }
  if (modifiers.weather === 'snow' && defender.types.includes('Ice') && defStatName === 'def') {
    effectiveDef = Math.floor(effectiveDef * 1.5);
  }

  let effectivePower = move.power;
  if (move.apiName === 'acrobatics' && (!attacker.item || attacker.item === 'none')) {
    effectivePower *= 2;
  }

  // Conditional power multipliers driven by battle state.
  // Knock Off's boost (and removal) only applies to items it can actually knock
  // off. A Mega's Mega Stone can't be removed, so no boost there. (Megas always
  // carry item === 'mega_stone'; see the mega lock in App.js.)
  if (
    move.apiName === 'knock-off' &&
    defender.item &&
    defender.item !== 'none' &&
    defender.item !== 'mega_stone'
  ) {
    effectivePower = Math.floor(effectivePower * 1.5);
  }
  if (move.apiName === 'facade' && attacker.status) {
    effectivePower *= 2;
  }
  if (move.apiName === 'hex' && defender.status) {
    effectivePower *= 2;
  }
  // Brine doubles against a target at or below half HP; the calc defaults to full
  // HP (defenderHpPercent unset === 100), where it doesn't trigger.
  if (
    move.apiName === 'brine' &&
    modifiers.defenderHpPercent != null &&
    modifiers.defenderHpPercent <= 50
  ) {
    effectivePower *= 2;
  }
  // Assurance doubles if the target already took damage this turn (a turn-state
  // toggle, since the calc is a single hit).
  if (move.apiName === 'assurance' && modifiers.targetDamaged) {
    effectivePower *= 2;
  }
  // Whether the attacker moves first. Defaults to comparing effective Speed, but
  // an explicit modifier overrides it (Trick Room, Choice Scarf, switch-ins, …).
  // Drives Bolt Beak (doubles when first) and the Analytic ability (1.3x when
  // last); Payback keeps its own strict-< tie handling below.
  const attackerMovesFirst =
    modifiers.movesFirst != null
      ? modifiers.movesFirst
      : effectiveSpeed(attacker) > effectiveSpeed(defender);
  if (move.apiName === 'bolt-beak' || move.apiName === 'fishious-rend') {
    if (attackerMovesFirst) {
      effectivePower *= 2;
    }
  }
  if (move.apiName === 'payback') {
    // The inverse of Bolt Beak: doubles when the user moves last.
    const movesSecond =
      modifiers.movesFirst != null
        ? !modifiers.movesFirst
        : effectiveSpeed(attacker) < effectiveSpeed(defender);
    if (movesSecond) {
      effectivePower *= 2;
    }
  }

  // (Variable base power — Return, Eruption, Gyro/Electro Ball, the weight/HP/
  // boost-driven moves — is resolved in resolveEffectiveMove so the UI's BP
  // display and the calc share one source of truth; move.power is final here.)

  const levelFactor = 22;
  const baseDamageFor = (power) =>
    Math.floor(Math.floor((levelFactor * power * effectiveAtk) / 50) / effectiveDef) + 2;

  // Canonical (Gen 9) damage rounding. Rather than collapse every multiplier
  // into one float and floor once, the cartridge applies modifiers in defined
  // stages, each rounded to 16-bit (4096) fixed point with "round half up".
  // `modify` is a single such step; `chainMods` combines the final-stage
  // modifiers into one fixed-point value applied with a single rounding (so a
  // run of small multipliers doesn't round at every step). Matching this keeps
  // our rolls within a point of standard calculators instead of drifting low.
  const FP = 4096;
  const toFP = (m) => Math.trunc(m * FP);
  // Apply a 4096 fixed-point modifier to a damage value with the cartridge's
  // "round half down" (pokeRound): a fractional part of exactly .5 truncates
  // down. This matches @smogon/calc — the library behind calc.pokemonshowdown.com
  // — which is the reference these rolls are validated against.
  const applyFP = (v, fp) => {
    const n = v * fp;
    const q = Math.floor(n / FP);
    return n - q * FP > FP / 2 ? q + 1 : q;
  };
  const modify = (v, m) => applyFP(v, toFP(m));
  // Combining the final-stage modifiers into a single modifier, by contrast,
  // rounds half UP (the game's chained-modifier accumulator), so keep +FP/2 here.
  const chainMods = (mods) => mods.reduce((c, m) => Math.trunc((c * toFP(m) + FP / 2) / FP), FP);

  // --- Pre-random modifiers: applied to base damage, before the 85–100 roll. --
  const preRandomMods = [];

  if (modifiers.spread) {
    preRandomMods.push(0.75);
  }

  // Mega Sol (Meganium): its moves always behave as if in harsh sunlight,
  // overriding the actual weather for the attacker's offense.
  const offensiveWeather = attacker.ability === 'mega-sol' ? 'sun' : modifiers.weather;
  if (offensiveWeather === 'sun') {
    if (move.type === 'Fire') {
      preRandomMods.push(1.5);
    } else if (move.type === 'Water') {
      preRandomMods.push(0.5);
    }
  } else if (offensiveWeather === 'rain') {
    if (move.type === 'Water') {
      preRandomMods.push(1.5);
    } else if (move.type === 'Fire') {
      preRandomMods.push(0.5);
    }
  }

  if (modifiers.crit) {
    preRandomMods.push(attacker.ability === 'sniper' ? 2.25 : 1.5);
  }

  // --- STAB: its own rounded step, after the roll. ---------------------------
  let stab = 1.0;
  if (attacker.types.includes(move.type)) {
    stab = attacker.ability === 'adaptability' ? 2.0 : 1.5;
  }

  // --- Type effectiveness: exact ×2 / floored halving, as on the cartridge
  // (Math.floor(v * mult) reproduces both for the {0.25,0.5,1,2,4} multipliers). --
  const typeMult = getMoveEffectiveness(move, defender.types, {
    scrappy: attacker.ability === 'scrappy',
  });

  // --- Burn: halves physical damage; its own rounded step. -------------------
  const burned =
    isPhysical &&
    attacker.ability !== 'guts' &&
    attacker.status === 'burned' &&
    move.apiName !== 'facade';

  // --- Final modifier chain: abilities, items, screens, terrain, auras, etc.,
  // combined into one fixed-point modifier applied with a single rounding. -----
  const finalMods = [];

  if ((move.apiName === 'collision-course' || move.apiName === 'electro-drift') && typeMult > 1.0) {
    finalMods.push(5461 / 4096);
  }

  const abilityCtx = {
    move,
    isPhysical,
    attacker,
    defender,
    typeMult,
    modifiers,
    movesFirst: attackerMovesFirst,
  };
  const attackerAbilityMod = attackerAbilityMultiplier(attacker.ability, abilityCtx);
  if (attackerAbilityMod !== 1.0) finalMods.push(attackerAbilityMod);

  if (modifiers.screens) {
    // Light Screen / Reflect in doubles: the cartridge's exact 2732/4096
    // (≈0.667), not a rounded 0.66, so the chained result matches @smogon/calc.
    finalMods.push(2732 / 4096);
  }

  const defenderAbilityMod = defenderAbilityMultiplier(defender.ability, abilityCtx);
  if (defenderAbilityMod !== 1.0) finalMods.push(defenderAbilityMod);

  let terrainMod = 1.0;
  if (
    modifiers.terrain === 'electric' &&
    move.type === 'Electric' &&
    !attacker.types.includes('Flying')
  ) {
    terrainMod = 1.3;
  } else if (
    modifiers.terrain === 'grassy' &&
    move.type === 'Grass' &&
    !attacker.types.includes('Flying')
  ) {
    terrainMod = 1.3;
  } else if (modifiers.terrain === 'grassy' && move.type === 'Ground') {
    terrainMod = 0.5;
  } else if (
    modifiers.terrain === 'psychic' &&
    move.type === 'Psychic' &&
    !attacker.types.includes('Flying')
  ) {
    terrainMod = 1.3;
  } else if (
    modifiers.terrain === 'misty' &&
    move.type === 'Dragon' &&
    !defender.types.includes('Flying')
  ) {
    terrainMod = 0.5;
  }
  if (terrainMod !== 1.0) finalMods.push(terrainMod);

  // Auras (1.33x their type) come from the field toggle OR the attacker's own
  // Fairy Aura / Dark Aura ability, so the ability is self-contained in the engine
  // (the field toggle still covers an opponent's aura). A move is a single type,
  // so at most one applies — no stacking.
  const fairyAura = modifiers.aura === 'fairy' || attacker.ability === 'fairy-aura';
  const darkAura = modifiers.aura === 'dark' || attacker.ability === 'dark-aura';
  if (fairyAura && move.type === 'Fairy') {
    finalMods.push(1.33);
  } else if (darkAura && move.type === 'Dark') {
    finalMods.push(1.33);
  }

  if (modifiers.friendGuard) {
    finalMods.push(0.75);
  }

  if (modifiers.helpingHand) {
    finalMods.push(1.5);
  }

  if (attacker.item === 'life_orb') {
    finalMods.push(1.3);
  } else if (attacker.item === 'expert_belt' && typeMult > 1.0) {
    finalMods.push(1.2);
  } else if (attacker.item === 'black_glasses_etc') {
    finalMods.push(1.2);
  }

  if (defender.item === 'berries' && typeMult > 1.0) {
    finalMods.push(0.5);
  }

  const finalChain = chainMods(finalMods);

  // The hit deals no damage at all when the type chart (typeMult 0) or a zeroing
  // ability in the final chain (Levitate, Flash Fire, Wonder Guard, …) cancels
  // it. Otherwise damage floors at a minimum of 1, so the min-1 rule must not
  // resurrect an immune hit.
  const immune = typeMult === 0 || finalChain === 0;

  // A single hit's 16 damage values across the r = 85..100 roll range, walking
  // the canonical stages: pre-random mods, the roll, STAB, type, burn, then the
  // combined final chain.
  const hitVals = (power) => {
    let base = baseDamageFor(power);
    for (const m of preRandomMods) base = modify(base, m);

    const vals = [];
    for (let r = 85; r <= 100; r++) {
      let d = Math.floor((base * r) / 100);
      d = modify(d, stab);
      d = Math.floor(d * typeMult);
      if (burned) d = modify(d, 0.5);
      d = applyFP(d, finalChain);
      if (!immune) d = Math.max(1, d);
      vals.push(d);
    }
    return vals;
  };

  return { move, attacker, effectivePower, hitVals };
}

export function calculateDamageRolls(attacker, defender, move, modifiers) {
  const ctx = damageContext(attacker, defender, move, modifiers);

  // Parental Bond and multi-hit moves decompose into several floored hits summed
  // per roll (see hitPowers). Simplification: the shared `mod` (incl. full-HP
  // defender abilities like Multiscale and the spread reduction) is applied
  // uniformly to every hit rather than recomputed against the defender's reduced
  // HP after each hit, and one damage roll is shared across the hits — acceptable
  // for a calculator. (multiHitDistribution rolls each hit independently.)
  const powers = hitPowers(ctx.move, ctx.effectivePower, ctx.attacker);
  const perHit = powers.map(ctx.hitVals);

  const rolls = [];
  for (let i = 0; i < 16; i++) {
    let total = 0;
    for (const h of perHit) total += h[i];
    rolls.push(total);
  }

  return rolls;
}

// --- Multi-hit distribution (issue #87) ------------------------------------
// A "distribution" is a Map<damage, probability>. The flat 16-roll array shares
// one roll across every hit; here each hit rolls its own 85–100, so we build the
// true summed distribution by convolving the per-hit value distributions. For
// the 2–5 family the hit count is itself random, so we mix the per-count
// distributions by HIT_COUNT_PROBS.

function singleHitDist(vals) {
  const m = new Map();
  const p = 1 / vals.length;
  for (const v of vals) m.set(v, (m.get(v) || 0) + p);
  return m;
}

function convolve(a, b) {
  const m = new Map();
  for (const [va, pa] of a) {
    for (const [vb, pb] of b) {
      const s = va + vb;
      m.set(s, (m.get(s) || 0) + pa * pb);
    }
  }
  return m;
}

function koChanceOf(dist, finalHp) {
  if (!finalHp) return null;
  let p = 0;
  for (const [v, pr] of dist) if (v >= finalHp) p += pr;
  return p;
}

// Lowest/highest damage carrying nonzero probability.
function rangeOf(dist) {
  const keys = [...dist.keys()];
  return { min: Math.min(...keys), max: Math.max(...keys) };
}

// Central probability band: the damage values straddling the 10th–90th
// percentiles, i.e. where the outcome realistically lands.
function likelyBand(dist) {
  const sorted = [...dist.entries()].sort((a, b) => a[0] - b[0]);
  let cdf = 0;
  let lo = sorted[0][0];
  let hi = sorted[sorted.length - 1][0];
  let setLo = false;
  for (const [v, p] of sorted) {
    cdf += p;
    if (!setLo && cdf >= 0.1) {
      lo = v;
      setLo = true;
    }
    if (cdf >= 0.9) {
      hi = v;
      break;
    }
  }
  return { lo, hi };
}

// True per-hit-independent damage distribution for a multi-hit move. Returns
// null for single-hit moves. `finalHp` is optional; when given, KO chances are
// computed (else null). Mirrors hitPowers/multiHitCount for hit-count semantics.
export function multiHitDistribution(attacker, defender, move, modifiers, finalHp) {
  const ctx = damageContext(attacker, defender, move, modifiers);
  const spec = MULTI_HIT_MOVES[ctx.move.apiName];
  const parentalBond = attacker.ability === 'parental-bond';
  if (!spec && !parentalBond) return null;

  const power = ctx.effectivePower;
  const distForPowers = (powers) =>
    powers.map((pw) => singleHitDist(ctx.hitVals(pw))).reduce((a, b) => convolve(a, b));

  const variable = !!(spec && spec.max && attacker.ability !== 'skill-link') && !parentalBond;

  let combined;
  let perCount = null;
  if (parentalBond) {
    combined = distForPowers([power, Math.floor(power * 0.25)]);
  } else if (variable) {
    combined = new Map();
    perCount = [];
    for (const n of [2, 3, 4, 5]) {
      const w = HIT_COUNT_PROBS[n];
      const d = distForPowers(Array(n).fill(power));
      for (const [v, p] of d) combined.set(v, (combined.get(v) || 0) + p * w);
      const { min, max } = rangeOf(d);
      perCount.push({ count: n, prob: w, min, max, koChance: koChanceOf(d, finalHp) });
    }
  } else {
    const count = spec.max && attacker.ability === 'skill-link' ? spec.max : spec.hits;
    const powers = spec.escalating
      ? Array.from({ length: count }, (_, i) => power * (i + 1))
      : Array(count).fill(power);
    combined = distForPowers(powers);
  }

  return {
    variable,
    koChance: koChanceOf(combined, finalHp),
    likely: likelyBand(combined),
    // Sorted [damage, probability] pairs — the full distribution shape, used to
    // paint the gauge's density gradient.
    outcomes: [...combined.entries()].sort((a, b) => a[0] - b[0]),
    perCount,
  };
}
