/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext } from "react";
import type { WorkspaceDelta } from "./types";
import { snakeToCamelPlural } from "./utils";

export const workspaceVersionRef: { current: Date | undefined } = {
  current: undefined,
};

function cloneRecord<T>(record: T): T {
  return typeof structuredClone === "function"
    ? (structuredClone(record) as T)
    : (JSON.parse(JSON.stringify(record)) as T);
}

export function applyWorkspaceDelta<T>(workspace: T, delta: WorkspaceDelta): T {
  const updated = { ...workspace } as any;

  for (const [tableName, rows] of Object.entries(delta.upserts)) {
    if (rows.length === 0) continue;
    const key = snakeToCamelPlural(tableName);
    if (!(key in updated)) continue;
    const recordMap = new Map(
      (updated[key] as any[]).map((r: any) => [r.id, cloneRecord(r)]),
    );
    for (const row of rows) recordMap.set(row.id, cloneRecord(row));
    updated[key] = Array.from(recordMap.values());
  }

  for (const [tableName, ids] of Object.entries(delta.deletes)) {
    if (ids.length === 0) continue;
    const key = snakeToCamelPlural(tableName);
    if (!(key in updated)) continue;
    const idsToDelete = new Set(ids);
    updated[key] = (updated[key] as any[]).filter(
      (r: any) => !idsToDelete.has(r.id),
    );
  }

  if (delta.version > (updated as any).version) {
    updated.version = delta.version;
  }

  return updated as T;
}

export function createWorkspaceContext<T>() {
  const workspaceContext = createContext<T | undefined>(undefined);
  const applyDeltaContext = createContext<
    ((delta: WorkspaceDelta) => void) | undefined
  >(undefined);

  function useWorkspace(): T {
    return useContext(workspaceContext)!;
  }

  function useApplyDelta(): (delta: WorkspaceDelta) => void {
    const fn = useContext(applyDeltaContext);
    if (!fn)
      throw new Error("useApplyDelta must be used within a WorkspaceProvider");
    return fn;
  }

  return {
    workspaceContext,
    applyDeltaContext,
    useWorkspace,
    useApplyDelta,
  };
}
