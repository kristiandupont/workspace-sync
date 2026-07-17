const require_utils = require("./utils-DBUNJZXG.cjs");
//#region src/apply-delta.ts
/**
* Applies a delta to a workspace, preserving structural sharing: rows and table
* arrays that the delta does not touch keep their identity, so selectors that
* compare by reference only fire for slices that actually changed. Returns the
* original workspace unchanged when the delta is a no-op.
*/
function applyWorkspaceDelta(workspace, delta) {
	const source = workspace;
	const nextTables = /* @__PURE__ */ new Map();
	const currentRows = (key) => nextTables.get(key) ?? source[key];
	for (const [tableName, rows] of Object.entries(delta.upserts)) {
		if (rows.length === 0) continue;
		const key = require_utils.snakeToCamelPlural(tableName);
		if (!(key in source)) continue;
		const existing = currentRows(key);
		const indexById = new Map(existing.map((row, index) => [row.id, index]));
		const next = existing.slice();
		for (const row of rows) {
			const index = indexById.get(row.id);
			if (index === void 0) {
				indexById.set(row.id, next.length);
				next.push(row);
			} else next[index] = row;
		}
		nextTables.set(key, next);
	}
	for (const [tableName, ids] of Object.entries(delta.deletes)) {
		if (ids.length === 0) continue;
		const key = require_utils.snakeToCamelPlural(tableName);
		if (!(key in source)) continue;
		const existing = currentRows(key);
		const idsToDelete = new Set(ids);
		const next = existing.filter((row) => !idsToDelete.has(row.id));
		if (next.length !== existing.length) nextTables.set(key, next);
	}
	const versionAdvances = delta.version > source.version;
	if (nextTables.size === 0 && !versionAdvances) return workspace;
	const updated = { ...source };
	for (const [key, rows] of nextTables) updated[key] = rows;
	if (versionAdvances) updated.version = delta.version;
	return updated;
}
//#endregion
//#region src/store.ts
/**
* Read by Cedar's tRPC client to send the `x-workspace-version` header, which
* is how a mutation knows which delta to compute for the caller. Kept in sync
* by every store. NOTE: this is a module-level singleton, so a client holding
* more than one workspace at a time would have them fight over it.
*/
const workspaceVersionRef = { current: void 0 };
function versionOf(workspace) {
	return workspace.version ?? void 0;
}
/**
* Framework-agnostic holder of one workspace. React binds to it via
* `useSyncExternalStore`; tab coordination and server pokes talk to it
* directly. Nothing here may import React.
*/
function createWorkspaceStore() {
	let snapshot;
	let version;
	const listeners = /* @__PURE__ */ new Set();
	function commit(next) {
		snapshot = next;
		version = versionOf(next);
		if (version) workspaceVersionRef.current = version;
		for (const listener of listeners) listener();
	}
	return {
		getSnapshot: () => snapshot,
		getVersion: () => version,
		setInitial(workspace) {
			commit(workspace);
		},
		applyDelta(delta) {
			if (snapshot === void 0) return;
			if (version && delta.version.getTime() <= version.getTime()) return;
			const next = applyWorkspaceDelta(snapshot, delta);
			if (next === snapshot) return;
			commit(next);
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
}
//#endregion
//#region src/tab-coordinator/channel.ts
/**
* A BroadcastChannel scoped to one workspace key. Messages reach every other
* tab on the same key but never the sender, so there is no echo to filter.
* Without BroadcastChannel support the channel is inert and tabs simply stay
* independent.
*/
function openWorkspaceChannel(key, onMessage) {
	const ChannelConstructor = globalThis.BroadcastChannel;
	if (!ChannelConstructor) return {
		post: () => {},
		close: () => {}
	};
	const channel = new ChannelConstructor(`workspace:${key}`);
	channel.onmessage = (event) => onMessage(event.data);
	return {
		post: (message) => channel.postMessage(message),
		close: () => {
			channel.onmessage = null;
			channel.close();
		}
	};
}
//#endregion
//#region src/tab-coordinator/driver-election.ts
/**
* Elects one driver tab per workspace key. The winner holds a Web Lock for as
* long as it lives; the browser releases the lock if the tab crashes, which is
* what makes handover automatic rather than something we have to detect.
*
* There is no live demotion: `onResignDriver` fires on teardown, not on
* contention. A driver stays the driver until it goes away.
*
* Returns the teardown function.
*/
function electDriver(options) {
	const { key, onBecomeDriver, onResignDriver } = options;
	const locks = globalThis.navigator?.locks;
	if (!locks) {
		onBecomeDriver();
		return () => onResignDriver();
	}
	const abortController = new AbortController();
	let releaseLock;
	let stopped = false;
	locks.request(`workspace-driver:${key}`, { signal: abortController.signal }, () => {
		if (stopped) return Promise.resolve();
		onBecomeDriver();
		return new Promise((resolve) => {
			releaseLock = resolve;
		});
	}).catch(() => {});
	return () => {
		stopped = true;
		if (releaseLock) {
			releaseLock();
			releaseLock = void 0;
			onResignDriver();
		} else abortController.abort();
	};
}
//#endregion
//#region src/tab-coordinator/snapshot-store.ts
const DATABASE_NAME = "workspace-sync";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "workspaces";
let databasePromise;
function openDatabase() {
	const indexedDb = globalThis.indexedDB;
	if (!indexedDb) return Promise.resolve(void 0);
	return new Promise((resolve) => {
		let request;
		try {
			request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
		} catch {
			resolve(void 0);
			return;
		}
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(OBJECT_STORE_NAME)) database.createObjectStore(OBJECT_STORE_NAME, { keyPath: "key" });
		};
		request.onsuccess = () => {
			const database = request.result;
			database.onversionchange = () => {
				database.close();
				databasePromise = void 0;
			};
			database.onclose = () => {
				databasePromise = void 0;
			};
			resolve(database);
		};
		request.onerror = () => resolve(void 0);
		request.onblocked = () => resolve(void 0);
	});
}
function getDatabase() {
	databasePromise ??= openDatabase();
	return databasePromise;
}
function promisifyRequest(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
async function readPersistedWorkspace(key) {
	const database = await getDatabase();
	if (!database) return void 0;
	try {
		return await promisifyRequest(database.transaction(OBJECT_STORE_NAME, "readonly").objectStore(OBJECT_STORE_NAME).get(key)) ?? void 0;
	} catch {
		return;
	}
}
async function writePersistedWorkspace(record) {
	const database = await getDatabase();
	if (!database) return;
	try {
		await promisifyRequest(database.transaction(OBJECT_STORE_NAME, "readwrite").objectStore(OBJECT_STORE_NAME).put(record));
	} catch (error) {
		console.warn("workspace-sync: could not persist workspace snapshot", error);
	}
}
/**
* Wipes every cached workspace. Apps call this on logout — but note that it is
* only half of a logout: the provider must also unmount (or its coordinator be
* destroyed), or the driver tab will simply write its in-memory snapshot back.
*/
async function clearWorkspaceCache() {
	const database = await getDatabase();
	if (!database) return;
	try {
		await promisifyRequest(database.transaction(OBJECT_STORE_NAME, "readwrite").objectStore(OBJECT_STORE_NAME).clear());
	} catch (error) {
		console.warn("workspace-sync: could not clear workspace cache", error);
	}
}
//#endregion
//#region src/tab-coordinator/index.ts
/** Long enough to fold a burst of deltas into one write, short enough that a
* tab closing rarely loses anything — and what it loses, the delta pull after
* hydration fetches back anyway. */
const PERSIST_DEBOUNCE_MS = 1e3;
/**
* Every shared resource is keyed by the *typed* anchor. An anchor id is only
* unique within its type — member #5 and organization #5 are different
* workspaces — and two logins in one browser must not meet in the same lock,
* channel or cache record.
*/
function workspaceKey(anchorType, anchorId) {
	return `${anchorType}:${anchorId}`;
}
/**
* Coordinates the tabs sharing one workspace: one of them polls, all of them
* see the results, and (optionally) the snapshot is cached for the next boot.
* Browser APIs only — no React, so a future Crank adapter can use this as-is.
*/
function createTabCoordinator(options) {
	const { anchorType, anchorId, store, persist = false, onDriverChange } = options;
	const key = workspaceKey(anchorType, anchorId);
	let driver = false;
	let destroyed = false;
	let persistTimer;
	const channel = openWorkspaceChannel(key, handleMessage);
	function handleMessage(message) {
		if (destroyed) return;
		switch (message.type) {
			case "delta": {
				const version = store.getVersion();
				if (!version) return;
				if (version.getTime() < message.since.getTime()) {
					channel.post({ type: "state-request" });
					return;
				}
				store.applyDelta(message.delta);
				return;
			}
			case "state-request": {
				if (!driver) return;
				const workspace = store.getSnapshot();
				const version = store.getVersion();
				if (!workspace || !version) return;
				channel.post({
					type: "state",
					version,
					workspace
				});
				return;
			}
			case "state": {
				const version = store.getVersion();
				if (version && version.getTime() >= message.version.getTime()) return;
				store.setInitial(message.workspace);
				return;
			}
		}
	}
	function persistNow() {
		if (destroyed || !driver) return;
		const workspace = store.getSnapshot();
		const version = store.getVersion();
		if (!workspace || !version) return;
		writePersistedWorkspace({
			key,
			anchorType,
			anchorId,
			version,
			workspace
		});
	}
	function schedulePersist() {
		if (!persist || !driver || destroyed) return;
		if (persistTimer) return;
		persistTimer = setTimeout(() => {
			persistTimer = void 0;
			persistNow();
		}, PERSIST_DEBOUNCE_MS);
	}
	const unsubscribe = persist ? store.subscribe(schedulePersist) : void 0;
	const stopElection = electDriver({
		key,
		onBecomeDriver: () => {
			driver = true;
			if (destroyed) return;
			onDriverChange?.(true);
			schedulePersist();
		},
		onResignDriver: () => {
			driver = false;
			if (destroyed) return;
			onDriverChange?.(false);
		}
	});
	function applyAndBroadcast(delta) {
		const since = store.getVersion();
		store.applyDelta(delta);
		const version = store.getVersion();
		if (!since || !version || version.getTime() <= since.getTime()) return;
		channel.post({
			type: "delta",
			since,
			delta
		});
	}
	return {
		isDriver: () => driver,
		applyAndBroadcast,
		destroy() {
			destroyed = true;
			if (persistTimer) {
				clearTimeout(persistTimer);
				persistTimer = void 0;
			}
			unsubscribe?.();
			stopElection();
			channel.close();
		}
	};
}
//#endregion
Object.defineProperty(exports, "applyWorkspaceDelta", {
	enumerable: true,
	get: function() {
		return applyWorkspaceDelta;
	}
});
Object.defineProperty(exports, "clearWorkspaceCache", {
	enumerable: true,
	get: function() {
		return clearWorkspaceCache;
	}
});
Object.defineProperty(exports, "createTabCoordinator", {
	enumerable: true,
	get: function() {
		return createTabCoordinator;
	}
});
Object.defineProperty(exports, "createWorkspaceStore", {
	enumerable: true,
	get: function() {
		return createWorkspaceStore;
	}
});
Object.defineProperty(exports, "readPersistedWorkspace", {
	enumerable: true,
	get: function() {
		return readPersistedWorkspace;
	}
});
Object.defineProperty(exports, "workspaceKey", {
	enumerable: true,
	get: function() {
		return workspaceKey;
	}
});
Object.defineProperty(exports, "workspaceVersionRef", {
	enumerable: true,
	get: function() {
		return workspaceVersionRef;
	}
});

//# sourceMappingURL=tab-coordinator-BkifYIlz.cjs.map