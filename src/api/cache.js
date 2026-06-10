// Centralized localStorage cache layer for the PokéAPI plumbing.
//
// PokéAPI responses are cached aggressively (the API is slow and the payloads
// are large). The hazard: ship a shape change and half your users read old
// cached objects with the new code, crashing silently. So every cache key flows
// through a single CACHE_VERSION — bump it and ALL cached data is invalidated at
// once, and pruneOldCaches() sweeps the stale keys on boot.

// Bump to invalidate every cached PokéAPI resource for all users.
export const CACHE_VERSION = 14;

const PREFIX = `vgc_v${CACHE_VERSION}_`;

// Namespaced, versioned key for a cache entry, e.g.
// cacheKey(`pokemon_details_${apiName}`) -> "vgc_v7_pokemon_details_pikachu".
export function cacheKey(name) {
  return `${PREFIX}${name}`;
}

export const Storage = {
  get: (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  },
};

// Drop cache entries from older schema versions so they don't linger forever.
// Targets both the legacy un-namespaced keys (vgc_opt_*, poke_details_*,
// move_details_*) and any vgc_v<n>_ key whose version isn't current. Call once
// on boot, before the first fetch.
export function pruneOldCaches() {
  let keys;
  try {
    keys = Object.keys(localStorage);
  } catch {
    return; // localStorage unavailable (private mode, disabled) — nothing to do
  }

  for (const key of keys) {
    const ours =
      key.startsWith('vgc_v') ||
      key.startsWith('vgc_opt_') ||
      key.startsWith('poke_details_') ||
      key.startsWith('move_details_');
    if (ours && !key.startsWith(PREFIX)) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }
}
