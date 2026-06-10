export interface WorkspaceTableConfig {
  link: string;
  omittedColumns: string[];
  timestampColumns: string[];
}

export interface WorkspaceDefinition {
  name: string;
  schema: string;
  /**
   * The table the workspace hangs off. It must also appear in `tables` with
   * `link: "id"` — it is synchronized and parsed like any other table.
   */
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
