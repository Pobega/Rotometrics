// Ability registry. Each entry returns a damage multiplier (1 = no change, 0 =
// fully immune) given the calculation context. To add a new ability:
//   1. Add an entry here (or, for stat / STAB / type-changing abilities, inline
//      in damage.js where those are applied).
//   2. Add the apiName to OFFENSIVE_VGC_ABILITIES or DEFENSIVE_VGC_ABILITIES in
//      src/data/constants.js so it appears in the calculator dropdown + Abilitydex.

import {
  SLICING_MOVES,
  CONTACT_MOVES,
  BITING_MOVES,
  PUNCHING_MOVES,
  PULSE_MOVES,
  SOUND_MOVES,
} from '../data/move-tags.js';

// Context shape passed to every entry:
//   { move, isPhysical, attacker, defender, typeMult, modifiers }
// `move` is the effective move (post resolveEffectiveMove), so the -ate type
// change + its ._ateBoosted flag are already resolved by the time we read it.

export const ATTACKER_DAMAGE_ABILITIES = {
  technician: ({ move }) => (move.power > 0 && move.power <= 60 ? 1.5 : 1),
  sharpness: ({ move }) => (SLICING_MOVES.has(move.apiName) ? 1.5 : 1),
  'tough-claws': ({ move }) => (CONTACT_MOVES.has(move.apiName) ? 1.3 : 1),
  'strong-jaw': ({ move }) => (BITING_MOVES.has(move.apiName) ? 1.5 : 1),
  'iron-fist': ({ move }) => (PUNCHING_MOVES.has(move.apiName) ? 1.2 : 1),
  'mega-launcher': ({ move }) => (PULSE_MOVES.has(move.apiName) ? 1.5 : 1),
  'punk-rock': ({ move }) => (SOUND_MOVES.has(move.apiName) ? 1.3 : 1),
  transistor: ({ move }) => (move.type === 'Electric' ? 1.3 : 1),
  steelworker: ({ move }) => (move.type === 'Steel' ? 1.5 : 1),
  'steely-spirit': ({ move }) => (move.type === 'Steel' ? 1.5 : 1),
  'rocky-payload': ({ move }) => (move.type === 'Rock' ? 1.5 : 1),
  "dragons-maw": ({ move }) => (move.type === 'Dragon' ? 1.5 : 1),
  // Water Bubble is dual-purpose: as the attacker it doubles the user's Water
  // moves (its defensive Fire-halving lives in DEFENDER_DAMAGE_ABILITIES).
  'water-bubble': ({ move }) => (move.type === 'Water' ? 2 : 1),
  'supreme-overlord': () => 1.5,
  // The -ate abilities change a Normal move's type (handled in resolveEffectiveMove)
  // and boost the converted move 1.2x; ._ateBoosted is set only on those moves.
  aerilate: ({ move }) => (move._ateBoosted ? 1.2 : 1),
  pixilate: ({ move }) => (move._ateBoosted ? 1.2 : 1),
  refrigerate: ({ move }) => (move._ateBoosted ? 1.2 : 1),
  galvanize: ({ move }) => (move._ateBoosted ? 1.2 : 1),
  // typeMult-conditional boosts.
  'tinted-lens': ({ typeMult }) => (typeMult < 1 && typeMult > 0 ? 2 : 1),
  neuroforce: ({ typeMult }) => (typeMult > 1 ? 1.25 : 1),
  // Sand Force boosts Rock / Ground / Steel moves 1.3x in a sandstorm.
  'sand-force': ({ move, modifiers }) =>
    modifiers && modifiers.weather === 'sandstorm' &&
    (move.type === 'Rock' || move.type === 'Ground' || move.type === 'Steel')
      ? 1.3
      : 1,
  // Flare Boost pumps the user's special moves 1.5x while burned (burn is the
  // only status the calc models; Toxic Boost is deferred until a poison status
  // exists to trigger it).
  'flare-boost': ({ attacker, isPhysical }) =>
    attacker.status === 'burned' && !isPhysical ? 1.5 : 1,
};

export const DEFENDER_DAMAGE_ABILITIES = {
  multiscale: () => 0.5,
  'shadow-shield': () => 0.5,
  fluffy: ({ move }) =>
    (CONTACT_MOVES.has(move.apiName) ? 0.5 : 1) * (move.type === 'Fire' ? 2 : 1),
  'ice-scales': ({ isPhysical }) => (!isPhysical ? 0.5 : 1),
  'fur-coat': ({ isPhysical }) => (isPhysical ? 0.5 : 1),
  'punk-rock': ({ move }) => (SOUND_MOVES.has(move.apiName) ? 0.5 : 1),
  'water-bubble': ({ move }) => (move.type === 'Fire' ? 0.5 : 1),
  'thick-fat': ({ move }) => (move.type === 'Fire' || move.type === 'Ice' ? 0.5 : 1),
  heatproof: ({ move }) => (move.type === 'Fire' ? 0.5 : 1),
  'purifying-salt': ({ move }) => (move.type === 'Ghost' ? 0.5 : 1),
  'dry-skin': ({ move }) => (move.type === 'Fire' ? 1.25 : move.type === 'Water' ? 0 : 1),
  filter: ({ typeMult }) => (typeMult > 1 ? 0.75 : 1),
  'solid-rock': ({ typeMult }) => (typeMult > 1 ? 0.75 : 1),
  'prism-armor': ({ typeMult }) => (typeMult > 1 ? 0.75 : 1),
  // Type-absorbing immunities: the move deals no damage (×0).
  levitate: ({ move }) => (move.type === 'Ground' ? 0 : 1),
  'earth-eater': ({ move }) => (move.type === 'Ground' ? 0 : 1),
  'well-baked-body': ({ move }) => (move.type === 'Fire' ? 0 : 1),
  'flash-fire': ({ move }) => (move.type === 'Fire' ? 0 : 1),
  'volt-absorb': ({ move }) => (move.type === 'Electric' ? 0 : 1),
  'lightning-rod': ({ move }) => (move.type === 'Electric' ? 0 : 1),
  'motor-drive': ({ move }) => (move.type === 'Electric' ? 0 : 1),
  'water-absorb': ({ move }) => (move.type === 'Water' ? 0 : 1),
  'storm-drain': ({ move }) => (move.type === 'Water' ? 0 : 1),
  'sap-sipper': ({ move }) => (move.type === 'Grass' ? 0 : 1),
  // Wonder Guard: only super-effective hits land at all.
  'wonder-guard': ({ typeMult }) => (typeMult > 1 ? 1 : 0),
};

export function attackerAbilityMultiplier(ability, ctx) {
  const entry = ATTACKER_DAMAGE_ABILITIES[ability];
  return entry ? entry(ctx) : 1;
}

export function defenderAbilityMultiplier(ability, ctx) {
  const entry = DEFENDER_DAMAGE_ABILITIES[ability];
  return entry ? entry(ctx) : 1;
}
