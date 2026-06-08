// Pieces shared verbatim by AttackerCard and DefenderCard. The rest of the two
// cards (presets, boost UI, stat dashboards, item/ability lists) genuinely
// differs, so only the context-free bits live here.
import { STATE } from './store.js';
import { REGULATIONS } from '../data/regulations.js';
import { isFormatLegal } from '../data/dex.js';
import { legalSetForFormat, nonLegalFormsForFormat } from '../api/pokeapi.js';

// Ghost (Spiritomb artwork) shown in the empty "select a Pokémon" slot.
export const GHOST_SPRITE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/479.png';

export const BOOST_STAGES = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

// Legality badge ({ text, cls }) for the active format — mirrors updateRegulationTag
// in app.js. Returns null when no Pokémon is selected.
export function regulationTag(apiName) {
  if (!apiName) return null;
  const reg = REGULATIONS[STATE.format];
  if (!reg)
    return {
      text: 'National Dex',
      cls: 'bg-slate-800/60 text-slate-400 border border-slate-700/30 border',
    };
  const legal = isFormatLegal(
    apiName,
    legalSetForFormat(STATE.format),
    nonLegalFormsForFormat(STATE.format)
  );
  return legal
    ? { text: `${reg.label} Legal`, cls: 'bg-green-950 text-green-400 border border-green-900/50' }
    : { text: `Banned in ${reg.short}`, cls: 'bg-red-950 text-red-400 border border-red-900/50' };
}
