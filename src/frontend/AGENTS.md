# workspace-sync/src/frontend

**Purpose**: React adapter over the framework-agnostic store in `../store.ts` and the coordinator in `../tab-coordinator/`. Exports `createWorkspaceProvider`, a factory that loads an initial workspace snapshot, keeps it current (server push when a `pokeTarget` is wired, otherwise polling), and exposes hooks for subscribing to slices of it.

**Notes**:

- The provider is injected with `useFoundationQuery` and `useFoundationDeltaQuery` hooks rather than importing tRPC directly, keeping workspace-sync decoupled from Cedar's tRPC client setup.
- **Every Phase 2 option is opt-in, and an app that ignores them behaves exactly as before.** No `anchor` → no coordination, and the tab polls for itself. `useFoundationQuery` gained an `{ enabled }` argument, but a zero-argument implementation still type-checks and simply always runs — it only forfeits the skipped fetch on a cache hit.
- **`anchor.getId` is called during render**, so it may use hooks as long as it calls them unconditionally (the apps read the member id out of the session JWT). It returns `undefined` until the anchor is known, and coordination waits.
- **Order matters in the boot sequence**: the initial query starts disabled whenever there might be a cached snapshot, because enabling it before the IndexedDB read settles would fire exactly the fetch the cache exists to avoid. A cache miss, a missing `fetchDelta`, or a failed catch-up all re-enable it — the last of those is what stops a snapshot the server can no longer delta from wedging a tab on stale state.
- The context carries the store with its `applyDelta` swapped for the coordinator's broadcasting one, so `useApplyDelta` (i.e. every mutation response) reaches sibling tabs. Everything else passes through untouched.
- **`pokeTarget` (Phase 3) turns polling into a backstop.** Given an `EventTarget` that emits the websocket's `message` events (Cedar's `WsProvider` target), the *driver* tab pulls a delta via `fetchDelta` when it sees a `{ type: "workspace-poke", anchor }` whose `anchor` equals this provider's key — plus on `open` (reconnect) and on tab refocus. The pull goes through the broadcasting `applyDelta`, so passenger tabs are fed over the channel and never pull themselves, and the store's version guard absorbs the self-poke after one's own mutation. Filtering by anchor is what lets one target serve a client holding several workspaces. With a `pokeTarget` the poll drops from 10 s to 60 s; without one it stays at 10 s. Requires `anchor` + `fetchDelta`.
- The store — not React state — holds the workspace. The provider only drives fetching and gates on the first snapshot; context carries the store itself, and hooks bind via `useSyncExternalStore`. Keep React out of `../store.ts`.
- `use-sync-external-store/shim/with-selector` is used rather than React's built-in `useSyncExternalStore` because the built-in has no selector/`isEqual` form. It is a runtime **dependency** (not a devDependency): the apps get it transitively via the GitHub install.
- The optional hooks (`useOptionalWorkspace`, `useOptionalWorkspaceSelector`) fall back to a permanently-empty store when no provider is above, so hook order stays stable while still returning `undefined`. They exist for workspaces a user may not have (admin, org) — see `plans/reactive-workspace.md`.
- `TestWorkspaceProvider` builds a real store from a static workspace, so selector hooks and `useApplyDelta` both work in tests.

**Key Files**:

- `index.tsx`: `createWorkspaceProvider` — the provider, the hooks, and the public re-exports of this folder.
- `by-id.ts`: `byId` — array-identity-memoized id index; makes per-row selectors O(1) instead of a scan per row per delta.
- `shallow-equal.ts`: `shallowEqual` — the `isEqual` argument for selectors that build a fresh object or array.
- `use-cached-bootstrap.ts`: IndexedDB hydration plus the delta that catches it up; reports whether the initial query is still needed.
- `use-tab-coordination.ts`: binds a coordinator's lifetime to the component and its driver role to React state.
- `tab-sync.test.tsx`: covers the multi-tab and persistence behaviour across the provider and `../tab-coordinator/`. jsdom has BroadcastChannel but no Web Locks, so election is faked there; the real lock semantics are covered in `../tab-coordinator/driver-election.test.ts`.

**Relationships**: Imports `store`, `tab-coordinator` and `types` from `../`.
