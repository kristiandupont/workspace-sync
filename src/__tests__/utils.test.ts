import { describe, expect, it } from "vitest";

import { parseRow, parseTimestamptz, snakeToCamelPlural } from "../utils";

describe("snakeToCamelPlural", () => {
  it("converts snake_case to camelCase and pluralizes", () => {
    expect(snakeToCamelPlural("member")).toBe("members");
    expect(snakeToCamelPlural("beat_point")).toBe("beatPoints");
    expect(snakeToCamelPlural("workspace_table_config")).toBe(
      "workspaceTableConfigs",
    );
  });

  it("handles already-camel identifiers", () => {
    expect(snakeToCamelPlural("item")).toBe("items");
  });
});

describe("parseTimestamptz", () => {
  it("parses a valid ISO timestamp string into a Date", () => {
    const result = parseTimestamptz("2024-01-15T10:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(new Date("2024-01-15T10:00:00.000Z").getTime());
  });

  it("returns null for null input", () => {
    expect(parseTimestamptz(null)).toBeNull();
  });
});

describe("parseRow", () => {
  it("parses timestamp columns into Date objects", () => {
    const row = {
      id: 1,
      name: "Alice",
      created_at: "2024-01-15T10:00:00.000Z",
      updated_at: "2024-06-01T12:00:00.000Z",
    };
    const result = parseRow(row, ["created_at", "updated_at"]);

    expect(result.id).toBe(1);
    expect(result.name).toBe("Alice");
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it("leaves non-timestamp columns unchanged", () => {
    const row = { id: 42, status: "active" };
    const result = parseRow(row, ["created_at"]);
    expect(result).toEqual({ id: 42, status: "active" });
  });

  it("does not mutate the original row", () => {
    const row = { id: 1, created_at: "2024-01-15T10:00:00.000Z" };
    parseRow(row, ["created_at"]);
    expect(typeof row.created_at).toBe("string");
  });
});
