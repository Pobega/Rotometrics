// Pure, DOM/fetch-free logic for the Pokédex stats-browser page.
// Kept side-effect free so it can be unit-tested in tests.html.

// The six base stats, in canonical Showdown order.
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Sum of the six base stats.
export function bst(baseStats) {
  if (!baseStats) return 0;
  return STAT_KEYS.reduce((sum, k) => sum + (baseStats[k] || 0), 0);
}

// A row is { apiName, name, details|null } where details is the object returned
// by fetchPokemonDetails (or null when not yet loaded).

// Numeric value for a sortable stat/bst key on a row, or null when unknown.
function statValue(row, key) {
  if (!row.details) return null;
  if (key === 'bst') return bst(row.details.baseStats);
  return row.details.baseStats ? (row.details.baseStats[key] ?? null) : null;
}

// Returns a new array sorted by `key` ('name', 'bst', or a STAT_KEYS entry) in
// the given direction ('desc' | 'asc'). Rows whose details aren't loaded sort to
// the end (for stat keys); the sort is stable.
export function sortDex(rows, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      if (key === 'name') {
        const cmp = a.row.name.localeCompare(b.row.name);
        return cmp !== 0 ? cmp * sign : a.i - b.i;
      }
      const av = statValue(a.row, key);
      const bv = statValue(b.row, key);
      // Unknown stats always sink to the bottom regardless of direction.
      if (av === null && bv === null) return a.i - b.i;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return (av - bv) * sign;
      return a.i - b.i; // stable tie-break
    })
    .map((e) => e.row);
}

// Case-insensitive filter: matches when the query is a substring of the display
// name or of any ability name. Rows without loaded details match on name only.
export function filterDex(rows, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(q)) return true;
    if (row.details && row.details.abilities) {
      return row.details.abilities.some((a) => a.name.toLowerCase().includes(q));
    }
    return false;
  });
}

// Cosmetic forms that are identical (stats + type + ability) to a kept sibling,
// so they're pure duplicates we don't want cluttering either view.
const COSMETIC_DUP_FORMS = new Set([
  'cramorant-gulping', 'cramorant-gorging',
  'dudunsparce-three-segment',
  'maushold-family-of-three',
  'mimikyu-busted',
  'morpeko-hangry',
  'tatsugiri-droopy', 'tatsugiri-stretchy',
]);

// True for non-battle / cosmetic forms that should never appear in any view
// (ride modes, Gigantamax/Eternamax/Totem, cosplay/cap Pikachu, cosmetic
// duplicates, and the redundant Minior color forms). This is a name-only filter
// because the National Dex roster is built before any stats are loaded.
// Battle-distinct forms (Mega/regional, Aegislash stances, Rotom appliances,
// Castform weather, Gourgeist sizes, etc.) and distinct species that merely share
// a hyphen prefix (mr-rime, iron-hands, tapu-koko, nidoran-f) are intentionally
// NOT matched.
export function isHiddenForm(apiName) {
  if (!apiName) return false;
  const name = apiName.toLowerCase();

  if (/^(koraidon|miraidon)-/.test(name)) return true;        // ride / build modes
  if (/-gmax$/.test(name)) return true;                        // Gigantamax
  if (/-eternamax$/.test(name)) return true;                   // Eternamax
  if (name.includes('-totem')) return true;                    // Totem
  if (name.startsWith('pikachu-') || name === 'eevee-starter') return true; // cosplay/cap/starter
  if (COSMETIC_DUP_FORMS.has(name)) return true;

  // Minior: the seven color variants are identical to each other, but the Meteor
  // (Shields Up, defensive) and Core (offensive, Spe 120) forms differ in stats.
  // Keep one of each profile and drop the redundant colors.
  if (name.startsWith('minior-') && name !== 'minior-red-meteor' && name !== 'minior-red') return true;

  return false;
}

// Forms that PokéAPI lists but that are never selectable in Regulation M-A:
// Gigantamax, Totem, cosplay/cap Pikachu, Eternal Floette, Ash-Greninja
// (Battle Bond), Let's Go starters, the non-canon "-mega-z" forms
// (absol/garchomp/lucario), etc.
const NON_LEGAL_FORMS = [
  '-totem', '-cap', '-battle-bond', '-gmax', '-eternamax', '-starter',
  '-cosplay', '-rock-star', '-belle', '-pop-star', '-phd', '-libre',
  '-eternal', '-mega-z', 'greninja-ash'
];

// Whether `apiName` is legal in Regulation M-A, given the legal base-species set
// (a Set of PokéAPI base names, e.g. CACHE.championsLegalList). Pure: the legal
// set is injected rather than read from module state, so this stays unit-testable.
export function isRegulationMALegal(apiName, legalList) {
  if (!apiName) return false;
  const name = apiName.toLowerCase();

  if (NON_LEGAL_FORMS.some(f => name.includes(f))) return false;
  if (!legalList) return false;

  // A Pokémon is legal when it IS, or is a form of, a legal base species. PokéAPI
  // names every variety as "<base>-<form>" (charizard-mega-x, aegislash-shield,
  // ninetales-alola), and some legal species only exist as such forms. The
  // trailing-hyphen guard matches those forms without letting a base like "mew"
  // match "mewtwo", and it handles hyphenated base names (kommo-o, ho-oh).
  for (const base of legalList) {
    if (name === base || name.startsWith(base + '-')) return true;
  }
  return false;
}
