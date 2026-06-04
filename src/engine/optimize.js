// EV/nature optimization search. Given a matchup, brute-force the cheapest SP
// (and nature) spread that hits a survival or KO goal. Pure: depends only on the
// stat/damage engine and the NATURES table, so it's unit-testable in isolation.
import { calculateStat } from './stats.js';
import { calculateDamageRolls } from './damage.js';
import { NATURES } from '../data/constants.js';

// Cheapest HP/Def(SpD) spread (and nature) that lets `defender` survive the
// attacker's max roll. Returns { hp, def, nature, total } or null if no spread
// within the budget survives.
export function optimizeSurvivalEVsWithNatures(attacker, defender, move, modifiers, allowedNatures) {
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

// Cheapest Atk(SpA) spread (and nature) that secures the target KO (OHKO on the
// min roll, or 2HKO via half the defender's HP). Returns { sp, nature } or null.
export function optimizeOffensiveEVsWithNatures(attacker, defender, move, modifiers, targetKO, allowedNatures) {
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
