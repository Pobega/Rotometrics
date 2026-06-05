// Attackdex move-browser page: a self-contained view (toggled via the nav) that
// lists every move with its type, category, power, PP, and description, with
// lazy-loading, client-side sort, and search/filter. Mirrors dex-page.js — holds
// its own AttackdexPage state and queries its own DOM nodes — so it stays
// decoupled from the calculator controller in app.js.
import { STATE, CACHE } from '../state.js';
import { sortMoves, filterMoves, spreadKind } from '../data/moves.js';
import { fetchMoveDetails, fetchPokemonDetails, initAllMovesList, formatDisplayName } from '../api/pokeapi.js';
import { isHiddenForm, isRegulationMALegal } from '../data/dex.js';
import { getTypeBgClass, escapeHtml } from './render.js';
import { registerPage } from './page-nav.js';
import { openDetailModal, closeDetailModal, refreshDetailModalBody } from './detail-modal.js';

const AttackdexPage = {
  roster: [],          // [{ apiName, name, details|null }]
  byName: {},          // apiName -> row (same object refs as roster)
  sortKey: 'name',     // 'name' | 'power' | 'pp'
  sortDir: 'asc',
  query: '',
  filterType: '',      // '' = all, else a type display name (e.g. 'Fire')
  filterCategory: '',  // '' = all, else 'physical' | 'special' | 'status'
  filterSpread: false, // true = only multi-target (spread) moves
  built: false,
  allLoaded: false,    // every roster row has details loaded
  loading: false,
  observer: null,
  dom: null
};

function attackdexDom() {
  if (AttackdexPage.dom) return AttackdexPage.dom;
  AttackdexPage.dom = {
    pageAttackdex: document.getElementById('page-attackdex'),
    navAttackdex: document.getElementById('nav-attackdex'),
    search: document.getElementById('attackdex-search'),
    searchClear: document.getElementById('attackdex-search-clear'),
    rows: document.getElementById('attackdex-rows'),
    status: document.getElementById('attackdex-status'),
    header: document.getElementById('attackdex-header'),
    typeFilter: document.getElementById('attackdex-type'),
    categoryFilter: document.getElementById('attackdex-category'),
    spreadFilter: document.getElementById('attackdex-spread')
  };
  return AttackdexPage.dom;
}

