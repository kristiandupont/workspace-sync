Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_context = require("./context-CSF-QrpS.cjs");
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/frontend/index.tsx
function createWorkspaceProvider(options) {
	const { useFoundationQuery, useFoundationDeltaQuery, Spinner } = options;
	const { workspaceContext: foundationContext, applyDeltaContext, useWorkspace, useApplyDelta } = require_context.createWorkspaceContext();
	const WorkspaceProvider = ({ children }) => {
		const q = useFoundationQuery();
		const [foundation, setFoundation] = (0, react.useState)(q.data);
		const [version, setVersion] = (0, react.useState)(q.data?.version);
		(0, react.useEffect)(() => {
			if (q.data) {
				setFoundation(q.data);
				const v = q.data.version;
				setVersion(v);
				if (v) require_context.workspaceVersionRef.current = v;
			}
		}, [q.data]);
		(0, react.useEffect)(() => {
			if (version) require_context.workspaceVersionRef.current = version;
		}, [version]);
		const handleApplyDelta = (0, react.useCallback)((delta) => {
			setFoundation((prev) => {
				if (!prev) return prev;
				const updated = require_context.applyWorkspaceDelta(prev, delta);
				const v = updated.version;
				setVersion(v);
				return updated;
			});
		}, []);
		const deltaQuery = useFoundationDeltaQuery({ since: version }, {
			enabled: Boolean(version),
			refetchInterval: 1e4
		});
		(0, react.useEffect)(() => {
			if (deltaQuery.data) {
				if (deltaQuery.data.version.getTime() === version?.getTime()) return;
				handleApplyDelta(deltaQuery.data);
			}
		}, [
			deltaQuery.data,
			version,
			handleApplyDelta
		]);
		if (!foundation) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, { className: "h-full" });
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(foundationContext.Provider, {
			value: foundation,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(applyDeltaContext.Provider, {
				value: handleApplyDelta,
				children
			})
		});
	};
	const TestWorkspaceProvider = ({ children, workspace }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(foundationContext.Provider, {
		value: workspace,
		children
	});
	return {
		foundationContext,
		applyDeltaContext,
		useWorkspace,
		useApplyDelta,
		WorkspaceProvider,
		TestWorkspaceProvider
	};
}
//#endregion
exports.createWorkspaceProvider = createWorkspaceProvider;

//# sourceMappingURL=frontend.cjs.map