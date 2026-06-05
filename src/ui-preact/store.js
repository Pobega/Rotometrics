// Bridge between the still-vanilla controller (app.js) and the Preact islands.
//
// During the page-by-page migration the single source of truth stays the plain
// `STATE` object in src/state.js, so vanilla code and components read/write the
// same data. Components mutate via `update()`, which runs the shared recompute
// pipeline (the vanilla updateLiveStats, registered by app.js) and then notifies
// subscribers so every mounted island re-renders. Vanilla code calls notify()
// at the end of updateLiveStats so islands also refresh on vanilla-driven edits
// (e.g. toggling Tailwind in the still-vanilla modifiers panel).
import { STATE, CACHE } from '../state.js';

export { STATE, CACHE };

const listeners = new Set();

// Subscribe a render trigger; returns an unsubscribe fn (for useEffect cleanup).
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-render every mounted island. Called by app.js at the tail of updateLiveStats.
export function notify() {
  listeners.forEach((l) => l());
}

// The shared recompute pipeline. app.js registers updateLiveStats here so islands
// don't need to import app.js (which would create a cycle).
let _recompute = () => {};
export function setRecompute(fn) { _recompute = fn; }
export function requestRecompute() { _recompute(); }

// Mutate STATE then run the full recompute pipeline. recompute() ends by calling
// notify(), so callers don't need to notify themselves.
export function update(mutator) {
  mutator(STATE);
  requestRecompute();
}
