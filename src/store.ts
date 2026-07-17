import { applyWorkspaceDelta } from "./apply-delta";
import type { WorkspaceDelta } from "./types";

/**
 * Read by Cedar's tRPC client to send the `x-workspace-version` header, which
 * is how a mutation knows which delta to compute for the caller. Kept in sync
 * by every store. NOTE: this is a module-level singleton, so a client holding
 * more than one workspace at a time would have them fight over it.
 */
export const workspaceVersionRef: { current: Date | undefined } = {
  current: undefined,
};

export interface WorkspaceStore<T> {
  getSnapshot(): T | undefined;
  getVersion(): Date | undefined;
  setInitial(workspace: T): void;
  /** No-op when the delta's version does not advance past the store's. */
  applyDelta(delta: WorkspaceDelta): void;
  subscribe(listener: () => void): () => void;
}

function versionOf<T>(workspace: T): Date | undefined {
  return (workspace as { version?: Date | null }).version ?? undefined;
}

/**
 * Framework-agnostic holder of one workspace. React binds to it via
 * `useSyncExternalStore`; tab coordination and server pokes talk to it
 * directly. Nothing here may import React.
 */
export function createWorkspaceStore<T>(): WorkspaceStore<T> {
  let snapshot: T | undefined;
  let version: Date | undefined;
  const listeners = new Set<() => void>();

  function commit(next: T): void {
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

    // The guard is what makes duplicate and spurious deltas harmless: a poll,
    // a broadcast from a sibling tab and a self-poke can all deliver the same
    // change. `version` means "I hold everything up to here", and every delta
    // carries everything since a version at or below the store's, so a delta
    // that does not advance the version holds nothing the store lacks.
    applyDelta(delta) {
      if (snapshot === undefined) return;
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
    },
  };
}
