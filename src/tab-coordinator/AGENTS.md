# workspace-sync/src/tab-coordinator

**Purpose**: Makes the tabs sharing one workspace behave like one client: a single _driver_ tab polls, its deltas reach the others over a BroadcastChannel, and (optionally) the snapshot is cached in IndexedDB so the next boot renders before the network answers. Browser APIs only — no React.

**Notes**:

- **Everything is keyed by the typed anchor** (`${anchorType}:${anchorId}`, via `workspaceKey`). An anchor id is only unique within its type — member `#5` and organization `#5` are different workspaces — so a key that dropped the type would let two logins in one browser share a driver, a channel, or a cache record. That is a cross-account leak, not an inefficiency.
- **`applyAndBroadcast` only broadcasts what advanced the store.** A replayed or self-poked delta holds nothing for a sibling either — and its `since` would sit at or past the sender's own version, which any tab behind reads as a gap and answers with a full resync it does not need.
- **The gap rule**: a receiver older than a delta's `since` is missing the changes in between and must not apply it; it asks for a full snapshot instead. Only the driver answers, so a resync draws one reply rather than one per tab. Rare in practice — a tab woken from bfcache or mobile background.
- **Driver election has no live demotion.** Web Locks hands the role over when the holder's tab dies (the browser releases the lock), which is the whole reason for using it — there is no heartbeat to get wrong. `onResignDriver` fires on teardown, not on contention.
- **Every capability degrades to today's behaviour rather than failing.** No Web Locks (older Android WebView) → every tab is its own driver. No BroadcastChannel → tabs stay independent. No IndexedDB, or a refused/exhausted one → a cold boot. The workspace never depends on any of them being present.
- **Persistence is driver-only and debounced ~1 s**, so N tabs do not write N copies of the same snapshot. A pending write is dropped on teardown rather than flushed: an async write started then would not finish anyway, and the delta pull after hydration recovers the second it costs.
- The tests run against Node's real `navigator.locks` and `BroadcastChannel` (both spec-compliant, and BroadcastChannel delivers to every instance but the sender), with `fake-indexeddb` for storage.

**Key Files**:

- `index.ts`: `createTabCoordinator` — wires the three below to a `WorkspaceStore`; owns the message handling, the gap rule and the persist debounce. Also `workspaceKey`.
- `driver-election.ts`: `electDriver` — Web Locks; the lock is held for the tab's lifetime.
- `channel.ts`: `openWorkspaceChannel` and the `WorkspaceMessage` union — what tabs say to each other.
- `snapshot-store.ts`: the IndexedDB layer, including `clearWorkspaceCache` for app logout flows.

**Relationships**: Wraps `../store`; imports `../types`. Nothing here imports React, and nothing in `../frontend` may leak into it — a future Crank adapter is meant to use this as-is. `../frontend/use-tab-coordination.ts` is the React binding.
