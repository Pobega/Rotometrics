// Pure, DOM/fetch-free logic for the Attackdex move-browser page. Mirrors the
// shape of dex.js (rows are { apiName, name, details|null }) so it can be unit
// tested and reasoned about without touching the network or the DOM.
import { ALL_TYPES } from './constants.js';

// PokéAPI `target` values that hit more than one Pokémon — i.e. spread moves —
// split by whether they also catch your own side. In VGC doubles this is a real
// decision: 'all-opponents' hits only the two foes (Rock Slide, Heat Wave),
// while 'all-other-pokemon'/'all-pokemon' also hit your ally (Earthquake, Surf,
// Explosion). Both still take the 0.75× spread multiplier, so isSpreadMove()
// treats them alike; spreadKind() exposes the ally distinction for the UI.
// (Single-target moves use 'selected-pokemon'; 'user'/'all-allies'/etc. self or
// ally targets are not "spread" in the damage-spread sense the calculator cares
// about.)
const SPREAD_OPPONENTS = 'all-opponents';
const SPREAD_INCLUDES_ALLY = new Set([
  'all-other-pokemon', // Earthquake, Surf, Discharge, Explosion, …
  'all-pokemon', // (rare) field-wide hits, also reaching the user
]);

// Classifies a move's spread behaviour: 'opponents' (foes only), 'ally' (also
// hits your own side), or null (single-target, status, or details not loaded).
export function spreadKind(details) {
  if (!details || !details.target) return null;
  if (details.target === SPREAD_OPPONENTS) return 'opponents';
  if (SPREAD_INCLUDES_ALLY.has(details.target)) return 'ally';
  return null;
}

// A move is a "spread" move when its target reaches multiple Pokémon. Rows
// without loaded details report false (unknown until fetched).
export function isSpreadMove(details) {
  return spreadKind(details) !== null;
}

// Numeric value for a sortable key ('power' | 'priority') on a row, or null when
// the row's details aren't loaded yet (so it can be sorted to the bottom). Note a
// genuine 0 (e.g. priority for most moves) is kept distinct from a missing value.
function moveValue(row, key) {
  if (!row.details) return null;
  const v = row.details[key];
  return v === null || v === undefined ? null : v;
}

// Returns a new array sorted by `key` ('name', 'power', or 'priority') in the given
// direction. Rows whose details aren't loaded sort to the end (for numeric
// keys); the sort is stable.
export function sortMoves(rows, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      if (key === 'name') {
        const cmp = a.row.name.localeCompare(b.row.name);
        return cmp !== 0 ? cmp * sign : a.i - b.i;
      }
      const av = moveValue(a.row, key);
      const bv = moveValue(b.row, key);
      // Unknown values always sink to the bottom regardless of direction.
      if (av === null && bv === null) return a.i - b.i;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return (av - bv) * sign;
      return a.i - b.i; // stable tie-break
    })
    .map((e) => e.row);
}

// Lowercased type names, used to recognize a search term that should filter by
// the move's type (an exact match) rather than as a loose substring. Built once.
const TYPE_NAMES = new Set(ALL_TYPES.map((t) => t.toLowerCase()));

// The three move categories, recognized as exact keyword terms (so 'status'
// filters to status moves rather than substring-matching any "status" in text).
const CATEGORY_NAMES = new Set(['physical', 'special', 'status']);

// Does a single, already-lowercased term match a move row? Smart keywords mirror
// the dropdown filters the stackable chips replaced:
//   - a term that exactly names a type ('fire') filters by the move's type
//   - 'physical' / 'special' / 'status' filter by category
//   - 'spread' keeps multi-target (spread) moves
//   - anything else is a substring match on the move name, its description, or a
//     learner's name — so 'garchomp' surfaces the moves it learns, the inverse of
//     the Pokédex's search-by-move.
// Rows without loaded details can only match on name (their type / category /
// desc / learnedBy are unknown), preserving the lazy-load fallback.
function moveTermMatches(row, term) {
  const d = row.details;
  if (TYPE_NAMES.has(term)) {
    return !!(d && d.type && d.type.toLowerCase() === term);
  }
  if (CATEGORY_NAMES.has(term)) {
    return !!(d && d.category && d.category.toLowerCase() === term);
  }
  if (term === 'spread') {
    return isSpreadMove(d);
  }
  if (row.name.toLowerCase().includes(term)) return true;
  if (!d) return false;
  if (d.desc && d.desc.toLowerCase().includes(term)) return true;
  // learnedBy holds raw PokéAPI apiNames (e.g. 'landorus-therian'); normalize the
  // hyphens to spaces so a typed 'iron hands' matches 'iron-hands'.
  if (d.learnedBy && d.learnedBy.some((n) => n.replace(/-/g, ' ').includes(term))) return true;
  return false;
}

// Case-insensitive filter over a list of search terms which are ANDed: a move is
// kept only when it satisfies every term. `terms` may be a single string (legacy
// single-search callers) or an array of strings (the stackable chip search).
// Empty/whitespace terms are ignored; no terms returns every row. Mirrors filterDex.
//
// `isLegalName` is an optional regulation gate (built from legalSetForFormat in the
// view): when given, a move is additionally kept only if at least one of its
// learners is legal in the current regulation. A row whose details aren't loaded
// yet has an unknown learner list, so it's dropped until the gate can be evaluated
// — the always-on regulation filter relies on the store force-loading every row.
export function filterMoves(rows, terms, isLegalName = null) {
  const list = (Array.isArray(terms) ? terms : [terms])
    .map((t) => (t || '').trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0 && !isLegalName) return rows;
  return rows.filter((row) => {
    if (isLegalName && !moveHasLegalLearner(row, isLegalName)) return false;
    return list.every((term) => moveTermMatches(row, term));
  });
}

// True when a move has at least one learner legal under the regulation gate. Rows
// without loaded details (learnedBy unknown) return false.
function moveHasLegalLearner(row, isLegalName) {
  const learners = row.details && row.details.learnedBy;
  return !!(learners && learners.some(isLegalName));
}
