import { useEffect, useMemo, useState } from "react";

import type { WorkspaceStore } from "../store";
import type { TabCoordinator } from "../tab-coordinator";
import { createTabCoordinator } from "../tab-coordinator";
import type { WorkspaceDelta } from "../types";

/**
 * Binds a tab coordinator's lifetime to the component and its driver role to
 * React state, so the provider can gate polling on it.
 *
 * Without an anchor there is nothing to key the coordination on, so the tab
 * stays independent and calls itself the driver — which is what every tab did
 * before any of this existed.
 */
export function useTabCoordination<T>(options: {
  store: WorkspaceStore<T>;
  anchorType: string | undefined;
  anchorId: string | number | undefined;
  persist: boolean;
}): { applyDelta: (delta: WorkspaceDelta) => void; isDriver: boolean } {
  const { store, anchorType, anchorId, persist } = options;

  const [coordinator, setCoordinator] = useState<TabCoordinator | undefined>(
    undefined,
  );
  const [isDriver, setIsDriver] = useState(true);

  useEffect(() => {
    if (anchorType === undefined || anchorId === undefined) return;

    // Nobody until the lock says otherwise.
    setIsDriver(false);
    const created = createTabCoordinator<T>({
      anchorType,
      anchorId,
      store,
      persist,
      onDriverChange: setIsDriver,
    });
    setCoordinator(created);

    return () => {
      created.destroy();
      setCoordinator(undefined);
      setIsDriver(true);
    };
  }, [anchorType, anchorId, persist, store]);

  // Deltas this tab obtains go out to its siblings; without a coordinator they
  // just land in the store.
  const applyDelta = useMemo(
    () => coordinator?.applyAndBroadcast ?? store.applyDelta,
    [coordinator, store],
  );

  return { applyDelta, isDriver };
}
