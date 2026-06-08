// Single place that wires htm to Preact's hyperscript so every component shares
// one binding. Import { html, ... } from here rather than re-binding per file.
import { h, render, Fragment, Component } from 'preact';
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useLayoutEffect, useRef, useMemo, Component };

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return html`
        <div class="p-4 bg-red-950/40 border border-red-900/50 rounded-2xl text-xs text-red-400 font-bold flex flex-col gap-2">
          <div class="flex items-center gap-2 text-sm">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Rendering Error</span>
          </div>
          <p class="font-mono text-[10px] text-red-500/80 leading-normal break-all">${this.state.error?.message || String(this.state.error)}</p>
        </div>
      `;
    }
    return this.props.children;
  }
}

// Re-render-on-store-change hook: subscribes the component to the calculator
// bridge so it refreshes whenever STATE changes (from this island or vanilla
// code). Thin wrapper over the shared useSubscription primitive.
import { subscribe } from './store.js';
import { useSubscription } from './reactive.js';
export function useStore() {
  useSubscription(subscribe);
}
