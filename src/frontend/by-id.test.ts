import { describe, expect, it } from "vitest";

import { byId } from "./by-id";

type Row = { id: number; name: string };

describe("byId", () => {
  it("indexes rows by id", () => {
    const rows: Row[] = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];

    expect(byId(rows).get(2)?.name).toBe("Bob");
  });

  it("returns the same index for the same array", () => {
    const rows: Row[] = [{ id: 1, name: "Alice" }];

    expect(byId(rows)).toBe(byId(rows));
  });

  it("rebuilds the index for a new array", () => {
    const rows: Row[] = [{ id: 1, name: "Alice" }];
    const next: Row[] = [...rows, { id: 2, name: "Bob" }];

    expect(byId(next)).not.toBe(byId(rows));
    expect(byId(next).get(2)?.name).toBe("Bob");
  });

  it("handles string ids", () => {
    const rows = [{ id: "a", name: "Alice" }];

    expect(byId(rows).get("a")?.name).toBe("Alice");
  });
});
