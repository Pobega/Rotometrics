// PokéAPI plumbing: roster/move fetches over the versioned localStorage cache.
// Kept DOM-free so the data layer can grow (rate limiting, retry, request
// deduplication, or a test mock) without dragging in UI concerns. The only
// shared state it touches is CACHE; callers own any DOM the results drive.
// Every cache key flows through cacheKey() so a single CACHE_VERSION bump
// invalidates all cached resources at once (see cache.js).
import { CACHE } from '../state.js';
import { Storage, cacheKey } from './cache.js';
import { REGULATIONS, resolveLegalSet, resolveNonLegalForms } from '../data/regulations.js';
import { isFormatLegal } from '../data/dex.js';

export const API_BASE = 'https://pokeapi.co/api/v2';

// Resolves to { count, fallback }. `count` is the number of entries loaded and
// `fallback` flags that the network failed and a hardcoded roster was used, so
// the caller can phrase the search placeholders accordingly.
export async function initPokemonList() {
  const cached = Storage.get(cacheKey('pokemon_list'));
  if (cached && cached.length > 0) {
    CACHE.pokemonList = cached;
    return { count: CACHE.pokemonList.length, fallback: false };
  }

  try {
    const res = await fetch(`${API_BASE}/pokemon?limit=1500`);
    const data = await res.json();

    CACHE.pokemonList = data.results.map((p) => ({
      name: formatDisplayName(p.name),
      apiName: p.name,
      url: p.url,
    }));

    Storage.set(cacheKey('pokemon_list'), CACHE.pokemonList);
    return { count: CACHE.pokemonList.length, fallback: false };
  } catch (e) {
    console.error('Failed fetching Pokemon list from PokeAPI', e);
    CACHE.pokemonList = [
      { name: 'Incineroar', apiName: 'incineroar' },
      { name: 'Flutter Mane', apiName: 'flutter-mane' },
      { name: 'Amoonguss', apiName: 'amoonguss' },
      { name: 'Urshifu Rapid-Strike', apiName: 'urshifu-rapid-strike' },
      { name: 'Rillaboom', apiName: 'rillaboom' },
      { name: 'Calyrex Shadow', apiName: 'calyrex-shadow' },
      { name: 'Ogerpon Hearthflame', apiName: 'ogerpon-hearthflame' },
      { name: 'Tornadus', apiName: 'tornadus' },
    ];
    return { count: CACHE.pokemonList.length, fallback: true };
  }
}

export async function initStatusMovesList() {
  const key = cacheKey('status_moves_set');
  let statusMoves = Storage.get(key);

  if (!statusMoves) {
    try {
      const res = await fetch('https://pokeapi.co/api/v2/move-damage-class/status/');
      const data = await res.json();

      statusMoves = {};
      data.moves.forEach((m) => {
        statusMoves[m.name] = true;
      });
      Storage.set(key, statusMoves);
    } catch (err) {
      console.error('Failed to fetch status moves list', err);
      statusMoves = {};
    }
  }

  CACHE.statusMoves = statusMoves;
}

// Loads the Champions game roster (the bundled champions_dex.json, mirrored
// upstream as PokéAPI pokedex 36) into CACHE.championsRoster. The roster is
// regulation-independent; each regulation's legal set is derived from it on
// demand by legalSetForFormat(). Shares the Storage-cache + fallback shape of
// the other roster fetches, so it lives alongside them in the data layer.
export async function initChampionsRoster() {
  const key = cacheKey('champions_roster');
  const cached = Storage.get(key);
  if (cached && cached.length > 0) {
    CACHE.championsRoster = cached;
    return;
  }

  try {
    const res = await fetch('champions_dex.json');
    CACHE.championsRoster = await res.json();
    Storage.set(key, CACHE.championsRoster);
  } catch (err) {
    console.error('Failed to fetch Champions roster JSON, loading fallback', err);
    // High-fidelity VGC roster fallback (Scenario templates!)
    CACHE.championsRoster = [
      'crabominable',
      'incineroar',
      'flutter-mane',
      'amoonguss',
      'rillaboom',
      'tornadus',
      'urshifu',
      'gholdengo',
      'kingambit',
      'sneasler',
      'garchomp',
      'basculegion',
      'charizard',
      'venusaur',
      'blastoise',
      'beedrill',
      'pidgeot',
      'pikachu',
      'raichu',
      'clefable',
      'ninetales',
    ];
  }
}

