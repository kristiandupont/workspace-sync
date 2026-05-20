/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WorkspaceDefinition, WorkspaceDelta } from "./types";

// Structural alias — avoids importing knex directly and the dual-copy type
// conflict that arises in consuming projects that have their own knex.
interface KnexLike {
  raw(sql: string, bindings: (string | number)[]): Promise<{ rows: any[] }>;
}
import { buildUpsertQuery, buildDeleteQuery } from "./queries";
import { parseTimestamptz, parseRow, snakeToCamelPlural } from "./utils";

function parseUpserts(
  definition: WorkspaceDefinition,
  upserts: any,
): { [tableName: string]: any[] } {
  const result: { [tableName: string]: any[] } = {};
  const { anchor, tables } = definition;

  if (upserts[anchor]) {
    result[anchor] = upserts[anchor].map((r: any) =>
      parseRow(r, ["created_at", "updated_at"]),
    );
  }

  for (const [tableName, config] of Object.entries(tables)) {
    if (!upserts[tableName]) continue;
    result[tableName] = upserts[tableName].map((r: any) => {
      const parsed = parseRow(r, config.timestampColumns);
      for (const col of config.omittedColumns) {
        delete parsed[col];
      }
      return parsed;
    });
  }

  return result;
}

function calculateVersion(
  upserts: { [tableName: string]: any[] },
  maxDeletedAt: Date | null,
  since: Date,
): Date {
  let maxTimestamp = since;
  let hasAnyData = false;

  for (const tableRows of Object.values(upserts)) {
    if (tableRows.length > 0) hasAnyData = true;
    for (const row of tableRows) {
      if (row.updated_at && row.updated_at > maxTimestamp) {
        maxTimestamp = row.updated_at;
      }
    }
  }

  if (maxDeletedAt && maxDeletedAt > maxTimestamp) {
    maxTimestamp = maxDeletedAt;
    hasAnyData = true;
  }

  // DB has microsecond precision; JS Date only milliseconds. Add 1ms to avoid
  // re-fetching the same records on the next poll when timestamps coincide.
  if (hasAnyData && maxTimestamp.getTime() === since.getTime()) {
    maxTimestamp = new Date(maxTimestamp.getTime() + 1);
  }

  return maxTimestamp;
}

export function parseInitialWorkspace<T>(
  definition: WorkspaceDefinition,
  raw: any,
): T {
  const { anchor, tables } = definition;
  const result: any = {};

  result[snakeToCamelPlural(anchor)] = (raw[anchor] ?? []).map((r: any) => ({
    ...r,
    created_at: parseTimestamptz(r.created_at),
    updated_at: parseTimestamptz(r.updated_at),
  }));

  for (const [tableName, config] of Object.entries(tables)) {
    result[snakeToCamelPlural(tableName)] = (raw[tableName] ?? []).map(
      (r: any) => {
        const parsed: any = { ...r };
        for (const col of config.timestampColumns) {
          parsed[col] = parseTimestamptz(r[col]);
        }
        for (const col of config.omittedColumns) {
          delete parsed[col];
        }
        return parsed;
      },
    );
  }

  result.version = parseTimestamptz(raw.version);
  return result as T;
}

export async function getWorkspaceDelta(
  trx: KnexLike,
  definition: WorkspaceDefinition,
  anchorId: number | string,
  since: Date,
): Promise<WorkspaceDelta> {
  const upsertQuery = buildUpsertQuery(definition, anchorId, since);
  const deleteQuery = buildDeleteQuery(definition, anchorId, since);

  const [upsertsResult, deletesResult] = await Promise.all([
    trx.raw(upsertQuery.sql, upsertQuery.bindings),
    trx.raw(deleteQuery.sql, deleteQuery.bindings),
  ]);

  const rawUpserts = upsertsResult.rows[0]?.upserts || {};
  const rawDeletes = deletesResult.rows[0]?.deletes || {};
  const maxDeletedAt = parseTimestamptz(deletesResult.rows[0]?.max_deleted_at);

  const upserts = parseUpserts(definition, rawUpserts);
  const version = calculateVersion(upserts, maxDeletedAt, since);

  return { upserts, deletes: rawDeletes, version };
}
