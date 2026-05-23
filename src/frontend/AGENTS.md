# workspace-sync/src/frontend

**Purpose**: Exports `createWorkspaceProvider`, a React provider factory that loads an initial workspace snapshot then polls for deltas every 10 seconds, keeping frontend state in sync with the backend.

**Notes**:

- The provider is injected with `useFoundationQuery` and `useFoundationDeltaQuery` hooks rather than importing tRPC directly, keeping workspace-sync decoupled from Cedar's tRPC client setup.
- Also exports `TestWorkspaceProvider` for injecting a fixed workspace in tests without needing a live backend.

**Key Files**:

- `index.tsx`: The sole export — `createWorkspaceProvider`.

**Relationships**: Imports `context` and `types` from `../`.
