import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspaceStore, workspaceVersionRef } from "./store";
import type { WorkspaceDelta } from "./types";

type Member = { id: number; name: string; updated_at: Date };
type Workspace = { members: Member[]; version: Date };

const baseDate = new Date("2024-01-01T00:00:00.000Z");
const laterDate = new Date("2024-06-01T00:00:00.000Z");
const latestDate = new Date("2024-09-01T00:00:00.000Z");

function makeWorkspace(version = baseDate): Workspace {
  return {
    members: [{ id: 1, name: "Alice", updated_at: baseDate }],
    version,
  };
}

function makeDelta(overrides: Partial<WorkspaceDelta> = {}): WorkspaceDelta {
  return { upserts: {}, deletes: {}, version: laterDate, ...overrides };
}

beforeEach(() => {
  workspaceVersionRef.current = undefined;
});

describe("createWorkspaceStore", () => {
  it("has no snapshot or version before setInitial", () => {
    const store = createWorkspaceStore<Workspace>();

    expect(store.getSnapshot()).toBeUndefined();
    expect(store.getVersion()).toBeUndefined();
  });

  it("exposes the workspace and its version after setInitial", () => {
    const store = createWorkspaceStore<Workspace>();
    const workspace = makeWorkspace();
    store.setInitial(workspace);

    expect(store.getSnapshot()).toBe(workspace);
    expect(store.getVersion()).toEqual(baseDate);
  });

  it("notifies subscribers on setInitial", () => {
    const store = createWorkspaceStore<Workspace>();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setInitial(makeWorkspace());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createWorkspaceStore<Workspace>();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setInitial(makeWorkspace());

    expect(listener).not.toHaveBeenCalled();
  });

  it("applies a delta and advances the version", () => {
    const store = createWorkspaceStore<Workspace>();
    store.setInitial(makeWorkspace());
    store.applyDelta(
      makeDelta({
        upserts: { member: [{ id: 2, name: "Bob", updated_at: laterDate }] },
      }),
    );

    expect(store.getSnapshot()?.members).toHaveLength(2);
    expect(store.getVersion()).toEqual(laterDate);
  });

  it("ignores a delta that arrives before the initial workspace", () => {
    const store = createWorkspaceStore<Workspace>();
    const listener = vi.fn();
    store.subscribe(listener);
    store.applyDelta(
      makeDelta({
        upserts: { member: [{ id: 2, name: "Bob", updated_at: laterDate }] },
      }),
    );

    expect(store.getSnapshot()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  // A poll, a sibling tab's broadcast and a self-poke can all deliver the same
  // change; only the first may reach subscribers.
  it("no-ops on a replayed delta", () => {
    const store = createWorkspaceStore<Workspace>();
    store.setInitial(makeWorkspace());
    const delta = makeDelta({
      upserts: { member: [{ id: 2, name: "Bob", updated_at: laterDate }] },
    });
    store.applyDelta(delta);

    const afterFirst = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.applyDelta(delta);

    expect(store.getSnapshot()).toBe(afterFirst);
    expect(listener).not.toHaveBeenCalled();
  });

  it("no-ops on an empty delta whose version matches the store", () => {
    const store = createWorkspaceStore<Workspace>();
    store.setInitial(makeWorkspace());
    const listener = vi.fn();
    store.subscribe(listener);
    store.applyDelta(makeDelta({ version: baseDate }));

    expect(listener).not.toHaveBeenCalled();
  });

  it("no-ops on a delta older than the store's version", () => {
    const store = createWorkspaceStore<Workspace>();
    store.setInitial(makeWorkspace(latestDate));
    const listener = vi.fn();
    store.subscribe(listener);
    store.applyDelta(
      makeDelta({
        version: laterDate,
        upserts: { member: [{ id: 2, name: "Bob", updated_at: laterDate }] },
      }),
    );

    expect(store.getSnapshot()?.members).toHaveLength(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("replaces the snapshot on setInitial after a delta", () => {
    const store = createWorkspaceStore<Workspace>();
    store.setInitial(makeWorkspace());
    store.applyDelta(
      makeDelta({
        upserts: { member: [{ id: 2, name: "Bob", updated_at: laterDate }] },
      }),
    );
    const fresh = makeWorkspace(latestDate);
    store.setInitial(fresh);

    expect(store.getSnapshot()).toBe(fresh);
    expect(store.getVersion()).toEqual(latestDate);
  });
});

describe("workspaceVersionRef", () => {
  it("tracks the store's version", () => {
    const store = createWorkspaceStore<Workspace>();
    store.setInitial(makeWorkspace());
    expect(workspaceVersionRef.current).toEqual(baseDate);

    store.applyDelta(
      makeDelta({
        upserts: { member: [{ id: 2, name: "Bob", updated_at: laterDate }] },
      }),
    );
    expect(workspaceVersionRef.current).toEqual(laterDate);
  });
});
