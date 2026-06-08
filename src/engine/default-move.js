// Smart default-move selection. When a Pokémon is chosen the calculator pre-picks
// a move; defaulting to the alphabetically-first damaging move gave nonsense like
// Kingambit -> Aerial Ace. This picks a sensible STAB attack instead (issue #68).
//
// The function is pure and fetch-free: callers resolve each damaging move's
// details first (engine-agnostic { apiName, name, type, power, category,
// accuracy }) and pass them in, so the heuristic can be unit-tested directly.
import { DRAWBACK_MOVES, SIGNATURE_MOVES, SELF_KO_MOVES } from '../data/move-tags.js';
import { isSpreadMove } from '../data/moves.js';

// The drawback / signature nudges, kept as named constants so the scoring reads
// declaratively (and the tests can reason about the ordering they enforce).
const DRAWBACK_PENALTY = 0.5; // Hyper Beam, Solar Beam, … — avoid by default
const SIGNATURE_BONUS = 1.3; // only orders among signatures now (they're force-picked)

// Proxy for a move's expected output on this attacker, used only to rank the
// candidates against each other (not the real damage formula):
//   base power × hit chance × the base stat the move's category scales off.
// Scaling by Atk vs SpA is what makes the pick follow the higher attacking stat
// (issue #68 pt 3); drawback / signature factors then nudge the ordering.
function scoreMove(move, baseStats) {
  const offStat = move.category.toLowerCase() === 'physical' ? baseStats.atk : baseStats.spa;
  const accuracy = move.accuracy == null ? 1 : move.accuracy / 100; // null = never misses
  const drawback = DRAWBACK_MOVES.has(move.apiName) ? DRAWBACK_PENALTY : 1;
  const signature = SIGNATURE_MOVES.has(move.apiName) ? SIGNATURE_BONUS : 1;
  return move.power * accuracy * offStat * drawback * signature;
}

// Highest-scoring move in a candidate pool, or null when empty.
function bestByScore(pool, baseStats) {
  let best = null;
  let bestScore = -Infinity;
  for (const move of pool) {
    const score = scoreMove(move, baseStats);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

// Picks the move a freshly-selected attacker should default to, or null when it
// has no damaging move to offer (caller falls back to a Custom Move).
//
// STAB (issue #68 pt 1) and the higher-attacking-stat category (pt 3) are both
// HARD preferences, applied as ordered candidate tiers so neither can be overcome
// by raw base power — e.g. special Farigiraf must not lead with physical STAB
// Double-Edge just because its BP outweighs the Atk/SpA gap. The first non-empty
// tier supplies the candidates, then the expected-output score ranks within it:
//   1. STAB in the preferred category   2. STAB (any category)
//   3. preferred category (any type)    4. any damaging move
export function pickDefaultMove({ moves, types, baseStats }) {
  // Signature attacks are forced (issue #68 pt 4): if the attacker learns one it
  // wins outright, overriding every rule below — STAB/category, the drawback
  // penalty, and even the spread exclusion (Glacial Lance, Astral Barrage and the
  // therian storms are spread signatures and still take precedence). The only
  // guard is power > 0, a data-sanity floor since a 0/variable-BP move can't be a
  // usable damage default. Multiple signatures break by the usual score.
  const signature = (moves || []).filter((m) => m && m.power > 0 && SIGNATURE_MOVES.has(m.apiName));
  if (signature.length > 0) return bestByScore(signature, baseStats);

  const typeSet = new Set((types || []).map((t) => t.toLowerCase()));
  // Exclude outright: self-KO moves (fainting the user is never a default, however
  // high the BP) and spread moves (Earthquake, Rock Slide, …). Spread attacks carry
  // their own 0.75× target multiplier and ally/foe targeting logic, so they're a
  // poor neutral default — keep the auto-pick to plain single-target moves.
  const damaging = (moves || []).filter(
    (m) => m && m.power > 0 && !SELF_KO_MOVES.has(m.apiName) && !isSpreadMove(m)
  );
  if (damaging.length === 0) return null;

  const preferPhysical = (baseStats.atk || 0) >= (baseStats.spa || 0);
  const isPreferred = (m) => (m.category.toLowerCase() === 'physical') === preferPhysical;
  const isStab = (m) => typeSet.has(m.type.toLowerCase());

  const tiers = [
    damaging.filter((m) => isStab(m) && isPreferred(m)),
    damaging.filter((m) => isStab(m)),
    damaging.filter((m) => isPreferred(m)),
    damaging,
  ];
  const pool = tiers.find((t) => t.length > 0);
  return bestByScore(pool, baseStats);
}
