import { n as WorkspaceDelta } from "./types-LCCUSy-n.cjs";
import { ComponentType, FC, ReactNode } from "react";

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
  foundationContext: import("react").Context<TFoundation | undefined>;
  applyDeltaContext: import("react").Context<((delta: WorkspaceDelta) => void) | undefined>;
  useWorkspace: () => TFoundation;
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
export { createWorkspaceProvider };
//# sourceMappingURL=frontend.d.cts.map