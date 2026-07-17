import type { Upsert, WorkspaceDelta } from "./types";
import { snakeToCamelPlural } from "./utils";

/**
 * Applies a delta to a workspace, preserving structural sharing: rows and table
 * arrays that the delta does not touch keep their identity, so selectors that
 * compare by reference only fire for slices that actually changed. Returns the
 * original workspace unchanged when the delta is a no-op.
 */
export function applyWorkspaceDelta<T>(workspace: T, delta: WorkspaceDelta): T {
  const source = workspace as Record<string, unknown>;
  const nextTables = new Map<string, Upsert[]>();

  // A table may appear in both upserts and deletes; the second pass must build
  // on the first pass's result rather than on the untouched source array.
  const currentRows = (key: string): Upsert[] =>
    (nextTables.get(key) ?? source[key]) as Upsert[];

  for (const [tableName, rows] of Object.entries(delta.upserts)) {
    if (rows.length === 0) continue;
    const key = snakeToCamelPlural(tableName);
    if (!(key in source)) continue;

    const existing = currentRows(key);
    const indexById = new Map(existing.map((row, index) => [row.id, index]));
    const next = existing.slice();
    for (const row of rows) {
      const index = indexById.get(row.id);
      if (index === undefined) {
        indexById.set(row.id, next.length);
        next.push(row);
      } else {
        next[index] = row;
      }
    }
    nextTables.set(key, next);
  }

  for (const [tableName, ids] of Object.entries(delta.deletes)) {
    if (ids.length === 0) continue;
    const key = snakeToCamelPlural(tableName);
    if (!(key in source)) continue;

    const existing = currentRows(key);
    const idsToDelete = new Set(ids);
    const next = existing.filter((row) => !idsToDelete.has(row.id));
    if (next.length !== existing.length) nextTables.set(key, next);
  }

  const versionAdvances = delta.version > (source.version as Date);
  if (nextTables.size === 0 && !versionAdvances) return workspace;

  const updated = { ...source };
  for (const [key, rows] of nextTables) updated[key] = rows;
  if (versionAdvances) updated.version = delta.version;

  return updated as T;
}
