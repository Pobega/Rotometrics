// Centralized DOM element references for the remaining vanilla chrome.
// Safe to query at module load time: ES modules are deferred, so the DOM is
// fully parsed before this file runs.
//
// The calculator panels (attacker / defender / center / results HUD) are now
// Preact islands that read & write STATE directly, so their old getElementById
// registry is gone. What's left here is the still-vanilla header + the
// export/import modal. The two search placeholders resolve to null now (the
// search inputs live in the islands); setSearchPlaceholders guards them.

export const DOM = {
  // Header chrome
  brandRotom: document.getElementById('brand-rotom'),
  formatPill: document.getElementById('format-pill'),
  formatSelector: document.getElementById('format-selector'),
  loadSampleBtn: document.getElementById('load-sample-btn'),
  exportImportBtn: document.getElementById('export-import-btn'),

  // Export / import matchup modal
  eiModal: document.getElementById('ei-modal'),
  eiTextarea: document.getElementById('ei-textarea'),
  eiCopyBtn: document.getElementById('ei-copy-btn'),
  eiImportBtn: document.getElementById('ei-import-btn'),
  eiCloseBtn: document.getElementById('ei-close-btn'),
  eiStatus: document.getElementById('ei-status'),

  // Search inputs now live in the Preact islands; these are null and only read
  // through guards in setSearchPlaceholders (kept for the loaded-count label).
  attackerSearch: document.getElementById('attacker-search'),
  defenderSearch: document.getElementById('defender-search'),
};
