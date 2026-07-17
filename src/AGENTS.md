# workspace-sync/src

**Purpose**: Shared core logic for workspace state synchronisation. Consumed by `src/backend/` and `src/frontend/`, and re-exported via the root `workspace-sync` package entry point.

**Notes**:

- The anchor table must itself be an entry in `WorkspaceDefinition.tables` with `link: "id"` — it is synchronized, parsed and column-filtered like any other table. `anchor` only designates which table the workspace hangs off (join base of the initial query, `${anchor}_id` convention in `deleted_record`). The query builders throw if this invariant is violated.
- Column omission (`omittedColumns`) happens in the backend parse layer (`delta.ts`), not in SQL — queries `SELECT *` and the columns are stripped before crossing tRPC.
- `applyWorkspaceDelta`'s structural sharing is load-bearing, not an optimization: `useWorkspaceSelector` and `byId` both rest on untouched rows and tables keeping their identity. A change that reintroduces wholesale cloning silently turns every selector into a re-render on every delta.
- `workspaceVersionRef` is a module-level singleton because Cedar's tRPC client reads it to set the `x-workspace-version` header. It therefore assumes **one workspace per client** — a second concurrent store would overwrite it. Revisit when a client first holds two workspaces at once (see `plans/reactive-workspace.md`).

**Key Files**:

- `types.ts`: `WorkspaceDefinition`, `WorkspaceDelta`, `WorkspaceTableConfig` — the central data contracts.
- `queries.ts`: SQL query builders for initial workspace load and delta upsert/delete.
- `delta.ts`: Computes deltas and parses initial workspace snapshots from raw SQL results.
- `apply-delta.ts`: `applyWorkspaceDelta` — folds a delta into a workspace, preserving references for everything the delta did not touch.
- `store.ts`: `createWorkspaceStore` — the framework-agnostic `subscribe`/`getSnapshot` holder React binds to, plus `workspaceVersionRef`. No React import; keep it that way (a future Crank adapter is meant to bind to this contract).
- `utils.ts`: Internal shared utilities.
- `index.ts`: Public entry point for the `workspace-sync` export path.

**Relationships**: `backend/` and `frontend/` import from this folder; nothing here imports from them.
