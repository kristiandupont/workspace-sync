import type { ComponentType, FC, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { applyWorkspaceDelta, createWorkspaceContext, workspaceVersionRef } from "../context";
import type { WorkspaceDelta } from "../types";

export function createWorkspaceProvider<TFoundation>(options: {
  useFoundationQuery: () => { data: TFoundation | undefined };
  useFoundationDeltaQuery: (
    input: { since: Date },
    queryOptions: { enabled: boolean; refetchInterval: number },
  ) => { data: WorkspaceDelta | undefined };
  Spinner: ComponentType<{ className?: string }>;
}) {
  const { useFoundationQuery, useFoundationDeltaQuery, Spinner } = options;

  const {
    workspaceContext: foundationContext,
    applyDeltaContext,
    useWorkspace,
    useApplyDelta,
  } = createWorkspaceContext<TFoundation>();

  const WorkspaceProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const q = useFoundationQuery();
    const [foundation, setFoundation] = useState<TFoundation | undefined>(
      q.data,
    );
    const [version, setVersion] = useState<Date | undefined>(
      (q.data as { version?: Date } | undefined)?.version,
    );

    useEffect(() => {
      if (q.data) {
        setFoundation(q.data);
        const v = (q.data as { version?: Date }).version;
        setVersion(v);
        if (v) workspaceVersionRef.current = v;
      }
    }, [q.data]);

    useEffect(() => {
      if (version) {
        workspaceVersionRef.current = version;
      }
    }, [version]);

    const handleApplyDelta = useCallback((delta: WorkspaceDelta) => {
      setFoundation((prev) => {
        if (!prev) return prev;
        const updated = applyWorkspaceDelta(prev, delta);
        const v = (updated as { version?: Date }).version;
        setVersion(v);
        return updated;
      });
    }, []);

    const deltaQuery = useFoundationDeltaQuery(
      { since: version! },
      { enabled: Boolean(version), refetchInterval: 10000 },
    );

    useEffect(() => {
      if (deltaQuery.data) {
        if (
          deltaQuery.data.version.getTime() === version?.getTime()
        ) {
          return;
        }
        handleApplyDelta(deltaQuery.data);
      }
    }, [deltaQuery.data, version, handleApplyDelta]);

    if (!foundation) {
      return <Spinner className="h-full" />;
    }

    return (
      <foundationContext.Provider value={foundation}>
        <applyDeltaContext.Provider value={handleApplyDelta}>
          {children}
        </applyDeltaContext.Provider>
      </foundationContext.Provider>
    );
  };

  const TestWorkspaceProvider: FC<{
    children: ReactNode;
    workspace: TFoundation;
  }> = ({ children, workspace }) => (
    <foundationContext.Provider value={workspace}>
      {children}
    </foundationContext.Provider>
  );

  return {
    foundationContext,
    applyDeltaContext,
    useWorkspace,
    useApplyDelta,
    WorkspaceProvider,
    TestWorkspaceProvider,
  };
}
