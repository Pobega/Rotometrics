// Single place that wires htm to Preact's hyperscript so every component shares
// one binding. Import { html, ... } from here rather than re-binding per file.
import { h, render, Fragment } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useLayoutEffect, useRef, useMemo };

// Re-render-on-store-change hook: subscribes the component to the bridge so it
// refreshes whenever STATE changes (from this island or vanilla code).
// useLayoutEffect (vs useEffect) registers the subscription synchronously right
// after mount, before paint — shrinking the window where an early notify() from
// startup could be missed.
import { subscribe } from './store.js';
export function useStore() {
  const [, force] = useState(0);
  useLayoutEffect(() => subscribe(() => force((n) => n + 1)), []);
}
