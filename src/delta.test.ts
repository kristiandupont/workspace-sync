import { describe, expect, it } from "vitest";

import { getWorkspaceDelta, parseInitialWorkspace } from "./delta";
import type { WorkspaceDefinition } from "./types";

const definition: WorkspaceDefinition = {
  name: "foundation",
  schema: "public",
  anchor: "member",
  tables: {
    member: {
      link: "id",
      omittedColumns: ["token_version"],
      timestampColumns: ["created_at", "updated_at"],
    },
    tag: {
      link: "member_id",
      omittedColumns: ["internal_notes"],
      timestampColumns: ["updated_at"],
    },
  },
};

type ParsedFoundation = {
  members: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  version: Date | null;
};

describe("parseInitialWorkspace", () => {
  it("applies omittedColumns and timestamp parsing to the anchor table", () => {
    const raw = {
      member: [
        {
          id: 1,
          name: "Ada",
          token_version: 3,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      ],
      tag: [
        {
          id: 10,
          member_id: 1,
          internal_notes: "secret",
          updated_at: "2026-01-03T00:00:00.000Z",
        },
      ],
      version: "2026-01-03T00:00:00.000Z",
    };

    const parsed = parseInitialWorkspace<ParsedFoundation>(definition, raw);

    expect(parsed.members).toHaveLength(1);
    expect(parsed.members[0]).not.toHaveProperty("token_version");
    expect(parsed.members[0].created_at).toBeInstanceOf(Date);
    expect(parsed.members[0].updated_at).toBeInstanceOf(Date);

    expect(parsed.tags[0]).not.toHaveProperty("internal_notes");
    expect(parsed.version).toBeInstanceOf(Date);
  });
});

describe("getWorkspaceDelta", () => {
  it("applies omittedColumns to anchor upserts", async () => {
    const trx = {
      raw: async (sql: string) => {
        if (sql.includes("AS upserts")) {
          return {
            rows: [
              {
                upserts: {
                  member: [
                    {
                      id: 1,
                      name: "Ada",
                      token_version: 4,
                      updated_at: "2026-01-05T00:00:00.000Z",
                    },
                  ],
                  tag: [],
                },
              },
            ],
          };
        }
        return { rows: [{ deletes: {}, max_deleted_at: null }] };
      },
    };

    const delta = await getWorkspaceDelta(
      trx,
      definition,
      1,
      new Date("2026-01-04T00:00:00.000Z"),
    );

    expect(delta.upserts.member).toHaveLength(1);
    expect(delta.upserts.member[0]).not.toHaveProperty("token_version");
    expect(delta.upserts.member[0].updated_at).toBeInstanceOf(Date);
  });
});
