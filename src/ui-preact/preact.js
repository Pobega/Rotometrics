// Single place that wires htm to Preact's hyperscript so every component shares
// one binding. Import { html, ... } from here rather than re-binding per file.
import { h, render, Fragment } from 'preact';
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useRef, useMemo };

// Re-render-on-store-change hook: subscribes the component to the bridge so it
// refreshes whenever STATE changes (from this island or vanilla code).
import { subscribe } from './store.js';
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
}
