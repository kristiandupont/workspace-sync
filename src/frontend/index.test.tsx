/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import type { FC } from "react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { WorkspaceDelta } from "../types";
import { byId } from "./by-id";
import { createWorkspaceProvider } from "./index";
import { shallowEqual } from "./shallow-equal";

type Member = { id: number; name: string; updated_at: Date };
type Tracker = { id: number; label: string; updated_at: Date };
type Foundation = {
  members: Member[];
  trackers: Tracker[];
  version: Date;
};

const baseDate = new Date("2024-01-01T00:00:00.000Z");
const laterDate = new Date("2024-06-01T00:00:00.000Z");

function makeFoundation(): Foundation {
  return {
    members: [{ id: 1, name: "Alice", updated_at: baseDate }],
    trackers: [{ id: 10, label: "Sleep", updated_at: baseDate }],
    version: baseDate,
  };
}

function memberDelta(name: string): WorkspaceDelta {
  return {
    upserts: { member: [{ id: 1, name, updated_at: laterDate }] },
    deletes: {},
    version: laterDate,
  };
}

/**
 * Drives the injected query hooks from the test rather than from a backend:
 * `emitFoundation` stands in for the initial query resolving, `emitDelta` for a
 * poll returning.
 */
function createHarness(initial: Foundation | undefined = undefined) {
  let setFoundation: ((data: Foundation | undefined) => void) | undefined;
  let setDelta: ((data: WorkspaceDelta | undefined) => void) | undefined;

  const factory = createWorkspaceProvider<Foundation>({
    useFoundationQuery: () => {
      const [data, set] = useState(initial);
      setFoundation = set;
      return { data };
    },
    useFoundationDeltaQuery: () => {
      const [data, set] = useState<WorkspaceDelta | undefined>(undefined);
      setDelta = set;
      return { data };
    },
    Spinner: () => <div>loading</div>,
  });

  return {
    ...factory,
    emitFoundation: (data: Foundation) => act(() => setFoundation!(data)),
    emitDelta: (data: WorkspaceDelta) => act(() => setDelta!(data)),
  };
}

afterEach(cleanup);

describe("WorkspaceProvider", () => {
  it("renders the spinner until the initial query resolves", () => {
    const { WorkspaceProvider, emitFoundation } = createHarness();
    render(
      <WorkspaceProvider>
        <div>content</div>
      </WorkspaceProvider>,
    );

    expect(screen.getByText("loading")).toBeDefined();

    emitFoundation(makeFoundation());
    expect(screen.getByText("content")).toBeDefined();
  });

  it("applies a polled delta to the workspace", () => {
    const { WorkspaceProvider, useWorkspace, emitDelta } = createHarness(
      makeFoundation(),
    );
    const Name: FC = () => <div>{useWorkspace().members[0].name}</div>;
    render(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );

    emitDelta(memberDelta("Alice Updated"));
    expect(screen.getByText("Alice Updated")).toBeDefined();
  });

  it("makes useApplyDelta update the workspace", () => {
    const { WorkspaceProvider, useWorkspace, useApplyDelta } = createHarness(
      makeFoundation(),
    );
    let applyDelta: ((delta: WorkspaceDelta) => void) | undefined;
    const Name: FC = () => {
      applyDelta = useApplyDelta();
      return <div>{useWorkspace().members[0].name}</div>;
    };
    render(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );

    act(() => applyDelta!(memberDelta("Alice Updated")));
    expect(screen.getByText("Alice Updated")).toBeDefined();
  });
});

