import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceStore } from "../store";
import type { WorkspaceDelta } from "../types";
import type { WorkspaceMessage } from "./channel";
import type { TabCoordinator } from "./index";
import { createTabCoordinator, workspaceKey } from "./index";
import { clearWorkspaceCache, readPersistedWorkspace } from "./snapshot-store";

// Two coordinators in one process are two tabs: Node gives us a real Web Locks
// implementation and a real BroadcastChannel that delivers to every instance
// but the sender, which is exactly the browser contract these rely on.

type Member = { id: number; name: string; updated_at: Date };
type Workspace = { members: Member[]; version: Date };

const v1 = new Date("2024-01-01T00:00:00.000Z");
const v2 = new Date("2024-02-01T00:00:00.000Z");
const v3 = new Date("2024-03-01T00:00:00.000Z");

/** Locks, channels and cache records are all process-wide and outlive a test,
 * so every test gets an anchor of its own. */
let anchorSeed = 0;
const nextAnchorId = () => ++anchorSeed;

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeWorkspace(version: Date): Workspace {
  return { members: [{ id: 1, name: "Alice", updated_at: v1 }], version };
}

function addMemberDelta(version: Date): WorkspaceDelta {
  return {
    upserts: { member: [{ id: 2, name: "Bob", updated_at: version }] },
    deletes: {},
    version,
  };
}

const openCoordinators: TabCoordinator[] = [];
const openChannels: BroadcastChannel[] = [];
const releaseLocks: (() => void)[] = [];

function openTab(
  anchorId: number,
  options: { workspace?: Workspace; persist?: boolean } = {},
) {
  const store = createWorkspaceStore<Workspace>();
  if (options.workspace) store.setInitial(options.workspace);

  const coordinator = createTabCoordinator({
    anchorType: "member",
    anchorId,
    store,
    persist: options.persist,
  });
  openCoordinators.push(coordinator);

  return { store, coordinator };
}

/** Watches the wire directly, to assert what is (and is not) sent. */
function watchChannel(anchorId: number) {
  const messages: WorkspaceMessage<Workspace>[] = [];
  const channel = new BroadcastChannel(
    `workspace:${workspaceKey("member", anchorId)}`,
  );
  channel.onmessage = (event: MessageEvent<WorkspaceMessage<Workspace>>) =>
    messages.push(event.data);
  openChannels.push(channel);
  return { messages, post: (m: WorkspaceMessage<Workspace>) => channel.postMessage(m) };
}

/** Holds the driver lock so the next tab opened on this anchor cannot win it. */
async function occupyDriverRole(anchorId: number) {
  await new Promise<void>((acquired) => {
    void navigator.locks.request(
      `workspace-driver:${workspaceKey("member", anchorId)}`,
      () => {
        acquired();
        return new Promise<void>((release) => releaseLocks.push(release));
      },
    );
  });
}

afterEach(async () => {
  for (const coordinator of openCoordinators.splice(0)) coordinator.destroy();
  for (const channel of openChannels.splice(0)) {
    channel.onmessage = null;
    channel.close();
  }
  for (const release of releaseLocks.splice(0)) release();
  await clearWorkspaceCache();
});

