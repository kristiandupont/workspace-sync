import { describe, expect, it } from "vitest";

import {
  buildDeleteQuery,
  buildInitialQuery,
  buildUpsertQuery,
} from "./queries";
import type { WorkspaceDefinition } from "./types";

const definition: WorkspaceDefinition = {
  name: "foundation",
  schema: "public",
  anchor: "member",
  tables: {
    member: { link: "id", omittedColumns: ["token_version"], timestampColumns: ["created_at", "updated_at"] },
    beat_point: { link: "member_id", omittedColumns: [], timestampColumns: ["created_at", "updated_at"] },
    tag: { link: "member_id", omittedColumns: ["internal_notes"], timestampColumns: ["updated_at"] },
  },
};

describe("anchor validation", () => {
  it("throws if the anchor table is not included in tables", () => {
    const tablesWithoutAnchor = Object.fromEntries(
      Object.entries(definition.tables).filter(([name]) => name !== "member"),
    );
    expect(() =>
      buildInitialQuery({ ...definition, tables: tablesWithoutAnchor }, 42),
    ).toThrow(/anchor table "member" must be included in tables/);
  });

  it("throws if the anchor table's link is not 'id'", () => {
    const tables = {
      ...definition.tables,
      member: { ...definition.tables.member, link: "owner_id" },
    };
    expect(() => buildInitialQuery({ ...definition, tables }, 42)).toThrow(
      /link "id"/,
    );
  });
});

describe("buildInitialQuery", () => {
  it("returns a SQL string and single binding for the anchor ID", () => {
    const { sql, bindings } = buildInitialQuery(definition, 42);
    expect(typeof sql).toBe("string");
    expect(bindings).toEqual([42]);
  });

  it("selects the anchor row by id and generates its CTE exactly once", () => {
    const { sql } = buildInitialQuery(definition, 42);
    expect(sql).toContain("WHERE id = params.anchor_id");
    expect(sql.match(/member_cte AS \(/g)).toHaveLength(1);
  });

  it("uses integer cast for numeric anchor IDs", () => {
    const { sql } = buildInitialQuery(definition, 42);
    expect(sql).toContain("::integer");
  });

  it("uses uuid cast for string anchor IDs", () => {
    const { sql } = buildInitialQuery(definition, "abc-123");
    expect(sql).toContain("::uuid");
  });

  it("includes all table names in the query", () => {
    const { sql } = buildInitialQuery(definition, 1);
    expect(sql).toContain("member");
    expect(sql).toContain("beat_point");
    expect(sql).toContain("tag");
  });

  it("uses the workspace name in the SELECT alias", () => {
    const { sql } = buildInitialQuery(definition, 1);
    expect(sql).toContain("foundation_workspace");
  });
});

describe("buildUpsertQuery", () => {
  const since = new Date("2024-01-01T00:00:00.000Z");

  it("returns two bindings: anchor ID and since timestamp", () => {
    const { bindings } = buildUpsertQuery(definition, 42, since);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toBe(42);
    expect(bindings[1]).toBe(since.toISOString());
  });

  it("filters by updated_at > since_ts", () => {
    const { sql } = buildUpsertQuery(definition, 1, since);
    expect(sql).toContain("updated_at > params.since_ts");
  });
});

describe("buildDeleteQuery", () => {
  const since = new Date("2024-01-01T00:00:00.000Z");

  it("returns two bindings: anchor ID and since timestamp", () => {
    const { bindings } = buildDeleteQuery(definition, 42, since);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toBe(42);
    expect(bindings[1]).toBe(since.toISOString());
  });

  it("references the anchor_id column for the deleted_record join", () => {
    const { sql } = buildDeleteQuery(definition, 1, since);
    expect(sql).toContain("member_id");
  });

  it("includes all table names in the IN clause", () => {
    const { sql } = buildDeleteQuery(definition, 1, since);
    expect(sql).toContain("'member'");
    expect(sql).toContain("'beat_point'");
    expect(sql).toContain("'tag'");
  });
});
