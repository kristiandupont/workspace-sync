export type WorkspaceConfig = {
  name: string;
  schema: string;
  /**
   * The table the workspace hangs off (e.g. a user or organization). It must
   * also appear in `tables` with `link: "id"` — it is synchronized like any
   * other table and supports the same options, such as `omittedColumns`.
   */
  anchor: string;
  tables: Record<string, WorkspaceTableConfig>;
};

export type WorkspaceTableConfig = {
  link: string;
  omittedColumns?: string[];
};
