import { n as WorkspaceDelta } from "./types-CDHUSqEO.cjs";
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
export { createWorkspaceStore as a, WorkspaceStore as i, clearWorkspaceCache as n, workspaceVersionRef as o, readPersistedWorkspace as r, PersistedWorkspace as t };
//# sourceMappingURL=snapshot-store-Cw1-oYZ4.d.cts.map