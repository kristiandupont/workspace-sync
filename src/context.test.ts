import { describe, expect, it } from "vitest";

import { applyWorkspaceDelta, workspaceVersionRef } from "../context";
import type { WorkspaceDelta } from "../types";

type Member = { id: number; name: string; updated_at: Date };
type Workspace = {
  members: Member[];
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

  it("removes deleted records", () => {
    const workspace = makeWorkspace();
    const delta = makeDelta({ deletes: { member: [2] } });
    const result = applyWorkspaceDelta<Workspace>(workspace, delta);

    expect(result.members).toHaveLength(1);
    expect(result.members.find((m) => m.id === 2)).toBeUndefined();
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

describe("workspaceVersionRef", () => {
  it("is initially undefined", () => {
    expect(workspaceVersionRef.current).toBeUndefined();
  });

  it("can be assigned and read back", () => {
    workspaceVersionRef.current = baseDate;
    expect(workspaceVersionRef.current).toEqual(baseDate);
    workspaceVersionRef.current = undefined;
  });
});
