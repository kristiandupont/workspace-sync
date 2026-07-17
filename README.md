# workspace-sync

Generic machinery for the workspace synchronization pattern: an initial full fetch of a scoped data set, followed by continuous polling for upserts and deletes.

## Concept

A "workspace" is a collection of normalized database records anchored to a single entity — typically a user or organization. On first load the entire workspace is fetched in one query. Thereafter, the frontend polls for changes since its last known version and merges them in. The frontend can then access all workspace data synchronously, without spinners.

Tables are suitable for a workspace when they are:
- Small enough that an initial full load is tolerable
- Infrequently written (high-churn tables should stay outside the workspace)
- Fundamental enough to warrant always being in memory

Each synchronized table must have `id`, `created_at`, and `updated_at` columns and a trigger that writes deleted rows into a `deleted_record` table (keyed by `${anchor}_id`).

## Package contents

### Runtime (main export)

```ts
import {
  // Types
  WorkspaceDefinition, WorkspaceTableConfig, WorkspaceDelta,
  // SQL builders
  buildInitialQuery, buildUpsertQuery, buildDeleteQuery,
  // Parsing / server helpers
  parseInitialWorkspace, getWorkspaceDelta,
  // Store (framework-agnostic)
  createWorkspaceStore, WorkspaceStore, applyWorkspaceDelta, workspaceVersionRef,
} from "workspace-sync";
```

**`WorkspaceDefinition`** — describes which tables belong to a workspace and how they relate to the anchor:

```ts
const myDefinition: WorkspaceDefinition = {
  name: "foundation",
  schema: "public",
  anchor: "member",          // anchor table (filtered by id = anchorId)
  tables: {
    tracker: {
      link: "member_id",     // FK column pointing at the anchor
      omittedColumns: [],    // columns stripped before sending to the client
      timestampColumns: ["created_at", "updated_at"],
    },
  },
};
```

**`buildInitialQuery(definition, anchorId)`** — returns `{ sql, bindings }` for a single query that fetches the full workspace and its current `version` (max `updated_at`).

**`buildUpsertQuery(definition, anchorId, since)`** / **`buildDeleteQuery(definition, anchorId, since)`** — return `{ sql, bindings }` for the two halves of a delta poll.

**`parseInitialWorkspace<T>(definition, raw)`** — parses the JSON payload returned by the initial query into typed workspace object `T`, converting timestamp strings to `Date` objects.

**`getWorkspaceDelta(trx, definition, anchorId, since)`** — runs both delta queries in parallel and returns a `WorkspaceDelta` with `upserts`, `deletes`, and the new `version`.

**`createWorkspaceStore<T>()`** — framework-agnostic holder of one workspace, with no React import. The React adapter binds to it via `useSyncExternalStore`; a future adapter for another framework only needs `subscribe`.

```ts
const store = createWorkspaceStore<Foundation>();
store.getSnapshot();          // Foundation | undefined
store.getVersion();           // Date | undefined
store.setInitial(workspace);
store.applyDelta(delta);      // no-op unless the delta's version advances
store.subscribe(() => {});    // returns an unsubscribe function
```

`applyDelta` discarding a delta that does not advance the version is what makes duplicate deliveries harmless — the same change can arrive from a poll, from another tab, and from a server poke.

**`applyWorkspaceDelta<T>(workspace, delta)`** — pure function that merges a `WorkspaceDelta` into a workspace value (immutably), preserving the identity of rows and tables the delta did not touch, and returning the original workspace when the delta changes nothing. Selectors depend on this.

**`workspaceVersionRef`** — mutable ref tracking the current version, for attaching to tRPC requests as a header. Kept in sync by every store; assumes one workspace per client.

### Kanel plugin (`workspace-sync/kanel`)

