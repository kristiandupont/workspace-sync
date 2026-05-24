//#region src/utils.ts
function snakeToCamelPlural(s) {
	return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + "s";
}
function parseTimestamptz(v) {
	return v ? new Date(v) : null;
}
function parseRow(row, timestampColumns) {
	const parsed = { ...row };
	for (const col of timestampColumns) if (parsed[col] !== void 0) parsed[col] = parseTimestamptz(parsed[col]);
	return parsed;
}
//#endregion
Object.defineProperty(exports, "parseRow", {
	enumerable: true,
	get: function() {
		return parseRow;
	}
});
Object.defineProperty(exports, "parseTimestamptz", {
	enumerable: true,
	get: function() {
		return parseTimestamptz;
	}
});
Object.defineProperty(exports, "snakeToCamelPlural", {
	enumerable: true,
	get: function() {
		return snakeToCamelPlural;
	}
});

//# sourceMappingURL=utils-DBUNJZXG.cjs.map