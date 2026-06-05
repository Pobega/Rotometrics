// Stat calculation and type effectiveness for Pokemon Champions rules.

export const TYPE_EFFECTIVENESS = {
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

export function calculateStat(statName, base, sp, natureName, isHP = false) {
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

  if (natLower === '+atk' && statName === 'spa') natureMod = 0.9;
  else if (natLower === '+spa' && statName === 'atk') natureMod = 0.9;
  else if (natLower === '+def' && statName === 'spa') natureMod = 0.9;
  else if (natLower === '+spd' && statName === 'atk') natureMod = 0.9;
  else if (natLower === '+spe' && statName === 'spa') natureMod = 0.9;

  return Math.floor((base + sp + 20) * natureMod);
}

export function calculateStatBoost(statValue, stage) {
  if (stage === 0) return statValue;
  if (stage > 0) {
    return Math.floor(statValue * (2 + stage) / 2);
  } else {
    return Math.floor(statValue * 2 / (2 - stage));
  }
}

export function getTypeEffectiveness(moveType, defenderTypes) {
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

// Map a type-effectiveness multiplier to a display label + favorability tone for
// the active mode. Favor flips by mode: in offense a high multiplier is good for
// the user (emerald); in survival a high multiplier means more damage taken, so
// it's bad (red). Neutral (1x) is always amber. Tones match RESULT_TONES keys.
export function effectivenessInfo(mult, mode) {
  const LABELS = {
    0: 'No Effect', 0.25: 'Extremely Ineffective', 0.5: 'Not Very Effective',
    1: 'Neutral', 2: 'Super Effective', 4: 'Extremely Effective',
  };
  const label = LABELS[mult] ?? `${mult}×`;
  let tone;
  if (mult === 1) tone = 'amber';
  else {
    const favorable = mode === 'survival' ? mult < 1 : mult > 1;
    tone = favorable ? 'emerald' : 'red';
  }
  return { label, tone };
}
