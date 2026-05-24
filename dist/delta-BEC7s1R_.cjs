const require_utils = require("./utils-DBUNJZXG.cjs");
//#region src/queries.ts
function anchorCast(anchorId) {
	return typeof anchorId === "number" ? "?::integer" : "?::uuid";
}
function paramsCte(anchorId, extraColumns) {
	return extraColumns ? `params AS (SELECT ${anchorCast(anchorId)} AS anchor_id, ${extraColumns})` : `params AS (SELECT ${anchorCast(anchorId)} AS anchor_id)`;
}
function buildInitialQuery(definition, anchorId) {
	const { anchor, tables, name } = definition;
	const tableNames = [anchor, ...Object.keys(tables)];
	const ctes = [
		paramsCte(anchorId),
		`${anchor}_cte AS (
    SELECT ${anchor}.*
    FROM ${anchor}, params
    WHERE id = params.anchor_id
  )`,
		...Object.entries(tables).map(([tableName, config]) => `${tableName}_cte AS (
    SELECT ${tableName}.*
    FROM ${tableName}, params
    WHERE ${config.link} = params.anchor_id
  )`),
		`version_cte AS (
    SELECT GREATEST(
      ${tableNames.map((t) => `COALESCE(MAX(${t}_cte.updated_at), '1970-01-01'::timestamptz)`).join(",\n      ")}
    ) AS version
    FROM ${anchor}_cte
    ${tableNames.slice(1).map((t) => `LEFT JOIN ${t}_cte ON TRUE`).join("\n    ")}
  )`
	];
	const tableSelects = tableNames.map((t) => `'${t}', COALESCE((SELECT json_agg(row_to_json(t)) FROM ${t}_cte t), '[]'::json)`).join(",\n    ");
	return {
		sql: `
WITH ${ctes.join(",\n\n")}

SELECT json_build_object(
    ${tableSelects},
    'version', (SELECT version FROM version_cte)
  ) AS ${name}_workspace
  FROM ${anchor}_cte
  ${tableNames.slice(1).map((t) => `LEFT JOIN ${t}_cte ON TRUE`).join("\n  ")};
`,
		bindings: [anchorId]
	};
}
function buildUpsertQuery(definition, anchorId, since) {
	const { anchor, tables } = definition;
	const tableNames = [anchor, ...Object.keys(tables)];
	const ctes = [
		paramsCte(anchorId, "?::timestamptz AS since_ts"),
		`${anchor}_cte AS (
    SELECT ${anchor}.*
    FROM ${anchor}, params
    WHERE id = params.anchor_id
    AND updated_at > params.since_ts
  )`,
		...Object.entries(tables).map(([tableName, config]) => `${tableName}_cte AS (
    SELECT ${tableName}.*
    FROM ${tableName}, params
    WHERE ${config.link} = params.anchor_id
    AND updated_at > params.since_ts
  )`)
	];
	const tableSelects = tableNames.map((t) => `'${t}', COALESCE((SELECT json_agg(row_to_json(t)) FROM ${t}_cte t), '[]'::json)`).join(",\n    ");
	return {
		sql: `
WITH ${ctes.join(",\n\n")}

SELECT json_build_object(
    ${tableSelects}
  ) AS upserts;
`,
		bindings: [anchorId, since.toISOString()]
	};
}
function buildDeleteQuery(definition, anchorId, since) {
	const { anchor, tables } = definition;
	const tableList = [anchor, ...Object.keys(tables)].map((t) => `'${t}'`).join(", ");
	const anchorIdColumn = `${anchor}_id`;
	return {
		sql: `
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
`,
		bindings: [anchorId, since.toISOString()]
	};
}
//#endregion
//#region src/delta.ts
function parseUpserts(definition, upserts) {
	const result = {};
	const { anchor, tables } = definition;
	if (upserts[anchor]) result[anchor] = upserts[anchor].map((r) => require_utils.parseRow(r, ["created_at", "updated_at"]));
	for (const [tableName, config] of Object.entries(tables)) {
		if (!upserts[tableName]) continue;
		result[tableName] = upserts[tableName].map((r) => {
			const parsed = require_utils.parseRow(r, config.timestampColumns);
			for (const col of config.omittedColumns) delete parsed[col];
			return parsed;
		});
	}
	return result;
}
function calculateVersion(upserts, maxDeletedAt, since) {
	let maxTimestamp = since;
	let hasAnyData = false;
	for (const tableRows of Object.values(upserts)) {
		if (tableRows.length > 0) hasAnyData = true;
		for (const row of tableRows) if (row.updated_at && row.updated_at > maxTimestamp) maxTimestamp = row.updated_at;
	}
	if (maxDeletedAt && maxDeletedAt > maxTimestamp) {
		maxTimestamp = maxDeletedAt;
		hasAnyData = true;
	}
	if (hasAnyData && maxTimestamp.getTime() === since.getTime()) maxTimestamp = new Date(maxTimestamp.getTime() + 1);
	return maxTimestamp;
}
function parseInitialWorkspace(definition, raw) {
	const { anchor, tables } = definition;
	const result = {};
	result[require_utils.snakeToCamelPlural(anchor)] = (raw[anchor] ?? []).map((r) => ({
		...r,
		created_at: require_utils.parseTimestamptz(r.created_at),
		updated_at: require_utils.parseTimestamptz(r.updated_at)
	}));
	for (const [tableName, config] of Object.entries(tables)) result[require_utils.snakeToCamelPlural(tableName)] = (raw[tableName] ?? []).map((r) => {
		const parsed = { ...r };
		for (const col of config.timestampColumns) parsed[col] = require_utils.parseTimestamptz(r[col]);
		for (const col of config.omittedColumns) delete parsed[col];
		return parsed;
	});
	result.version = require_utils.parseTimestamptz(raw.version);
	return result;
}
async function getWorkspaceDelta(trx, definition, anchorId, since) {
	const upsertQuery = buildUpsertQuery(definition, anchorId, since);
	const deleteQuery = buildDeleteQuery(definition, anchorId, since);
	const [upsertsResult, deletesResult] = await Promise.all([trx.raw(upsertQuery.sql, upsertQuery.bindings), trx.raw(deleteQuery.sql, deleteQuery.bindings)]);
	const rawUpserts = upsertsResult.rows[0]?.upserts || {};
	const rawDeletes = deletesResult.rows[0]?.deletes || {};
	const maxDeletedAt = require_utils.parseTimestamptz(deletesResult.rows[0]?.max_deleted_at);
	const upserts = parseUpserts(definition, rawUpserts);
	return {
		upserts,
		deletes: rawDeletes,
		version: calculateVersion(upserts, maxDeletedAt, since)
	};
}
//#endregion
Object.defineProperty(exports, "buildDeleteQuery", {
	enumerable: true,
	get: function() {
		return buildDeleteQuery;
	}
});
Object.defineProperty(exports, "buildInitialQuery", {
	enumerable: true,
	get: function() {
		return buildInitialQuery;
	}
});
Object.defineProperty(exports, "buildUpsertQuery", {
	enumerable: true,
	get: function() {
		return buildUpsertQuery;
	}
});
Object.defineProperty(exports, "getWorkspaceDelta", {
	enumerable: true,
	get: function() {
		return getWorkspaceDelta;
	}
});
Object.defineProperty(exports, "parseInitialWorkspace", {
	enumerable: true,
	get: function() {
		return parseInitialWorkspace;
	}
});

//# sourceMappingURL=delta-BEC7s1R_.cjs.map