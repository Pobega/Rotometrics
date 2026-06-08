// Competitive VGC regulation definitions.
//
// PokéAPI has no per-regulation Pokédex, and regulations rotate every few months
// (M-A -> M-B -> ...), each adding and/or removing a handful of species. So the
// legal roster for every regulation is maintained here, expressed as a delta over
// the Champions game roster (champions_dex.json, mirrored upstream as PokéAPI
// pokedex 36):
//
//     legal = (roster ∪ include) − exclude
//
// Adding a new regulation is a data change: add an entry below and the format
// selector, legality badges, and roster filters all pick it up — there is no
// per-regulation logic to touch. Keyed by the STATE.format value used in the
// format <select>. The unrestricted "National Dex" view ('all') is the absence
// of a regulation, not an entry here.

export const REGULATIONS = {
  regulation_ma: {
    label: 'Regulation M-A', // full badge / tag text
    short: 'M-A', // compact selector + pill text
    // Rotom-form accent for the brand glow and format pill (Heat Rotom amber).
    theme: {
      glow: 'rgba(251,191,36,0.65)',
      pillBorder: 'border-amber-500/40',
      pillText: 'text-amber-300',
    },
    include: [], // legal beyond the Champions roster
    exclude: [], // roster species not legal this regulation
    legalForms: ['-mega', '-eternal'], // form suffixes re-allowed despite NON_LEGAL_FORMS
  },
};

// Accent for the unrestricted "National Dex" view (STATE.format === 'all'), which
// is not a regulation. Wash Rotom's cool sky, mirroring the old FORM_THEMES.all.
export const NATIONAL_THEME = {
  glow: 'rgba(56,189,248,0.65)',
  pillBorder: 'border-sky-500/40',
  pillText: 'text-sky-300',
};

// Resolve a regulation's legal base-species Set from the roster names + its delta:
// start from the roster, drop excludes, add includes.
export function resolveLegalSet(rosterNames, reg) {
  const set = new Set(rosterNames);
  for (const name of reg.exclude || []) set.delete(name);
  for (const name of reg.include || []) set.add(name);
  return set;
}

// PokéAPI form-name suffixes that are not battle-legal by default in ANY regulation
// (Gigantamax, Totem, cosplay Pikachu, Ash-Greninja, the non-canon "-mega-z" forms,
// etc.). Mega Evolution (-mega) and Eternal Floette (-eternal) are banned here too:
// they're only legal in formats that explicitly enable them. A regulation re-allows
// specific suffixes via its `legalForms` delta (see resolveNonLegalForms) — e.g. the
// current Mega format M-A re-allows '-mega' and '-eternal', while a future Gigantamax
// format would re-allow '-gmax' and, by omitting '-mega', drop Megas entirely.
//
// Matching is a substring test (see isFormatLegal), so order/specificity matters:
// '-mega' also matches '-mega-x', '-mega-y' AND '-mega-z'. Both '-mega' and '-mega-z'
// stay listed so that a regulation re-allowing only '-mega' still bans Z-A megas — the
// retained, more specific '-mega-z' entry continues to match e.g. 'garchomp-mega-z'.
export const NON_LEGAL_FORMS = [
  '-totem',
  '-cap',
  '-battle-bond',
  '-gmax',
  '-eternamax',
  '-starter',
  '-cosplay',
  '-rock-star',
  '-belle',
  '-pop-star',
  '-phd',
  '-libre',
  '-mega',
  '-eternal',
  '-mega-z',
  'greninja-ash',
];

// Resolve the banned form-suffix list for a regulation: the global NON_LEGAL_FORMS
// minus any suffixes the regulation re-allows via `legalForms`. The "NAND" that lets
// each regulation opt specific forms back in without touching the global list.
export function resolveNonLegalForms(reg) {
  const allow = new Set(reg.legalForms || []);
  return NON_LEGAL_FORMS.filter((f) => !allow.has(f));
}
