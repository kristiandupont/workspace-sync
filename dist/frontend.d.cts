import { n as WorkspaceDelta } from "./types-LCCUSy-n.cjs";
import { t as WorkspaceStore } from "./store-BZgKstJI.cjs";
import { ComponentType, FC, ReactNode } from "react";

//#region src/frontend/by-id.d.ts
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
declare function byId<TRow extends {
  id: number | string;
}>(rows: readonly TRow[]): Map<TRow["id"], TRow>;
//#endregion
//#region src/frontend/shallow-equal.d.ts
/**
 * Compares own enumerable properties with `Object.is`. Pass as the `isEqual`
 * argument of `useWorkspaceSelector` when the selector builds a fresh object or
 * array each run (`w => ({ a: w.a, b: w.b })`), which `Object.is` would treat
 * as changed every time.
 */
declare function shallowEqual<T>(a: T, b: T): boolean;
//#endregion
//#region src/frontend/index.d.ts
declare function createWorkspaceProvider<TFoundation>(options: {
  useFoundationQuery: () => {
    data: TFoundation | undefined;
  };
  useFoundationDeltaQuery: (input: {
    since: Date;
  }, queryOptions: {
    enabled: boolean;
    refetchInterval: number;
  }) => {
    data: WorkspaceDelta | undefined;
  };
  Spinner: ComponentType<{
    className?: string;
  }>;
}): {
  storeContext: import("react").Context<WorkspaceStore<TFoundation> | undefined>;
  useWorkspace: () => TFoundation;
  useOptionalWorkspace: () => TFoundation | undefined;
  useWorkspaceSelector: <S>(selector: (workspace: TFoundation) => S, isEqual?: (a: S, b: S) => boolean) => S;
  useOptionalWorkspaceSelector: <S>(selector: (workspace: TFoundation) => S, isEqual?: (a: S | undefined, b: S | undefined) => boolean) => S | undefined;
  useApplyDelta: () => (delta: WorkspaceDelta) => void;
  WorkspaceProvider: FC<{
    children: ReactNode;
  }>;
  TestWorkspaceProvider: FC<{
    children: ReactNode;
    workspace: TFoundation;
  }>;
};
//#endregion
export { byId, createWorkspaceProvider, shallowEqual };
//# sourceMappingURL=frontend.d.cts.map