// Shared result-summary rendering. One computation feeds every "view" (the mobile
// bottom overlay + the desktop pinned HUD), so verdict/speed/percentages never
// drift between layouts. The verdict/KO-chance helpers are pure; updateResultSummary
// and setSpeedText mirror the model into the (already-queried) DOM elements.
import { DOM } from './dom.js';
import { STATE } from '../state.js';
import { calculateStat } from '../engine/stats.js';

// Tone -> shared color palette (bg / text / border). Views differ only in size.
const RESULT_TONES = {
  emerald: 'bg-emerald-950/60 text-emerald-400 border-emerald-900/30',
  amber: 'bg-amber-950/60 text-amber-400 border-amber-900/30',
  sky: 'bg-sky-950/60 text-sky-400 border-sky-900/30',
  red: 'bg-red-950/60 text-red-400 border-red-900/30',
  slate: 'bg-slate-800 text-slate-400 border-slate-700',
};

// The result summary is mirrored across these element groups. Each view supplies
// its own size base for the verdict badge; colors come from RESULT_TONES.
const RESULT_VIEWS = [
  {
    matchup: DOM.mobOverlayMatchup, move: DOM.mobOverlayMove, pct: DOM.mobOverlayPct,
    badge: DOM.mobOverlayBadge,
    badgeBase: 'h-8 px-3 rounded-lg flex items-center justify-center text-[10px] font-black uppercase select-none tracking-wider border',
    barMin: DOM.mobOverlayBarMin, barMax: DOM.mobOverlayBarMax,
    icon: DOM.mobOverlayIcon, iconWrap: DOM.mobOverlayIconWrap,
    iconBase: 'fa-solid text-xs',
    iconWrapBase: 'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 shadow-inner border',
  },
  {
    matchup: DOM.resMatchup, move: DOM.resMove, pct: DOM.resPct,
    badge: DOM.resBadge,
    badgeBase: 'h-10 px-4 rounded-lg flex items-center justify-center text-sm font-black uppercase select-none tracking-wider border',
    barMin: DOM.resBarMin, barMax: DOM.resBarMax,
    icon: DOM.resModeIcon, iconWrap: DOM.resModeIconWrap,
    iconBase: 'fa-solid',
    iconWrapBase: 'flex items-center justify-center w-10 h-10 rounded-xl shrink-0 shadow-inner border',
  },
];

// The turn-order line is plain text (not a chip), so it only takes a text color.
const SPEED_TEXT_TONES = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  sky: 'text-sky-400',
  red: 'text-red-400',
  slate: 'text-slate-400',
};

// Speed lives in a different function (it's known earlier than damage), so updating
// it is split out. Drives every view's turn-order text + keeps tones in sync.
export function setSpeedText(label, tone) {
  const toneCls = SPEED_TEXT_TONES[tone] || SPEED_TEXT_TONES.slate;
  if (DOM.mobOverlaySpeed) {
    DOM.mobOverlaySpeed.textContent = label;
    DOM.mobOverlaySpeed.className = `text-[10px] font-extrabold tracking-wide leading-none ${toneCls}`;
  }
  if (DOM.resSpeed) {
    DOM.resSpeed.textContent = label;
    DOM.resSpeed.className = `text-[11px] font-extrabold tracking-wide leading-none ${toneCls}`;
  }
}

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

function verdictBadgeHTML(v) {
  if (v.roll) {
    // Roll verdicts carry the odds: show the exact chance (e.g. "12.5%") in place
    // of a generic "(roll)" tag so a high-roll-only result reads as a probability.
    const sub = v.chance != null ? v.chance : '(roll)';
    return `
      <div class="flex flex-col items-center justify-center leading-none gap-0.5">
        <span>${v.label}</span>
        <span class="text-[10px] font-extrabold opacity-85 tracking-normal font-sans tabular-nums">${sub}</span>
      </div>`;
  }
  return `<span class="leading-none">${v.label}</span>`;
}