// Build the roster once from the loaded move-name cache.
function buildMovesRoster() {
  const entries = (CACHE.allMoves || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  AttackdexPage.roster = entries.map(e => ({ apiName: e.apiName, name: e.name, details: null }));
  AttackdexPage.byName = {};
  AttackdexPage.roster.forEach(r => { AttackdexPage.byName[r.apiName] = r; });
  AttackdexPage.built = true;
  AttackdexPage.allLoaded = false;
}

function updateAttackdexClearBtn() {
  const { search, searchClear } = attackdexDom();
  if (searchClear) searchClear.classList.toggle('hidden', !search.value);
}

function attackdexStatusText() {
  const total = AttackdexPage.roster.length;
  const loaded = AttackdexPage.roster.filter(r => r.details).length;
  if (loaded < total) return `${total} moves · loaded ${loaded}/${total}…`;
  return `${total} moves`;
}

// Concurrency-limited loader. Resolves once every requested name is fetched.
async function loadMoveDetails(apiNames, { rerenderEachBatch = true } = {}) {
  const queue = apiNames.filter(n => AttackdexPage.byName[n] && !AttackdexPage.byName[n].details);
  if (queue.length === 0) return;
  AttackdexPage.loading = true;

  const CONCURRENCY = 8;
  const RENDER_EVERY = 24; // rebuild the table periodically, not on every fetch
  let cursor = 0;
  let sinceRender = 0;

  async function worker() {
    while (cursor < queue.length) {
      const apiName = queue[cursor++];
      try {
        const details = await fetchMoveDetails(apiName);
        const row = AttackdexPage.byName[apiName];
        if (row) row.details = details;
      } catch (err) {
        console.error(`Attackdex: failed to load ${apiName}`, err);
      }
      if (rerenderEachBatch && ++sinceRender >= RENDER_EVERY) {
        sinceRender = 0;
        renderAttackdex();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  AttackdexPage.loading = false;
  AttackdexPage.allLoaded = AttackdexPage.roster.every(r => r.details);
  renderAttackdex();
}

// Ensure every roster row has details. Needed before any search/filter/sort that
// reads a move attribute (type, category, power, PP, description), since rows are
// otherwise lazy-loaded as they scroll into view. Crucially this must not bail
// when a partial (lazy) load is mid-flight — it waits that out, then loads
// whatever's still missing — otherwise a filter fired while the observer is busy
// would leave most rows permanently unloaded.
async function ensureAllLoaded() {
  if (AttackdexPage.allLoaded) return;
  while (AttackdexPage.loading) {
    await new Promise(resolve => setTimeout(resolve, 50));
    if (AttackdexPage.allLoaded) return;
  }
  await loadMoveDetails(AttackdexPage.roster.map(r => r.apiName));
}

// True when the current view depends on loaded move details (anything other than
// the default name-only browse).
function needsFullLoad() {
  return !!(AttackdexPage.query.trim()
    || AttackdexPage.filterType
    || AttackdexPage.filterCategory
    || AttackdexPage.filterSpread
    || AttackdexPage.sortKey !== 'name');
}

const CATEGORY_BADGE = {
  physical: { label: 'Physical', cls: 'bg-red-950/50 text-red-400 border border-red-900/40' },
  special:  { label: 'Special',  cls: 'bg-blue-950/50 text-blue-400 border border-blue-900/40' },
  status:   { label: 'Status',   cls: 'bg-slate-800/60 text-slate-400 border border-slate-700/40' }
};

const GRID = 'grid grid-cols-[minmax(140px,1.4fr)_72px_72px_48px_40px_minmax(220px,2.8fr)] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs';

function moveRowHTML(row) {
  const d = row.details;
  const apiName = escapeHtml(row.apiName);
  const name = escapeHtml(row.name);
  if (!d) {
    // Lazy placeholder; carries data-api so the observer knows what to fetch.
    return `<div class="attackdex-row ${GRID}" data-api="${apiName}">
      <span class="font-bold text-slate-300 truncate">${name}</span>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-slate-600 text-[10px]">…</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-right font-mono text-slate-600">–</span>
      <span class="text-slate-600 text-[10px]">loading…</span>
    </div>`;
  }

  const type = escapeHtml(d.type);
  const typeBadge = `<span class="text-[8px] px-1.5 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(d.type)} text-white" title="${type}">${type}</span>`;
  const cat = CATEGORY_BADGE[d.category] || CATEGORY_BADGE.status;
  const catBadge = `<span class="text-[8px] px-1.5 py-0.5 font-black uppercase rounded ${cat.cls}">${cat.label}</span>`;
  const power = d.power ? d.power : '—';
  const pp = (d.pp === null || d.pp === undefined) ? '—' : d.pp;
  // Two flavours of spread: foes-only ('Spread') vs also-hits-your-ally
  // ('Spread+Ally'), which is the decision that matters in VGC doubles.
  const kind = spreadKind(d);
  const spread = kind === 'ally'
    ? `<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-rose-950/50 text-rose-400 border border-rose-900/40" title="Spread move — also hits your own ally">Spread+Ally</span>`
    : kind === 'opponents'
      ? `<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="Spread move — hits both opponents">Spread</span>`
      : '';

  return `<div class="attackdex-row ${GRID} hover:bg-slate-800/40 transition cursor-pointer" data-api="${apiName}">
    <span class="font-bold text-slate-100 truncate flex items-center gap-1.5">${name}${spread}</span>
    <span>${typeBadge}</span>
    <span>${catBadge}</span>
    <span class="text-left font-mono font-bold text-amber-400">${power}</span>
    <span class="text-left font-mono text-slate-300">${pp}</span>
    <span class="text-slate-400 text-[10px] leading-tight line-clamp-2">${escapeHtml(d.desc || '—')}</span>
  </div>`;
}

function updateSortIndicators() {
  const { header } = attackdexDom();
  if (!header) return;
  header.querySelectorAll('.attackdex-sort').forEach(btn => {
    const arrow = btn.querySelector('.attackdex-arrow');
    const active = btn.dataset.sortKey === AttackdexPage.sortKey;
    btn.classList.toggle('text-amber-400', active);
    if (arrow) arrow.textContent = active ? (AttackdexPage.sortDir === 'desc' ? '▼' : '▲') : '';
  });
}

function renderAttackdex() {
  const { rows, status } = attackdexDom();
  if (!rows) return;

  const filtered = filterMoves(AttackdexPage.roster, {
    query: AttackdexPage.query,
    type: AttackdexPage.filterType,
    category: AttackdexPage.filterCategory,
    spread: AttackdexPage.filterSpread
  });
  const sorted = sortMoves(filtered, AttackdexPage.sortKey, AttackdexPage.sortDir);

  rows.innerHTML = sorted.length
    ? sorted.map(moveRowHTML).join('')
    : `<div class="px-3 py-8 text-center text-xs text-slate-500">No moves match your filters.</div>`;

  if (status) status.textContent = attackdexStatusText();
  updateSortIndicators();
  observeLazyRows();
}

// Fetch details for placeholder rows as they scroll into view (name-only browse).
function observeLazyRows() {
  const { rows } = attackdexDom();
  if (!rows) return;
  if (AttackdexPage.observer) AttackdexPage.observer.disconnect();
  if (AttackdexPage.allLoaded) return;

  AttackdexPage.observer = new IntersectionObserver((entries) => {
    const toLoad = [];
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const apiName = entry.target.getAttribute('data-api');
      const row = AttackdexPage.byName[apiName];
      if (row && !row.details) toLoad.push(apiName);
      AttackdexPage.observer.unobserve(entry.target);
    });
    if (toLoad.length) loadMoveDetails(toLoad, { rerenderEachBatch: true });
  }, { rootMargin: '200px' });

  rows.querySelectorAll('.attackdex-row[data-api]').forEach(el => {
    const apiName = el.getAttribute('data-api');
    const row = AttackdexPage.byName[apiName];
    if (row && !row.details) AttackdexPage.observer.observe(el);
  });
}

// Build + render the Attackdex the first time it's shown.
async function openAttackdexPage() {
  if (!_preserveQuery) {
    AttackdexPage.query = '';
    const dom = attackdexDom();
    if (dom.search) dom.search.value = '';
  }
  _preserveQuery = false;
  updateAttackdexClearBtn();

  if (AttackdexPage.built && AttackdexPage.roster.length > 0) {
    renderAttackdex();
    return;
  }

  const { status } = attackdexDom();
  if (status) status.textContent = 'loading moves…';
  if (!CACHE.allMoves || CACHE.allMoves.length === 0) {
    await initAllMovesList();
  }

  buildMovesRoster();
  renderAttackdex();
}

// Reflect the spread toggle's pressed/idle styling.
function updateSpreadButton() {
  const { spreadFilter } = attackdexDom();
  if (!spreadFilter) return;
  const on = AttackdexPage.filterSpread;
  spreadFilter.setAttribute('aria-pressed', on ? 'true' : 'false');
  spreadFilter.className = on
    ? 'shrink-0 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-xl transition bg-amber-950/40 text-amber-400 border border-amber-900/50'
    : 'shrink-0 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-xl transition bg-slate-900 text-slate-400 border border-slate-700 hover:text-white';
}

// Re-render after a filter changes, loading every move's details first (filters
// read attributes the lazy browse hasn't fetched yet).
async function applyFilterChange() {
  if (needsFullLoad() && !AttackdexPage.allLoaded) {
    renderAttackdex(); // reflect control state immediately
    await ensureAllLoaded();
  }
  renderAttackdex();
}

// Narrow the Attackdex to a single move by name (called when jumping from the
// Pokédex learnset modal). Sets the search field + re-renders.
// Look up already-loaded move details by apiName (used by dex-page via app.js).
export function getMoveDetails(apiName) {
  return AttackdexPage.byName[apiName]?.details ?? null;
}

export function jumpToAttackdexMove(apiName) {
  const dom = attackdexDom();
  const displayName = AttackdexPage.byName[apiName]?.name || formatDisplayName(apiName);
  _preserveQuery = true;
  AttackdexPage.query = displayName;
  if (dom.search) dom.search.value = displayName;
  updateAttackdexClearBtn();
  // Only render if already built; otherwise openAttackdexPage (triggered by
  // showPage) will render with the query already set.
  if (AttackdexPage.built) renderAttackdex();
}

let _onPokemonClick = null;
let _getPokemonDetails = null;
let _preserveQuery = false;

const LEARNER_CAP = 150;

function buildPokemonItem(n, pd, onClick) {
  const name = escapeHtml(formatDisplayName(n));
  if (!pd) {
    return {
      html: `<div class="w-8 h-8 bg-slate-800 rounded shrink-0 animate-pulse"></div><span class="font-bold text-slate-500 flex-1 truncate">${name}</span>`,
      onClick
    };
  }
  const sprite = escapeHtml(pd.sprite || '');
  const img = `<img src="${sprite}" alt="" loading="lazy" class="w-8 h-8 object-contain shrink-0">`;
  const types = pd.types.map(t => {
    const type = escapeHtml(t);
    return `<span class="text-[8px] px-1 py-0.5 font-extrabold uppercase rounded ${getTypeBgClass(t)} text-white">${type}</span>`;
  }).join('');
  return {
    html: `${img}<span class="font-bold text-slate-100 flex-1 truncate min-w-0">${name}</span><div class="flex gap-1 shrink-0">${types}</div>`,
    onClick
  };
}

async function handleAttackdexRowClick(apiName) {
  const row = AttackdexPage.byName[apiName];
  if (!row) return;

  if (!row.details) {
    openDetailModal({ title: row.name, subtitle: 'Loading…', items: [] });
    try {
      const details = await fetchMoveDetails(apiName);
      row.details = details;
      renderAttackdex();
    } catch (err) {
      console.error(`Attackdex detail modal: failed to load ${apiName}`, err);
      return;
    }
  }

  const details = row.details;
  let learners = (details.learnedBy || []).filter(n => !isHiddenForm(n));
  if (STATE.format === 'regulation_ma') {
    learners = learners.filter(n => isRegulationMALegal(n, CACHE.championsLegalList));
  }
  learners.sort((a, b) => a.localeCompare(b));

  const capped = learners.length > LEARNER_CAP;
  const visible = capped ? learners.slice(0, LEARNER_CAP) : learners;
  const formatLabel = STATE.format === 'regulation_ma' ? 'Regulation M-A' : 'National Dex';

  const localCache = new Map();
  const getDetails = (n) => localCache.get(n) || (_getPokemonDetails && _getPokemonDetails(n));
  const makeOnClick = (n) => () => { closeDetailModal(); if (_onPokemonClick) _onPokemonClick(n); };

  const buildItems = () => {
    const rows = visible.map(n => buildPokemonItem(n, getDetails(n), makeOnClick(n)));
    if (capped) {
      rows.push({ label: `…and ${learners.length - LEARNER_CAP} more — switch to Regulation M-A to narrow the list`, onClick: null });
    }
    return rows;
  };

  openDetailModal({
    title: `Who learns ${details.name}`,
    subtitle: `${learners.length} Pokémon · ${formatLabel}`,
    items: buildItems()
  });

  // Fetch details for Pokémon not yet in any cache.
  const toFetch = visible.filter(n => !getDetails(n));
  if (toFetch.length === 0) return;

  const CONCURRENCY = 8;
  let cursor = 0;
  let sinceRefresh = 0;

  async function worker() {
    while (cursor < toFetch.length) {
      const n = toFetch[cursor++];
      try {
        const pd = await fetchPokemonDetails(n);
        localCache.set(n, pd);
        if (++sinceRefresh >= CONCURRENCY) {
          sinceRefresh = 0;
          refreshDetailModalBody(buildItems());
        }
      } catch (err) {
        console.error(`Failed to load Pokémon ${n}`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  refreshDetailModalBody(buildItems());
}

export function initAttackdexPage({ onPokemonClick = null, getPokemonDetails = null } = {}) {
  _onPokemonClick = onPokemonClick;
  _getPokemonDetails = getPokemonDetails;
  const dom = attackdexDom();
  if (!dom.navAttackdex) return;

  registerPage('attackdex', {
    navBtn: dom.navAttackdex,
    pageEl: dom.pageAttackdex,
    onShow: openAttackdexPage
  });

  dom.rows.addEventListener('click', e => {
    const row = e.target.closest('.attackdex-row[data-api]');
    if (!row) return;
    handleAttackdexRowClick(row.getAttribute('data-api'));
  });

  if (dom.searchClear) {
    dom.searchClear.addEventListener('click', () => {
      dom.search.value = '';
      AttackdexPage.query = '';
      updateAttackdexClearBtn();
      renderAttackdex();
      dom.search.focus();
    });
  }

  let searchTimer = null;
  dom.search.addEventListener('input', (e) => {
    AttackdexPage.query = e.target.value;
    updateAttackdexClearBtn();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      // Description search needs every row's details; load them on first query.
      if (AttackdexPage.query.trim() && !AttackdexPage.allLoaded) {
        await ensureAllLoaded();
      }
      renderAttackdex();
    }, 180);
  });

  if (dom.typeFilter) {
    dom.typeFilter.addEventListener('change', (e) => {
      AttackdexPage.filterType = e.target.value;
      applyFilterChange();
    });
  }

  if (dom.categoryFilter) {
    dom.categoryFilter.addEventListener('change', (e) => {
      AttackdexPage.filterCategory = e.target.value;
      applyFilterChange();
    });
  }

  if (dom.spreadFilter) {
    dom.spreadFilter.addEventListener('click', () => {
      AttackdexPage.filterSpread = !AttackdexPage.filterSpread;
      updateSpreadButton();
      applyFilterChange();
    });
  }

  dom.header.querySelectorAll('.attackdex-sort').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.sortKey;
      if (AttackdexPage.sortKey === key) {
        AttackdexPage.sortDir = AttackdexPage.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        AttackdexPage.sortKey = key;
        AttackdexPage.sortDir = key === 'name' ? 'asc' : 'desc';
      }
      // Power/PP sorting needs every row's details loaded.
      if (key !== 'name' && !AttackdexPage.allLoaded) {
        renderAttackdex(); // reflect arrow immediately
        await ensureAllLoaded();
      }
      renderAttackdex();
    });
  });
}