// Resolved legal base-species Set for a regulation format (a STATE.format value),
// or null for the unrestricted "National Dex" view ('all'). Memoized per format —
// the roster is fixed for a session, so each regulation's delta resolves once.
const legalSetByFormat = {};
export function legalSetForFormat(format) {
  if (!REGULATIONS[format]) return null;
  const roster = CACHE.championsRoster;
  if (!roster || roster.length === 0) return new Set(); // roster not loaded yet
  if (!legalSetByFormat[format]) {
    legalSetByFormat[format] = resolveLegalSet(roster, REGULATIONS[format]);
  }
  return legalSetByFormat[format];
}

// Resolved banned form-suffix list for a regulation format (the global NON_LEGAL_FORMS
// minus that regulation's re-allowed `legalForms`), to pair with legalSetForFormat() in
// isFormatLegal(). Returns [] for the unrestricted "National Dex" view ('all'), which
// applies no form ban — cosmetic/non-battle forms are handled by isHiddenForm instead.
// Memoized per format, like legalSetForFormat.
const nonLegalFormsByFormat = {};
export function nonLegalFormsForFormat(format) {
  const reg = REGULATIONS[format];
  if (!reg) return [];
  if (!nonLegalFormsByFormat[format]) {
    nonLegalFormsByFormat[format] = resolveNonLegalForms(reg);
  }
  return nonLegalFormsByFormat[format];
}

// Build the regulation gate predicate for a format: a function (apiName) => bool
// that the Attackdex/Abilitydex filters use to keep only moves/abilities with a
// learner/holder legal in the current regulation. Returns null for the unrestricted
// "National Dex" view ('all'), where no gate applies. Resolves the legal set +
// banned-form list once (both are memoized) and closes over them.
export function legalNameFilterForFormat(format) {
  const legal = legalSetForFormat(format);
  if (!legal) return null;
  const nonLegal = nonLegalFormsForFormat(format);
  return (apiName) => isFormatLegal(apiName, legal, nonLegal);
}

// Friendlier labels for forms whose PokéAPI name reads awkwardly. The kept Minior
// forms differ only by stat profile, so drop the (cosmetic) color and label them
// by profile instead of "Minior Red" / "Minior Red Meteor".
const DISPLAY_NAME_OVERRIDES = {
  'minior-red': 'Minior Core',
  'minior-red-meteor': 'Minior Meteor',
};

