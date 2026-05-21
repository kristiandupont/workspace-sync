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

export type Upsert = {
  id: number | string;
  [column: string]: unknown;
};

export interface WorkspaceDelta {
  upserts: { [tableName: string]: Upsert[] };
  deletes: { [tableName: string]: (number | string)[] };
  version: Date;
}
