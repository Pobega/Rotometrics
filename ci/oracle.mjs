// Cross-checks our damage engine against @smogon/calc — the real library behind
// calc.pokemonshowdown.com — so the formula/modifier layer can't silently drift
// from the reference calculator.
//
//   node ci/oracle.mjs
//
// Why this is a separate script from the golden suite (ci/run-tests.mjs):
// the golden cases prove the engine matches ITSELF (their expected values were
// recorded from the engine). This proves the engine matches an EXTERNAL truth.
//
// How it stays valid despite the custom stat model:
// Champions uses an invented stat formula (floor(base+sp+20); HP base+sp+75; no
// level/EV/IV), so a Champions mon maps to no real Pokémon and can't be typed
// into Showdown directly. But the two formulas coincide on the base stat: our
// neutral, 0-SP final is base + 20, and @smogon/calc's level-50 / 0-EV / 31-IV /
// neutral final is ALSO base + 20. So feeding both engines the same base stat
// (via Champions sps=0 on our side and a baseStats override on Smogon's) yields
// identical final Atk/Def/SpA/SpD. The only mechanic under test is then the
// damage formula + modifier rounding. (HP also coincides at 0 SP — both are
// base + 75 — but the rolls don't depend on the defender's HP, so we don't
// bother offsetting Smogon's HP base.)
//
// The `statScenarios` list ADDITIONALLY exercises SP and nature: at level 50 /
// 31 IV, EV = 8*SP - 4 (SP>=1) makes Smogon's final equal ours exactly, and our
// fixed nature pairs map 1:1 to Smogon natures with the same lowered stat. So
// those scenarios cross-check our +1-per-SP scaling and ±10% nature against the
// reference, not just the modifier layer.
//
// Stat-altering items (Choice Band) are out of scope here — we test a range of
// raw Attack magnitudes directly; only damage-altering modifiers (Life Orb,
// screens, crit, ...) are set on both sides. Exits non-zero if any roll disagrees.

import smogon from '@smogon/calc';
import { calculateDamageRolls } from '../src/engine/Damage.js';

const { Generations, Pokemon, Move, Field, calculate } = smogon;
const gen = Generations.get(9);

// --- our-engine mon whose calculateStat() returns the given final stats --------
// Neutral nature, 0 SP: atk/def/spa/spd = base + 20, hp = base + 75. So to hit a
// target final stat we just offset the base stat. Only the attacking and the
// relevant defending stat (plus HP) matter for the rolls.
function ourMon({ atk = 100, def = 100, spa = 100, spd = 100, hp = 100, types, item = 'none' }) {
  return {
    baseStats: { hp: hp - 75, atk: atk - 20, def: def - 20, spa: spa - 20, spd: spd - 20, spe: 80 },
    sps: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    boosts: { atk: 0, spa: 0, def: 0, spd: 0, spe: 0 },
    nature: 'neutral',
    item,
    ability: 'none',
    types,
  };
}

// --- @smogon/calc Pokemon mirroring our base stats and types -------------------
// Override baseStats so the level-50/0-EV/31-IV/neutral finals equal our engine's
// (final = base + 20). HP base is irrelevant to the rolls, so leave it at 100.
function smogonMon({ atk = 100, def = 100, spa = 100, spd = 100, types, item }) {
  const baseStats = {
    hp: 100,
    atk: atk - 20,
    def: def - 20,
    spa: spa - 20,
    spd: spd - 20,
    spe: 80,
  };
  return new Pokemon(gen, 'Pikachu', { level: 50, item, overrides: { types, baseStats } });
}

// --- raw-stat helpers: parameterized by base stat + investment, not a final ----
// Used by `statScenarios` to exercise SP + nature. Our fixed nature ids map 1:1 to
// Smogon natures that boost the same stat AND lower the same stat (see Stats.js),
// and EV = 8*SP - 4 (SP>=1; 0 for SP 0) makes the level-50/31-IV finals identical.
const NATURE_MAP = {
  '+atk': 'Adamant', // +Atk / -SpA
  '+spa': 'Modest', //  +SpA / -Atk
  '+def': 'Impish', //  +Def / -SpA
  '+spd': 'Calm', //    +SpD / -Atk
  '+spe': 'Jolly', //   +Spe / -SpA
  neutral: 'Serious',
};
const spToEv = (sp) => (sp === 0 ? 0 : 8 * sp - 4);

