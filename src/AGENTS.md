# workspace-sync/src

**Purpose**: Shared core logic for workspace state synchronisation. Consumed by `src/backend/` and `src/frontend/`, and re-exported via the root `workspace-sync` package entry point.

**Key Files**:

- `types.ts`: `WorkspaceDefinition`, `WorkspaceDelta`, `WorkspaceTableConfig` — the central data contracts.
- `queries.ts`: SQL query builders for initial workspace load and delta upsert/delete.
- `delta.ts`: Computes deltas and parses initial workspace snapshots from raw SQL results.
- `context.ts`: In-memory workspace context (`createWorkspaceContext`, `applyWorkspaceDelta`, `workspaceVersionRef`).
- `utils.ts`: Internal shared utilities.
- `index.ts`: Public entry point for the `workspace-sync` export path.

**Relationships**: `backend/` and `frontend/` import from this folder; nothing here imports from them.
