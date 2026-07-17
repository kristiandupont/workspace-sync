Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_tab_coordinator = require("./tab-coordinator-BkifYIlz.cjs");
let react = require("react");
let use_sync_external_store_shim_with_selector = require("use-sync-external-store/shim/with-selector");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/frontend/use-cached-bootstrap.ts
/**
* Boots the store from the cached snapshot when there is one, so a reload
* renders before the network answers, and catches it up with a delta instead of
* a full fetch.
*
* Reports whether the caller still needs the initial query: false only while a
* cached snapshot is carrying us, since running it then would fire exactly the
* fetch the cache exists to avoid.
*/
function useCachedBootstrap(options) {
	const { store, cacheKey, fetchDelta } = options;
	const [needsInitialQuery, setNeedsInitialQuery] = (0, react.useState)(cacheKey === void 0);
	(0, react.useEffect)(() => {
		if (cacheKey === void 0) {
			setNeedsInitialQuery(true);
			return;
		}
		let cancelled = false;
		setNeedsInitialQuery(false);
		(async () => {
			const cached = await require_tab_coordinator.readPersistedWorkspace(cacheKey);
			if (cancelled) return;
			if (cached) store.setInitial(cached.workspace);
			if (!cached || !fetchDelta) {
				setNeedsInitialQuery(true);
				return;
			}
			try {
				const delta = await fetchDelta(cached.version);
				if (!cancelled) store.applyDelta(delta);
			} catch {
				if (!cancelled) setNeedsInitialQuery(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		cacheKey,
		fetchDelta,
		store
	]);
	return { needsInitialQuery };
}
//#endregion
//#region src/frontend/use-tab-coordination.ts
/**
* Binds a tab coordinator's lifetime to the component and its driver role to
* React state, so the provider can gate polling on it.
*
* Without an anchor there is nothing to key the coordination on, so the tab
* stays independent and calls itself the driver — which is what every tab did
* before any of this existed.
*/
function useTabCoordination(options) {
	const { store, anchorType, anchorId, persist } = options;
	const [coordinator, setCoordinator] = (0, react.useState)(void 0);
	const [isDriver, setIsDriver] = (0, react.useState)(true);
	(0, react.useEffect)(() => {
		if (anchorType === void 0 || anchorId === void 0) return;
		setIsDriver(false);
		const created = require_tab_coordinator.createTabCoordinator({
			anchorType,
			anchorId,
			store,
			persist,
			onDriverChange: setIsDriver
		});
		setCoordinator(created);
		return () => {
			created.destroy();
			setCoordinator(void 0);
			setIsDriver(true);
		};
	}, [
		anchorType,
		anchorId,
		persist,
		store
	]);
	return {
		applyDelta: (0, react.useMemo)(() => coordinator?.applyAndBroadcast ?? store.applyDelta, [coordinator, store]),
		isDriver
	};
}
//#endregion
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
const POLL_INTERVAL_MS = 1e4;
function createWorkspaceProvider(options) {
	const { useFoundationQuery, useFoundationDeltaQuery, Spinner, fetchDelta, anchor, persist = false } = options;
	const storeContext = (0, react.createContext)(void 0);
	const emptyStore = require_tab_coordinator.createWorkspaceStore();
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
		const [store] = (0, react.useState)(() => require_tab_coordinator.createWorkspaceStore());
		const anchorId = anchor?.getId();
		const key = anchor && anchorId !== void 0 ? require_tab_coordinator.workspaceKey(anchor.type, anchorId) : void 0;
		const { applyDelta, isDriver } = useTabCoordination({
			store,
			anchorType: anchor?.type,
			anchorId,
			persist
		});
		const { needsInitialQuery } = useCachedBootstrap({
			store,
			cacheKey: persist ? key : void 0,
			fetchDelta
		});
		const query = useFoundationQuery({ enabled: needsInitialQuery });
		(0, react.useEffect)(() => {
			if (query.data) store.setInitial(query.data);
		}, [query.data, store]);
		const workspace = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
		const version = store.getVersion();
		const deltaQuery = useFoundationDeltaQuery({ since: version }, {
			enabled: Boolean(version) && isDriver,
			refetchInterval: POLL_INTERVAL_MS
		});
		(0, react.useEffect)(() => {
			if (deltaQuery.data) applyDelta(deltaQuery.data);
		}, [deltaQuery.data, applyDelta]);
		const contextStore = (0, react.useMemo)(() => ({
			...store,
			applyDelta
		}), [store, applyDelta]);
		if (!workspace) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { className: "h-full" });
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(storeContext.Provider, {
			value: contextStore,
			children
		});
	};
	const TestWorkspaceProvider = ({ children, workspace }) => {
		const store = (0, react.useMemo)(() => {
			const testStore = require_tab_coordinator.createWorkspaceStore();
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
exports.clearWorkspaceCache = require_tab_coordinator.clearWorkspaceCache;
exports.createWorkspaceProvider = createWorkspaceProvider;
exports.shallowEqual = shallowEqual;

//# sourceMappingURL=frontend.cjs.map