export function formatDisplayName(apiName) {
  if (DISPLAY_NAME_OVERRIDES[apiName]) return DISPLAY_NAME_OVERRIDES[apiName];
  return apiName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Megas whose true pre-Mega form is a special form rather than the plain species.
// Mega Floette can only be reached from Eternal Floette (the Eternal Flower), so its
// movepool — Light of Ruin included — must merge from floette-eternal, not floette.
const MEGA_BASE_OVERRIDES = {
  'floette-mega': 'floette-eternal',
};

// Union `additions` ({ name, apiName }) into `target` in place, skipping any move
// already present. Shared by the Mega and pre-evolution learnset merges below.
function mergeMoves(target, additions) {
  const seen = new Set(target.map((m) => m.apiName));
  for (const move of additions) {
    if (seen.has(move.apiName)) continue;
    seen.add(move.apiName);
    target.push(move);
  }
}

// Regional form suffixes whose pre-evolution should resolve to the matching
// regional variety (Alolan Ninetales -> Alolan Vulpix, not Kantonian Vulpix).
const REGIONAL_FORM_SUFFIXES = ['alola', 'galar', 'hisui', 'paldea'];

// Trimmed pokemon-species lookup: the species this one evolves from and the list
// of its varieties (forms). Cached like every other PokéAPI resource.
async function fetchSpeciesEvo(speciesName) {
  const key = cacheKey(`species_evo_${speciesName}`);
  const cached = Storage.get(key);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/pokemon-species/${speciesName}`);
  const data = await res.json();
  const evo = {
    evolvesFrom: data.evolves_from_species ? data.evolves_from_species.name : null,
    varieties: data.varieties.map((v) => v.pokemon.name),
  };
  Storage.set(key, evo);
  return evo;
}

// Moves of `speciesName`'s immediate pre-evolution, resolved to the regional
// variety matching `apiName` when there is one. Returns [] for base-stage forms.
async function fetchPreEvolutionMoves(speciesName, apiName) {
  const species = await fetchSpeciesEvo(speciesName);
  if (!species.evolvesFrom) return [];

  let variety = species.evolvesFrom;
  const suffix = REGIONAL_FORM_SUFFIXES.find((s) => apiName.endsWith(`-${s}`));
  if (suffix) {
    const preEvo = await fetchSpeciesEvo(species.evolvesFrom);
    const regional = preEvo.varieties.find((v) => v.endsWith(`-${suffix}`));
    if (regional) variety = regional;
  }

  const details = await fetchPokemonDetails(variety);
  return details.moves;
}

export async function fetchPokemonDetails(apiName) {
  const key = cacheKey(`pokemon_details_${apiName}`);
  const cached = Storage.get(key);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/pokemon/${apiName}`);
  const data = await res.json();

  let movesMapped = data.moves.map((m) => ({
    name: formatDisplayName(m.move.name),
    apiName: m.move.name,
  }));

  // A Mega Evolution shares its base form's movepool (you only Mega-evolve mid-battle),
  // but PokéAPI's Mega learnsets are often empty or incomplete — e.g. Mega Charizard is
  // missing Weather Ball. Merge in any of the base species' moves the Mega lacks.
  if (apiName.includes('-mega')) {
    try {
      const baseSpeciesName = MEGA_BASE_OVERRIDES[apiName] || apiName.split('-mega')[0];
      const baseRes = await fetch(`${API_BASE}/pokemon/${baseSpeciesName}`);
      const baseData = await baseRes.json();
      mergeMoves(
        movesMapped,
        baseData.moves.map((m) => ({
          name: formatDisplayName(m.move.name),
          apiName: m.move.name,
        }))
      );
    } catch (err) {
      console.error(`Failed to merge base species moves for ${apiName}`, err);
    }
  }

  // PokéAPI doesn't always carry a pre-evolution's moves onto the evolved form's
  // learnset — e.g. Alolan Ninetales is missing Freeze-Dry, which Alolan Vulpix
  // learns by level-up. Merge in the immediate pre-evolution's moves; that lookup
  // recurses through fetchPokemonDetails, so the whole pre-evolution chain is covered.
  try {
    mergeMoves(movesMapped, await fetchPreEvolutionMoves(data.species.name, apiName));
  } catch (err) {
    console.error(`Failed to merge pre-evolution moves for ${apiName}`, err);
  }

  const details = {
    name: formatDisplayName(data.name),
    apiName: data.name,
    sprite: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
    types: data.types.map((t) => formatDisplayName(t.type.name)),
    baseStats: {
      hp: data.stats[0].base_stat,
      atk: data.stats[1].base_stat,
      def: data.stats[2].base_stat,
      spa: data.stats[3].base_stat,
      spd: data.stats[4].base_stat,
      spe: data.stats[5].base_stat,
    },
    moves: movesMapped,
    abilities: data.abilities.map((a) => ({
      name: formatDisplayName(a.ability.name),
      apiName: a.ability.name,
    })),
  };

  Storage.set(key, details);
  return details;
}

// PokéAPI hasn't written real effect_entries for many newer moves — it leaves
// them as this boilerplate even when the move has a genuine secondary effect
// (e.g. Lash Out's "power doubles if your stats were lowered this turn"). When we
// see it, the flavor text carries the actual behavior, so fall back to that.
const GENERIC_MOVE_EFFECT = /^inflicts regular damage(\s+with no additional effect)?\.?$/i;

// Most recent English flavor-text line, whitespace-collapsed. The entries run
// oldest → newest, so the last English match is the current-generation wording.
function latestEnglishFlavor(data) {
  const entries = (data.flavor_text_entries || []).filter(
    (e) => e.language && e.language.name === 'en'
  );
  const entry = entries[entries.length - 1];
  return entry ? (entry.flavor_text || '').replace(/\s+/g, ' ').trim() : '';
}

// Pull the English rules text for a move, preferring the terse short_effect and
// substituting the move's effect chance into PokéAPI's $effect_chance token so
// strings like "Has a $effect_chance% chance to burn" read correctly. Used for
// the Attackdex's free-text search ("burn", "paralyze", …) and its description
// column. Returns '' when no English entry exists.
function moveDescription(data) {
  const entry = (data.effect_entries || []).find((e) => e.language && e.language.name === 'en');
  let text = entry ? (entry.short_effect || entry.effect || '').trim() : '';
  // No real effect text, or PokéAPI's generic placeholder — use the flavor text,
  // which describes the actual behavior for moves PokéAPI hasn't annotated.
  if (!text || GENERIC_MOVE_EFFECT.test(text)) {
    return latestEnglishFlavor(data) || text;
  }
  if (data.effect_chance != null) {
    text = text.replace(/\$effect_chance/g, data.effect_chance);
  }
  return text;
}

