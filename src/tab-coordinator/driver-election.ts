/**
 * Elects one driver tab per workspace key. The winner holds a Web Lock for as
 * long as it lives; the browser releases the lock if the tab crashes, which is
 * what makes handover automatic rather than something we have to detect.
 *
 * There is no live demotion: `onResignDriver` fires on teardown, not on
 * contention. A driver stays the driver until it goes away.
 *
 * Returns the teardown function.
 */
export function electDriver(options: {
  key: string;
  onBecomeDriver: () => void;
  onResignDriver: () => void;
}): () => void {
  const { key, onBecomeDriver, onResignDriver } = options;
  const locks = globalThis.navigator?.locks;

  // No Web Locks (older Android WebView): every tab drives itself. That is
  // exactly the behaviour from before coordination existed, so the feature
  // degrades to a no-op instead of leaving nobody polling.
  if (!locks) {
    onBecomeDriver();
    return () => onResignDriver();
  }

  const abortController = new AbortController();
  let releaseLock: (() => void) | undefined;
  let stopped = false;

  locks
    .request(
      `workspace-driver:${key}`,
      { signal: abortController.signal },
      () => {
        // Torn down while queued behind another tab, and that tab has just
        // released: take the lock and hand it straight back.
        if (stopped) return Promise.resolve();

        onBecomeDriver();
        // Never resolves on its own: holding this promise *is* holding the
        // lock, and we want to hold it for the lifetime of the tab.
        return new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
      },
    )
    .catch(() => {
      // AbortError: torn down before we ever acquired the lock, so there is no
      // driver role to resign and nothing to clean up.
    });

  return () => {
    stopped = true;
    if (releaseLock) {
      releaseLock();
      releaseLock = undefined;
      onResignDriver();
    } else {
      abortController.abort();
    }
  };
}
