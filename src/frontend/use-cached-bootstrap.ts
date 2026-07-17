import { useEffect, useState } from "react";

import type { WorkspaceStore } from "../store";
import { readPersistedWorkspace } from "../tab-coordinator";
import type { WorkspaceDelta } from "../types";

/**
 * Boots the store from the cached snapshot when there is one, so a reload
 * renders before the network answers, and catches it up with a delta instead of
 * a full fetch.
 *
 * Reports whether the caller still needs the initial query: false only while a
 * cached snapshot is carrying us, since running it then would fire exactly the
 * fetch the cache exists to avoid.
 */
export function useCachedBootstrap<T>(options: {
  store: WorkspaceStore<T>;
  /** The typed anchor key, or undefined when persistence is off. */
  cacheKey: string | undefined;
  fetchDelta: ((since: Date) => Promise<WorkspaceDelta>) | undefined;
}): { needsInitialQuery: boolean } {
  const { store, cacheKey, fetchDelta } = options;

  // Hold the query back until we know whether there is a cache to boot from.
  const [needsInitialQuery, setNeedsInitialQuery] = useState(
    cacheKey === undefined,
  );

  useEffect(() => {
    if (cacheKey === undefined) {
      setNeedsInitialQuery(true);
      return;
    }

    let cancelled = false;
    setNeedsInitialQuery(false);

    void (async () => {
      const cached = await readPersistedWorkspace<T>(cacheKey);
      if (cancelled) return;

      if (cached) store.setInitial(cached.workspace);

      // Nothing cached, or no way to catch it up: the full query is the only
      // route to current. A cached snapshot still renders in the meantime.
      if (!cached || !fetchDelta) {
        setNeedsInitialQuery(true);
        return;
      }

      try {
        const delta = await fetchDelta(cached.version);
        if (!cancelled) store.applyDelta(delta);
      } catch {
        // Offline, or a `since` the server would not serve. The cached data
        // stays on screen either way; falling back to the full query is what
        // stops a snapshot the server can no longer delta from wedging this tab
        // on stale state forever.
        if (!cancelled) setNeedsInitialQuery(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, fetchDelta, store]);

  return { needsInitialQuery };
}
