export interface WorkspaceTableConfig {
  link: string;
  omittedColumns: string[];
  timestampColumns: string[];
}

export interface WorkspaceDefinition {
  name: string;
  schema: string;
  anchor: string;
  tables: Record<string, WorkspaceTableConfig>;
}

export interface WorkspaceDelta {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upserts: { [tableName: string]: any[] };
  deletes: { [tableName: string]: (number | string)[] };
  version: Date;
}
