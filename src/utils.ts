export function snakeToCamelPlural(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) + "s";
}

export function parseTimestamptz(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

export function parseRow(row: any, timestampColumns: string[]): any {
  const parsed = { ...row };
  for (const col of timestampColumns) {
    if (parsed[col] !== undefined) {
      parsed[col] = parseTimestamptz(parsed[col]);
    }
  }
  return parsed;
}
