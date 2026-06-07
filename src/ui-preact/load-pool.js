// Bounded-concurrency async pool shared by the dex/attackdex streaming loaders
// and the detail-modal row fetchers. Runs `task` over `items` with at most
// `concurrency` in flight; calls `onProgress` every `batchEvery` completed items
// (for periodic re-render) — not on every item. The task owns its own error
// handling (so each caller logs a store-specific message); a throwing task will
// stop its worker, so callers wrap their fetch in try/catch.
export async function runPool(items, task, { concurrency = 8, batchEvery = 0, onProgress } = {}) {
  let cursor = 0;
  let since = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
      if (onProgress && batchEvery && ++since >= batchEvery) {
        since = 0;
        onProgress();
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}
