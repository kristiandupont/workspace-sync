export type { WorkspaceDelta, WorkspaceDefinition, WorkspaceTableConfig } from "./types";
export type { RawQuery } from "./queries";
export { buildInitialQuery, buildUpsertQuery, buildDeleteQuery } from "./queries";
export { getWorkspaceDelta, parseInitialWorkspace } from "./delta";
export {
  createWorkspaceContext,
  applyWorkspaceDelta,
  workspaceVersionRef,
} from "./context";
