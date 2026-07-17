Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_store = require("./store-DMU-E85-.cjs");
let react = require("react");
let use_sync_external_store_shim_with_selector = require("use-sync-external-store/shim/with-selector");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/frontend/by-id.ts
const indexCache = /* @__PURE__ */ new WeakMap();
/**
* Id-index for a workspace table, memoized on the array's identity.
*
* Without it a per-row selector (`w => w.transactions.find(t => t.id === id)`)
* costs an O(n) scan per row per delta — quadratic on a list page. Because
* `applyWorkspaceDelta` keeps a table's array reference stable until that table
* actually changes, the same array yields the same index, rebuilt only when the
* table changes. Row selectors become `w => byId(w.transactions).get(id)`:
* O(1), and referentially stable across unrelated deltas.
*/
function byId(rows) {
	const cached = indexCache.get(rows);
	if (cached) return cached;
	const index = new Map(rows.map((row) => [row.id, row]));
	indexCache.set(rows, index);
	return index;
}
//#endregion
//#region src/frontend/shallow-equal.ts
/**
* Compares own enumerable properties with `Object.is`. Pass as the `isEqual`
* argument of `useWorkspaceSelector` when the selector builds a fresh object or
* array each run (`w => ({ a: w.a, b: w.b })`), which `Object.is` would treat
* as changed every time.
*/
function shallowEqual(a, b) {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]));
}
//#endregion
//#region src/frontend/index.tsx
function createWorkspaceProvider(options) {
	const { useFoundationQuery, useFoundationDeltaQuery, Spinner } = options;
	const storeContext = (0, react.createContext)(void 0);
	const emptyStore = require_store.createWorkspaceStore();
	function useStore() {
		const store = (0, react.useContext)(storeContext);
		if (!store) throw new Error("useWorkspace must be used within a WorkspaceProvider");
		return store;
	}
	function useSelectorOn(store, select, isEqual) {
		return (0, use_sync_external_store_shim_with_selector.useSyncExternalStoreWithSelector)(store.subscribe, store.getSnapshot, store.getSnapshot, select, isEqual);
	}
	/**
	* Subscribes to a slice of the workspace: the component re-renders only when
	* the selected value changes. `isEqual` defaults to `Object.is`, which works
	* because `applyWorkspaceDelta` preserves references for untouched rows and
	* tables; pass `shallowEqual` for selectors that build a fresh object.
	*/
	function useWorkspaceSelector(selector, isEqual = Object.is) {
		return useSelectorOn(useStore(), (workspace) => selector(workspace), isEqual);
	}
	/**
	* Selector for a workspace a given user may not have (an admin or org
	* workspace): returns `undefined` when there is no provider above, or when
	* its store has not loaded yet, instead of throwing. This is what lets a
	* component read such a workspace without its page being wrapped in that
	* workspace's provider.
	*/
	function useOptionalWorkspaceSelector(selector, isEqual = Object.is) {
		return useSelectorOn((0, react.useContext)(storeContext) ?? emptyStore, (workspace) => workspace === void 0 ? void 0 : selector(workspace), isEqual);
	}
	function useWorkspace() {
		return useWorkspaceSelector((workspace) => workspace);
	}
	function useOptionalWorkspace() {
		return useOptionalWorkspaceSelector((workspace) => workspace);
	}
	function useApplyDelta() {
		return useStore().applyDelta;
	}
	const WorkspaceProvider = ({ children }) => {
		const [store] = (0, react.useState)(() => require_store.createWorkspaceStore());
		const query = useFoundationQuery();
		(0, react.useEffect)(() => {
			if (query.data) store.setInitial(query.data);
		}, [query.data, store]);
		const workspace = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
		const version = store.getVersion();
		const deltaQuery = useFoundationDeltaQuery({ since: version }, {
			enabled: Boolean(version),
			refetchInterval: 1e4
		});
		(0, react.useEffect)(() => {
			if (deltaQuery.data) store.applyDelta(deltaQuery.data);
		}, [deltaQuery.data, store]);
		if (!workspace) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { className: "h-full" });
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(storeContext.Provider, {
			value: store,
			children
		});
	};
	const TestWorkspaceProvider = ({ children, workspace }) => {
		const store = (0, react.useMemo)(() => {
			const testStore = require_store.createWorkspaceStore();
			testStore.setInitial(workspace);
			return testStore;
		}, [workspace]);
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(storeContext.Provider, {
			value: store,
			children
		});
	};
	return {
		storeContext,
		useWorkspace,
		useOptionalWorkspace,
		useWorkspaceSelector,
		useOptionalWorkspaceSelector,
		useApplyDelta,
		WorkspaceProvider,
		TestWorkspaceProvider
	};
}
//#endregion
exports.byId = byId;
exports.createWorkspaceProvider = createWorkspaceProvider;
exports.shallowEqual = shallowEqual;

//# sourceMappingURL=frontend.cjs.map