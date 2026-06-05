// PokéAPI plumbing: roster/move fetches over the versioned localStorage cache.
// Kept DOM-free so the data layer can grow (rate limiting, retry, request
// deduplication, or a test mock) without dragging in UI concerns. The only
// shared state it touches is CACHE; callers own any DOM the results drive.
// Every cache key flows through cacheKey() so a single CACHE_VERSION bump
// invalidates all cached resources at once (see cache.js).
import { CACHE } from '../state.js';
import { Storage, cacheKey } from './cache.js';

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

    CACHE.pokemonList = data.results.map(p => ({
      name: formatDisplayName(p.name),
      apiName: p.name,
      url: p.url
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
      { name: 'Tornadus', apiName: 'tornadus' }
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
      data.moves.forEach(m => {
        statusMoves[m.name] = true;
      });
      Storage.set(key, statusMoves);
    } catch (err) {
      console.error("Failed to fetch status moves list", err);
      statusMoves = {};
    }
  }

  CACHE.statusMoves = statusMoves;
}

// Loads the Champions-format legal species set. Sourced from the bundled
// champions_dex.json (not PokéAPI), but shares the same Storage-cache + fallback
// shape as the roster fetches, so it lives alongside them in the data layer.
export async function initChampionsLegalList() {
  const key = cacheKey('champions_legal_list');
  const cached = Storage.get(key);
  if (cached && cached.length > 0) {
    CACHE.championsLegalList = new Set(cached);
    return;
  }

  try {
    const res = await fetch('champions_dex.json');
    const data = await res.json();
    CACHE.championsLegalList = new Set(data);
    Storage.set(key, data);
  } catch (err) {
    console.error("Failed to fetch Champions VGC local Pokedex JSON, loading fallback", err);
    // High-fidelity VGC legal fallbacks (Scenario templates!)
    CACHE.championsLegalList = new Set([
      'crabominable', 'incineroar', 'flutter-mane', 'amoonguss', 'rillaboom', 'tornadus',
      'urshifu', 'gholdengo', 'kingambit', 'sneasler', 'garchomp', 'basculegion',
      'charizard', 'venusaur', 'blastoise', 'beedrill', 'pidgeot', 'pikachu', 'raichu', 'clefable', 'ninetales'
    ]);
  }
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
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function fetchPokemonDetails(apiName) {
  const key = cacheKey(`pokemon_details_${apiName}`);
  const cached = Storage.get(key);
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/pokemon/${apiName}`);
  const data = await res.json();

  let movesMapped = data.moves.map(m => ({
    name: formatDisplayName(m.move.name),
    apiName: m.move.name
  }));

  // PokéAPI empty moves learnset fallback for Mega Evolution species/special forms!
  if (movesMapped.length === 0 && apiName.includes('-mega')) {
    try {
      const baseSpeciesName = apiName.split('-mega')[0];
      const baseRes = await fetch(`${API_BASE}/pokemon/${baseSpeciesName}`);
      const baseData = await baseRes.json();
      movesMapped = baseData.moves.map(m => ({
        name: formatDisplayName(m.move.name),
        apiName: m.move.name
      }));
    } catch (err) {
      console.error(`Failed to fetch base species moves fallback for ${apiName}`, err);
    }
  }

  const details = {
    name: formatDisplayName(data.name),
    apiName: data.name,
    sprite: data.sprites.other['official-artwork'].front_default || data.sprites.front_default,
    types: data.types.map(t => formatDisplayName(t.type.name)),
    baseStats: {
      hp: data.stats[0].base_stat,
      atk: data.stats[1].base_stat,
      def: data.stats[2].base_stat,
      spa: data.stats[3].base_stat,
      spd: data.stats[4].base_stat,
      spe: data.stats[5].base_stat
    },
    moves: movesMapped,
    abilities: data.abilities.map(a => ({
      name: formatDisplayName(a.ability.name),
      apiName: a.ability.name
    }))
  };

  Storage.set(key, details);
  return details;
}

// Pull the English rules text for a move, preferring the terse short_effect and
// substituting the move's effect chance into PokéAPI's $effect_chance token so
// strings like "Has a $effect_chance% chance to burn" read correctly. Used for
// the Attackdex's free-text search ("burn", "paralyze", …) and its description
// column. Returns '' when no English entry exists.
function moveDescription(data) {
  const entry = (data.effect_entries || []).find(e => e.language && e.language.name === 'en');
  if (!entry) return '';
  let text = entry.short_effect || entry.effect || '';
  if (data.effect_chance != null) {
    text = text.replace(/\$effect_chance/g, data.effect_chance);
  }
  return text.trim();
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
    // Attackdex fields. `pp` and `target` drive the PP sort and the Spread
    // filter; `desc` backs the description column + free-text search.
    pp: data.pp ?? null,
    target: data.target ? data.target.name : null,
    desc: moveDescription(data),
    learnedBy: (data.learned_by_pokemon || []).map(p => p.name)
  };

  Storage.set(key, details);
  return details;
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
    const list = (data.results || []).map(m => ({
      name: formatDisplayName(m.name),
      apiName: m.name
    }));
    CACHE.allMoves = list;
    Storage.set(key, list);
  } catch (err) {
    console.error('Failed to fetch the move list', err);
    CACHE.allMoves = [];
  }
}
