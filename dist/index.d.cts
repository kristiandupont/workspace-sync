import { n as WorkspaceDelta, r as WorkspaceTableConfig, t as WorkspaceDefinition } from "./types-CDHUSqEO.cjs";
import { a as createWorkspaceStore, i as WorkspaceStore, n as clearWorkspaceCache, o as workspaceVersionRef, r as readPersistedWorkspace, t as PersistedWorkspace } from "./snapshot-store-Cw1-oYZ4.cjs";
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
export declare function workspaceKey(anchorType: string, anchorId: string | number): string;
/**
 * Coordinates the tabs sharing one workspace: one of them polls, all of them
 * see the results, and (optionally) the snapshot is cached for the next boot.
 * Browser APIs only — no React, so a future Crank adapter can use this as-is.
 */
export declare function createTabCoordinator<T>(options: {
  anchorType: string;
  anchorId: string | number;
  store: WorkspaceStore<T>;
  /** Write snapshots to IndexedDB. Off by default: it puts workspace data
   * unencrypted in browser storage, which is an app's call to make. */
  persist?: boolean;
  onDriverChange?: (isDriver: boolean) => void;
}): TabCoordinator;
//#endregion
//#region src/queries.d.ts
interface RawQuery {
  sql: string;
  bindings: (string | number)[];
}
export declare function buildInitialQuery(definition: WorkspaceDefinition, anchorId: number | string): RawQuery;
export declare function buildUpsertQuery(definition: WorkspaceDefinition, anchorId: number | string, since: Date): RawQuery;
export declare function buildDeleteQuery(definition: WorkspaceDefinition, anchorId: number | string, since: Date): RawQuery;
//#endregion
//#region src/delta.d.ts
interface KnexLike {
  raw(sql: string, bindings: (string | number)[]): Promise<{
    rows: any[];
  }>;
}
export declare function parseInitialWorkspace<T>(definition: WorkspaceDefinition, raw: any): T;
export declare function getWorkspaceDelta(trx: KnexLike, definition: WorkspaceDefinition, anchorId: number | string, since: Date): Promise<WorkspaceDelta>;
//#endregion
//#region src/apply-delta.d.ts
/**
 * Applies a delta to a workspace, preserving structural sharing: rows and table
 * arrays that the delta does not touch keep their identity, so selectors that
 * compare by reference only fire for slices that actually changed. Returns the
 * original workspace unchanged when the delta is a no-op.
 */
export declare function applyWorkspaceDelta<T>(workspace: T, delta: WorkspaceDelta): T;
//#endregion
export { type PersistedWorkspace, type RawQuery, type TabCoordinator, type WorkspaceDefinition, type WorkspaceDelta, type WorkspaceMessage, type WorkspaceStore, type WorkspaceTableConfig, clearWorkspaceCache, createWorkspaceStore, readPersistedWorkspace, workspaceVersionRef };
//# sourceMappingURL=index.d.cts.map