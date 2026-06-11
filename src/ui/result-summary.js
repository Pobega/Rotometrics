// Result-summary model. One pure computation (buildResultModel) feeds both result
// views (the desktop pinned HUD + the mobile bottom overlay), so verdict/speed/
// percentages never drift between layouts. The rendering now lives in the Preact
// ResultsHUD island (src/ui-preact/ResultsHUD.js); this module is DOM-free.
import { STATE } from '../state.js';
import {
  calculateStat,
  calculateStatBoost,
  getMoveEffectiveness,
  effectivenessInfo,
} from '../engine/stats.js';
import { resolveEffectiveMove, multiHitRange } from '../engine/damage.js';

// Map raw damage vs effective HP to a KO/survival verdict for the active mode.
function computeVerdict(mode, minDamage, maxDamage, finalHp) {
  if (mode === 'survival') {
    if (minDamage >= finalHp) return { label: 'Faints', tone: 'red', roll: false };
    if (maxDamage >= finalHp) return { label: 'Survives', tone: 'amber', roll: true };
    return { label: 'Survives', tone: 'emerald', roll: false };
  }
  // Green is reserved for a guaranteed OHKO; the 2HKO tier reads sky (a clear step
  // below) so it's never mistaken for a kill-this-turn result.
  if (minDamage >= finalHp) return { label: 'OHKO', tone: 'emerald', roll: false };
  if (maxDamage >= finalHp) return { label: 'OHKO', tone: 'amber', roll: true };
  if (minDamage >= finalHp / 2) return { label: '2HKO', tone: 'sky', roll: false };
  if (maxDamage >= finalHp / 2) return { label: '2HKO', tone: 'sky', roll: true };
  return { label: 'No KO', tone: 'red', roll: false };
}

