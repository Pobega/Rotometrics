// Shared detail modal for Pokédex ↔ Attackdex cross-links. Opened by each dex
// page module with a list of clickable items; the close button and backdrop click
// are wired once in initDetailModal() so repeated opens don't stack listeners.
import { escapeHtml } from './render.js';

let _modal, _title, _subtitle, _body, _close;
let _items = [];

function ensureDom() {
  if (_modal) return;
  _modal   = document.getElementById('detail-modal');
  _title   = document.getElementById('detail-modal-title');
  _subtitle = document.getElementById('detail-modal-subtitle');
  _body    = document.getElementById('detail-modal-body');
  _close   = document.getElementById('detail-modal-close');
}

export function initDetailModal() {
  ensureDom();
  if (!_modal) return;
  _close.addEventListener('click', closeDetailModal);
  _modal.addEventListener('click', e => { if (e.target === _modal) closeDetailModal(); });
  _body.addEventListener('click', e => {
    const btn = e.target.closest('[data-detail-idx]');
    if (!btn) return;
    const item = _items[parseInt(btn.dataset.detailIdx)];
    if (item?.onClick) item.onClick();
  });
}

export function closeDetailModal() {
  ensureDom();
  _modal?.classList.add('hidden');
}

// items: [{
//   html?:    pre-escaped HTML string for the row interior (caller must escape all values)
//   label?:   plain-text fallback used when `html` is absent
//   onClick?: () => void   — omit for non-interactive note rows
// }]

function renderItems(items) {
  if (!items.length) {
    return `<p class="text-xs text-slate-500 italic p-3 text-center">No entries found.</p>`;
  }
  return items.map((item, i) => {
    const inner = item.html ?? `<span class="truncate">${escapeHtml(item.label || '')}</span>`;
    if (!item.onClick) {
      return `<p class="text-[11px] text-slate-500 italic px-3 py-2 text-center">${inner}</p>`;
    }
    return `<button class="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800/60 transition text-slate-200 flex items-center gap-2 group" data-detail-idx="${i}">${inner}</button>`;
  }).join('');
}

export function openDetailModal({ title, subtitle, items }) {
  ensureDom();
  if (!_modal) return;
  _items = items;
  _title.textContent = title;
  _subtitle.textContent = subtitle || '';
  _body.innerHTML = renderItems(items);
  _modal.classList.remove('hidden');
}

// Re-render just the body (preserves scroll position). Used when details load
// asynchronously after the modal is already open.
export function refreshDetailModalBody(items) {
  ensureDom();
  if (!_modal || _modal.classList.contains('hidden')) return;
  _items = items;
  const scrollTop = _body.scrollTop;
  _body.innerHTML = renderItems(items);
  _body.scrollTop = scrollTop;
}
