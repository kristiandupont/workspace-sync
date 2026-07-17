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
export { createWorkspaceStore as n, workspaceVersionRef as r, WorkspaceStore as t };
//# sourceMappingURL=store-BZgKstJI.d.cts.map