describe("useWorkspaceSelector", () => {
  it("does not re-render a component whose slice is untouched", () => {
    const { WorkspaceProvider, useWorkspaceSelector, emitDelta } =
      createHarness(makeFoundation());
    const renders = { members: 0, trackers: 0 };

    const Members: FC = () => {
      const members = useWorkspaceSelector((w) => w.members);
      renders.members += 1;
      return <div>{members[0].name}</div>;
    };
    const Trackers: FC = () => {
      const trackers = useWorkspaceSelector((w) => w.trackers);
      renders.trackers += 1;
      return <div>{trackers[0].label}</div>;
    };

    render(
      <WorkspaceProvider>
        <Members />
        <Trackers />
      </WorkspaceProvider>,
    );
    expect(renders).toEqual({ members: 1, trackers: 1 });

    emitDelta(memberDelta("Alice Updated"));

    expect(renders.members).toBe(2);
    expect(renders.trackers).toBe(1);
  });

  it("does not re-render for a delta that changes nothing", () => {
    const { WorkspaceProvider, useWorkspaceSelector, emitDelta } =
      createHarness(makeFoundation());
    let renders = 0;
    const Members: FC = () => {
      const members = useWorkspaceSelector((w) => w.members);
      renders += 1;
      return <div>{members.length}</div>;
    };

    render(
      <WorkspaceProvider>
        <Members />
      </WorkspaceProvider>,
    );
    emitDelta({ upserts: {}, deletes: {}, version: baseDate });

    expect(renders).toBe(1);
  });

  it("keeps a row selector stable when a different row changes", () => {
    const { WorkspaceProvider, useWorkspaceSelector, emitDelta } =
      createHarness({
        ...makeFoundation(),
        members: [
          { id: 1, name: "Alice", updated_at: baseDate },
          { id: 2, name: "Bob", updated_at: baseDate },
        ],
      });
    let renders = 0;
    const Bob: FC = () => {
      const bob = useWorkspaceSelector((w) => byId(w.members).get(2));
      renders += 1;
      return <div>{bob?.name}</div>;
    };

    render(
      <WorkspaceProvider>
        <Bob />
      </WorkspaceProvider>,
    );
    expect(renders).toBe(1);

    emitDelta(memberDelta("Alice Updated"));

    expect(renders).toBe(1);
    expect(screen.getByText("Bob")).toBeDefined();
  });

  it("re-renders a row selector when that row changes", () => {
    const { WorkspaceProvider, useWorkspaceSelector, emitDelta } =
      createHarness(makeFoundation());
    const Alice: FC = () => {
      const alice = useWorkspaceSelector((w) => byId(w.members).get(1));
      return <div>{alice?.name}</div>;
    };

    render(
      <WorkspaceProvider>
        <Alice />
      </WorkspaceProvider>,
    );
    emitDelta(memberDelta("Alice Updated"));

    expect(screen.getByText("Alice Updated")).toBeDefined();
  });

  it("does not re-render an object selector guarded by shallowEqual", () => {
    const { WorkspaceProvider, useWorkspaceSelector, emitDelta } =
      createHarness(makeFoundation());
    let renders = 0;
    const Counts: FC = () => {
      const counts = useWorkspaceSelector(
        (w) => ({ members: w.members.length, trackers: w.trackers.length }),
        shallowEqual,
      );
      renders += 1;
      return <div>{counts.members}</div>;
    };

    render(
      <WorkspaceProvider>
        <Counts />
      </WorkspaceProvider>,
    );
    emitDelta(memberDelta("Alice Updated"));

    expect(renders).toBe(1);
  });
});

describe("useOptionalWorkspaceSelector", () => {
  it("returns undefined when there is no provider above", () => {
    const { useOptionalWorkspaceSelector } = createHarness();
    const AdminBadge: FC = () => {
      const count = useOptionalWorkspaceSelector((w) => w.members.length);
      return <div>{count === undefined ? "no workspace" : String(count)}</div>;
    };

    render(<AdminBadge />);

    expect(screen.getByText("no workspace")).toBeDefined();
  });

  it("returns the slice when a provider is present", () => {
    const { WorkspaceProvider, useOptionalWorkspaceSelector } =
      createHarness(makeFoundation());
    const AdminBadge: FC = () => {
      const count = useOptionalWorkspaceSelector((w) => w.members.length);
      return <div>{count === undefined ? "no workspace" : String(count)}</div>;
    };

    render(
      <WorkspaceProvider>
        <AdminBadge />
      </WorkspaceProvider>,
    );

    expect(screen.getByText("1")).toBeDefined();
  });
});

describe("TestWorkspaceProvider", () => {
  it("serves selectors from a static workspace", () => {
    const { TestWorkspaceProvider, useWorkspaceSelector } = createHarness();
    const Members: FC = () => (
      <div>{useWorkspaceSelector((w) => w.members[0].name)}</div>
    );

    render(
      <TestWorkspaceProvider workspace={makeFoundation()}>
        <Members />
      </TestWorkspaceProvider>,
    );

    expect(screen.getByText("Alice")).toBeDefined();
  });
});
