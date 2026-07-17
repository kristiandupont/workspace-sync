/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { FC } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceKey } from "../tab-coordinator";
import {
  clearWorkspaceCache,
  readPersistedWorkspace,
  writePersistedWorkspace,
} from "../tab-coordinator/snapshot-store";
import type { WorkspaceDelta } from "../types";
import { createWorkspaceProvider } from "./index";

// Covers what Phase 2 added to the provider: booting from the cache, polling in
// one tab only, and feeding the others. jsdom has a working BroadcastChannel but
// no Web Locks, so election is faked here — the real lock semantics are covered
// against Node's implementation in `tab-coordinator/driver-election.test.ts`.

type Member = { id: number; name: string; updated_at: Date };
type Foundation = { members: Member[]; version: Date };

const v1 = new Date("2024-01-01T00:00:00.000Z");
const v2 = new Date("2024-06-01T00:00:00.000Z");

let anchorSeed = 0;
const nextAnchorId = () => ++anchorSeed;

const makeFoundation = (version = v1): Foundation => ({
  members: [{ id: 1, name: "Alice", updated_at: v1 }],
  version,
});

const renameDelta = (name: string, version = v2): WorkspaceDelta => ({
  upserts: { member: [{ id: 1, name, updated_at: version }] },
  deletes: {},
  version,
});

/** Grants a key to its first claimant and leaves later ones queued — enough to
 * pin down who drives, which is all the provider reacts to. */
function installFakeLocks() {
  const holders = new Set<string>();
  const waiters = new Map<string, (() => void)[]>();

  const locks = {
    async request(name: string, optionsOrCallback: unknown, maybeCallback?: unknown) {
      const callback = (maybeCallback ?? optionsOrCallback) as () => Promise<void>;

      if (holders.has(name)) {
        await new Promise<void>((resolve) => {
          waiters.set(name, [...(waiters.get(name) ?? []), resolve]);
        });
      }
      holders.add(name);
      try {
        await callback();
      } finally {
        holders.delete(name);
        waiters.get(name)?.shift()?.();
      }
    },
  };

  vi.stubGlobal("navigator", { locks });
}

/**
 * Stands in for the tRPC query hooks. `enabled` is recorded rather than obeyed:
 * the assertion that matters is what the provider *asked* for, since that is
 * what decides whether react-query would hit the network.
 */
function createHarness(
  options: {
    anchorId?: number;
    persist?: boolean;
    fetchDelta?: (since: Date) => Promise<WorkspaceDelta>;
  } = {},
) {
  const foundationQueryEnabled: boolean[] = [];
  const deltaQueryEnabled: boolean[] = [];
  let setFoundation: ((data: Foundation) => void) | undefined;
  let setDelta: ((data: WorkspaceDelta) => void) | undefined;

  const factory = createWorkspaceProvider<Foundation>({
    useFoundationQuery: (queryOptions) => {
      foundationQueryEnabled.push(queryOptions.enabled);
      const [data, set] = useState<Foundation | undefined>(undefined);
      setFoundation = set;
      return { data };
    },
    useFoundationDeltaQuery: (_input, queryOptions) => {
      deltaQueryEnabled.push(queryOptions.enabled);
      const [data, set] = useState<WorkspaceDelta | undefined>(undefined);
      setDelta = set;
      return { data };
    },
    Spinner: () => <div>loading</div>,
    fetchDelta: options.fetchDelta,
    anchor:
      options.anchorId === undefined
        ? undefined
        : { type: "member", getId: () => options.anchorId },
    persist: options.persist,
  });

  return {
    ...factory,
    foundationQueryEnabled,
    deltaQueryEnabled,
    lastFoundationQueryEnabled: () => foundationQueryEnabled.at(-1),
    lastDeltaQueryEnabled: () => deltaQueryEnabled.at(-1),
    emitFoundation: (data: Foundation) => act(() => setFoundation!(data)),
    emitDelta: (data: WorkspaceDelta) => act(() => setDelta!(data)),
  };
}

const Name: FC<{ useWorkspace: () => Foundation }> = ({ useWorkspace }) => (
  <div>{useWorkspace().members[0].name}</div>
);

beforeEach(() => {
  installFakeLocks();
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clearWorkspaceCache();
});

