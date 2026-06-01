// Move classification tags used by ability modifiers.
// PokeAPI does not expose these flags directly, so we maintain them by hand.
// Add new moves as users hit them.

export const SLICING_MOVES = new Set([
  'leaf-blade', 'sacred-sword', 'kowtow-cleave', 'aqua-cutter',
  'slash', 'night-slash', 'air-slash', 'psyblade', 'x-scissor',
  'aerial-ace',
]);

// Full set of contact moves per Bulbapedia (https://bulbapedia.bulbagarden.net/wiki/Contact),
// normalized to PokeAPI move names. Includes Z-moves and LGPE partner-exclusive
// signature moves for completeness, even though they can't appear in normal play.
export const CONTACT_MOVES = new Set([
  'accelerock', 'acrobatics', 'aerial-ace', 'anchor-shot', 'aqua-jet', 'aqua-step',
  'aqua-tail', 'arm-thrust', 'assurance', 'astonish', 'avalanche', 'axe-kick',
  'behemoth-bash', 'behemoth-blade', 'bide', 'bind', 'bite', 'bitter-blade',
  'blaze-kick', 'body-press', 'body-slam', 'bolt-beak', 'bolt-strike', 'bounce',
  'branch-poke', 'brave-bird', 'breaking-swipe', 'brick-break', 'brutal-swing', 'bug-bite',
  'bullet-punch', 'catastropika', 'ceaseless-edge', 'chip-away', 'circle-throw', 'clamp',
  'close-combat', 'collision-course', 'comet-punch', 'comeuppance', 'constrict', 'counter',
  'covet', 'crabhammer', 'cross-chop', 'cross-poison', 'crunch', 'crush-claw',
  'crush-grip', 'cut', 'darkest-lariat', 'dig', 'dire-claw', 'dive',
  'dizzy-punch', 'double-edge', 'double-hit', 'double-iron-bash', 'double-kick', 'double-shock',
  'double-slap', 'dragon-ascent', 'dragon-claw', 'dragon-hammer', 'dragon-rush', 'dragon-tail',
  'drain-punch', 'draining-kiss', 'drill-peck', 'drill-run', 'dual-chop', 'dual-wingbeat',
  'dynamic-punch', 'electro-drift', 'endeavor', 'extreme-speed', 'facade', 'fake-out',
  'false-surrender', 'false-swipe', 'feint-attack', 'fell-stinger', 'fire-fang', 'fire-lash',
  'fire-punch', 'first-impression', 'fishious-rend', 'flail', 'flame-charge', 'flame-wheel',
  'flare-blitz', 'flip-turn', 'floaty-fall', 'fly', 'flying-press', 'focus-punch',
  'force-palm', 'foul-play', 'frustration', 'fury-attack', 'fury-cutter', 'fury-swipes',
  'gear-grind', 'giga-impact', 'glaive-rush', 'grass-knot', 'grassy-glide', 'guillotine',
  'gyro-ball', 'hammer-arm', 'hard-press', 'head-charge', 'head-smash', 'headbutt',
  'headlong-rush', 'heart-stamp', 'heat-crash', 'heavy-slam', 'high-horsepower', 'high-jump-kick',
  'hold-back', 'horn-attack', 'horn-drill', 'horn-leech', 'hyper-drill', 'hyper-fang',
  'ice-ball', 'ice-fang', 'ice-hammer', 'ice-punch', 'ice-spinner', 'infestation',
  'iron-head', 'iron-tail', 'jaw-lock', 'jet-punch', 'jump-kick', 'karate-chop',
  'knock-off', 'kowtow-cleave', 'lash-out', 'last-resort', 'leaf-blade', 'leech-life',
  'lets-snuggle-forever', 'lick', 'liquidation', 'low-kick', 'low-sweep', 'lunge',
  'mach-punch', 'malicious-moonsault', 'mega-kick', 'mega-punch', 'megahorn', 'metal-claw',
  'meteor-mash', 'mighty-cleave', 'mortal-spin', 'multi-attack', 'needle-arm', 'night-slash',
  'nuzzle', 'outrage', 'payback', 'peck', 'petal-dance', 'phantom-force',
  'plasma-fists', 'play-rough', 'pluck', 'poison-fang', 'poison-jab', 'poison-tail',
  'population-bomb', 'pounce', 'pound', 'power-trip', 'power-up-punch', 'power-whip',
  'psyblade', 'psychic-fangs', 'psyshield-bash', 'pulverizing-pancake', 'punishment', 'pursuit',
  'quick-attack', 'rage', 'rage-fist', 'raging-bull', 'rapid-spin', 'razor-shell',
  'retaliate', 'return', 'revenge', 'reversal', 'rock-climb', 'rock-smash',
  'rolling-kick', 'rollout', 'sacred-sword', 'scratch', 'searing-sunraze-smash', 'seismic-toss',
  'shadow-claw', 'shadow-force', 'shadow-punch', 'shadow-sneak', 'sizzly-slide', 'skitter-smack',
  'skull-bash', 'sky-drop', 'sky-uppercut', 'slam', 'slash', 'smart-strike',
  'smelling-salts', 'snap-trap', 'solar-blade', 'soul-stealing-7-star-strike', 'spark', 'spectral-thief',
  'spin-out', 'spirit-break', 'steamroller', 'steel-roller', 'steel-wing', 'stomp',
  'stomping-tantrum', 'stone-axe', 'storm-throw', 'strength', 'struggle', 'submission',
  'sucker-punch', 'sunsteel-strike', 'super-fang', 'supercell-slam', 'superpower', 'surging-strikes',
  'tackle', 'tail-slap', 'take-down', 'temper-flare', 'thief', 'thrash',
  'throat-chop', 'thunder-fang', 'thunder-punch', 'thunderous-kick', 'trailblaze', 'triple-axel',
  'triple-dive', 'triple-kick', 'trop-kick', 'trump-card', 'u-turn', 'upper-hand',
  'v-create', 'veevee-volley', 'vice-grip', 'vine-whip', 'vital-throw', 'volt-tackle',
  'wake-up-slap', 'waterfall', 'wave-crash', 'wicked-blow', 'wild-charge', 'wing-attack',
  'wood-hammer', 'wrap', 'wring-out', 'x-scissor', 'zen-headbutt', 'zing-zap',
  'zippy-zap',
]);

// Biting moves boosted by Strong Jaw, per Bulbapedia
// (https://bulbapedia.bulbagarden.net/wiki/Strong_Jaw_(Ability)).
export const BITING_MOVES = new Set([
  'bite', 'crunch', 'fire-fang', 'fishious-rend', 'hyper-fang', 'ice-fang',
  'jaw-lock', 'poison-fang', 'psychic-fangs', 'thunder-fang',
]);

// Punching moves boosted by Iron Fist, per Bulbapedia
// (https://bulbapedia.bulbagarden.net/wiki/Iron_Fist_(Ability)).
export const PUNCHING_MOVES = new Set([
  'bullet-punch', 'comet-punch', 'dizzy-punch', 'double-iron-bash', 'drain-punch',
  'dynamic-punch', 'fire-punch', 'focus-punch', 'hammer-arm', 'headlong-rush',
  'ice-hammer', 'ice-punch', 'jet-punch', 'mach-punch', 'mega-punch', 'meteor-mash',
  'plasma-fists', 'power-up-punch', 'rage-fist', 'shadow-punch', 'sky-uppercut',
  'surging-strikes', 'thunder-punch', 'wicked-blow',
]);
