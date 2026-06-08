// Pure, DOM/fetch-free logic for the Abilitydex ability-browser page. Mirrors the
// shape of moves.js / dex.js (rows are { apiName, name, details|null }) so it can
// be unit tested and reasoned about without touching the network or the DOM.
import { OFFENSIVE_VGC_ABILITIES, DEFENSIVE_VGC_ABILITIES } from './constants.js';

// The curated VGC lists keyed by apiName, so the Abilitydex can both filter to
// "VGC-relevant" abilities and tag each row Offensive / Defensive. Built once.
const OFF_SET = new Set(OFFENSIVE_VGC_ABILITIES.map((a) => a.apiName));
const DEF_SET = new Set(DEFENSIVE_VGC_ABILITIES.map((a) => a.apiName));

// Classifies an ability's VGC relevance for the Tag column + the "VGC only"
// filter: 'off' (damage-boosting), 'def' (damage-reducing), or null (neither).
export function vgcTag(apiName) {
  if (OFF_SET.has(apiName)) return 'off';
  if (DEF_SET.has(apiName)) return 'def';
  return null;
}

// True when an ability appears in either curated VGC list.
export function isVgcAbility(apiName) {
  return vgcTag(apiName) !== null;
}

// Returns a new array sorted by name in the given direction. Stable. Abilities
// have no numeric attributes, so name is the only sort key.
export function sortAbilities(rows, dir = 'asc') {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const cmp = a.row.name.localeCompare(b.row.name);
      return cmp !== 0 ? cmp * sign : a.i - b.i;
    })
    .map((e) => e.row);
}

// Filters the roster by a free-text query (matched against the ability name and
// its effect description) and a VGC tag filter ('' = all, 'off', or 'def'). Rows
// without loaded details can only match the name (their desc is unknown until
// fetched), mirroring the lazy-load behaviour of filterMoves / filterDex.
export function filterAbilities(rows, { query = '', tag = '' } = {}) {
  const q = (query || '').trim().toLowerCase();

  return rows.filter((row) => {
    if (tag && vgcTag(row.apiName) !== tag) return false;

    if (q) {
      const d = row.details;
      const inName = row.name.toLowerCase().includes(q);
      const inDesc = d && d.desc && d.desc.toLowerCase().includes(q);
      if (!inName && !inDesc) return false;
    }

    return true;
  });
}