function ourStatMon({ base, sp, nature, types, item = 'none' }) {
  const zero = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  return {
    baseStats: { ...base },
    sps: { ...zero, ...sp },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    boosts: { atk: 0, spa: 0, def: 0, spd: 0, spe: 0 },
    nature,
    item,
    ability: 'none',
    types,
  };
}

function smogonStatMon({ base, ev, nature, types }) {
  return new Pokemon(gen, 'Pikachu', {
    level: 50,
    nature: NATURE_MAP[nature],
    evs: ev,
    overrides: { types, baseStats: base },
  });
}

// Each scenario yields 16 rolls from each engine; we assert they're identical.
const scenarios = [
  {
    name: 'STAB, neutral',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Normal',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
  },
  {
    name: 'super-effective (2x), no STAB',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 60,
    type: 'Fighting',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Normal'],
  },
  {
    name: 'resisted (0.5x)',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Fighting',
    cat: 'physical',
    atkTypes: ['Fighting'],
    defTypes: ['Flying'],
  },
  {
    name: 'quad-effective (4x)',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Rock',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Flying', 'Fire'],
  },
  {
    name: 'special move',
    spa: 130,
    spd: 110,
    hp: 200,
    bp: 90,
    type: 'Fire',
    cat: 'special',
    atkTypes: ['Fire'],
    defTypes: ['Grass'],
  },
  {
    name: 'Life Orb (1.3x), STAB',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Normal',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    item: 'Life Orb',
  },
  {
    name: 'high Attack stat, STAB',
    atk: 180,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Normal',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
  },
  {
    name: 'crit (1.5x), STAB',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Normal',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    crit: true,
  },
  {
    name: 'spread (doubles, 0.75x)',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Normal',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    spread: true,
  },
  {
    name: 'Reflect (doubles, 2732/4096)',
    atk: 120,
    def: 120,
    hp: 200,
    bp: 80,
    type: 'Normal',
    cat: 'physical',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    screens: true,
  },
];

function smogonRolls(s) {
  const physical = s.cat === 'physical';
  const attacker = smogonMon({ atk: s.atk, spa: s.spa, types: s.atkTypes, item: s.item });
  const defender = smogonMon({ def: s.def, spd: s.spd, types: s.defTypes });
  const moveOverrides = {
    basePower: s.bp,
    type: s.type,
    category: physical ? 'Physical' : 'Special',
  };
  if (s.spread) moveOverrides.target = 'allAdjacentFoes';
  const move = new Move(gen, 'Tackle', { overrides: moveOverrides, useMax: false });
  if (s.crit) move.isCrit = true;

  const field = new Field({
    gameType: s.spread || s.screens ? 'Doubles' : 'Singles',
    defenderSide: s.screens ? { isReflect: true } : {},
  });

  const res = calculate(gen, attacker, defender, move, field);
  const dmg = res.damage;
  return Array.isArray(dmg) ? dmg : [dmg];
}

function ourRolls(s) {
  const physical = s.cat === 'physical';
  const attacker = ourMon({
    atk: physical ? s.atk : 100,
    spa: physical ? 100 : s.spa,
    types: s.atkTypes,
    item: s.item === 'Life Orb' ? 'life_orb' : 'none',
  });
  const defender = ourMon({
    def: physical ? s.def : 100,
    spd: physical ? 100 : s.spd,
    hp: s.hp,
    types: s.defTypes,
  });
  const move = { apiName: 'tackle', type: s.type, power: s.bp, category: s.cat };
  const modifiers = {
    crit: !!s.crit,
    spread: !!s.spread,
    screens: !!s.screens,
  };
  return calculateDamageRolls(attacker, defender, move, modifiers);
}

