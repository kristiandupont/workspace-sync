import type { WorkspaceDefinition } from "./types";

export interface RawQuery {
  sql: string;
  bindings: (string | number)[];
}

// A params CTE binds the anchor ID once by name throughout the query. This
// supports both integer and UUID string IDs without repeating positional
// bindings and avoids re-encoding the value for every CTE that references it.
// An explicit cast is required because PostgreSQL types an undecorated $1 as
// `text`, which cannot be compared to `integer` or `uuid` columns.
function anchorCast(anchorId: number | string): string {
  return typeof anchorId === "number" ? "?::integer" : "?::uuid";
}

function paramsCte(anchorId: number | string, extraColumns?: string): string {
  return extraColumns
    ? `params AS (SELECT ${anchorCast(anchorId)} AS anchor_id, ${extraColumns})`
    : `params AS (SELECT ${anchorCast(anchorId)} AS anchor_id)`;
}

// The anchor is an ordinary synchronized table whose link is the `id` column
// itself. Requiring it in `tables` gives it the same per-table config
// (omittedColumns, timestampColumns) as every other table; `anchor` only
// designates which table the workspace hangs off. The anchor is kept first in
// table orderings because the initial query joins from it (it is the one CTE
// guaranteed to hold exactly one row).
function orderedTableEntries(
  definition: WorkspaceDefinition,
): [string, WorkspaceDefinition["tables"][string]][] {
  const { anchor, tables, name } = definition;
  const anchorConfig = tables[anchor];
  if (!anchorConfig || anchorConfig.link !== "id") {
    throw new Error(
      `Workspace "${name}": the anchor table "${anchor}" must be included in tables with link "id"`,
    );
  }
  return [
    [anchor, anchorConfig],
    ...Object.entries(tables).filter(([tableName]) => tableName !== anchor),
  ];
}

export function buildInitialQuery(
  definition: WorkspaceDefinition,
  anchorId: number | string,
): RawQuery {
  const { anchor, name } = definition;
  const tableEntries = orderedTableEntries(definition);
  const tableNames = tableEntries.map(([tableName]) => tableName);

  const ctes = [
    paramsCte(anchorId),
    ...tableEntries.map(
      ([tableName, config]) => `${tableName}_cte AS (
    SELECT ${tableName}.*
    FROM ${tableName}, params
    WHERE ${config.link} = params.anchor_id
  )`,
    ),
    `version_cte AS (
    SELECT GREATEST(
      ${tableNames
        .map(
          (t) =>
            `COALESCE(MAX(${t}_cte.updated_at), '1970-01-01'::timestamptz)`,
        )
        .join(",\n      ")}
    ) AS version
    FROM ${anchor}_cte
    ${tableNames
      .slice(1)
      .map((t) => `LEFT JOIN ${t}_cte ON TRUE`)
      .join("\n    ")}
  )`,
  ];

  const tableSelects = tableNames
    .map(
      (t) =>
        `'${t}', COALESCE((SELECT json_agg(row_to_json(t)) FROM ${t}_cte t), '[]'::json)`,
    )
    .join(",\n    ");

  const sql = `
WITH ${ctes.join(",\n\n")}

SELECT json_build_object(
    ${tableSelects},
    'version', (SELECT version FROM version_cte)
  ) AS ${name}_workspace
  FROM ${anchor}_cte
  ${tableNames
    .slice(1)
    .map((t) => `LEFT JOIN ${t}_cte ON TRUE`)
    .join("\n  ")};
`;

  return { sql, bindings: [anchorId] };
}

export function buildUpsertQuery(
  definition: WorkspaceDefinition,
  anchorId: number | string,
  since: Date,
): RawQuery {
  const tableEntries = orderedTableEntries(definition);
  const tableNames = tableEntries.map(([tableName]) => tableName);

  const ctes = [
    paramsCte(anchorId, "?::timestamptz AS since_ts"),
    ...tableEntries.map(
      ([tableName, config]) => `${tableName}_cte AS (
    SELECT ${tableName}.*
    FROM ${tableName}, params
    WHERE ${config.link} = params.anchor_id
    AND updated_at > params.since_ts
  )`,
    ),
  ];

  const tableSelects = tableNames
    .map(
      (t) =>
        `'${t}', COALESCE((SELECT json_agg(row_to_json(t)) FROM ${t}_cte t), '[]'::json)`,
    )
    .join(",\n    ");

  const sql = `
WITH ${ctes.join(",\n\n")}

SELECT json_build_object(
    ${tableSelects}
  ) AS upserts;
`;

  return { sql, bindings: [anchorId, since.toISOString()] };
}

export function buildDeleteQuery(
  definition: WorkspaceDefinition,
  anchorId: number | string,
  since: Date,
): RawQuery {
  const { anchor } = definition;
  const tableNames = orderedTableEntries(definition).map(
    ([tableName]) => tableName,
  );
  const tableList = tableNames.map((t) => `'${t}'`).join(", ");
  // Convention: the deleted_record table has a column named `${anchor}_id`
  const anchorIdColumn = `${anchor}_id`;

  const sql = `
WITH params AS (SELECT ${anchorCast(anchorId)} AS anchor_id, ?::timestamptz AS since_ts)

SELECT
  json_object_agg(
    table_name,
    COALESCE((
      SELECT json_agg(record_id)
      FROM deleted_record d2, params
      WHERE d2.table_name = d1.table_name
      AND d2.deleted_at > params.since_ts
      AND d2.${anchorIdColumn} = params.anchor_id
    ), '[]'::json)
  ) AS deletes,
  (
    SELECT MAX(deleted_at)
    FROM deleted_record, params
    WHERE table_name IN (${tableList})
    AND deleted_at > params.since_ts
    AND ${anchorIdColumn} = params.anchor_id
  ) AS max_deleted_at
FROM (
  SELECT DISTINCT table_name
  FROM deleted_record, params
  WHERE table_name IN (${tableList})
  AND deleted_at > params.since_ts
  AND ${anchorIdColumn} = params.anchor_id
) d1;
`;

  return { sql, bindings: [anchorId, since.toISOString()] };
}
