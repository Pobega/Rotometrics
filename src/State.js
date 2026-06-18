// Shared application state and global cache.
// These are the mutable singletons the UI reads and writes as the user edits
// the matchup. Kept in their own dependency-free module so UI code can import
// them without pulling in app.js (which would create import cycles).

export const STATE = {
  mode: 'offensive',
  targetKO: 'ohko',
  format: 'regulation_mb',
  page: 'calculator', // active top-nav view; the Brand island reads this to pick the Rotom form

  attacker: {
    name: '',
    apiName: '',
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 50,
    nature: '+atk',
    item: 'none',
    ability: 'none',
    sps: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    // def is tracked so Body Press (damage off the user's Defense) can take a
    // Defense boost; atk/spa/spe cover the ordinary offensive cases.
    boosts: { atk: 0, def: 0, spa: 0, spe: 0 },
    types: ['???'],
    moves: [],
    status: null,
    weight: 0, // hectograms (PokéAPI unit); set on selection, used by weight moves
    // Render-only fields the Preact attacker island reads (the vanilla DOM used
    // to hold these); kept on STATE so the island has a single source of truth.
    sprite: '',
    abilities: [],
  },

  defender: {
    name: '',
    apiName: '',
    baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    level: 50,
    nature: '+def',
    item: 'none',
    ability: 'none',
    sps: { hp: 32, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    // atk is tracked so Foul Play (damage off the target's Attack) can take an
    // Attack boost; def/spd/spe cover the ordinary defensive cases.
    boosts: { atk: 0, def: 0, spd: 0, spe: 0 },
    types: ['???'],
    status: null, // Hex / Brine etc. read the defender's status
    weight: 0, // hectograms; set on selection, used by weight-based moves
    // Render-only fields the Preact defender island reads.
    sprite: '',
    abilities: [],
  },

  move: {
    name: 'Custom Move',
    type: 'Normal',
    power: 80,
    category: 'physical',
    // Whether the selected move is spread-capable (hits multiple targets). Drives
    // the damage card's Spread/Non-Spread tag; the applied 0.75x lives on
    // modifiers.spread. Not serialized — re-derived on move selection.
    spread: false,
  },

  modifiers: {
    spread: false,
    weather: 'none', // 'none', 'sun', 'rain', 'sandstorm', 'snow'
    crit: false,
    helpingHand: false,
    friendGuard: false,
    screens: false,
    terrain: 'none', // 'none', 'electric', 'grassy', 'psychic', 'misty'
    aura: 'none', // 'none', 'fairy', 'dark'
    tailAtk: false, // attacker Tailwind (2x Speed) — was read off the DOM
    tailDef: false, // defender Tailwind (2x Speed)
    boosterActive: false, // Protosynthesis/Quark Drive active (Booster Energy / field)
    pinchActive: false, // pinch abilities (Overgrow/Blaze/Torrent/Swarm/Defeatist) active
    // movesFirst (Bolt Beak / Fishious Rend / Payback) overrides the Speed-inferred
    // turn order: null = infer from Speed, true = attacker first, false = last.
    movesFirst: null,
    // Target's remaining HP as a percent (100 = full, the calc default). Drives
    // Wring Out / Crush Grip (scaling power) and Brine (x2 at <=50%).
    defenderHpPercent: 100,
    // Whether the target already took damage this turn (Assurance x2).
    targetDamaged: false,
  },
};

export const CACHE = {
  pokemonList: [],
  pokemonDetails: {},
  movesDetails: {},
  statusMoves: {},
  championsRoster: null,
  allMoves: [],
  allAbilities: [],
};
