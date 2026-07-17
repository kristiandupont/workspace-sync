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
Object.defineProperty(exports, "applyWorkspaceDelta", {
	enumerable: true,
	get: function() {
		return applyWorkspaceDelta;
	}
});
Object.defineProperty(exports, "createWorkspaceStore", {
	enumerable: true,
	get: function() {
		return createWorkspaceStore;
	}
});
Object.defineProperty(exports, "workspaceVersionRef", {
	enumerable: true,
	get: function() {
		return workspaceVersionRef;
	}
});

//# sourceMappingURL=store-DMU-E85-.cjs.map