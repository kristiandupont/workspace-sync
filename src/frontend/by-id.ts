const indexCache = new WeakMap<object, Map<unknown, unknown>>();

/**
 * Id-index for a workspace table, memoized on the array's identity.
 *
 * Without it a per-row selector (`w => w.transactions.find(t => t.id === id)`)
 * costs an O(n) scan per row per delta — quadratic on a list page. Because
 * `applyWorkspaceDelta` keeps a table's array reference stable until that table
 * actually changes, the same array yields the same index, rebuilt only when the
 * table changes. Row selectors become `w => byId(w.transactions).get(id)`:
 * O(1), and referentially stable across unrelated deltas.
 */
export function byId<TRow extends { id: number | string }>(
  rows: readonly TRow[],
): Map<TRow["id"], TRow> {
  const cached = indexCache.get(rows);
  if (cached) return cached as Map<TRow["id"], TRow>;

  const index = new Map<TRow["id"], TRow>(rows.map((row) => [row.id, row]));
  indexCache.set(rows, index as Map<unknown, unknown>);
  return index;
}