describe("booting from the cache", () => {
  async function seedCache(anchorId: number, workspace: Foundation) {
    await writePersistedWorkspace({
      key: workspaceKey("member", anchorId),
      anchorType: "member",
      anchorId,
      version: workspace.version,
      workspace,
    });
  }

  it("renders cached content and skips the full fetch", async () => {
    const anchorId = nextAnchorId();
    await seedCache(anchorId, makeFoundation());
    const fetchDelta = vi.fn().mockResolvedValue(renameDelta("Alice", v1));
    const harness = createHarness({ anchorId, persist: true, fetchDelta });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeDefined());
    expect(harness.lastFoundationQueryEnabled()).toBe(false);
    // The full fetch is never even offered as an option before we know whether
    // there is a cache — otherwise it would race the thing meant to replace it.
    expect(harness.foundationQueryEnabled).not.toContain(true);
    expect(fetchDelta).toHaveBeenCalledWith(v1);
  });

  it("catches the cached snapshot up with a delta", async () => {
    const anchorId = nextAnchorId();
    await seedCache(anchorId, makeFoundation());
    const harness = createHarness({
      anchorId,
      persist: true,
      fetchDelta: vi.fn().mockResolvedValue(renameDelta("Alice Updated")),
    });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Alice Updated")).toBeDefined(),
    );
  });

  it("falls back to the full fetch when nothing is cached", async () => {
    const harness = createHarness({
      anchorId: nextAnchorId(),
      persist: true,
      fetchDelta: vi.fn(),
    });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );

    await waitFor(() => expect(harness.lastFoundationQueryEnabled()).toBe(true));
    expect(screen.getByText("loading")).toBeDefined();

    harness.emitFoundation(makeFoundation());
    expect(screen.getByText("Alice")).toBeDefined();
  });

  // Otherwise a snapshot the server can no longer delta from would wedge the
  // tab on stale state, with no path back to current.
  it("falls back to the full fetch when the catch-up fails", async () => {
    const anchorId = nextAnchorId();
    await seedCache(anchorId, makeFoundation());
    const harness = createHarness({
      anchorId,
      persist: true,
      fetchDelta: vi.fn().mockRejectedValue(new Error("offline")),
    });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );

    // The cached data still renders — a failed catch-up is not a failed boot.
    await waitFor(() => expect(screen.getByText("Alice")).toBeDefined());
    await waitFor(() => expect(harness.lastFoundationQueryEnabled()).toBe(true));
  });

  it("does not hold the fetch back when persistence is off", () => {
    const harness = createHarness({ anchorId: nextAnchorId() });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );

    expect(harness.foundationQueryEnabled[0]).toBe(true);
  });

  it("writes the driver's snapshot back for the next boot", async () => {
    const anchorId = nextAnchorId();
    const harness = createHarness({ anchorId, persist: true });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );

    await waitFor(() => expect(harness.lastFoundationQueryEnabled()).toBe(true));
    harness.emitFoundation(makeFoundation());

    await waitFor(
      async () => {
        const record = await readPersistedWorkspace<Foundation>(
          workspaceKey("member", anchorId),
        );
        expect(record?.workspace.members[0]?.name).toBe("Alice");
      },
      { timeout: 3000 },
    );
  });
});

describe("multi-tab", () => {
  it("polls in the driver tab only", async () => {
    const anchorId = nextAnchorId();
    const driver = createHarness({ anchorId });
    const passenger = createHarness({ anchorId });

    render(
      <driver.WorkspaceProvider>
        <Name useWorkspace={driver.useWorkspace} />
      </driver.WorkspaceProvider>,
    );
    driver.emitFoundation(makeFoundation());

    render(
      <passenger.WorkspaceProvider>
        <Name useWorkspace={passenger.useWorkspace} />
      </passenger.WorkspaceProvider>,
    );
    passenger.emitFoundation(makeFoundation());

    await waitFor(() => expect(driver.lastDeltaQueryEnabled()).toBe(true));
    // Has the workspace, so `since` is available — it just must not poll.
    expect(passenger.lastDeltaQueryEnabled()).toBe(false);
  });

  it("keeps polling in a lone tab that has no anchor configured", async () => {
    const harness = createHarness();

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );
    harness.emitFoundation(makeFoundation());

    await waitFor(() => expect(harness.lastDeltaQueryEnabled()).toBe(true));
  });

  it("hands a mutation delta to the sibling tab", async () => {
    const anchorId = nextAnchorId();
    const tabA = createHarness({ anchorId });
    const tabB = createHarness({ anchorId });

    let applyDelta: ((delta: WorkspaceDelta) => void) | undefined;
    const Mutator: FC = () => {
      applyDelta = tabA.useApplyDelta();
      return <Name useWorkspace={tabA.useWorkspace} />;
    };

    render(
      <tabA.WorkspaceProvider>
        <Mutator />
      </tabA.WorkspaceProvider>,
    );
    tabA.emitFoundation(makeFoundation());

    render(
      <tabB.WorkspaceProvider>
        <Name useWorkspace={tabB.useWorkspace} />
      </tabB.WorkspaceProvider>,
    );
    tabB.emitFoundation(makeFoundation());

    act(() => applyDelta!(renameDelta("Alice Updated")));

    // B never polled and never mutated; the delta reached it over the channel.
    await waitFor(() =>
      expect(screen.getAllByText("Alice Updated")).toHaveLength(2),
    );
  });

  it("keeps a polled delta to itself when there is no sibling", async () => {
    const harness = createHarness({ anchorId: nextAnchorId() });

    render(
      <harness.WorkspaceProvider>
        <Name useWorkspace={harness.useWorkspace} />
      </harness.WorkspaceProvider>,
    );
    harness.emitFoundation(makeFoundation());
    harness.emitDelta(renameDelta("Alice Updated"));

    expect(screen.getByText("Alice Updated")).toBeDefined();
  });
});
