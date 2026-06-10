import { n as WorkspaceDelta, r as WorkspaceTableConfig, t as WorkspaceDefinition } from "./types-LCCUSy-n.cjs";

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
//#region src/context.d.ts
declare const workspaceVersionRef: {
  current: Date | undefined;
};
declare function applyWorkspaceDelta<T>(workspace: T, delta: WorkspaceDelta): T;
declare function createWorkspaceContext<T>(): {
  workspaceContext: import("react").Context<T | undefined>;
  applyDeltaContext: import("react").Context<((delta: WorkspaceDelta) => void) | undefined>;
  useWorkspace: () => T;
  useApplyDelta: () => (delta: WorkspaceDelta) => void;
};
//#endregion
export { type RawQuery, type WorkspaceDefinition, type WorkspaceDelta, type WorkspaceTableConfig, applyWorkspaceDelta, buildDeleteQuery, buildInitialQuery, buildUpsertQuery, createWorkspaceContext, getWorkspaceDelta, parseInitialWorkspace, workspaceVersionRef };
//# sourceMappingURL=index.d.cts.map