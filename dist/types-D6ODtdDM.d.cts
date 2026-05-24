//#region src/types.d.ts
interface WorkspaceTableConfig {
  link: string;
  omittedColumns: string[];
  timestampColumns: string[];
}
interface WorkspaceDefinition {
  name: string;
  schema: string;
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
//# sourceMappingURL=types-D6ODtdDM.d.cts.map