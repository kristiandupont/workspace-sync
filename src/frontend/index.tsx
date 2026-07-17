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
import type { WorkspaceDelta } from "../types";

export { byId } from "./by-id";
export { shallowEqual } from "./shallow-equal";

export function createWorkspaceProvider<TFoundation>(options: {
  useFoundationQuery: () => { data: TFoundation | undefined };
  useFoundationDeltaQuery: (
    input: { since: Date },
    queryOptions: { enabled: boolean; refetchInterval: number },
  ) => { data: WorkspaceDelta | undefined };
  Spinner: ComponentType<{ className?: string }>;
}) {
  const { useFoundationQuery, useFoundationDeltaQuery, Spinner } = options;

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
    const query = useFoundationQuery();

    useEffect(() => {
      if (query.data) store.setInitial(query.data);
    }, [query.data, store]);

    const workspace = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const version = store.getVersion();

    const deltaQuery = useFoundationDeltaQuery(
      { since: version! },
      { enabled: Boolean(version), refetchInterval: 10000 },
    );

    // The store discards a delta that does not advance its version, so a poll
    // that returns the same version as the last one costs nothing here.
    useEffect(() => {
      if (deltaQuery.data) store.applyDelta(deltaQuery.data);
    }, [deltaQuery.data, store]);

    if (!workspace) {
      return <Spinner className="h-full" />;
    }

    return (
      <storeContext.Provider value={store}>{children}</storeContext.Provider>
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
