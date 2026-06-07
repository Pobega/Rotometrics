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
import { createEmitter } from './reactive.js';

export { STATE, CACHE };

// Derived results stashed by the recompute pipeline (updateLiveStats) and read by
// the OptimizerPanel + ResultsHUD islands, so they render reactively instead of
// the controller writing innerHTML. recompute fills this, then notify() fires.
export const DERIVED = {
  rolls: [],
  // Optimizer suggestions for the active mode: { notPossible, cards: [...] }.
  // Each card is either an option { type, theme, title, nature, ...applyData }
  // or an impossible placeholder { impossible:true, theme, title, nature }.
  optimizer: { notPossible: false, cards: [] },
  // Headline result-summary model (see buildResultModel) for the ResultsHUD island.
  model: null,
};

// Subscribe a render trigger (returns an unsubscribe fn); notify() re-renders
// every mounted island. Called by app.js at the tail of updateLiveStats.
const { subscribe, notify } = createEmitter();
export { subscribe, notify };

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