// Probability that the displayed roll-verdict actually lands, as a percentage of
// the 16 damage rolls. Only meaningful for "roll" verdicts (guaranteed ones are
// 100% by definition), so it returns null otherwise.
function koChanceLabel(mode, rolls, finalHp, verdict) {
  if (!verdict.roll) return null;
  const n = rolls.length;
  let count;
  if (mode === 'survival') {
    count = rolls.filter(r => r < finalHp).length;       // rolls the defender lives through
  } else if (verdict.label === 'OHKO') {
    count = rolls.filter(r => r >= finalHp).length;
  } else {                                                // 2HKO
    count = rolls.filter(r => r * 2 >= finalHp).length;
  }
  return `${(count / n * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

// Build the summary model once, then mirror it into every result view.
export function updateResultSummary(rolls) {
  const minDamage = rolls[0];
  const maxDamage = rolls[rolls.length - 1];
  let model;
  if (!STATE.attacker.name || !STATE.defender.name) {
    model = {
      matchup: 'Awaiting Selection...', move: 'Select both slots to calculate',
      pct: '0.0% - 0.0%',
      verdict: { label: 'Awaiting', tone: 'slate', roll: false }, minFill: 0, maxFill: 0,
    };
  } else {
    const finalHp = calculateStat('hp', STATE.defender.baseStats.hp, STATE.defender.sps.hp, STATE.defender.nature, true);
    const minPct = (minDamage / finalHp) * 100;
    const maxPct = (maxDamage / finalHp) * 100;
    const verdict = computeVerdict(STATE.mode, minDamage, maxDamage, finalHp);
    verdict.chance = koChanceLabel(STATE.mode, rolls, finalHp, verdict);
    model = {
      matchup: `${STATE.attacker.name} vs ${STATE.defender.name}`,
      move: `${STATE.move.name} (${STATE.move.power} BP)`,
      pct: `${minPct.toFixed(1)}% - ${maxPct.toFixed(1)}%`,
      verdict,
      minFill: Math.min(100, minPct),
      maxFill: Math.min(100, maxPct),
    };
  }

  // Mode-driven bits, shared by every view: the identity icon (shield when sizing
  // defensive bulk, fist when sizing offense; accent matches the mode's tab) and the
  // roll-gauge tier color (keyed off the high roll's lethality).
  const survival = STATE.mode === 'survival';
  const iconGlyph = survival ? 'fa-shield-halved' : 'fa-hand-fist';
  const iconTone = survival ? 'bg-blue-950/40 border-blue-900/40 text-blue-400'
    : 'bg-amber-950/40 border-amber-900/40 text-amber-400';
  const gaugeTier = model.maxFill >= 100 ? 'bg-gradient-to-r from-red-600 to-rose-600'
    : model.maxFill >= 50 ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
    : 'bg-gradient-to-r from-green-500 to-emerald-500';

  for (const v of RESULT_VIEWS) {
    if (!v.matchup) continue;
    v.matchup.textContent = model.matchup;
    v.move.textContent = model.move;
    v.pct.textContent = model.pct;
    v.badge.innerHTML = verdictBadgeHTML(model.verdict);
    v.badge.className = `${v.badgeBase} ${RESULT_TONES[model.verdict.tone]}`;

    if (v.icon && v.iconWrap) {
      v.icon.className = `${v.iconBase} ${iconGlyph}`;
      v.iconWrap.className = `${v.iconWrapBase} ${iconTone}`;
    }

    // Roll gauge: solid floor = guaranteed (min roll), faded extension = up to max.
    if (v.barMin && v.barMax) {
      v.barMax.style.width = `${model.maxFill}%`;
      v.barMax.className = `absolute inset-y-0 left-0 opacity-40 transition-all duration-300 ${gaugeTier}`;
      v.barMin.style.width = `${model.minFill}%`;
      v.barMin.className = `absolute inset-y-0 left-0 transition-all duration-300 ${gaugeTier}`;
    }
  }
}
