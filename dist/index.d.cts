import { n as WorkspaceDelta, r as WorkspaceTableConfig, t as WorkspaceDefinition } from "./types-LCCUSy-n.cjs";
import { n as createWorkspaceStore, r as workspaceVersionRef, t as WorkspaceStore } from "./store-BZgKstJI.cjs";

//#region src/queries.d.ts
interface RawQuery {
  sql: string;
  bindings: (string | number)[];
}
declare function buildInitialQuery(definition: WorkspaceDefinition, anchorId: number | string): RawQuery;
declare function buildUpsertQuery(definition: WorkspaceDefinition, anchorId: number | string, since: Date): RawQuery;
declare function buildDeleteQuery(definition: WorkspaceDefinition, anchorId: number | string, since: Date): RawQuery;
//#endregion
//#region src/delta.d.ts
interface KnexLike {
  raw(sql: string, bindings: (string | number)[]): Promise<{
    rows: any[];
  }>;
}
declare function parseInitialWorkspace<T>(definition: WorkspaceDefinition, raw: any): T;
declare function getWorkspaceDelta(trx: KnexLike, definition: WorkspaceDefinition, anchorId: number | string, since: Date): Promise<WorkspaceDelta>;
//#endregion
//#region src/apply-delta.d.ts
/**
 * Applies a delta to a workspace, preserving structural sharing: rows and table
 * arrays that the delta does not touch keep their identity, so selectors that
 * compare by reference only fire for slices that actually changed. Returns the
 * original workspace unchanged when the delta is a no-op.
 */
declare function applyWorkspaceDelta<T>(workspace: T, delta: WorkspaceDelta): T;
//#endregion
export { type RawQuery, type WorkspaceDefinition, type WorkspaceDelta, type WorkspaceStore, type WorkspaceTableConfig, applyWorkspaceDelta, buildDeleteQuery, buildInitialQuery, buildUpsertQuery, createWorkspaceStore, getWorkspaceDelta, parseInitialWorkspace, workspaceVersionRef };
//# sourceMappingURL=index.d.cts.map