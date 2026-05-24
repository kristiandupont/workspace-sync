const require_utils = require("./utils-DBUNJZXG.cjs");
let react = require("react");
//#region src/context.ts
const workspaceVersionRef = { current: void 0 };
function cloneRecord(record) {
	return typeof structuredClone === "function" ? structuredClone(record) : JSON.parse(JSON.stringify(record));
}
function applyWorkspaceDelta(workspace, delta) {
	const updated = { ...workspace };
	for (const [tableName, rows] of Object.entries(delta.upserts)) {
		if (rows.length === 0) continue;
		const key = require_utils.snakeToCamelPlural(tableName);
		if (!(key in updated)) continue;
		const recordMap = new Map(updated[key].map((r) => [r.id, cloneRecord(r)]));
		for (const row of rows) recordMap.set(row.id, cloneRecord(row));
		updated[key] = Array.from(recordMap.values());
	}
	for (const [tableName, ids] of Object.entries(delta.deletes)) {
		if (ids.length === 0) continue;
		const key = require_utils.snakeToCamelPlural(tableName);
		if (!(key in updated)) continue;
		const idsToDelete = new Set(ids);
		updated[key] = updated[key].filter((r) => !idsToDelete.has(r.id));
	}
	if (delta.version > updated.version) updated.version = delta.version;
	return updated;
}
function createWorkspaceContext() {
	const workspaceContext = (0, react.createContext)(void 0);
	const applyDeltaContext = (0, react.createContext)(void 0);
	function useWorkspace() {
		return (0, react.useContext)(workspaceContext);
	}
	function useApplyDelta() {
		const fn = (0, react.useContext)(applyDeltaContext);
		if (!fn) throw new Error("useApplyDelta must be used within a WorkspaceProvider");
		return fn;
	}
	return {
		workspaceContext,
		applyDeltaContext,
		useWorkspace,
		useApplyDelta
	};
}
//#endregion
Object.defineProperty(exports, "applyWorkspaceDelta", {
	enumerable: true,
	get: function() {
		return applyWorkspaceDelta;
	}
});
Object.defineProperty(exports, "createWorkspaceContext", {
	enumerable: true,
	get: function() {
		return createWorkspaceContext;
	}
});
Object.defineProperty(exports, "workspaceVersionRef", {
	enumerable: true,
	get: function() {
		return workspaceVersionRef;
	}
});

//# sourceMappingURL=context-CSF-QrpS.cjs.map