// Abilitydex page (Preact) — the searchable/filterable ability table mounted into
// the persistent #page-abilitydex container. Reads the reactive AbdStore and
// re-renders on notifyAbd(); all data + loading logic lives in abilitydex-store.js.
// Row click opens the shared detail modal ("Pokémon with …"). Lazy rows via an
// IntersectionObserver, mirroring AttackdexView.
import { html, useRef } from './preact.js';
import { useSubscription, useLazyRowLoader } from './reactive.js';
import { SearchChips } from './SearchChips.js';
import { sortAbilities, filterAbilities, abilityTag } from '../data/abilities.js';
import {
  AbdStore,
  subscribeAbd,
  abilitydexStatusText,
  setAbdDraft,
  commitAbdFilter,
  commitAbdValue,
  removeAbdFilter,
  clearAbdFilters,
  toggleAbdTag,
  abdSuggest,
  handleAbilitydexRowClick,
  loadAbilityDetails,
} from './abilitydex-store.js';

const ROW_GRID =
  'grid grid-cols-[minmax(160px,1.6fr)_56px_minmax(240px,3fr)] items-center gap-2 px-3 py-1.5 border-b border-slate-800/70 text-xs';

// Small Offensive/Defensive marker for the curated VGC abilities (blank otherwise).
function TagBadge({ apiName }) {
  const tag = abilityTag(apiName);
  if (tag === 'off')
    return html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-amber-950/50 text-amber-400 border border-amber-900/40" title="VGC-relevant offensive ability">Off</span>`;
  if (tag === 'def')
    return html`<span class="text-[7px] px-1 py-0.5 font-black uppercase rounded bg-sky-950/50 text-sky-400 border border-sky-900/40" title="VGC-relevant defensive ability">Def</span>`;
  return html`<span class="text-slate-600 text-[10px]">—</span>`;
}

function PlaceholderRow({ row }) {
  // Lazy placeholder; data-api lets the observer know what to fetch. Clicking a
  // not-yet-loaded row still opens the modal (it fetches on demand).
  return html`
    <div class=${`${ROW_GRID} cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleAbilitydexRowClick(row.apiName)}>
      <span class="font-bold text-slate-300 truncate">${row.name}</span>
      <span><${TagBadge} apiName=${row.apiName} /></span>
      <span class="text-slate-600 text-[10px]">loading…</span>
    </div>`;
}

function AbilityRow({ row }) {
  const d = row.details;
  if (!d) return html`<${PlaceholderRow} row=${row} />`;

  return html`
    <div class=${`${ROW_GRID} hover:bg-slate-800/40 transition cursor-pointer`} data-api=${row.apiName}
      onClick=${() => handleAbilitydexRowClick(row.apiName)}>
      <span class="font-bold text-slate-100 truncate">${row.name}</span>
      <span><${TagBadge} apiName=${row.apiName} /></span>
      <span class="text-slate-400 text-[10px] leading-tight line-clamp-2">${d.desc || '—'}</span>
    </div>`;
}

export function AbilitydexView() {
  useSubscription(subscribeAbd);

  // Committed chips plus the live draft (so typing previews before Enter).
  const draft = AbdStore.draft.trim();
  const terms = draft ? [...AbdStore.filters, draft] : AbdStore.filters;
  const filtered = filterAbilities(AbdStore.roster, terms);
  const sorted = sortAbilities(filtered, 'asc');
  const statusText =
    AbdStore.loading && AbdStore.roster.length === 0
      ? 'loading abilities…'
      : abilitydexStatusText();

  // Lazy loading: fetch placeholder rows as they scroll into view.
  const rowsRef = useRef(null);
  useLazyRowLoader(rowsRef, AbdStore, loadAbilityDetails);

  // Offensive / Defensive presets: each toggles its keyword chip, and lights up
  // (with the amber/sky accent echoing the row Tag badges) while that chip is on.
  const offOn = AbdStore.filters.includes('offensive');
  const defOn = AbdStore.filters.includes('defensive');
  const tagBtnCls = (on, accent) =>
    on
      ? `shrink-0 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-xl transition ${accent}`
      : 'shrink-0 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-xl transition bg-slate-900 text-slate-400 border border-slate-700 hover:text-white';

  return html`
    <section class="bg-slate-950/20 border border-slate-800/80 rounded-3xl p-5 lg:p-5 flex flex-col gap-4">

      <!-- Title + Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
        <h2 class="text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-atom text-xs"></i> Abilitydex
          <span class="text-[10px] font-bold text-slate-500 normal-case tracking-normal">${statusText}</span>
        </h2>
        <div class="flex flex-wrap items-start gap-2 w-full sm:w-auto">
          <button type="button" aria-pressed=${offOn ? 'true' : 'false'}
            class=${tagBtnCls(offOn, 'bg-amber-950/40 text-amber-400 border border-amber-900/50')}
            onClick=${() => toggleAbdTag('offensive')}>
            Offensive
          </button>
          <button type="button" aria-pressed=${defOn ? 'true' : 'false'}
            class=${tagBtnCls(defOn, 'bg-sky-950/40 text-sky-400 border border-sky-900/50')}
            onClick=${() => toggleAbdTag('defensive')}>
            Defensive
          </button>
          <${SearchChips}
            draft=${AbdStore.draft}
            filters=${AbdStore.filters}
            placeholder="Search ability, effect, Pokémon… (Enter to add)"
            onDraft=${setAbdDraft}
            onCommit=${commitAbdFilter}
            onRemove=${removeAbdFilter}
            onClear=${clearAbdFilters}
            suggest=${abdSuggest}
            onPick=${commitAbdValue} />
        </div>
      </div>

      <!-- Scrollable table -->
      <div class="overflow-x-auto">
        <div class="min-w-[520px]">
          <!-- Header row -->
          <div class="grid grid-cols-[minmax(160px,1.6fr)_56px_minmax(240px,3fr)] items-center gap-2 px-3 py-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-700">
            <span class="text-left">Ability</span>
            <span class="text-left">Tag</span>
            <span class="text-left">Effect</span>
          </div>
          <!-- Data rows -->
          <div class="flex flex-col" ref=${rowsRef}>
            ${
              sorted.length
                ? sorted.map((row) => html`<${AbilityRow} key=${row.apiName} row=${row} />`)
                : html`<div class="px-3 py-8 text-center text-xs text-slate-500">No abilities match ${terms.map((t, i) => html`${i > 0 ? ' + ' : ''}“${t}”`)}.</div>`
            }
          </div>
        </div>
      </div>

    </section>`;
}
