import { describe, expect, it } from "vitest";

import { applyWorkspaceDelta } from "./apply-delta";
import type { WorkspaceDelta } from "./types";

type Member = { id: number; name: string; updated_at: Date };
type Tracker = { id: number; label: string; updated_at: Date };
type Workspace = {
  members: Member[];
  trackers: Tracker[];
  version: Date | null;
};

const baseDate = new Date("2024-01-01T00:00:00.000Z");
const laterDate = new Date("2024-06-01T00:00:00.000Z");

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    members: [
      { id: 1, name: "Alice", updated_at: baseDate },
      { id: 2, name: "Bob", updated_at: baseDate },
    ],
    trackers: [{ id: 10, label: "Sleep", updated_at: baseDate }],
    version: baseDate,
    ...overrides,
  };
}

function makeDelta(overrides: Partial<WorkspaceDelta> = {}): WorkspaceDelta {
  return {
    upserts: {},
    deletes: {},
    version: laterDate,
    ...overrides,
  };
}

describe("applyWorkspaceDelta", () => {
  it("does not mutate the original workspace", () => {
    const workspace = makeWorkspace();
    const original = JSON.stringify(workspace);
    applyWorkspaceDelta(workspace, makeDelta());
    expect(JSON.stringify(workspace)).toBe(original);
  });

  it("upserts a new record into the correct table", () => {
    const workspace = makeWorkspace();
    const newMember = { id: 3, name: "Carol", updated_at: laterDate };
    const delta = makeDelta({ upserts: { member: [newMember] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).toHaveLength(3);
    expect(result.members.find((m) => m.id === 3)?.name).toBe("Carol");
  });

  it("updates an existing record by id", () => {
    const workspace = makeWorkspace();
    const updated = { id: 1, name: "Alice Updated", updated_at: laterDate };
    const delta = makeDelta({ upserts: { member: [updated] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).toHaveLength(2);
    expect(result.members.find((m) => m.id === 1)?.name).toBe("Alice Updated");
  });

  it("updates a record in place rather than reordering the table", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({
      upserts: { member: [{ id: 1, name: "Alice Updated", updated_at: laterDate }] },
    });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members.map((m) => m.id)).toEqual([1, 2]);
  });

  it("removes deleted records", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({ deletes: { member: [2] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).toHaveLength(1);
    expect(result.members.find((m) => m.id === 2)).toBeUndefined();
  });

  it("applies an upsert and a delete to the same table", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({
      upserts: { member: [{ id: 3, name: "Carol", updated_at: laterDate }] },
      deletes: { member: [1] },
    });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members.map((m) => m.id)).toEqual([2, 3]);
  });

  it("advances version when delta version is newer", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({ version: laterDate });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.version).toEqual(laterDate);
  });

  it("does not roll back version when delta version is older", () => {
    const workspace = makeWorkspace({ version: laterDate });
    const olderDate = new Date("2023-01-01T00:00:00.000Z");
    const delta = makeDelta({ version: olderDate });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.version).toEqual(laterDate);
  });

  it("ignores upserts for unknown table keys", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({ upserts: { unknown_table: [{ id: 99 }] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).toHaveLength(2);
  });
});

// Selectors compare by reference, so a delta must not hand new identities to
// rows and tables it did not touch — otherwise every selector fires on every
// change and the whole feature is a no-op.
describe("applyWorkspaceDelta structural sharing", () => {
  it("keeps the array reference of a table the delta does not touch", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({
      upserts: { member: [{ id: 1, name: "Alice Updated", updated_at: laterDate }] },
    });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.trackers).toBe(workspace.trackers);
  });

  it("keeps row references for untouched rows of a touched table", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({
      upserts: { member: [{ id: 1, name: "Alice Updated", updated_at: laterDate }] },
    });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members[1]).toBe(workspace.members[1]);
    expect(result.members[0]).not.toBe(workspace.members[0]);
  });

  it("gives a touched table a new array reference", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({
      upserts: { member: [{ id: 1, name: "Alice Updated", updated_at: laterDate }] },
    });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).not.toBe(workspace.members);
  });

  it("keeps row references for untouched rows after a delete", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({ deletes: { member: [2] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members[0]).toBe(workspace.members[0]);
  });

  it("keeps the table reference when a delete removes nothing", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({ deletes: { member: [999] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).toBe(workspace.members);
  });

  it("returns the same workspace for a delta that changes nothing", () => {
    const workspace = makeWorkspace({ version: laterDate });
    const delta = makeDelta({ version: laterDate });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result).toBe(workspace);
  });
});
