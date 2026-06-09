// Shared stackable-search input for the dex-style browser pages. Renders the text
// input (with a clear-input button) plus the row of committed filter chips (each
// removable, with a "Clear all" when more than one). Purely presentational — the
// caller owns the state (a chip-filter from chip-filter.js) and passes it in via
// the value props + handlers, so the Pokédex, Attackdex, and any future page all
// share one UI.
import { html } from './preact.js';

export function SearchChips({ draft, filters, placeholder, onDraft, onCommit, onRemove, onClear }) {
  return html`
    <div class="flex flex-col items-stretch gap-2 w-full sm:w-72">
      <div class="relative w-full">
        <input type="text" placeholder=${placeholder}
          value=${draft}
          onInput=${(e) => onDraft(e.target.value)}
          onKeyDown=${(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommit();
            }
          }}
          class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition" />
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
        ${
          draft &&
          html`
          <button onClick=${() => onDraft('')}
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition leading-none" aria-label="Clear input">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>`
        }
      </div>
      ${
        filters.length > 0 &&
        html`
        <div class="flex flex-wrap items-center gap-1.5">
          ${filters.map(
            (term, i) => html`
            <span key=${term} class="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded-lg pl-2 pr-1 py-0.5">
              ${term}
              <button onClick=${() => onRemove(i)}
                class="text-amber-500/70 hover:text-white transition leading-none px-0.5" aria-label=${`Remove ${term}`}>
                <i class="fa-solid fa-xmark text-[11px]"></i>
              </button>
            </span>`
          )}
          ${
            filters.length > 1 &&
            html`
            <button onClick=${onClear}
              class="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 hover:text-white transition px-1">
              Clear all
            </button>`
          }
        </div>`
      }
    </div>`;
}
