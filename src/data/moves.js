// Pure, DOM/fetch-free logic for the Attackdex move-browser page. Mirrors the
// shape of dex.js (rows are { apiName, name, details|null }) so it can be unit
// tested and reasoned about without touching the network or the DOM.

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
  'all-pokemon'        // (rare) field-wide hits, also reaching the user
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

// Numeric value for a sortable key ('power' | 'pp') on a row, or null when the
// row's details aren't loaded yet (so it can be sorted to the bottom).
function moveValue(row, key) {
  if (!row.details) return null;
  const v = row.details[key];
  return (v === null || v === undefined) ? null : v;
}

// Returns a new array sorted by `key` ('name', 'power', or 'pp') in the given
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

// Filters the roster by any combination of: free-text query (matched against the
// move name and its description), exact type, exact category, and the spread
// flag. Rows without loaded details can only match the name (their type /
// category / desc / target are unknown), mirroring the lazy-load behaviour of
// filterDex.
export function filterMoves(rows, { query = '', type = '', category = '', spread = false } = {}) {
  const q = (query || '').trim().toLowerCase();
  const wantType = (type || '').toLowerCase();
  const wantCategory = (category || '').toLowerCase();

  return rows.filter((row) => {
    const d = row.details;

    if (q) {
      const inName = row.name.toLowerCase().includes(q);
      const inDesc = d && d.desc && d.desc.toLowerCase().includes(q);
      if (!inName && !inDesc) return false;
    }

    // The attribute filters need loaded details; unloaded rows can't satisfy them.
    if (wantType) {
      if (!d || d.type.toLowerCase() !== wantType) return false;
    }
    if (wantCategory) {
      if (!d || d.category.toLowerCase() !== wantCategory) return false;
    }
    if (spread) {
      if (!isSpreadMove(d)) return false;
    }

    return true;
  });
}