// --- SP + nature scenarios: validate the stat layer, not just the modifiers ----
// Each varies SP and/or nature on the stat that drives the roll; both engines
// compute their finals naturally (ours from SP, Smogon from EV = 8*SP - 4).
const statScenarios = [
  {
    name: '+atk nature, 32 SP, physical STAB',
    cat: 'physical',
    bp: 80,
    type: 'Normal',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    atkBase: 130,
    atkSp: 32,
    atkNature: '+atk',
    defBase: 120,
    defSp: 0,
    defNature: 'neutral',
  },
  {
    name: '+spa nature, 32 SP, special STAB super-effective',
    cat: 'special',
    bp: 90,
    type: 'Fire',
    atkTypes: ['Fire'],
    defTypes: ['Grass'],
    atkBase: 130,
    atkSp: 32,
    atkNature: '+spa',
    defBase: 110,
    defSp: 0,
    defNature: 'neutral',
  },
  {
    name: 'neutral, 16 SP (EV 124), physical — pure SP scaling',
    cat: 'physical',
    bp: 80,
    type: 'Normal',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    atkBase: 120,
    atkSp: 16,
    atkNature: 'neutral',
    defBase: 120,
    defSp: 0,
    defNature: 'neutral',
  },
  {
    name: '+def defender, 32 SP on defense, physical',
    cat: 'physical',
    bp: 80,
    type: 'Normal',
    atkTypes: ['Normal'],
    defTypes: ['Ground'],
    atkBase: 120,
    atkSp: 0,
    atkNature: 'neutral',
    defBase: 100,
    defSp: 32,
    defNature: '+def',
  },
];

const fullBase = (over) => ({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 80, ...over });

function statMonStats(s) {
  const physical = s.cat === 'physical';
  const atkStat = physical ? 'atk' : 'spa';
  const defStat = physical ? 'def' : 'spd';
  return { physical, atkStat, defStat };
}

function ourStatRolls(s) {
  const { atkStat, defStat } = statMonStats(s);
  const attacker = ourStatMon({
    base: fullBase({ [atkStat]: s.atkBase }),
    sp: { [atkStat]: s.atkSp },
    nature: s.atkNature,
    types: s.atkTypes,
  });
  const defender = ourStatMon({
    base: fullBase({ [defStat]: s.defBase }),
    sp: { [defStat]: s.defSp },
    nature: s.defNature,
    types: s.defTypes,
  });
  const move = { apiName: 'tackle', type: s.type, power: s.bp, category: s.cat };
  return calculateDamageRolls(attacker, defender, move, {});
}

function smogonStatRolls(s) {
  const { physical, atkStat, defStat } = statMonStats(s);
  const attacker = smogonStatMon({
    base: fullBase({ [atkStat]: s.atkBase }),
    ev: { [atkStat]: spToEv(s.atkSp) },
    nature: s.atkNature,
    types: s.atkTypes,
  });
  const defender = smogonStatMon({
    base: fullBase({ [defStat]: s.defBase }),
    ev: { [defStat]: spToEv(s.defSp) },
    nature: s.defNature,
    types: s.defTypes,
  });
  const move = new Move(gen, 'Tackle', {
    overrides: { basePower: s.bp, type: s.type, category: physical ? 'Physical' : 'Special' },
    useMax: false,
  });
  const res = calculate(gen, attacker, defender, move, new Field({ gameType: 'Singles' }));
  const dmg = res.damage;
  return Array.isArray(dmg) ? dmg : [dmg];
}

let failures = 0;
const run = (list, our, smog) => {
  for (const s of list) {
    const a = our(s);
    const b = smog(s);
    const match = a.length === b.length && a.every((v, i) => v === b[i]);
    console.log(`${match ? 'PASS' : 'FAIL'}  ${s.name}`);
    if (!match) {
      failures++;
      console.error(`  ours:   ${a.join(',')}`);
      console.error(`  smogon: ${b.join(',')}`);
    }
  }
};

run(scenarios, ourRolls, smogonRolls);
run(statScenarios, ourStatRolls, smogonStatRolls);

const total = scenarios.length + statScenarios.length;
console.log(`\n${total - failures}/${total} scenarios match @smogon/calc`);
process.exit(failures ? 1 : 0);
