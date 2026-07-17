# Plan: Reactive Workspace — external store, multi-tab sync, server push, offline

## Goal

Four improvements to the workspace mechanism, consumed by both Beatpoints and
Moneybutler:

1. **Selectors** — components subscribe to a slice of the workspace and only
   re-render when that slice changes.
2. **Multi-tab** — one tab per user becomes the *driver* (owns polling/push
   connection); other tabs receive changes without their own server traffic.
   IndexedDB persists a snapshot so reloads and new tabs start instantly.
3. **Server push** — changes not caused by a client request (e.g. a Graphile
   job) reach connected clients within moments instead of at the next poll.
4. **Offline mutations** — the PWA stays usable offline: reads from the
   persisted snapshot, writes through a replayed outbox. Explicitly *not*
   two-way state sync or CRDTs — mutations remain server-authoritative RPCs.

The unifying move: pull workspace state out of React into a **framework-agnostic
store** with `subscribe`/`getSnapshot`. React binds via `useSyncExternalStore`;
tab coordination, IndexedDB, and websocket pokes all talk to the store, not to
React. A future CrankJS adapter is then a thin `subscribe → ctx.refresh()`
binding — nothing in the core may import React.

**Anchors are not always members.** A workspace is usually anchored on a
`member`, but the anchor *could* be another entity — most likely an
`organization`. Neither app does this today, but these changes are
framework-level, so nothing here may assume `anchorId === memberId`. Two
consequences run through the whole plan: (a) an anchor id is only unique
*within its type* — member `#5` and org `#5` are different things — so every
key derived from an anchor (poke topics, driver lock, BroadcastChannel, IDB)
must be **typed**: `${anchorType}:${anchorId}`, where the type is the
`WorkspaceDefinition.anchor` table name; (b) a single client can hold **several
workspaces at once** (e.g. an admin sees the normal user workspace *and* an
admin-only workspace with extra entities), so stores, coordinators, and socket
subscriptions are all per-workspace, and workspace data is globally available
via its store rather than scoped to a React subtree.

Phases land in order; 2 and 3 both depend on 1, but 2 and 3 are independent of
each other. Phase 4 (offline mutations) builds on 2 and is itself split into
levels that can be adopted incrementally — or stopped at any point.

---

## Key design decisions (and why)

- **Poke/pull, not delta-push.** The delta mechanism is state-based:
  `getWorkspaceDelta(anchorId, since)` computes the correct delta no matter
  what caused the writes. So the server never needs to derive per-consumer
  delta sets — it only tells connected clients "workspace `${type}:${id}`
  changed", and each client pulls via the existing delta endpoint with its own
  `since`. The server stays stateless per connection. Duplicate/spurious pokes
  are harmless *provided* the store's `applyDelta` no-ops when the delta's
  version does not advance — that guard is new behaviour to build (§1a), not an
  existing property: today `applyWorkspaceDelta` applies unconditionally and
  only the polled-query effect discards on an exact-version match.
- **App-level pokes, not DB triggers.** The poke is emitted by the backend code
  that performs the write, not by a Postgres trigger on every row. Any write
  that should update a workspace already runs on the backend, so a trigger's
  "fires on every write" comprehensiveness mostly buys coverage of code paths
  that shouldn't exist. Two choke points cover it: the `protectedMutationWithDelta`
  wrapper (all client mutations) and a `pokeWorkspace(anchorType, anchorId)`
  helper (jobs, webhooks, cron). A linter rule flags raw writes to workspace
  tables that go
  through neither. This drops the per-app trigger migration, avoids a
  `pg_notify` firehose on bulk jobs (one poke per job, not per row), and keeps
  the coupling in application code. The one thing triggers gave for free and
  this gives up: a write whose *affected* anchor differs from the anchor the
  poking code knows about (e.g. a cross-anchor FK cascade). Per-member/-org
  anchoring makes those rare-to-nonexistent — treat their absence as a
  deliberate invariant, not an accident.
- **`pg_notify` as the cross-instance transport (not the source).** The apps
  will run multiple instances before long. The instance that ran a write holds
  different sockets than the instance a client is connected to, so `sendToMember`
  alone can't reach everyone. The poke helper calls
  `pg_notify('workspace_changed', { type, id })`; every instance `LISTEN`s and
  pokes its own subscribed sockets. Single-instance today collapses to the same
  code path (it just also hears its own notify). No triggers involved — the
  *decision* to notify lives in app code where it can be coalesced.