// Probability that the displayed roll-verdict actually lands, as a percentage of
// the 16 damage rolls. Only meaningful for "roll" verdicts (guaranteed ones are
// 100% by definition), so it returns null otherwise.
function koChanceLabel(mode, rolls, finalHp, verdict) {
  if (!verdict.roll) return null;
  const n = rolls.length;
  let count;
  if (mode === 'survival') {
    count = rolls.filter((r) => r < finalHp).length; // rolls the defender lives through
  } else if (verdict.label === 'OHKO') {
    count = rolls.filter((r) => r >= finalHp).length;
  } else {
    // 2HKO
    count = rolls.filter((r) => r * 2 >= finalHp).length;
  }
  return `${((count / n) * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

// Effective Speed for a side, folding in Choice Scarf (x1.5) and Tailwind (x2).
function effectiveSpeed(mon, tailwind) {
  let spe = calculateStatBoost(
    calculateStat('spe', mon.baseStats.spe || 100, mon.sps.spe, mon.nature, false),
    mon.boosts.spe
  );
  if (mon.item === 'choice_scarf') spe = Math.floor(spe * 1.5);
  if (tailwind) spe *= 2;
  return spe;
}

// Turn-order line, framed around the mode's own Pokémon (attacker in offense,
// defender in survival): green when it moves first, red when second.
function turnOrder(state) {
  if (!state.attacker.name || !state.defender.name)
    return { label: 'Awaiting Speed', tone: 'slate' };
  const survival = state.mode === 'survival';
  const atkSpe = effectiveSpeed(state.attacker, state.modifiers.tailAtk);
  const defSpe = effectiveSpeed(state.defender, state.modifiers.tailDef);
  const subjectName = survival ? state.defender.name : state.attacker.name;
  const subjectSpe = survival ? defSpe : atkSpe;
  const otherSpe = survival ? atkSpe : defSpe;
  if (subjectSpe === otherSpe) return { label: 'Speed Tie', tone: 'amber' };
  const first = subjectSpe > otherSpe;
  return {
    label: `${subjectName} moves ${first ? '1st' : '2nd'}`,
    tone: first ? 'emerald' : 'red',
  };
}

// Build the damage-card move line (display text + tone) from battle state. Pure
// and DOM-free so it can be golden-tested. Reads everything off the *resolved*
// move so variable moves (Weather Ball) report their resolved type + BP, keeping
// the card in sync with the Attack card and the damage math.
export function buildMoveLine(attacker, defender, move, modifiers, mode) {
  const eff = resolveEffectiveMove(attacker, move, modifiers, defender);
  const mult = getMoveEffectiveness(eff, defender.types, {
    scrappy: attacker.ability === 'scrappy',
  });
  const info = effectivenessInfo(mult, mode);
  const range = multiHitRange(move, attacker);
  const hitsTwice =
    attacker.ability === 'parental-bond'
      ? ' · Hits Twice (0.25x Second Hit)'
      : range
        ? range.min === range.max
          ? ` · Hits ${range.min}x`
          : ` · Hits ${range.min}-${range.max}x`
        : '';
  // Spread tag — make the 0.75x state obvious at a glance. Show "Spread (0.75x)"
  // whenever the multiplier is actually applied (modifiers.spread), and "Non-Spread"
  // when a spread-capable move (move.spread) currently isn't getting it, so a
  // toggle/move mismatch is visible. Single-target moves with spread off stay clean.
  let spread = '';
  if (modifiers.spread) spread = ' · Spread (0.75x)';
  else if (move.spread) spread = ' · Non-Spread';
  return {
    text: `${move.name} (${eff.power} BP) · ${info.label}${hitsTwice}${spread}`,
    tone: info.tone,
  };
}

// Build the full result-summary model from rolls + state. Pure (no DOM); the
// ResultsHUD island renders both views from this. tone fields are semantic keys
// (emerald/amber/sky/red/slate) the renderer maps to classes.
// Format a probability (0–1) as a compact percentage string ("12%", "0.3%",
// "100%"), matching the koChanceLabel style.
function pctOf(p) {
  return `${(p * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

// Representative RGB for each gauge tier (matches gaugeTier's hue) so the
// multi-hit density gradient is tinted by KO severity.
const TIER_RGB = {
  red: '248,113,113', // red-400
  amber: '251,191,36', // amber-400
  green: '52,211,153', // emerald-400
};

// Paint the damage distribution as a CSS gradient across the 0–100% HP gauge.
// The bar is a solid flat fill (like the other calcs) up to the guaranteed
// minimum total, then a short "shoulder" eases it down into the probability
// density — brightest where the outcome clusters, fading to nothing at the
// unlikely upper tail — so the solid part blends into the spread instead of
// reading as a separate chunk. Returns null if there's nothing to draw.
function buildDensityGradient(outcomes, finalHp, rgb) {
  const bins = 60;
  const dens = new Array(bins + 1).fill(0);
  for (const [dmg, p] of outcomes) {
    const idx = Math.round((Math.min(100, (dmg / finalHp) * 100) / 100) * bins);
    dens[idx] += p;
  }
  // Light 3-tap smoothing so discrete damage values read as a continuous curve.
  const sm = dens.map((d, i) => 0.25 * (dens[i - 1] || 0) + 0.5 * d + 0.25 * (dens[i + 1] || 0));
  const lo = sm.findIndex((d) => d > 0); // guaranteed minimum (support start)
  let hi = bins;
  while (hi > 0 && sm[hi] === 0) hi--;
  if (lo < 0) return null;
  const max = Math.max(...sm);
  const shoulder = 8; // bins over which the solid fill eases into the density
  const stops = [];
  for (let i = 0; i <= bins; i++) {
    const pos = ((i / bins) * 100).toFixed(1);
    let a;
    if (i < lo) {
      a = 1; // solid, guaranteed-damage floor
    } else if (i <= hi) {
      // Higher of the density (0.25 floor so faint tails stay visible) and a
      // shoulder decaying from the solid fill, so the two blend seamlessly.
      const density = 0.25 + 0.75 * (sm[i] / max);
      a = Math.max(density, Math.max(0, 1 - (i - lo) / shoulder));
    } else {
      a = 0; // above the max possible roll — empty track
    }
    stops.push(`rgba(${rgb},${a.toFixed ? a.toFixed(3) : a}) ${pos}%`);
  }
  return `linear-gradient(90deg, ${stops.join(',')})`;
}

export function buildResultModel(rolls, state = STATE, dist = null) {
  const minDamage = rolls[0] || 0;
  const maxDamage = rolls[rolls.length - 1] || 0;
  const survival = state.mode === 'survival';

  let model;
  if (!state.attacker.name || !state.defender.name) {
    model = {
      matchup: 'Awaiting Selection...',
      moveText: 'Select both slots to calculate',
      moveTone: 'slate',
      pct: '0.0% - 0.0%',
      verdict: { label: 'Awaiting', tone: 'slate', roll: false, chance: null },
      minFill: 0,
      maxFill: 0,
    };
  } else {
    const finalHp = calculateStat(
      'hp',
      state.defender.baseStats.hp,
      state.defender.sps.hp,
      state.defender.nature,
      true
    );
    const minPct = (minDamage / finalHp) * 100;
    const maxPct = (maxDamage / finalHp) * 100;
    const verdict = computeVerdict(state.mode, minDamage, maxDamage, finalHp);
    // Distribution-aware verdict: the label tiers stay driven by the true
    // min/max extremes, but for a multi-hit move the displayed odds come from the
    // real per-hit-independent (and hit-count-weighted) distribution rather than
    // the shared-roll approximation.
    if (dist && verdict.roll && dist.koChance != null) {
      verdict.chance = state.mode === 'survival' ? pctOf(1 - dist.koChance) : pctOf(dist.koChance);
    } else {
      verdict.chance = koChanceLabel(state.mode, rolls, finalHp, verdict);
    }
    const line = buildMoveLine(
      state.attacker,
      state.defender,
      state.move,
      state.modifiers,
      state.mode
    );
    model = {
      matchup: `${state.attacker.name} vs ${state.defender.name}`,
      moveText: line.text,
      moveTone: line.tone,
      pct: `${minPct.toFixed(1)}% - ${maxPct.toFixed(1)}%`,
      verdict,
      minFill: Math.min(100, minPct),
      maxFill: Math.min(100, maxPct),
    };

    // Multi-hit: paint the true distribution as a density gradient on the gauge,
    // plus a slim inline strip under it. Damage units → %HP for display.
    if (dist) {
      const tierKey = maxPct >= 100 ? 'red' : maxPct >= 50 ? 'amber' : 'green';
      model.densityGradient = buildDensityGradient(dist.outcomes, finalHp, TIER_RGB[tierKey]);
      const band = `Likely ${((dist.likely.lo / finalHp) * 100).toFixed(0)}–${(
        (dist.likely.hi / finalHp) *
        100
      ).toFixed(0)}%`;
      const counts = dist.perCount
        ? dist.perCount.map((c) => ({
            count: c.count,
            prob: pctOf(c.prob),
            ko: c.koChance != null ? pctOf(c.koChance) : null,
          }))
        : null;
      model.multiHit = { band, counts };
    }
  }

  // Mode-driven identity icon + roll-gauge tier (shared across both views).
  model.iconGlyph = survival ? 'fa-shield-halved' : 'fa-hand-fist';
  model.iconTone = survival
    ? 'bg-blue-950/40 border-blue-900/40 text-blue-400'
    : 'bg-amber-950/40 border-amber-900/40 text-amber-400';
  model.gaugeTier =
    model.maxFill >= 100
      ? 'bg-gradient-to-r from-red-600 to-rose-600'
      : model.maxFill >= 50
        ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
        : 'bg-gradient-to-r from-green-500 to-emerald-500';
  model.speed = turnOrder(state);
  return model;
}