export async function fetchMoveDetails(moveApiName) {
  const key = cacheKey(`move_details_${moveApiName}`);
  const cached = Storage.get(key);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/move/${moveApiName}`);
  const data = await res.json();

  const details = {
    name: formatDisplayName(data.name),
    apiName: data.name,
    power: data.power || 0,
    type: formatDisplayName(data.type.name),
    category: data.damage_class.name,
    // null in PokeAPI means the move never misses (e.g. Swift, Aura Sphere); the
    // smart default-move pick treats null as 100%.
    accuracy: data.accuracy ?? null,
    // Attackdex fields. `pp` and `target` drive the PP sort and the Spread
    // filter; `desc` backs the description column + free-text search.
    pp: data.pp ?? null,
    target: data.target ? data.target.name : null,
    desc: moveDescription(data),
    learnedBy: (data.learned_by_pokemon || []).map((p) => p.name),
  };

  Storage.set(key, details);
  return details;
}

// Resolve details for many moves at once, capping in-flight requests so picking
// a Pokémon with a large learnset doesn't fire a hundred parallel PokeAPI calls
// on a cold cache (warm-cache lookups resolve instantly via Storage). Failed
// lookups are dropped; result order is not significant to callers.
export async function fetchMoveDetailsMany(apiNames, concurrency = 8) {
  const out = [];
  let next = 0;
  async function worker() {
    while (next < apiNames.length) {
      const name = apiNames[next++];
      try {
        out.push(await fetchMoveDetails(name));
      } catch (err) {
        console.error(`Failed to fetch move details for ${name}`, err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, apiNames.length) }, worker));
  return out;
}

// Loads the full move name list (PokéAPI's /move index, ~900 entries) into
// CACHE.allMoves as [{ name, apiName }], cached in localStorage. Only names are
// fetched here; the Attackdex lazy-loads each move's stats via fetchMoveDetails
// as rows scroll in (or eagerly before a filter/sort that needs them).
export async function initAllMovesList() {
  const key = cacheKey('all_moves_list');
  const cached = Storage.get(key);
  if (cached && cached.length > 0) {
    CACHE.allMoves = cached;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/move?limit=2000`);
    const data = await res.json();
    const list = (data.results || []).map((m) => ({
      name: formatDisplayName(m.name),
      apiName: m.name,
    }));
    CACHE.allMoves = list;
    Storage.set(key, list);
  } catch (err) {
    console.error('Failed to fetch the move list', err);
    CACHE.allMoves = [];
  }
}

// English rules text for an ability. Prefers the terse short_effect, then the
// fuller effect, then a flavor-text line (older abilities sometimes carry only
// flavor text). Backs the Abilitydex free-text search + its description column.
function abilityDescription(data) {
  const entry = (data.effect_entries || []).find((e) => e.language && e.language.name === 'en');
  if (entry) {
    const text = (entry.short_effect || entry.effect || '').trim();
    if (text) return text;
  }
  const flavor = (data.flavor_text_entries || []).find(
    (e) => e.language && e.language.name === 'en'
  );
  return flavor ? (flavor.flavor_text || '').replace(/\s+/g, ' ').trim() : '';
}

export async function fetchAbilityDetails(abilityApiName) {
  const key = cacheKey(`ability_details_${abilityApiName}`);
  const cached = Storage.get(key);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/ability/${abilityApiName}`);
  const data = await res.json();

  const details = {
    name: formatDisplayName(data.name),
    apiName: data.name,
    desc: abilityDescription(data),
    // Pokémon that can have this ability (parallel to a move's learnedBy). Used
    // by the Abilitydex row-click modal.
    pokemon: (data.pokemon || []).map((p) => p.pokemon.name),
  };

  Storage.set(key, details);
  return details;
}

// Loads the full ability name list (PokéAPI's /ability index, ~360 entries) into
// CACHE.allAbilities as [{ name, apiName }], cached in localStorage. Only names
// are fetched here; the Abilitydex lazy-loads each ability's effect + Pokémon
// list via fetchAbilityDetails as rows scroll in (or before a search/filter).
export async function initAllAbilitiesList() {
  const key = cacheKey('all_abilities_list');
  const cached = Storage.get(key);
  if (cached && cached.length > 0) {
    CACHE.allAbilities = cached;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/ability?limit=500`);
    const data = await res.json();
    const list = (data.results || []).map((a) => ({
      name: formatDisplayName(a.name),
      apiName: a.name,
    }));
    CACHE.allAbilities = list;
    Storage.set(key, list);
  } catch (err) {
    console.error('Failed to fetch the ability list', err);
    CACHE.allAbilities = [];
  }
}
