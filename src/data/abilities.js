// Pure, DOM/fetch-free logic for the Abilitydex ability-browser page. Mirrors the
// shape of moves.js / dex.js (rows are { apiName, name, details|null }) so it can
// be unit tested and reasoned about without touching the network or the DOM.
import { OFFENSIVE_VGC_ABILITIES, DEFENSIVE_VGC_ABILITIES } from './constants.js';

// The curated VGC lists keyed by apiName, so the Abilitydex can both filter to
// "VGC-relevant" abilities and tag each row Offensive / Defensive. Built once.
const OFF_SET = new Set(OFFENSIVE_VGC_ABILITIES.map((a) => a.apiName));
const DEF_SET = new Set(DEFENSIVE_VGC_ABILITIES.map((a) => a.apiName));

// Classifies an ability's VGC relevance for the Tag column + the Offensive /
// Defensive filters: 'off' (damage-boosting), 'def' (damage-reducing), or null
// (neither).
export function abilityTag(apiName) {
  if (OFF_SET.has(apiName)) return 'off';
  if (DEF_SET.has(apiName)) return 'def';
  return null;
}

// True when an ability appears in either curated VGC list.
export function isVgcAbility(apiName) {
  return abilityTag(apiName) !== null;
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

// Does a single, already-lowercased term match an ability row? The 'offensive' /
// 'defensive' keywords (committed by the preset buttons) filter by curated VGC
// tag. Anything else is a substring match on the ability name, its effect text,
// or a holder's name — so 'garchomp' surfaces the abilities it can have, the
// inverse of the modal's "Pokémon with …". (There is no move search here: an
// ability can't be filtered by a move, just as a move can't be filtered by an
// ability in the Attackdex.) The keyword and name matches work on unloaded rows
// (the tag is keyed by apiName, always known); desc and holder matches need
// loaded details.
function abilityTermMatches(row, term) {
  if (term === 'offensive') return abilityTag(row.apiName) === 'off';
  if (term === 'defensive') return abilityTag(row.apiName) === 'def';
  if (row.name.toLowerCase().includes(term)) return true;
  const d = row.details;
  if (!d) return false;
  if (d.desc && d.desc.toLowerCase().includes(term)) return true;
  // pokemon holds raw PokéAPI apiNames (e.g. 'landorus-therian'); normalize the
  // hyphens to spaces so a typed 'iron hands' matches 'iron-hands'.
  if (d.pokemon && d.pokemon.some((n) => n.replace(/-/g, ' ').includes(term))) return true;
  return false;
}

// Case-insensitive filter over a list of search terms which are ANDed: an ability
// is kept only when it satisfies every term. `terms` may be a single string
// (legacy single-search callers) or an array of strings (the stackable chip
// search). Empty/whitespace terms are ignored; no terms returns every row.
// Mirrors filterMoves / filterDex.
//
// `isLegalName` is an optional regulation gate (built from legalSetForFormat in the
// view): when given, an ability is additionally kept only if at least one of its
// holders is legal in the current regulation. A row whose details aren't loaded yet
// has an unknown holder list, so it's dropped until the gate can be evaluated — the
// always-on regulation filter relies on the store force-loading every row.
export function filterAbilities(rows, terms, isLegalName = null) {
  const list = (Array.isArray(terms) ? terms : [terms])
    .map((t) => (t || '').trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0 && !isLegalName) return rows;
  return rows.filter((row) => {
    if (isLegalName && !abilityHasLegalHolder(row, isLegalName)) return false;
    return list.every((term) => abilityTermMatches(row, term));
  });
}

// True when an ability has at least one holder legal under the regulation gate.
// Rows without loaded details (pokemon list unknown) return false.
function abilityHasLegalHolder(row, isLegalName) {
  const holders = row.details && row.details.pokemon;
  return !!(holders && holders.some(isLegalName));
}
