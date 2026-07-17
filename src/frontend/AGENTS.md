# workspace-sync/src/frontend

**Purpose**: React adapter over the framework-agnostic store in `../store.ts`. Exports `createWorkspaceProvider`, a factory that loads an initial workspace snapshot, polls for deltas every 10 seconds, and exposes hooks for subscribing to slices of it.

**Notes**:

- The provider is injected with `useFoundationQuery` and `useFoundationDeltaQuery` hooks rather than importing tRPC directly, keeping workspace-sync decoupled from Cedar's tRPC client setup.
- The store — not React state — holds the workspace. The provider only drives fetching and gates on the first snapshot; context carries the store itself, and hooks bind via `useSyncExternalStore`. Keep React out of `../store.ts`.
- `use-sync-external-store/shim/with-selector` is used rather than React's built-in `useSyncExternalStore` because the built-in has no selector/`isEqual` form. It is a runtime **dependency** (not a devDependency): the apps get it transitively via the GitHub install.
- The optional hooks (`useOptionalWorkspace`, `useOptionalWorkspaceSelector`) fall back to a permanently-empty store when no provider is above, so hook order stays stable while still returning `undefined`. They exist for workspaces a user may not have (admin, org) — see `plans/reactive-workspace.md`.
- `TestWorkspaceProvider` builds a real store from a static workspace, so selector hooks and `useApplyDelta` both work in tests.

**Key Files**:

- `index.tsx`: `createWorkspaceProvider` — the provider, the hooks, and the public re-exports of this folder.
- `by-id.ts`: `byId` — array-identity-memoized id index; makes per-row selectors O(1) instead of a scan per row per delta.
- `shallow-equal.ts`: `shallowEqual` — the `isEqual` argument for selectors that build a fresh object or array.

**Relationships**: Imports `store` and `types` from `../`.
