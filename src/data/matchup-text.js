// Human-readable matchup export/import. Serializes the calc-relevant slices of
// STATE into a Showdown-flavored text block, and parses one back. The text is
// meant to be pasted into Discord/forums and hand-edited, so the parser is
// deliberately tolerant of spacing, case, and missing optional lines.
//
// Both functions are pure (no DOM, no window). The app feeds in an augmented
// STATE (burn lives on attacker.status and the tailwind flags on the DOM, so it
// folds them into `modifiers`) and applies a parsed object back onto the DOM,
// fetching Pokémon/moves by the apiName derived from their display names.

const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const STAT_FROM_LABEL = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' };

// item key <-> clean label (the <option> text carries multipliers we don't want)
const ITEM_LABELS = {
  none: 'None',
  choice_band: 'Choice Band',
  choice_specs: 'Choice Specs',
  choice_scarf: 'Choice Scarf',
  life_orb: 'Life Orb',
  expert_belt: 'Expert Belt',
  black_glasses_etc: 'Type-Boost Item',
  mega_stone: 'Mega Stone',
  assault_vest: 'Assault Vest',
  eviolite: 'Eviolite',
  berries: 'Resist Berry',
};
const ITEM_KEYS = invert(ITEM_LABELS);

const NATURE_LABELS = {
  neutral: 'Neutral',
  '+atk': '+Atk',
  '+spa': '+SpA',
  '+def': '+Def',
  '+spd': '+SpD',
  '+spe': '+Spe',
};
const NATURE_KEYS = invert(NATURE_LABELS);

const WEATHER_LABELS = { sun: 'Sun', rain: 'Rain', sandstorm: 'Sand', snow: 'Snow' };
const WEATHER_KEYS = invert(WEATHER_LABELS);
const TERRAIN_LABELS = {
  electric: 'Electric Terrain',
  grassy: 'Grassy Terrain',
  psychic: 'Psychic Terrain',
  misty: 'Misty Terrain',
};
const TERRAIN_KEYS = invert(TERRAIN_LABELS);
const AURA_LABELS = { fairy: 'Fairy Aura', dark: 'Dark Aura' };
const AURA_KEYS = invert(AURA_LABELS);

function invert(map) {
  const out = {};
  for (const k in map) out[map[k].toLowerCase()] = k;
  return out;
}

