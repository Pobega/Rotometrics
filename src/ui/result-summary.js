// Result-summary model. One pure computation (buildResultModel) feeds both result
// views (the desktop pinned HUD + the mobile bottom overlay), so verdict/speed/
// percentages never drift between layouts. The rendering now lives in the Preact
// ResultsHUD island (src/ui-preact/ResultsHUD.js); this module is DOM-free.
import { STATE } from '../state.js';
import {
  calculateStat,
  calculateStatBoost,
  getTypeEffectiveness,
  effectivenessInfo,
} from '../engine/stats.js';
import { resolveEffectiveMove } from '../engine/damage.js';

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
  const eff = resolveEffectiveMove(attacker, move, modifiers);
  const mult = getTypeEffectiveness(eff.type, defender.types, {
    scrappy: attacker.ability === 'scrappy',
  });
  const info = effectivenessInfo(mult, mode);
  const hitsTwice = attacker.ability === 'parental-bond' ? ' · Hits Twice (0.25x Second Hit)' : '';
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
export function buildResultModel(rolls, state = STATE) {
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
    verdict.chance = koChanceLabel(state.mode, rolls, finalHp, verdict);
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
