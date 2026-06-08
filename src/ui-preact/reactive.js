// Minimal reactive primitives shared by every island store/modal.
//
// Each store used to hand-roll the same `new Set()` of listeners + subscribe +
// notify, and each view re-implemented the same "force a re-render on notify"
// hook. createEmitter() and useSubscription() are the one copy of each.
//
// Imports straight from preact/hooks (not ./preact.js) on purpose: this is a
// leaf module, so the stores can depend on it without forming an import cycle
// with preact.js (which itself imports the calculator store).
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';

// A tiny pub-sub: subscribe() registers a listener and returns an unsubscribe
// fn (for useEffect cleanup); notify() re-runs every listener.
export function createEmitter() {
  const listeners = new Set();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify() {
      listeners.forEach((l) => l());
    },
  };
}

// Re-render the calling component whenever the given subscribe() fires. Uses
// useLayoutEffect so the subscription registers synchronously after mount
// (before paint), shrinking the window where an early notify() is missed.
export function useSubscription(subscribe) {
  const [, force] = useState(0);
  useLayoutEffect(() => subscribe(() => force((n) => n + 1)), []);
}

// Lazy-load placeholder table rows ([data-api] elements under rowsRef) as they
// scroll into view, calling load(apiNames) for the ones not yet detailed. Shared
// by DexView and AttackdexView. `store` is the page store ({ byName, allLoaded });
// it's a stable module object read fresh on each effect run. The observer is
// created once and kept across renders (re-creating it re-observes the whole
// list); each render only observes newly-mounted placeholders, tracked in a
// WeakSet, so observation grows incrementally instead of O(rows) per render.
export function useLazyRowLoader(rowsRef, store, load) {
  const observerRef = useRef(null);
  const observedRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const toLoad = [];
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const apiName = entry.target.getAttribute('data-api');
          const row = store.byName[apiName];
          if (row && !row.details) toLoad.push(apiName);
          observer.unobserve(entry.target);
        });
        if (toLoad.length) load(toLoad);
      },
      { rootMargin: '200px' }
    );
    observerRef.current = observer;
    observedRef.current = new WeakSet();
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = rowsRef.current;
    const observer = observerRef.current;
    const observed = observedRef.current;
    if (!container || !observer || store.allLoaded) return;
    container.querySelectorAll('[data-api]').forEach((el) => {
      if (observed.has(el)) return;
      const row = store.byName[el.getAttribute('data-api')];
      if (row && !row.details) {
        observer.observe(el);
        observed.add(el);
      }
    });
  });
}
