# workspace-sync/src/backend

**Purpose**: Exports `createWorkspaceRouter`, a tRPC router factory that exposes `getFoundation` and `getFoundationDelta` endpoints for a given `WorkspaceDefinition`.

**Notes**:

- The router is framework-agnostic by design: it receives `router`, `protectedProcedure`, `getTrx`, and `getUserId` as options rather than importing from Cedar directly, so workspace-sync stays decoupled from Cedar.

**Key Files**:

- `index.ts`: The sole export — `createWorkspaceRouter`.

**Relationships**: Imports `delta`, `queries`, and `types` from `../`.
