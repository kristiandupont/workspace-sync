//#region src/types.d.ts
interface WorkspaceTableConfig {
  link: string;
  omittedColumns: string[];
  timestampColumns: string[];
}
interface WorkspaceDefinition {
  name: string;
  schema: string;
  /**
   * The table the workspace hangs off. It must also appear in `tables` with
   * `link: "id"` — it is synchronized and parsed like any other table.
   */
  anchor: string;
  tables: Record<string, WorkspaceTableConfig>;
}
type Upsert = {
  id: number | string;
  [column: string]: unknown;
};
interface WorkspaceDelta {
  upserts: {
    [tableName: string]: Upsert[];
  };
  deletes: {
    [tableName: string]: (number | string)[];
  };
  version: Date;
}
//#endregion
export { WorkspaceDelta as n, WorkspaceTableConfig as r, WorkspaceDefinition as t };
//# sourceMappingURL=types-LCCUSy-n.d.cts.map