describe("createTabCoordinator", () => {
  it("hands a delta to a sibling tab", async () => {
    const anchorId = nextAnchorId();
    const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
    const b = openTab(anchorId, { workspace: makeWorkspace(v1) });
    await tick();

    a.coordinator.applyAndBroadcast(addMemberDelta(v2));
    await tick();

    expect(b.store.getSnapshot()?.members).toHaveLength(2);
    expect(b.store.getVersion()).toEqual(v2);
  });

  it("elects exactly one driver", async () => {
    const anchorId = nextAnchorId();
    const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
    const b = openTab(anchorId, { workspace: makeWorkspace(v1) });
    await tick();

    expect(a.coordinator.isDriver()).toBe(true);
    expect(b.coordinator.isDriver()).toBe(false);
  });

  it("passes the driver role on when the driver tab is destroyed", async () => {
    const anchorId = nextAnchorId();
    const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
    const b = openTab(anchorId, { workspace: makeWorkspace(v1) });
    await tick();

    a.coordinator.destroy();
    await tick();

    expect(b.coordinator.isDriver()).toBe(true);
  });

  // A delta the store discarded holds nothing for a sibling either — and its
  // `since` would sit at our version, which any tab behind us would read as a
  // gap and answer with a full resync it does not need.
  it("does not put a replayed delta on the wire", async () => {
    const anchorId = nextAnchorId();
    const watcher = watchChannel(anchorId);
    const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
    await tick();

    a.coordinator.applyAndBroadcast(addMemberDelta(v2));
    a.coordinator.applyAndBroadcast(addMemberDelta(v2));
    await tick();

    expect(watcher.messages.filter((m) => m.type === "delta")).toHaveLength(1);
  });

  it("broadcasts a delta with the version it was applied on top of", async () => {
    const anchorId = nextAnchorId();
    const watcher = watchChannel(anchorId);
    const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
    await tick();

    a.coordinator.applyAndBroadcast(addMemberDelta(v2));
    await tick();

    expect(watcher.messages[0]).toMatchObject({ type: "delta", since: v1 });
  });

  describe("the gap rule", () => {
    it("resyncs a tab that would otherwise skip changes", async () => {
      const anchorId = nextAnchorId();
      const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
      const b = openTab(anchorId, { workspace: makeWorkspace(v1) });
      await tick();

      // B misses this one entirely — it was asleep in bfcache.
      a.store.applyDelta(addMemberDelta(v2));
      // So the next broadcast starts after where B is.
      a.coordinator.applyAndBroadcast({
        upserts: { member: [{ id: 3, name: "Cleo", updated_at: v3 }] },
        deletes: {},
        version: v3,
      });
      await tick();
      await tick();

      // B asked for the whole snapshot rather than applying onto a hole.
      expect(b.store.getVersion()).toEqual(v3);
      expect(b.store.getSnapshot()?.members.map((m) => m.name)).toEqual([
        "Alice",
        "Bob",
        "Cleo",
      ]);
    });

    it("applies without resyncing when there is no gap", async () => {
      const anchorId = nextAnchorId();
      const watcher = watchChannel(anchorId);
      const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
      openTab(anchorId, { workspace: makeWorkspace(v1) });
      await tick();

      a.coordinator.applyAndBroadcast(addMemberDelta(v2));
      await tick();
      await tick();

      expect(watcher.messages.some((m) => m.type === "state-request")).toBe(
        false,
      );
    });
  });

  describe("state requests", () => {
    it("are answered by the driver", async () => {
      const anchorId = nextAnchorId();
      const watcher = watchChannel(anchorId);
      openTab(anchorId, { workspace: makeWorkspace(v2) });
      await tick();

      watcher.post({ type: "state-request" });
      await tick();

      expect(watcher.messages).toContainEqual(
        expect.objectContaining({ type: "state", version: v2 }),
      );
    });

    // One reply per resync, not one per open tab.
    it("are ignored by a non-driver", async () => {
      const anchorId = nextAnchorId();
      await occupyDriverRole(anchorId);
      const watcher = watchChannel(anchorId);
      const b = openTab(anchorId, { workspace: makeWorkspace(v2) });
      await tick();
      expect(b.coordinator.isDriver()).toBe(false);

      watcher.post({ type: "state-request" });
      await tick();

      expect(watcher.messages.some((m) => m.type === "state")).toBe(false);
    });

    it("never move a tab backwards", async () => {
      const anchorId = nextAnchorId();
      const watcher = watchChannel(anchorId);
      const a = openTab(anchorId, { workspace: makeWorkspace(v3) });
      await tick();

      watcher.post({ type: "state", version: v2, workspace: makeWorkspace(v2) });
      await tick();

      expect(a.store.getVersion()).toEqual(v3);
    });
  });

  describe("persistence", () => {
    it("caches the driver's snapshot", async () => {
      const anchorId = nextAnchorId();
      const a = openTab(anchorId, { workspace: makeWorkspace(v1), persist: true });
      await tick();

      a.coordinator.applyAndBroadcast(addMemberDelta(v2));
      await wait(1100);

      const record = await readPersistedWorkspace<Workspace>(
        workspaceKey("member", anchorId),
      );
      expect(record?.version).toEqual(v2);
      expect(record?.anchorType).toBe("member");
      expect(record?.anchorId).toBe(anchorId);
      expect(record?.workspace.members).toHaveLength(2);
    });

    // N tabs would otherwise write N copies of the same snapshot.
    it("is left to the driver", async () => {
      const anchorId = nextAnchorId();
      await occupyDriverRole(anchorId);
      openTab(anchorId, { workspace: makeWorkspace(v1), persist: true });
      await wait(1100);

      expect(
        await readPersistedWorkspace(workspaceKey("member", anchorId)),
      ).toBeUndefined();
    });

    it("does not happen unless asked for", async () => {
      const anchorId = nextAnchorId();
      const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
      await tick();

      a.coordinator.applyAndBroadcast(addMemberDelta(v2));
      await wait(1100);

      expect(
        await readPersistedWorkspace(workspaceKey("member", anchorId)),
      ).toBeUndefined();
    });

    it("stops once the tab is destroyed", async () => {
      const anchorId = nextAnchorId();
      const a = openTab(anchorId, { workspace: makeWorkspace(v1), persist: true });
      await tick();

      a.coordinator.applyAndBroadcast(addMemberDelta(v2));
      a.coordinator.destroy();
      await wait(1100);

      expect(
        await readPersistedWorkspace(workspaceKey("member", anchorId)),
      ).toBeUndefined();
    });
  });

  it("goes quiet once destroyed", async () => {
    const anchorId = nextAnchorId();
    const a = openTab(anchorId, { workspace: makeWorkspace(v1) });
    const b = openTab(anchorId, { workspace: makeWorkspace(v1) });
    await tick();

    b.coordinator.destroy();
    a.coordinator.applyAndBroadcast(addMemberDelta(v2));
    await tick();

    expect(b.store.getVersion()).toEqual(v1);
  });
});