- **Backend-derived socket subscriptions, keyed by anchor.** The socket registry
  is keyed by anchor topic, not by member. On connect, after the existing token
  auth, an app-supplied `resolveSubscriptions(member) → topics[]` enumerates the
  workspaces that identity gets (the user workspace; the admin workspace if
  admin; the `org:{id}` workspace for the member's org). Pokes route by
  `sendToTopic("anchor:${type}:${id}", …)` — a direct map lookup, no
  anchor→members query at poke time. Because subscriptions are derived server-side from the
  authenticated identity, there is no client-asserted-anchor attack surface; and
  the follow-up delta pull re-authorizes regardless, so a stale subscription can
  leak change-*timing* at worst, never data.
- **Memory is the source of truth; IndexedDB is a write-behind cache.** IDB has
  no change-notification API and every read is async — making it the live store
  would kill the synchronous no-spinner reads that are the point of
  workspace-sync. IDB's job is bootstrap: hydrate instantly on load, then pull
  a delta since the persisted version instead of the full initial fetch.
- **Web Locks + BroadcastChannel, not SharedWorker.** SharedWorker is
  unsupported in Android WebView, which the Capacitor builds run in. Web Locks
  gives crash-safe driver election (lock auto-releases when the tab dies);
  BroadcastChannel carries deltas between tabs. Both are supported in Android
  WebView and Safari ≥ 15.4. If `navigator.locks` is missing, every tab acts
  as its own driver — exactly today's behaviour, so degradation is graceful.
- **Race handling leans on delta idempotence.** Upserts carry full rows keyed
  by id, deletes are id sets, every delta carries `version` — replays are
  no-ops. The one real hazard is a *gap* (a tab that slept receives a delta
  computed `since` a version newer than its own); the fix is a resync rule,
  see Phase 2.

---

## Existing infrastructure to build on

- **workspace-sync**: `queries.ts` / `delta.ts` (SQL + delta computation, keep
  as-is), `context.ts` (`applyWorkspaceDelta`, React context — reworked in
  Phase 1), `frontend/index.tsx` (`createWorkspaceProvider`, currently polls
  every 10 s via tRPC hooks), kanel plugin.
- **cedar/frontend**: `WsProvider` (reconnecting websocket client,
  authenticates by sending the session token as first message, fans messages
  out on an `EventTarget`), `useMutationWithDelta`, `createTrpcClients`
  (provides `trpcVanillaClient` — usable for delta pulls outside the React
  render cycle — and wires `workspaceVersionRef` into the
  `x-workspace-version` header).
- **Both apps**: `src/backend/wsHandler.ts` — per-member socket registry with
  token auth, `sendToMember(memberId, payload)`. (Moneybutler's is a verbatim
  copy of Beatpoints', still using `Member` types.)
- **Beatpoints**: `src/backend/db-listener/` — `pg-listen` subscriber
  (`establishDbListener.ts`) dispatching Postgres NOTIFY payloads onto an
  `EventTarget`; currently listens to the `chat` channel only. Moneybutler has
  no equivalent yet.
- **DB**: every workspace table already has `updated_at` and an
  `AFTER DELETE` trigger writing to `deleted_record` — trigger infrastructure
  and migration patterns exist in both apps
  (see beatpoints `migrations/20250324202049_workspace-prep.js`).

### Pre-existing bug the socket registry must not reproduce

`wsHandler.ts` (both apps) does `if (!(member.id in wsMap))` — but `in` on a
`Map` checks object properties, not entries, so it is always false and every
new connection **replaces** the member's socket map, orphaning previously
connected tabs. Harmless today (chat push tolerates it); fatal for reliable
pokes. Phase 3 generalizes this registry into a topic-keyed one in cedar
(`member:{id}` becomes just another topic alongside `anchor:{type}:{id}`), which
supersedes the buggy line — but the rewrite must use proper `Map.has`/`Set`
membership so the same class of bug does not recur.

---

## Phase 1 — External store + selectors (workspace-sync, then both apps)

### 1a. `src/store.ts` (new, framework-free)

```ts
export interface WorkspaceStore<T> {
  getSnapshot(): T | undefined;
  getVersion(): Date | undefined;
  setInitial(workspace: T): void;
  applyDelta(delta: WorkspaceDelta): void;   // no-op if version hasn't advanced
  subscribe(listener: () => void): () => void;
}
export function createWorkspaceStore<T>(): WorkspaceStore<T>;
```

Plain TypeScript, no React import. `applyDelta` uses `applyWorkspaceDelta`,
updates the store's version, keeps `workspaceVersionRef.current` in sync (the
ref stays, since cedar's header wiring reads it), and notifies subscribers.

### 1b. Fix structural sharing in `applyWorkspaceDelta` — the precondition for selectors

This is not a nice-to-have; it is the mechanism the whole selector feature rests
on. `context.ts` currently `cloneRecord`s **every existing row** of any table
that receives an upsert, so one changed tracker gives all trackers new
identities and reference-equality selectors fire spuriously — with this in
place, *every* selector re-runs and re-renders on *any* change, and the selector
story is a lie. Change to: keep existing row references untouched, insert/replace
only the rows present in the delta, and replace a table array only when that
table actually changed. Add tests asserting referential stability (untouched
table → same array reference; touched table → same references for untouched
rows).

### 1c. React adapter (`src/frontend/`)

- Add dependency `use-sync-external-store` (the `shim/with-selector` entry —
  same building block Zustand uses; apps are on React 18.3).
- New hook, exposed from `createWorkspaceProvider`:

  ```ts
  useWorkspaceSelector<S>(
    selector: (w: T) => S,
    isEqual?: (a: S, b: S) => boolean,  // default Object.is; export shallowEqual too
  ): S
  ```

- **Memoized id-indexes for list-item selectors.** A plain blob makes per-row
  selectors quadratic: 500 rows each doing `w => w.transactions.find(t => t.id
  === id)` re-runs 500 O(n) scans per delta. Because 1b keeps a table's array
  referentially stable until it actually changes, expose a `byId` derived from a
  `WeakMap<array, Map<id, row>>` — same array in, same index out, rebuilt only
  when the array changes. Row selectors become `w => byId(w.transactions).get(id)`
  → O(1) and stable. The index lives in the frontend adapter; the core store
  stays a plain `T` (no entity framework, no React), which is what keeps the
  Crank path open. This is the pragmatic middle: separate values at the row
  level (id-indexed), derived from one stored blob — not a store decomposed into
  per-entity atoms.
- **Nullable selector variant for optional workspaces.** `useWorkspace()` today
  does `useContext(...)!` — fine for the always-present user workspace, wrong for
  an admin (or org) workspace a given user may not have. The factory also exposes
  a nullable selector that returns `undefined` when the store was never populated,
  instead of throwing. This is what lets an admin-mode control on an otherwise
  normal page read admin data without wrapping that page in an admin provider —
  data is available via its store, not scoped to a subtree (see the multi-workspace
  note in the intro).
- Rework `createWorkspaceProvider` internals: it creates a
  `WorkspaceStore<T>`, feeds it the initial query result and polled deltas,
  and provides it via context. `useWorkspace()` becomes
  `useWorkspaceSelector(w => w)`; `useApplyDelta()` returns
  `store.applyDelta`. **The external API is unchanged** —
  `WorkspaceProvider`, `TestWorkspaceProvider`, `useWorkspace`,
  `useApplyDelta` keep their signatures, so both apps compile without edits.
- `TestWorkspaceProvider` wraps a static store so selector hooks work in tests.

### 1d. App integration

- Re-export `useWorkspaceSelector` from each app's `WorkspaceProvider.tsx`.
- Migrate the hottest components (Beatpoints tracker views, Moneybutler
  transaction/account lists) from `useFoundation()` to selectors
  opportunistically — no big-bang rewrite; `useWorkspace()` keeps working.

### Ship

workspace-sync: build, commit `dist/`, push → `./sync-libs.sh` → commit lock
files in both apps.

---

## Phase 2 — Multi-tab driver + IndexedDB bootstrap (workspace-sync, then both apps)

### 2a. `src/tab-coordinator.ts` (new; browser APIs, still no React)

Wraps a `WorkspaceStore<T>`. **Every resource below is keyed by the typed
anchor** `key = ${definition.anchor}:${anchorId}` (the type from the definition,
the id from the app-supplied `getAnchorId`) — never the bare workspace name or a
raw numeric id. This is what prevents two logins in the same browser (or a
member #5 vs org #5 id collision) from sharing a driver, a channel, or a
snapshot — a real cross-account leak if the key omits the anchor.

- **Driver election**: `navigator.locks.request("workspace-driver:{key}",
  () => <promise held until tab dies>)`. Callback `onBecomeDriver` /
  `onResignDriver` lets the provider start/stop polling and (Phase 3) poke
  handling. No `navigator.locks` → behave as permanent driver. (With Web Locks
  you hold the lock until the tab dies; `onResignDriver` fires on teardown/abort,
  not on contention — there is no live demotion.)
- **BroadcastChannel** `workspace:{key}` with messages:
  - `{ type: "delta", since: Date, delta: WorkspaceDelta }` — sent by whichever
    tab obtained a delta (driver poll/poke pull, or any tab's mutation
    response). Receivers apply via `store.applyDelta`.
  - `{ type: "state-request" }` / `{ type: "state", workspace, version }` —
    full-snapshot resync, served by the driver.
  - **Gap rule**: a receiver whose version is *older* than `since` must not
    apply the delta; it posts `state-request` instead (rare: bfcache/mobile
    background wake-ups).
  - `structuredClone` semantics of `postMessage` handle `Date` fields natively.
- **IndexedDB persistence** (driver only, debounced ~1 s):
  `{ key, anchorType, anchorId, version, workspace }`, record keyed by `key`.
  Storing the typed anchor means a snapshot is never hydrated for a different
  login *or* a different anchor type. Export `clearWorkspaceCache()` for apps to
  call on logout — and logout must also tear the coordinator down (release the
  lock, close the channel, stop polling), not merely wipe IDB, or a same-tab
  re-login races the old driver.

### 2b. Provider changes (`src/frontend/`)

`createWorkspaceProvider` gains options (all optional → current behaviour
unchanged until apps opt in):

```ts
{
  fetchDelta?: (since: Date) => Promise<WorkspaceDelta>; // vanilla-client pull, used by driver + resync
  persist?: { enabled: boolean; getAnchorId: () => string | number | undefined };
}
```

Boot sequence becomes: try IDB hydration → if hit, `setInitial(snapshot)` and
immediately `fetchDelta(persistedVersion)`; if miss, run the initial query as
today. Polling runs **only in the driver tab**. Mutation deltas
(`useMutationWithDelta` path) apply locally *and* broadcast, so sibling tabs
update without waiting for a poll/poke.

### 2c. App integration

- Implement `fetchDelta` with the existing `trpcVanillaClient`
  (`workspace.getFoundationDelta.query({ since })`).
- Call `clearWorkspaceCache()` in each app's logout flow.
- **Moneybutler privacy decision**: the IDB snapshot puts financial data
  unencrypted in browser storage. Persistence is opt-in per app precisely so
  Moneybutler can ship tab-sync without persistence (hydration skipped, new
  tabs do the full fetch) if that trade-off feels wrong. Decide at
  integration time.

### Verify

Two desktop tabs: mutation in tab A appears in tab B without B polling
(network tab). Close the driver tab → surviving tab acquires the lock and
polling resumes. Reload → content renders from IDB before the network
round-trip. Log out/in as a different user → no stale data. Capacitor build:
single webview trivially becomes driver; app still works.

---

## Phase 3 — Server push via app-level poke/pull (apps + cedar, small workspace-sync addition)

The poke is emitted by the backend code that writes, carried between instances
by `pg_notify`, routed to sockets by anchor topic, and named so a client with
several workspaces only pulls the one that changed. No database triggers.

### 3a. The poke helper (cedar/backend, `pg_notify` transport)

- `pokeWorkspace(anchorType, anchorId)` runs
  `pg_notify('workspace_changed', JSON.stringify({ type, id }))`. Payload is the
  typed anchor only — never row data (8 kB NOTIFY limit; the client pulls the
  delta anyway). Call it from exactly two places so the surface stays small:
  - **`protectedMutationWithDelta`** (`app/src/backend/trpc.ts` in both apps)
    already computes the delta and knows the anchor id — poke there and *every*
    client mutation is covered, including cross-device propagation (the
    initiating tab has its delta from the response, same-device tabs get it via
    BroadcastChannel, but the user's *other devices* need this poke).
  - **`pokeWorkspace` directly** from non-client writers: Graphile jobs
    (Moneybutler bank sync), webhooks, cron. Coalesce to one call per job rather
    than one per row.
- **Leak-surface lint**: a raw write to a workspace table that goes through
  neither the mutation wrapper nor `pokeWorkspace` is the way this silently
  rots. Add a lint rule (or a wrapped db helper) that flags such writes. The
  residual hazard is a write whose affected anchor differs from the one the
  poking code knows (cross-anchor cascade) — assert those don't exist rather
  than discover it.
- Single-instance runs this path unchanged (the one instance hears its own
  notify). No `buildNotifyTriggerSql`, no per-app trigger migration.

### 3b. Backend wiring — topic registry + listener (cedar/backend)

- **Generalize the socket registry into a topic-keyed one** in cedar. A socket
  subscribes to topics; `sendToTopic(topic, payload)` fans out. `member:{id}`
  (chat) and `anchor:{type}:{id}` (workspace) are both just topics. Use proper
  `Map.has`/`Set` membership — this supersedes and must not reproduce the
  `in`-vs-`has` bug. Beatpoints' chat keeps working via its `member:{id}` topic.
- **Backend-derived subscriptions.** On connect, after the existing token auth,
  call an app-supplied `resolveSubscriptions(member) → topics[]` and register the
  socket under each. This is where "admin ⇒ user + admin workspaces" and "member
  ⇒ their org's workspace" is decided; the org→members lookup happens once here,
  not per poke. The subscription set is a snapshot at connect — a mid-session
  role/membership change goes live on reconnect (harmless extra pokes meanwhile;
  a newly-relevant workspace is covered by the fallback poll until reconnect).
- **Generalize Beatpoints' `db-listener` into cedar/backend**:
  `establishDbListener(connectionString, channels) → EventTarget`, built on
  `pg-listen` as today. Beatpoints switches to it (keeping its `chat` channel);
  Moneybutler gains its first listener.
- Each instance subscribes to `workspace_changed`, debounces ~100 ms per anchor
  key, and calls `sendToTopic("anchor:{type}:{id}", JSON.stringify({ type:
  "workspace-poke", anchor: "{type}:{id}" }))` — the poke **names its anchor** so
  a socket holding several workspaces pulls only the one that changed. Skip the
  send (don't error) when no socket is subscribed — for pokes that's normal.
- **Multi-instance**: every instance `LISTEN`s the same Postgres and pokes its
  own sockets. Pokes are best-effort — a `pg-listen` reconnect drops notifies in
  its gap — so the client's fallback poll (3c) is the correctness backstop, not
  just a mobile nicety.

### 3c. Client wiring

- Driver tab (only) listens on cedar `WsProvider`'s `EventTarget`; on a
  `workspace-poke` **whose `anchor` matches this provider's key**, calls
  `fetchDelta(store.getVersion())`, applies, and broadcasts — the same path as a
  poll result. Provider option: `pokeTarget?: EventTarget`. A client with
  several workspace providers shares the one `EventTarget`; each filters for its
  own anchor.
- Demote polling to a fallback: `refetchInterval` 10 s → 60 s, plus an immediate
  pull on `visibilitychange` (page becomes visible) and on websocket reconnect.
  Websockets die silently on mobile, and pokes can be dropped on a listener
  reconnect; the fallback keeps eventual consistency in both cases.
- Self-poke after one's own mutation is expected and harmless (the version
  no-op guard from §1a discards the empty delta).

### Verify

Manually enqueue a Graphile job that writes workspace rows (Moneybutler bank
sync is the real-world case): connected browser updates within ~1 s without a
poll. Kill the websocket (dev tools offline) → change still arrives via the
60 s fallback or on tab refocus. Two tabs + a job: both update, only the driver
hit the network. Admin with two workspaces open: a change to one pokes only that
provider (log the pulls). If reachable, a two-instance dev run: a write on
instance A reaches a client connected to instance B.

---

## Phase 4 — Offline mutations: "sync down, queue up"

### Design stance

No two-way state sync, no CRDTs. Sync stays backend→frontend only; mutations
stay server-authoritative RPCs. Offline support means mutations become
**queueable**: while offline they wait in an IndexedDB outbox and replay
through the normal tRPC procedure (full validation) on reconnect. The server
never merges state — it processes slightly delayed requests. This is the
Replicache/Zero and Linear model; Figma likewise rejected CRDTs for
server-authoritative last-writer-wins. It fits here unusually well because
workspaces are anchored per-member: concurrent writers are mostly one
person's own devices, so "replay in order, server validates, last writer
wins" resolves nearly everything, and the residue is *visible failures*, not
silent merges.

Every observable state is either "what the server said" or "what the server
said plus a visible queue" — that invariant is what keeps this debuggable,
and no level below may break it.

### Level 0 — offline reads (free with Phase 2)

IDB hydration already makes the PWA open with data offline. Add a service
worker for app-shell caching in each app (orthogonal to workspace-sync, but
without it the PWA doesn't load offline at all). Read-only offline ships
here.

### Level 1 — outbox without optimism

- **Outbox in the workspace store layer** (framework-free, IDB-persisted,
  shared across tabs; the driver tab replays — consistent with Phase 2).
  A queued mutation is `{ id: uuid, name, input, queuedAt }`.
- Not inside react-query: TanStack Query's paused-mutation persistence exists
  but mutation functions don't serialize, making resume-after-reload fragile
  (`setMutationDefaults` wiring). The store already owns IDB and tab
  coordination, and staying React-free keeps the Crank path open.
- UX: affected UI shows a "pending" badge (expose `usePendingMutations()`);
  the workspace itself does not change until the server confirms. Honest and
  cheap — no business logic duplicated on the client.
- Replay on reconnect: strictly in queue order via the vanilla tRPC client;
  resulting deltas apply and broadcast as usual.
- **Idempotency (required)**: replay can retry a request the server already
  committed (connection died after commit, before response). Each mutation
  carries its client-generated uuid; the server keeps a small
  `processed_mutation (member_id, mutation_id, result, created_at)` table and
  returns the recorded result for duplicates. Add a cedar/backend helper that
  wraps a tRPC mutation with this check so both apps opt in per procedure.
  Prune rows after ~30 days.
- **Failure policy (decide up front)**: a replayed mutation may legitimately
  fail validation — the world moved on. Policy: drop the failed mutation,
  keep replaying the rest unless they declared a dependency on it, and
  surface the failure visibly (toast + a retrievable "didn't apply" list).
  Never retry silently forever; an invisibly wedged queue is how offline
  systems rot.

### Level 2 — optimistic overlay, selectively

For mutations that must *appear applied* while offline, add a client-side
mutator. Elegant fit with existing machinery: server mutations already return
a `WorkspaceDelta`, so a client mutator is just
`(workspace, input) → speculative delta`, applied through the same
`applyWorkspaceDelta`.

- Store follows the rebase model: **canonical state** (built purely from
  server deltas) + pending queue replayed through mutators on top = the
  optimistic snapshot exposed to selectors. On every server delta or mutation
  ack, recompute from canonical + remaining queue. Optimistic state is always
  a pure, discardable function of those two inputs — never a merged artifact.
- Speculative rows need temporary client ids for inserts; the ack's real
  delta replaces them (the mutation leaves the queue, its speculation
  vanishes, the server's rows arrive — no id-mapping bookkeeping needed
  beyond stable React keys, for which a `clientId` echo column can be added
  later if list reordering flickers).
- **Allowlist, not blanket**: only register mutators for flows where offline
  matters (Beatpoints: logging a tracker entry mid-run; Moneybutler:
  categorizing transactions on a plane). Everything else stays Level 1 or
  requires connectivity. This caps the duplicated-logic surface permanently.

### Verify

Airplane-mode PWA: app loads (service worker), data renders (IDB), a
queued mutation shows pending, survives a full reload, replays exactly once
on reconnect (check `processed_mutation`), and a deliberately conflicting
replay (edit the same row from another device meanwhile) fails visibly
rather than silently. Two tabs offline: single shared queue, driver replays.

---

## Rollout mechanics

Each phase follows the library workflow from the root `CLAUDE.md`: change
workspace-sync (and cedar in Phase 3) → `npm run build`, commit `dist/`, push
`main` → `./sync-libs.sh` → commit both apps' lock files → land app-side
wiring per app. Phase boundaries are safe stopping points; within a phase,
library and app changes must ship together only where an option is newly
*required* (none are — every new capability is opt-in via provider options).

## Open questions

- **Moneybutler IDB persistence** — ship with persistence off? (See 2c.)
- **Navigate-to-arbitrary-anchor** (resolved boundary, not open work): backend
  `resolveSubscriptions(member)` covers workspaces implied by *who you are* — the
  admin case (admin ⇒ user + admin workspaces) fits, since that admin workspace
  is tied to the role, not to some other user. It does *not* cover a workspace
  implied by *what you navigated to* (e.g. an admin support tool opening one
  specific other user's workspace). That, if ever needed, reintroduces a
  client-initiated subscribe plus an access predicate. Out of scope; flagged so
  it's a conscious boundary. (This supersedes the former "anchor id vs member id
  for pokes" question — poke routing is by anchor topic, no anchor→members
  lookup at poke time.)
- **Crank adapter**: out of scope, but Phase 1's store is the contract —
  a `crank/` entry point exporting a subscription helper can be added without
  touching the core.
- **Phase 4 Level 2 allowlist**: which mutations get client mutators is a
  per-app product decision (candidates named in 4); decide when Level 1 UX
  proves insufficient for a concrete flow, not before.
