import type { ComponentType, FC, ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";

import { createWorkspaceStore, type WorkspaceStore } from "../store";
import { workspaceKey } from "../tab-coordinator";
import type { WorkspaceDelta } from "../types";
import { useCachedBootstrap } from "./use-cached-bootstrap";
import { useTabCoordination } from "./use-tab-coordination";

export { byId } from "./by-id";
export { shallowEqual } from "./shallow-equal";
export { clearWorkspaceCache } from "../tab-coordinator";

const POLL_INTERVAL_MS = 10000;

export function createWorkspaceProvider<TFoundation>(options: {
  /**
   * `queryOptions.enabled` is false while a cached snapshot is booting the
   * store. Forward it to skip the full fetch on a cache hit; ignoring it costs
   * only the fetch the cache would have saved.
   */
  useFoundationQuery: (queryOptions: { enabled: boolean }) => {
    data: TFoundation | undefined;
  };
  useFoundationDeltaQuery: (
    input: { since: Date },
    queryOptions: { enabled: boolean; refetchInterval: number },
  ) => { data: WorkspaceDelta | undefined };
  Spinner: ComponentType<{ className?: string }>;
  /**
   * Pulls a delta outside the React render cycle (Cedar's vanilla tRPC client).
   * Used to catch a cached snapshot up on boot.
   */
  fetchDelta?: (since: Date) => Promise<WorkspaceDelta>;
  /**
   * Turns on multi-tab coordination: one tab polls, the rest are fed over a
   * BroadcastChannel. Everything is keyed by the *typed* anchor, since an
   * anchor id is only unique within its type.
   */
  anchor?: {
    /** The `anchor` of the `WorkspaceDefinition` — e.g. `"member"`. */
    type: string;
    /**
     * Called during render, so it may use hooks provided it calls them
     * unconditionally. Returns undefined when the anchor is not known yet, and
     * coordination waits.
     */
    getId: () => string | number | undefined;
  };
  /**
   * Cache the snapshot in IndexedDB so reloads and new tabs render instantly.
   * Requires `anchor`. Off by default: it puts workspace data unencrypted in
   * browser storage, which is the app's call.
   */
  persist?: boolean;
}) {
  const {
    useFoundationQuery,
    useFoundationDeltaQuery,
    Spinner,
    fetchDelta,
    anchor,
    persist = false,
  } = options;

  const storeContext = createContext<WorkspaceStore<TFoundation> | undefined>(
    undefined,
  );

  // Stands in for a missing provider so the optional hooks can call the same
  // hooks in the same order as the required ones. Never populated.
  const emptyStore = createWorkspaceStore<TFoundation>();

  function useStore(): WorkspaceStore<TFoundation> {
    const store = useContext(storeContext);
    if (!store) {
      throw new Error("useWorkspace must be used within a WorkspaceProvider");
    }
    return store;
  }

  function useSelectorOn<S>(
    store: WorkspaceStore<TFoundation>,
    select: (workspace: TFoundation | undefined) => S,
    isEqual: (a: S, b: S) => boolean,
  ): S {
    return useSyncExternalStoreWithSelector(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot,
      select,
      isEqual,
    );
  }

  /**
   * Subscribes to a slice of the workspace: the component re-renders only when
   * the selected value changes. `isEqual` defaults to `Object.is`, which works
   * because `applyWorkspaceDelta` preserves references for untouched rows and
   * tables; pass `shallowEqual` for selectors that build a fresh object.
   */
  function useWorkspaceSelector<S>(
    selector: (workspace: TFoundation) => S,
    isEqual: (a: S, b: S) => boolean = Object.is,
  ): S {
    return useSelectorOn(
      useStore(),
      (workspace) => selector(workspace as TFoundation),
      isEqual,
    );
  }

  /**
   * Selector for a workspace a given user may not have (an admin or org
   * workspace): returns `undefined` when there is no provider above, or when
   * its store has not loaded yet, instead of throwing. This is what lets a
   * component read such a workspace without its page being wrapped in that
   * workspace's provider.
   */
  function useOptionalWorkspaceSelector<S>(
    selector: (workspace: TFoundation) => S,
    isEqual: (a: S | undefined, b: S | undefined) => boolean = Object.is,
  ): S | undefined {
    return useSelectorOn(
      useContext(storeContext) ?? emptyStore,
      (workspace) => (workspace === undefined ? undefined : selector(workspace)),
      isEqual,
    );
  }

  function useWorkspace(): TFoundation {
    return useWorkspaceSelector((workspace) => workspace);
  }

  function useOptionalWorkspace(): TFoundation | undefined {
    return useOptionalWorkspaceSelector((workspace) => workspace);
  }

  function useApplyDelta(): (delta: WorkspaceDelta) => void {
    return useStore().applyDelta;
  }

  const WorkspaceProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [store] = useState(() => createWorkspaceStore<TFoundation>());

    const anchorId = anchor?.getId();
    const key =
      anchor && anchorId !== undefined
        ? workspaceKey(anchor.type, anchorId)
        : undefined;

    const { applyDelta, isDriver } = useTabCoordination({
      store,
      anchorType: anchor?.type,
      anchorId,
      persist,
    });

    const { needsInitialQuery } = useCachedBootstrap({
      store,
      cacheKey: persist ? key : undefined,
      fetchDelta,
    });

    const query = useFoundationQuery({ enabled: needsInitialQuery });

    useEffect(() => {
      if (query.data) store.setInitial(query.data);
    }, [query.data, store]);

    const workspace = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const version = store.getVersion();

    // Only the driver polls — the other tabs are fed from its results over the
    // channel, so N tabs cost one tab's worth of traffic.
    const deltaQuery = useFoundationDeltaQuery(
      { since: version! },
      {
        enabled: Boolean(version) && isDriver,
        refetchInterval: POLL_INTERVAL_MS,
      },
    );

    // The store discards a delta that does not advance its version, so a poll
    // that returns the same version as the last one costs nothing here.
    useEffect(() => {
      if (deltaQuery.data) applyDelta(deltaQuery.data);
    }, [deltaQuery.data, applyDelta]);

    // The store with its `applyDelta` swapped for the broadcasting one, so a
    // delta from `useApplyDelta` (a mutation response) reaches sibling tabs
    // without waiting for their next poll. Everything else passes through.
    const contextStore = useMemo(
      () => ({ ...store, applyDelta }),
      [store, applyDelta],
    );

    if (!workspace) {
      return <Spinner className="h-full" />;
    }

    return (
      <storeContext.Provider value={contextStore}>
        {children}
      </storeContext.Provider>
    );
  };

  const TestWorkspaceProvider: FC<{
    children: ReactNode;
    workspace: TFoundation;
  }> = ({ children, workspace }) => {
    const store = useMemo(() => {
      const testStore = createWorkspaceStore<TFoundation>();
      testStore.setInitial(workspace);
      return testStore;
    }, [workspace]);

    return (
      <storeContext.Provider value={store}>{children}</storeContext.Provider>
    );
  };

  return {
    storeContext,
    useWorkspace,
    useOptionalWorkspace,
    useWorkspaceSelector,
    useOptionalWorkspaceSelector,
    useApplyDelta,
    WorkspaceProvider,
    TestWorkspaceProvider,
  };
}
