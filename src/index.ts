export type { WorkspaceDelta, WorkspaceDefinition, WorkspaceTableConfig } from "./types";
export type { RawQuery } from "./queries";
export { buildInitialQuery, buildUpsertQuery, buildDeleteQuery } from "./queries";
export { getWorkspaceDelta, parseInitialWorkspace } from "./delta";
export { applyWorkspaceDelta } from "./apply-delta";
export type { WorkspaceStore } from "./store";
export { createWorkspaceStore, workspaceVersionRef } from "./store";
export type {
  PersistedWorkspace,
  TabCoordinator,
  WorkspaceMessage,
} from "./tab-coordinator";
export {
  clearWorkspaceCache,
  createTabCoordinator,
  readPersistedWorkspace,
  workspaceKey,
} from "./tab-coordinator";
