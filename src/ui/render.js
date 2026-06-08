// Pure UI render helpers shared across the Preact islands: type→Tailwind color
// and nature-id→display-name lookups. Both are pure (no STATE, no DOM); the rest
// of the old vanilla rendering (dropdown colors, move badges, option cards, stat
// bars, search placeholders) moved into the islands during the Preact migration.

const TYPE_BG_CLASSES = {
  Normal: 'bg-neutral-500',
  Fire: 'bg-orange-600',
  Water: 'bg-blue-500',
  Grass: 'bg-green-600',
  Electric: 'bg-yellow-500',
  Ice: 'bg-cyan-400 text-slate-900',
  Fighting: 'bg-red-700',
  Poison: 'bg-purple-600',
  Ground: 'bg-amber-600',
  Flying: 'bg-indigo-400 text-slate-900',
  Psychic: 'bg-pink-600',
  Bug: 'bg-lime-600',
  Rock: 'bg-yellow-700',
  Ghost: 'bg-violet-700',
  Dragon: 'bg-indigo-700',
  Dark: 'bg-stone-800',
  Steel: 'bg-slate-500',
  Fairy: 'bg-pink-400 text-slate-900',
};

export function getTypeBgClass(type) {
  return TYPE_BG_CLASSES[type] || 'bg-slate-700';
}

// Three-letter type abbreviations for space-constrained badges (the Pokédex table
// type column + the detail modal's type-matchup summary).
export const TYPE_SHORT = {
  Normal: 'NOR',
  Fire: 'FIR',
  Water: 'WAT',
  Grass: 'GRA',
  Electric: 'ELE',
  Ice: 'ICE',
  Fighting: 'FIG',
  Poison: 'POI',
  Ground: 'GRD',
  Flying: 'FLY',
  Psychic: 'PSY',
  Bug: 'BUG',
  Rock: 'ROC',
  Ghost: 'GHO',
  Dragon: 'DRA',
  Dark: 'DRK',
  Steel: 'STE',
  Fairy: 'FAI',
};

// Move-category badge ({ label, cls }) shared by the Attackdex table and the
// Pokédex learnset modal. (The calculator's MovePanel uses its own icon-badge
// styling and intentionally does not share this.)
const CATEGORY_BADGE = {
  physical: { label: 'Physical', cls: 'bg-red-950/50 text-red-400 border border-red-900/40' },
  special: { label: 'Special', cls: 'bg-blue-950/50 text-blue-400 border border-blue-900/40' },
  status: { label: 'Status', cls: 'bg-slate-800/60 text-slate-400 border border-slate-700/40' },
};

export function getCategoryBadge(category) {
  return CATEGORY_BADGE[category] || CATEGORY_BADGE.status;
}

const NATURE_DISPLAY = {
  neutral: 'Neutral',
  '+atk': '+Atk',
  '+spa': '+SpAtk',
  '+def': '+Def',
  '+spd': '+SpDef',
  '+spe': '+Spe',
};

export function formatNatureDisplayName(natId) {
  return NATURE_DISPLAY[natId.toLowerCase()] || natId;
}
