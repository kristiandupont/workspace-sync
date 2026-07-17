import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedWorkspace } from "./snapshot-store";
import {
  clearWorkspaceCache,
  readPersistedWorkspace,
  writePersistedWorkspace,
} from "./snapshot-store";

type Workspace = { members: { id: number; name: string }[]; version: Date };

const version = new Date("2024-01-01T00:00:00.000Z");

function makeRecord(
  overrides: Partial<PersistedWorkspace<Workspace>> = {},
): PersistedWorkspace<Workspace> {
  return {
    key: "member:1",
    anchorType: "member",
    anchorId: 1,
    version,
    workspace: { members: [{ id: 1, name: "Alice" }], version },
    ...overrides,
  };
}

beforeEach(async () => {
  await clearWorkspaceCache();
});

describe("persisted workspaces", () => {
  it("round-trips a snapshot, keeping Dates as Dates", async () => {
    await writePersistedWorkspace(makeRecord());
    const record = await readPersistedWorkspace<Workspace>("member:1");

    expect(record?.workspace.members).toEqual([{ id: 1, name: "Alice" }]);
    // Structured clone, not JSON: a revived string here would break every
    // version comparison downstream.
    expect(record?.version).toBeInstanceOf(Date);
    expect(record?.version).toEqual(version);
    expect(record?.workspace.version).toBeInstanceOf(Date);
  });

  it("has nothing for an unknown key", async () => {
    expect(await readPersistedWorkspace("member:404")).toBeUndefined();
  });

  it("replaces the record for a key it already holds", async () => {
    const laterVersion = new Date("2024-06-01T00:00:00.000Z");
    await writePersistedWorkspace(makeRecord());
    await writePersistedWorkspace(
      makeRecord({
        version: laterVersion,
        workspace: {
          members: [{ id: 1, name: "Alice Updated" }],
          version: laterVersion,
        },
      }),
    );

    const record = await readPersistedWorkspace<Workspace>("member:1");
    expect(record?.version).toEqual(laterVersion);
    expect(record?.workspace.members[0]?.name).toBe("Alice Updated");
  });

  // The whole point of the typed key: two logins in one browser, or a member
  // and an organization that happen to share an id, must never read each
  // other's snapshot.
  it("keeps anchors of the same id but different types apart", async () => {
    await writePersistedWorkspace(makeRecord());
    await writePersistedWorkspace(
      makeRecord({
        key: "organization:1",
        anchorType: "organization",
        workspace: { members: [{ id: 9, name: "Org member" }], version },
      }),
    );

    const member = await readPersistedWorkspace<Workspace>("member:1");
    const organization = await readPersistedWorkspace<Workspace>(
      "organization:1",
    );

    expect(member?.workspace.members[0]?.name).toBe("Alice");
    expect(organization?.workspace.members[0]?.name).toBe("Org member");
  });

  it("keeps different anchor ids apart", async () => {
    await writePersistedWorkspace(makeRecord());
    await writePersistedWorkspace(
      makeRecord({
        key: "member:2",
        anchorId: 2,
        workspace: { members: [{ id: 2, name: "Bob" }], version },
      }),
    );

    expect(
      (await readPersistedWorkspace<Workspace>("member:1"))?.workspace
        .members[0]?.name,
    ).toBe("Alice");
    expect(
      (await readPersistedWorkspace<Workspace>("member:2"))?.workspace
        .members[0]?.name,
    ).toBe("Bob");
  });

  it("clears every workspace, not just one", async () => {
    await writePersistedWorkspace(makeRecord());
    await writePersistedWorkspace(makeRecord({ key: "member:2", anchorId: 2 }));

    await clearWorkspaceCache();

    expect(await readPersistedWorkspace("member:1")).toBeUndefined();
    expect(await readPersistedWorkspace("member:2")).toBeUndefined();
  });
});

// A missing or refused IndexedDB is a cold boot, never a crash: the initial
// query is always there to fall back on.
describe("without IndexedDB", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function importWithoutIndexedDb() {
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    return import("./snapshot-store");
  }

  it("reads as a miss", async () => {
    const { readPersistedWorkspace: read } = await importWithoutIndexedDb();
    expect(await read("member:1")).toBeUndefined();
  });

  it("swallows writes", async () => {
    const { writePersistedWorkspace: write } = await importWithoutIndexedDb();
    await expect(write(makeRecord())).resolves.toBeUndefined();
  });

  it("swallows clears", async () => {
    const { clearWorkspaceCache: clear } = await importWithoutIndexedDb();
    await expect(clear()).resolves.toBeUndefined();
  });
});
