// Ability registry. Each entry returns a damage multiplier (1 = no change)
// given the calculation context. To add a new ability:
//   1. Add an entry here.
//   2. Add the apiName to OFFENSIVE_VGC_ABILITIES or DEFENSIVE_VGC_ABILITIES
//      in app.js so it appears in the dropdown.

import { SLICING_MOVES, CONTACT_MOVES, BITING_MOVES, PUNCHING_MOVES } from '../data/move-tags.js';

// Context shape passed to every entry:
//   { move, isPhysical, attacker, defender }

export const ATTACKER_DAMAGE_ABILITIES = {
  technician: ({ move }) => (move.power > 0 && move.power <= 60 ? 1.5 : 1),
  sharpness: ({ move }) => (SLICING_MOVES.has(move.apiName) ? 1.5 : 1),
  'tough-claws': ({ move }) => (CONTACT_MOVES.has(move.apiName) ? 1.3 : 1),
  'strong-jaw': ({ move }) => (BITING_MOVES.has(move.apiName) ? 1.5 : 1),
  'iron-fist': ({ move }) => (PUNCHING_MOVES.has(move.apiName) ? 1.2 : 1),
  transistor: ({ move }) => (move.type === 'Electric' ? 1.3 : 1),
  steelworker: ({ move }) => (move.type === 'Steel' ? 1.5 : 1),
  'rocky-payload': ({ move }) => (move.type === 'Rock' ? 1.5 : 1),
  'supreme-overlord': () => 1.5,
};

export const DEFENDER_DAMAGE_ABILITIES = {
  multiscale: () => 0.5,
  'shadow-shield': () => 0.5,
  fluffy: ({ move }) =>
    (CONTACT_MOVES.has(move.apiName) ? 0.5 : 1) * (move.type === 'Fire' ? 2 : 1),
  'ice-scales': ({ isPhysical }) => (!isPhysical ? 0.5 : 1),
  'water-bubble': ({ move }) => (move.type === 'Fire' ? 0.5 : 1),
  'thick-fat': ({ move }) => (move.type === 'Fire' || move.type === 'Ice' ? 0.5 : 1),
  heatproof: ({ move }) => (move.type === 'Fire' ? 0.5 : 1),
  'purifying-salt': ({ move }) => (move.type === 'Ghost' ? 0.5 : 1),
  'dry-skin': ({ move }) => (move.type === 'Fire' ? 1.25 : move.type === 'Water' ? 0 : 1),
  filter: ({ typeMult }) => (typeMult > 1 ? 0.75 : 1),
  'solid-rock': ({ typeMult }) => (typeMult > 1 ? 0.75 : 1),
  'prism-armor': ({ typeMult }) => (typeMult > 1 ? 0.75 : 1),
};

export function attackerAbilityMultiplier(ability, ctx) {
  const entry = ATTACKER_DAMAGE_ABILITIES[ability];
  return entry ? entry(ctx) : 1;
}

export function defenderAbilityMultiplier(ability, ctx) {
  const entry = DEFENDER_DAMAGE_ABILITIES[ability];
  return entry ? entry(ctx) : 1;
}
