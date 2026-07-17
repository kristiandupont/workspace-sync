import { n as WorkspaceDelta } from "./types-LCCUSy-n.cjs";

//#region src/store.d.ts
/**
 * Read by Cedar's tRPC client to send the `x-workspace-version` header, which
 * is how a mutation knows which delta to compute for the caller. Kept in sync
 * by every store. NOTE: this is a module-level singleton, so a client holding
 * more than one workspace at a time would have them fight over it.
 */
declare const workspaceVersionRef: {
  current: Date | undefined;
};
interface WorkspaceStore<T> {
  getSnapshot(): T | undefined;
  getVersion(): Date | undefined;
  setInitial(workspace: T): void;
  /** No-op when the delta's version does not advance past the store's. */
  applyDelta(delta: WorkspaceDelta): void;
  subscribe(listener: () => void): () => void;
}
/**
 * Framework-agnostic holder of one workspace. React binds to it via
 * `useSyncExternalStore`; tab coordination and server pokes talk to it
 * directly. Nothing here may import React.
 */
declare function createWorkspaceStore<T>(): WorkspaceStore<T>;
//#endregion
//#region src/tab-coordinator/snapshot-store.d.ts
/**
 * One workspace snapshot as it sits in IndexedDB. `anchorType` and `anchorId`
 * are stored alongside the derived `key` so a record is self-describing when
 * inspected in devtools; `key` is what it is actually looked up by.
 */
interface PersistedWorkspace<T> {
  key: string;
  anchorType: string;
  anchorId: string | number;
  version: Date;
  workspace: T;
}
declare function readPersistedWorkspace<T>(key: string): Promise<PersistedWorkspace<T> | undefined>;
/**
 * Wipes every cached workspace. Apps call this on logout — but note that it is
 * only half of a logout: the provider must also unmount (or its coordinator be
 * destroyed), or the driver tab will simply write its in-memory snapshot back.
 */
declare function clearWorkspaceCache(): Promise<void>;
//#endregion
//#region src/tab-coordinator/channel.d.ts
/**
 * What tabs sharing one workspace say to each other.
 *
 * `since` on a delta is the version it was computed from: a receiver older than
 * that is missing the changes in between, so the delta alone would not make it
 * whole. `postMessage` uses structured clone, so the `Date` fields survive as
 * `Date`s and need no serialization of their own.
 */
type WorkspaceMessage<T> = {
  type: "delta";
  since: Date;
  delta: WorkspaceDelta;
} | {
  type: "state-request";
} | {
  type: "state";
  version: Date;
  workspace: T;
};
//#endregion
//#region src/tab-coordinator/index.d.ts
interface TabCoordinator {
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
declare function workspaceKey(anchorType: string, anchorId: string | number): string;
/**
 * Coordinates the tabs sharing one workspace: one of them polls, all of them
 * see the results, and (optionally) the snapshot is cached for the next boot.
 * Browser APIs only — no React, so a future Crank adapter can use this as-is.
 */
declare function createTabCoordinator<T>(options: {
  anchorType: string;
  anchorId: string | number;
  store: WorkspaceStore<T>;
  /** Write snapshots to IndexedDB. Off by default: it puts workspace data
   * unencrypted in browser storage, which is an app's call to make. */
  persist?: boolean;
  onDriverChange?: (isDriver: boolean) => void;
}): TabCoordinator;
//#endregion
export { PersistedWorkspace as a, WorkspaceStore as c, WorkspaceMessage as i, createWorkspaceStore as l, createTabCoordinator as n, clearWorkspaceCache as o, workspaceKey as r, readPersistedWorkspace as s, TabCoordinator as t, workspaceVersionRef as u };
//# sourceMappingURL=index-CImRnVtZ.d.cts.map