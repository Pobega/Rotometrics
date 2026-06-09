// Shared stackable-search input for the dex-style browser pages. Renders the text
// input (with a clear-input button), an optional autocomplete dropdown, and the
// row of committed filter chips (each removable, with a "Clear all" when more than
// one). Purely presentational — the caller owns the state (a chip-filter from
// chip-filter.js) and passes it in via the value props + handlers, so the Pokédex,
// Attackdex, and any future page all share one UI.
//
// Suggestions are opt-in: pass `suggest(draft, excludeLowercased)` (typically a
// makeSuggester from suggestions.js) and `onPick(value)`. They are never
// auto-selected — nothing is highlighted until the user arrows into the list, so
// Enter always commits the typed draft unless they deliberately picked one.
import { html, useState } from './preact.js';

export function SearchChips({
  draft,
  filters,
  placeholder,
  onDraft,
  onCommit,
  onRemove,
  onClear,
  suggest,
  onPick,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const trimmed = draft.trim();
  const suggestions =
    suggest && open && trimmed
      ? suggest(
          draft,
          filters.map((f) => f.toLowerCase())
        )
      : [];
  const showList = suggestions.length > 0;

  const changeDraft = (value) => {
    setOpen(true);
    setActive(-1);
    onDraft(value);
  };
  const dismiss = () => {
    setOpen(false);
    setActive(-1);
  };
  const commitDraft = () => {
    onCommit();
    dismiss();
  };
  const pick = (value) => {
    if (onPick) onPick(value);
    dismiss();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && showList) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showList && active >= 0 && suggestions[active]) pick(suggestions[active].value);
      else commitDraft();
    } else if (e.key === 'Escape') {
      dismiss();
    }
  };

  return html`
    <div class="flex flex-col items-stretch gap-2 w-full sm:w-72">
      <div class="relative w-full">
        <input type="text" placeholder=${placeholder}
          value=${draft}
          onInput=${(e) => changeDraft(e.target.value)}
          onFocus=${() => setOpen(true)}
          onBlur=${dismiss}
          onKeyDown=${onKeyDown}
          class="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition" />
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
        ${
          draft &&
          html`
          <button onClick=${() => {
            onDraft('');
            dismiss();
          }}
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition leading-none" aria-label="Clear input">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>`
        }
        ${
          showList &&
          html`
          <ul class="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-xl shadow-black/40">
            ${suggestions.map(
              (s, i) => html`
              <li key=${`${s.kind}:${s.value}`}>
                <button type="button"
                  onMouseDown=${(e) => {
                    e.preventDefault();
                    pick(s.value);
                  }}
                  onMouseEnter=${() => setActive(i)}
                  class=${`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition ${i === active ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/60'}`}>
                  <span class="truncate">${s.value}</span>
                  <span class="text-[10px] text-slate-500 shrink-0">(${s.label})</span>
                </button>
              </li>`
            )}
          </ul>`
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
