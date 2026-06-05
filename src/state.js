// Shared application state and global cache.
// These are the mutable singletons the UI reads and writes as the user edits
// the matchup. Kept in their own dependency-free module so UI code can import
// them without pulling in app.js (which would create import cycles).

export const STATE = {
  mode: 'offensive',
  targetKO: 'ohko',
  format: 'regulation_ma',

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
    boosts: { atk: 0, spa: 0, spe: 0 },
    types: ['???'],
    moves: [],
    status: null,
    // Render-only fields the Preact attacker island reads (the vanilla DOM used
    // to hold these); kept on STATE so the island has a single source of truth.
    sprite: '',
    abilities: []
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
    boosts: { def: 0, spd: 0, spe: 0 },
    types: ['???']
  },

  move: {
    name: 'Custom Move',
    type: 'Normal',
    power: 80,
    category: 'physical'
  },

  modifiers: {
    spread: false,
    weather: 'none', // 'none', 'sun', 'rain', 'sandstorm', 'snow'
    crit: false,
    helpingHand: false
    // movesFirst (Bolt Beak / Fishious Rend) is left unset so the engine
    // infers turn order from effective Speed; set it to override that.
  }
};

export const CACHE = {
  pokemonList: [],
  pokemonDetails: {},
  movesDetails: {},
  statusMoves: {},
  championsRoster: null,
  allMoves: []
};