Generates a `WorkspaceDefinition` runtime object and a matching TypeScript interface from a live PostgreSQL schema, via [Kanel](https://kristiandupont.github.io/kanel/).

```js
// kanel.config.js (or generateWorkspace.js pre-render hook)
const { makeGenerateWorkspace } = require("workspace-sync/kanel");

/** @type {import("workspace-sync/kanel").WorkspaceConfig[]} */
const workspaces = [
  {
    name: "foundation",
    schema: "public",
    anchor: "member",
    tables: {
      tracker:         { link: "member_id" },
      derived_metric:  { link: "member_id" },
    },
  },
];

module.exports = makeGenerateWorkspace(workspaces);
```

Each generated file exports a `${name}Definition: WorkspaceDefinition` object and a `${Name}` TypeScript interface whose keys are the camelCase-pluralized table names.

## Usage pattern (server)

```ts
// tRPC procedure
getFoundation: protectedProcedure.query(async ({ ctx }) => {
  const trx = getTrx();
  const { sql, bindings } = buildInitialQuery(foundationDefinition, ctx.user.id);
  const response = await trx.raw(sql, bindings);
  return parseInitialWorkspace<Foundation>(
    foundationDefinition,
    response.rows[0].foundation_workspace,
  );
}),

getFoundationDelta: protectedProcedure
  .input(z.object({ since: z.date() }))
  .query(async ({ ctx, input }) => {
    return getWorkspaceDelta(trx, foundationDefinition, ctx.user.id, input.since);
  }),
```

## Usage pattern (client)

`createWorkspaceProvider` (from `workspace-sync/frontend`) owns the store, the initial fetch and the delta polling. Inject the query hooks so the package stays independent of your tRPC setup.

```tsx
// WorkspaceProvider.tsx
export const {
  useWorkspace,           // hook — the whole workspace; re-renders on any change
  useWorkspaceSelector,   // hook — a slice; re-renders only when that slice changes
  useApplyDelta,          // hook — applies a delta (used by useMutationWithDelta)
  WorkspaceProvider,      // renders Spinner until the initial fetch resolves
  TestWorkspaceProvider,  // serves a static workspace in tests
} = createWorkspaceProvider<Foundation>({
  useFoundationQuery: () => trpc.workspace.getFoundation.useQuery(),
  useFoundationDeltaQuery: (input, options) =>
    trpc.workspace.getFoundationDelta.useQuery(input, options),
  Spinner: CenteredSpinner,
});
```

Prefer selectors in components that render often. `isEqual` defaults to `Object.is`, which is enough for most selectors because `applyWorkspaceDelta` preserves references; use `shallowEqual` when the selector builds a fresh object, and `byId` for per-row selectors so they cost a map lookup rather than a scan.

```tsx
const trackers = useWorkspaceSelector((w) => w.trackers);
const tracker = useWorkspaceSelector((w) => byId(w.trackers).get(id));
const counts = useWorkspaceSelector(
  (w) => ({ trackers: w.trackers.length, entries: w.timeEntries.length }),
  shallowEqual,
);
```

For a workspace a given user may not have (an admin or org workspace), `useOptionalWorkspace` and `useOptionalWorkspaceSelector` return `undefined` instead of throwing when that provider is absent.

## Database requirements

- Every synchronized table needs `id`, `created_at`, `updated_at` columns.
- Deletes must be recorded in a `deleted_record` table with columns: `id`, `table_name`, `record_id`, `deleted_at`, and `${anchor}_id` (e.g. `member_id`).

## Local development (workspace-sync-root checkout)

workspace-sync is published from GitHub (`github:kristiandupont/workspace-sync#main`) and pinned by commit in each consuming app's `package-lock.json`. The apps do **not** symlink this folder — local changes only reach them once the library is built, committed, pushed to `main`, and the lock files are updated via `./sync-libs.sh` from the root folder. This is deliberate: local behaviour then matches CI and production exactly.

**Before first use after a fresh checkout, build the package:**

```sh
cd workspace-sync
npm install
npm run build       # runs tsdown → populates dist/
npm run build:watch # for incremental rebuilds during development
```

The compiled output (`dist/*.cjs`, `dist/*.d.cts`) is committed to the repo so that `npm install` from GitHub works without a build step in CI.

## Scripts

| Script | What it does |
|--------|-------------|
| `npm run build` | Compile all entries to `dist/` via tsdown |
| `npm run build:watch` | Incremental rebuild on file change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | `vitest run` |