// "Fake Out" -> "fake-out", "Flutter Mane" -> "flutter-mane", "Ho-Oh" -> "ho-oh".
function toApiName(display) {
  return String(display || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "huge-power" -> "Huge Power"
function titleCase(apiName) {
  return String(apiName || '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function evString(sps) {
  const parts = [];
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
    const v = (sps && sps[k]) || 0;
    if (v) parts.push(`${v} ${STAT_LABELS[k]}`);
  }
  return parts.length ? parts.join(' / ') : 'None';
}

function boostString(boosts, keys) {
  const parts = [];
  for (const k of keys) {
    const v = (boosts && boosts[k]) || 0;
    if (v) parts.push(`${v > 0 ? '+' : ''}${v} ${STAT_LABELS[k]}`);
  }
  return parts.join(' / ');
}

export function exportMatchup(state) {
  const a = state.attacker || {};
  const d = state.defender || {};
  const m = state.move || {};
  const mod = state.modifiers || {};
  const lines = [];

  lines.push(`Attacker: ${a.name || 'Unknown'} @ ${ITEM_LABELS[a.item] || 'None'}`);
  lines.push(
    `Ability: ${a.ability && a.ability !== 'none' ? titleCase(a.ability) : 'None'} | Nature: ${NATURE_LABELS[a.nature] || 'Neutral'}`
  );
  lines.push(`EVs: ${evString(a.sps)}`);
  const aBoosts = boostString(a.boosts, ['atk', 'spa', 'spe']);
  if (aBoosts) lines.push(`Boosts: ${aBoosts}`);
  if (m.apiName) {
    lines.push(`Move: ${m.name || titleCase(m.apiName)}`);
  } else {
    lines.push(
      `Move: Custom (${m.type || 'Normal'} / ${m.power || 0} BP / ${capitalize(m.category) || 'Physical'})`
    );
  }
  lines.push('');

  lines.push(`Defender: ${d.name || 'Unknown'} @ ${ITEM_LABELS[d.item] || 'None'}`);
  lines.push(
    `Ability: ${d.ability && d.ability !== 'none' ? titleCase(d.ability) : 'None'} | Nature: ${NATURE_LABELS[d.nature] || 'Neutral'}`
  );
  lines.push(`EVs: ${evString(d.sps)}`);
  const dBoosts = boostString(d.boosts, ['def', 'spd', 'spe']);
  if (dBoosts) lines.push(`Boosts: ${dBoosts}`);

  const field = [];
  if (mod.spread) field.push('Spread');
  if (mod.crit) field.push('Crit');
  if (mod.screens) field.push('Screens');
  if (mod.friendGuard) field.push('Friend Guard');
  if (mod.helpingHand) field.push('Helping Hand');
  if (mod.burn) field.push('Burn');
  if (mod.tailAtk) field.push('Tailwind (Atk)');
  if (mod.tailDef) field.push('Tailwind (Def)');
  if (mod.weather && WEATHER_LABELS[mod.weather]) field.push(WEATHER_LABELS[mod.weather]);
  if (mod.terrain && TERRAIN_LABELS[mod.terrain]) field.push(TERRAIN_LABELS[mod.terrain]);
  if (mod.aura && AURA_LABELS[mod.aura]) field.push(AURA_LABELS[mod.aura]);
  if (field.length) lines.push('', `Field: ${field.join(', ')}`);

  if (state.mode === 'survival') lines.push('Mode: Survival');
  if (state.targetKO === '2hko') lines.push('Target: 2HKO');

  return lines.join('\n');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

function parseEVs(text) {
  const sps = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const re = /(\d+)\s*(HP|Atk|Def|SpA|SpD|Spe)/gi;
  let mt;
  while ((mt = re.exec(text)) !== null) {
    const key = STAT_FROM_LABEL[mt[2].toLowerCase()];
    if (key) sps[key] = Math.max(0, parseInt(mt[1], 10) || 0);
  }
  return sps;
}

function parseBoosts(text) {
  const boosts = {};
  const re = /([+-]?\d+)\s*(Atk|Def|SpA|SpD|Spe)/gi;
  let mt;
  while ((mt = re.exec(text)) !== null) {
    const key = STAT_FROM_LABEL[mt[2].toLowerCase()];
    if (key) boosts[key] = parseInt(mt[1], 10) || 0;
  }
  return boosts;
}

function lookup(map, value, fallback) {
  if (value == null) return fallback;
  const hit = map[String(value).trim().toLowerCase()];
  return hit != null ? hit : fallback;
}

export function importMatchup(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);

  const mon = (side) => ({
    apiName: '',
    nature: 'neutral',
    item: 'none',
    ability: 'none',
    sps: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    boosts: side === 'attacker' ? { atk: 0, spa: 0, spe: 0 } : { def: 0, spd: 0, spe: 0 },
  });
  const attacker = mon('attacker');
  const defender = mon('defender');
  let move = { apiName: null, type: 'Normal', power: 80, category: 'physical' };
  const modifiers = {
    spread: false,
    crit: false,
    screens: false,
    friendGuard: false,
    helpingHand: false,
    burn: false,
    tailAtk: false,
    tailDef: false,
    weather: 'none',
    terrain: 'none',
    aura: 'none',
  };
  let mode = 'offensive';
  let ko = 'ohko';
  let current = null;
  let sawMon = false;

  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;

    let mt;
    if ((mt = /^(Attacker|Defender)\s*:\s*(.+?)(?:\s*@\s*(.+))?$/i.exec(text))) {
      current = mt[1].toLowerCase() === 'attacker' ? attacker : defender;
      sawMon = true;
      current.apiName = toApiName(mt[2]);
      if (mt[3]) current.item = lookup(ITEM_KEYS, mt[3], 'none');
      continue;
    }
    if (!current && !/^(Field|Mode|Target)\s*:/i.test(text)) continue;

    if ((mt = /Ability\s*:\s*([^|]+?)\s*(?:\||$)/i.exec(text)) && current) {
      const ability = mt[1].trim();
      current.ability = /^none$/i.test(ability) ? 'none' : toApiName(ability);
    }
    if ((mt = /Nature\s*:\s*([+\w]+)/i.exec(text)) && current) {
      current.nature = lookup(NATURE_KEYS, mt[1], 'neutral');
    }
    if (/^EVs\s*:/i.test(text) && current) {
      current.sps = parseEVs(text);
    }
    if (/^Boosts\s*:/i.test(text) && current) {
      Object.assign(current.boosts, parseBoosts(text));
    }
    if ((mt = /^Move\s*:\s*(.+)$/i.exec(text)) && current === attacker) {
      const body = mt[1].trim();
      const custom = /^Custom\s*\(\s*([^/]+?)\s*\/\s*(\d+)\s*BP?\s*\/\s*(\w+)\s*\)/i.exec(body);
      if (custom) {
        move = {
          apiName: null,
          type: capitalize(custom[1].trim()),
          power: parseInt(custom[2], 10) || 0,
          category: custom[3].toLowerCase(),
        };
      } else {
        move = { apiName: toApiName(body), type: null, power: null, category: null };
      }
    }
    if ((mt = /^Field\s*:\s*(.+)$/i.exec(text))) {
      for (const token of mt[1].split(',')) {
        const t = token.trim();
        const tl = t.toLowerCase();
        if (tl === 'spread') modifiers.spread = true;
        else if (tl === 'crit') modifiers.crit = true;
        else if (tl === 'screens') modifiers.screens = true;
        else if (tl === 'friend guard') modifiers.friendGuard = true;
        else if (tl === 'helping hand') modifiers.helpingHand = true;
        else if (tl === 'burn') modifiers.burn = true;
        else if (tl === 'tailwind (atk)') modifiers.tailAtk = true;
        else if (tl === 'tailwind (def)') modifiers.tailDef = true;
        else if (WEATHER_KEYS[tl]) modifiers.weather = WEATHER_KEYS[tl];
        else if (TERRAIN_KEYS[tl]) modifiers.terrain = TERRAIN_KEYS[tl];
        else if (AURA_KEYS[tl]) modifiers.aura = AURA_KEYS[tl];
      }
    }
    if (/^Mode\s*:\s*survival/i.test(text)) mode = 'survival';
    if (/^Target\s*:\s*2hko/i.test(text)) ko = '2hko';
  }

  if (!sawMon || (!attacker.apiName && !defender.apiName)) return null;
  return { attacker, defender, move, modifiers, mode, ko };
}
