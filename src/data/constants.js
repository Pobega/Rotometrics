// Static reference data shared across the calculator: the nature shorthands the
// optimizer iterates, the full type list for dropdowns, and the curated VGC
// ability lists. Pure data with no DOM or fetch dependencies.

// The optimizer treats natures as a single +stat boost (or neutral); these ids
// match the keys used throughout STATE and the stat engine.
export const NATURES = [
  { id: 'neutral', name: 'Neutral' },
  { id: '+atk', name: '+Attack' },
  { id: '+spa', name: '+Sp. Attack' },
  { id: '+def', name: '+Defense' },
  { id: '+spd', name: '+Sp. Defense' },
  { id: '+spe', name: '+Speed' },
];

export const ALL_TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
];

export const OFFENSIVE_VGC_ABILITIES = [
  { apiName: 'huge-power', name: 'Huge Power (2x Atk Stat)' },
  { apiName: 'guts', name: 'Guts Activated (1.5x Atk Stat)' },
  { apiName: 'adaptability', name: 'Adaptability (2.0x STAB)' },
  { apiName: 'technician', name: 'Technician (1.5x moves <= 60 power)' },
  { apiName: 'sharpness', name: 'Sharpness (1.5x Slicing moves)' },
  { apiName: 'tough-claws', name: 'Tough Claws (1.3x Contact moves)' },
  { apiName: 'strong-jaw', name: 'Strong Jaw (1.5x Biting moves)' },
  { apiName: 'sniper', name: 'Sniper (Boosts Crit to 2.25x)' },
  { apiName: 'transistor', name: 'Transistor (1.3x Electric moves)' },
  { apiName: 'steelworker', name: 'Steelworker (1.5x Steel moves)' },
  { apiName: 'rocky-payload', name: 'Rocky Payload (1.5x Rock moves)' },
  { apiName: 'supreme-overlord', name: 'Supreme Overlord (1.5x damage)' },
  { apiName: 'iron-fist', name: 'Iron Fist (1.2x Punching moves)' },
  { apiName: 'mega-launcher', name: 'Mega Launcher (1.5x Pulse/Aura moves)' },
  { apiName: 'mega-sol', name: 'Mega Sol (Always Sunny)' },
  { apiName: 'fairy-aura', name: 'Fairy Aura (1.33x Fairy moves)' },
  { apiName: 'scrappy', name: 'Scrappy (Hit Ghosts w/ Normal/Fighting)' },
  { apiName: 'parental-bond', name: 'Parental Bond (Hits twice, 2nd at 0.25x)' },
];

export const DEFENSIVE_VGC_ABILITIES = [
  { apiName: 'multiscale', name: 'Multiscale (0.5x full HP)' },
  { apiName: 'shadow-shield', name: 'Shadow Shield (0.5x full HP)' },
  { apiName: 'fluffy', name: 'Fluffy (0.5x Contact, 2x Fire)' },
  { apiName: 'ice-scales', name: 'Ice Scales (0.5x Special)' },
  { apiName: 'water-bubble', name: 'Water Bubble (0.5x Fire)' },
  { apiName: 'thick-fat', name: 'Thick Fat (0.5x Fire & Ice)' },
  { apiName: 'heatproof', name: 'Heatproof (0.5x Fire)' },
  { apiName: 'purifying-salt', name: 'Purifying Salt (0.5x Ghost)' },
  { apiName: 'dry-skin', name: 'Dry Skin (1.25x Fire, immune Water)' },
  { apiName: 'filter', name: 'Filter (0.75x super-effective)' },
  { apiName: 'solid-rock', name: 'Solid Rock (0.75x super-effective)' },
  { apiName: 'prism-armor', name: 'Prism Armor (0.75x super-effective)' },
];

// Narrow the curated ability lists to those the Pokémon can actually learn,
// given its PokéAPI ability list ([{ apiName, name }, ...]).
export function OFF_VGC_ABILITIES_HELPER(learnable) {
  return OFFENSIVE_VGC_ABILITIES.filter((vgc) => learnable.some((a) => a.apiName === vgc.apiName));
}

export function DEF_VGC_ABILITIES_HELPER(learnable) {
  return DEFENSIVE_VGC_ABILITIES.filter((vgc) => learnable.some((a) => a.apiName === vgc.apiName));
}
