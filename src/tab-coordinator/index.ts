import type { WorkspaceStore } from "../store";
import type { WorkspaceDelta } from "../types";
import type { WorkspaceMessage } from "./channel";
import { openWorkspaceChannel } from "./channel";
import { electDriver } from "./driver-election";
import { writePersistedWorkspace } from "./snapshot-store";

export type { PersistedWorkspace } from "./snapshot-store";
export { clearWorkspaceCache, readPersistedWorkspace } from "./snapshot-store";
export type { WorkspaceMessage } from "./channel";

/** Long enough to fold a burst of deltas into one write, short enough that a
 * tab closing rarely loses anything — and what it loses, the delta pull after
 * hydration fetches back anyway. */
const PERSIST_DEBOUNCE_MS = 1000;

export interface TabCoordinator {
  isDriver(): boolean;
  /**
   * Apply a delta this tab obtained (a poll, a mutation response, later a
   * poke) and hand it to the other tabs so they update without their own
   * request.
   */
  applyAndBroadcast(delta: WorkspaceDelta): void;
  destroy(): void;
}

/**
 * Every shared resource is keyed by the *typed* anchor. An anchor id is only
 * unique within its type — member #5 and organization #5 are different
 * workspaces — and two logins in one browser must not meet in the same lock,
 * channel or cache record.
 */
export function workspaceKey(
  anchorType: string,
  anchorId: string | number,
): string {
  return `${anchorType}:${anchorId}`;
}

/**
 * Coordinates the tabs sharing one workspace: one of them polls, all of them
 * see the results, and (optionally) the snapshot is cached for the next boot.
 * Browser APIs only — no React, so a future Crank adapter can use this as-is.
 */
export function createTabCoordinator<T>(options: {
  anchorType: string;
  anchorId: string | number;
  store: WorkspaceStore<T>;
  /** Write snapshots to IndexedDB. Off by default: it puts workspace data
   * unencrypted in browser storage, which is an app's call to make. */
  persist?: boolean;
  onDriverChange?: (isDriver: boolean) => void;
}): TabCoordinator {
  const { anchorType, anchorId, store, persist = false, onDriverChange } = options;
  const key = workspaceKey(anchorType, anchorId);

  let driver = false;
  let destroyed = false;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  const channel = openWorkspaceChannel<T>(key, handleMessage);

  function handleMessage(message: WorkspaceMessage<T>): void {
    if (destroyed) return;

    switch (message.type) {
      case "delta": {
        const version = store.getVersion();
        // Nothing to fold this into yet; our own initial load is on its way and
        // will arrive at or past this delta.
        if (!version) return;

        // The gap rule. We are behind where this delta starts, so the changes
        // between us and `since` are in no message we will ever receive —
        // applying it would silently skip them. Ask for the whole snapshot.
        // Rare in practice: a tab woken from bfcache or mobile background.
        if (version.getTime() < message.since.getTime()) {
          channel.post({ type: "state-request" });
          return;
        }

        store.applyDelta(message.delta);
        return;
      }

      case "state-request": {
        // Only the driver answers, so a resync draws one reply rather than one
        // per open tab.
        if (!driver) return;

        const workspace = store.getSnapshot();
        const version = store.getVersion();
        if (!workspace || !version) return;

        channel.post({ type: "state", version, workspace });
        return;
      }

      case "state": {
        const version = store.getVersion();
        // A full snapshot is not automatically an improvement: we may have
        // moved past it since asking. Never go backwards.
        if (version && version.getTime() >= message.version.getTime()) return;

        store.setInitial(message.workspace);
        return;
      }
    }
  }

  function persistNow(): void {
    if (destroyed || !driver) return;

    const workspace = store.getSnapshot();
    const version = store.getVersion();
    if (!workspace || !version) return;

    void writePersistedWorkspace({ key, anchorType, anchorId, version, workspace });
  }

  function schedulePersist(): void {
    // Driver-only: otherwise every tab writes the same snapshot, and a
    // non-driver's data came from the driver in the first place.
    if (!persist || !driver || destroyed) return;
    if (persistTimer) return;

    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  const unsubscribe = persist ? store.subscribe(schedulePersist) : undefined;

  const stopElection = electDriver({
    key,
    onBecomeDriver: () => {
      driver = true;
      if (destroyed) return;
      onDriverChange?.(true);
      // We may have inherited the role long after the store filled up (the
      // previous driver died), so the cache is not necessarily current.
      schedulePersist();
    },
    onResignDriver: () => {
      driver = false;
      // On teardown the caller already knows; telling it would only poke React
      // state on the way out.
      if (destroyed) return;
      onDriverChange?.(false);
    },
  });

  function applyAndBroadcast(delta: WorkspaceDelta): void {
    const since = store.getVersion();
    store.applyDelta(delta);
    const version = store.getVersion();

    // Broadcast only what actually moved us forward. A replayed or self-poked
    // delta that the store discarded holds nothing for a sibling either — and
    // worse, its `since` would sit at or past our own version, which reads as a
    // gap to any tab behind us and would trigger a full resync it does not need.
    if (!since || !version || version.getTime() <= since.getTime()) return;

    channel.post({ type: "delta", since, delta });
  }

  return {
    isDriver: () => driver,
    applyAndBroadcast,
    destroy() {
      destroyed = true;
      // A pending write is dropped rather than flushed: an async write started
      // during teardown would not finish, and the cost is at most a second of
      // snapshot freshness that the post-hydration delta pull recovers.
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
      }
      unsubscribe?.();
      stopElection();
      channel.close();
    },
  };
}
