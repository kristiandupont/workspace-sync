# workspace-sync/src

**Purpose**: Shared core logic for workspace state synchronisation. Consumed by `src/backend/` and `src/frontend/`, and re-exported via the root `workspace-sync` package entry point.

**Notes**:

- The anchor table must itself be an entry in `WorkspaceDefinition.tables` with `link: "id"` — it is synchronized, parsed and column-filtered like any other table. `anchor` only designates which table the workspace hangs off (join base of the initial query, `${anchor}_id` convention in `deleted_record`). The query builders throw if this invariant is violated.
- Column omission (`omittedColumns`) happens in the backend parse layer (`delta.ts`), not in SQL — queries `SELECT *` and the columns are stripped before crossing tRPC.

**Key Files**:

- `types.ts`: `WorkspaceDefinition`, `WorkspaceDelta`, `WorkspaceTableConfig` — the central data contracts.
- `queries.ts`: SQL query builders for initial workspace load and delta upsert/delete.
- `delta.ts`: Computes deltas and parses initial workspace snapshots from raw SQL results.
- `context.ts`: In-memory workspace context (`createWorkspaceContext`, `applyWorkspaceDelta`, `workspaceVersionRef`).
- `utils.ts`: Internal shared utilities.
- `index.ts`: Public entry point for the `workspace-sync` export path.

**Relationships**: `backend/` and `frontend/` import from this folder; nothing here imports from them.
